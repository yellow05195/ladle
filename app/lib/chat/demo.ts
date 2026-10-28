/**
 * The demo room: about fifty people in the hall. This round's entrants stand
 * on the stage (the same owners, labels, animals and colours the drum and
 * the 3D cast use); the regulars fill the stands, arrive and leave; a
 * handful of them talk at a natural pace and react to the round's phases.
 * The viewer's own talk is echoed, and someone says hello back.
 *
 * Everything here is demo data: the snapshot's status is "demo" and the UI
 * marks it as such. The lines come from demo-lines.ts (checked against the
 * copy rules by chat/test/parity.test.ts).
 */
import { getDataSource, type LiveWindow } from "../data";
import type { EntryView } from "../data/types";
import { playerColor } from "../colors";
import { base58, formatSol } from "../format";
import { sfc32 } from "../prng";
import { SPECIES } from "../profile";
import { DEMO_NAMES, DEMO_TALKERS, DIALOGUES, ENTRY_LINES, GREETINGS, HELP_REPLIES, HELP_TOPICS, IDLE_LINES, PHASE_LINES } from "./demo-lines";
import { LocalBucket, type RoomSource } from "./source";
import { sortPresence, type RoomStore } from "./store";
import { hintFor } from "./text";
import type { ChatLine, ChatProfile, Presence, SendResult } from "./types";

/** how many people the demo hall holds, give or take a few */
export const DEMO_CROWD = 50;

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function fnvBytes(b: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]!; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const pool = new Map<string, ChatProfile>();
/** A regular: a pubkey-shaped id from the name, an animal from the name, the name's identity colour. */
export function regular(nick: string): ChatProfile {
  let p = pool.get(nick);
  if (!p) {
    const h = fnv(nick);
    p = {
      id: base58(sfc32(h).bytes(32)),
      nickname: nick,
      species: SPECIES[h % SPECIES.length]!,
      scarf: playerColor(nick),
      genesis: (h >>> 8) % 4 === 0 ? 1 + ((h >>> 12) % 1000) : null,
    };
    pool.set(nick, p);
  }
  return p;
}

/** An entrant of the round: the same animal (components/hall/pets.ts speciesOf) and colour (playerColor(label)) as the 3D cast. */
function entrant(e: EntryView): ChatProfile {
  return { id: base58(e.owner), nickname: e.label, species: SPECIES[fnvBytes(e.owner) % SPECIES.length]!, scarf: playerColor(e.label), genesis: null };
}

const solStr = (l: bigint) => formatSol(l, 3).replace(/\.?0+$/, "");

export function demoSource(store: RoomStore): RoomSource {
  const rnd = Math.random;
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const present = new Map<string, Presence>();
  /** entrants of past rounds still standing around: they drift out first */
  const transient = new Set<string>();
  const entrants = new Map<string, ChatProfile>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const bucket = new LocalBucket(3, 1500);
  let me: ChatProfile | null = null;
  let w: LiveWindow | null = null;
  let windowId = "";
  let phase = "";
  let seq = 0;
  let running = false;
  let startedAt = 0;
  let unsub: (() => void) | null = null;
  let greeted = false;
  let lastHelpAt = 0;
  let dirty = false;
  const bags = new Map<string, number[]>();
  const lastDrawn = new Map<string, number>();
  let lastEntryLineAt = 0;

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.delete(t); if (running) fn(); }, ms);
    timers.add(t);
  };

  /** one of the list, not again until the others have been said */
  function draw<T>(key: string, list: readonly T[]): T {
    let bag = bags.get(key);
    if (!bag || !bag.length) {
      bag = list.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j]!, bag[i]!]; }
      // a fresh bag never starts with the line just said
      if (bag.length > 1 && bag[bag.length - 1] === lastDrawn.get(key)) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
      bags.set(key, bag);
    }
    const i = bag.pop()!;
    lastDrawn.set(key, i);
    return list[i]!;
  }

  const roundN = () => (w ? Number(w.id.replace(/^demo-/, "")) || 0 : 0);
  function fill(t: string, speaker: ChatProfile | null, extra: Record<string, string> = {}): string {
    return t.replace(/\{(\w+)\}/g, (_, k: string) => {
      if (k in extra) return extra[k]!;
      switch (k) {
        case "n": return String(roundN());
        case "prev": return String(Math.max(1, roundN() - 1));
        case "nick": return me?.nickname ?? "there";
        case "species": return speaker?.species ?? "fox";
        case "e": return String(w?.entries.length ?? 0);
        case "seed": return (w?.seedHex ?? "").slice(0, 8);
        default: return "";
      }
    });
  }

  const line = (from: ChatProfile | null, text: string, at = Date.now()): ChatLine => ({ id: `demo-${++seq}`, at, kind: "talk", from, text });
  const say = (from: ChatProfile, text: string) => store.addLines([line(from, text)]);

  function setSeat(id: string, seat: "stage" | "stands"): void {
    const cur = present.get(id);
    if (!cur || cur.seat === seat) return;
    present.set(id, { ...cur, seat });
    dirty = true;
  }
  function arrive(p: ChatProfile, seat: "stage" | "stands", since = Date.now()): void {
    if (present.has(p.id)) return setSeat(p.id, seat);
    present.set(p.id, { profile: p, since, seat });
    dirty = true;
  }
  function leave(id: string): void {
    if (id === me?.id) return;
    if (present.delete(id)) dirty = true;
    transient.delete(id);
  }
  function publish(): void {
    if (!dirty) return;
    dirty = false;
    store.set({ present: sortPresence(present.values()), online: present.size });
  }

  /** someone in the room to say a line (the regulars who talk, mostly) */
  function speaker(exclude?: string): ChatProfile | null {
    const talkers = DEMO_TALKERS.map(regular).filter((p) => present.has(p.id) && p.id !== exclude);
    if (talkers.length && rnd() < 0.75) return pick(talkers);
    const others = [...present.values()].map((p) => p.profile).filter((p) => p.id !== me?.id && p.id !== exclude);
    return others.length ? pick(others) : null;
  }
  function stageSpeaker(): ChatProfile | null {
    const on = [...present.values()].filter((p) => p.seat === "stage" && p.profile.id !== me?.id);
    return on.length ? pick(on).profile : null;
  }

  function idleTick(): void {
    if (rnd() < 0.22) {
      const [q, a] = draw("dialogue", DIALOGUES);
      const s1 = speaker();
      if (s1) {
        say(s1, q);
        later(2200 + rnd() * 2800, () => { const s2 = speaker(s1.id); if (s2) say(s2, a); });
      }
    } else {
      const s = speaker();
      const t = draw("idle", IDLE_LINES);
      if (s) {
        say(s, fill(t, s));
        if (t.startsWith("logging off")) later(4000 + rnd() * 4000, () => { leave(s.id); publish(); });
      }
    }
    later(rnd() < 0.15 ? 15_000 + rnd() * 10_000 : 4500 + rnd() * 7500, idleTick);
  }

  function churn(): void {
    if (transient.size && (present.size > DEMO_CROWD || rnd() < 0.5)) {
      // the oldest ex-entrant walks out
      let oldest: Presence | null = null;
      for (const id of transient) { const p = present.get(id); if (p && (!oldest || p.since < oldest.since)) oldest = p; }
      if (oldest) leave(oldest.profile.id); else transient.clear();
    } else if (present.size > DEMO_CROWD + 4 || rnd() < 0.2) {
      const stands = [...present.values()].filter((p) => p.seat === "stands" && p.profile.id !== me?.id && !transient.has(p.profile.id));
      if (stands.length) leave(pick(stands).profile.id);
    }
    if (present.size < DEMO_CROWD - 2 || rnd() < 0.3) {
      const away = DEMO_NAMES.map(regular).filter((p) => !present.has(p.id));
      if (away.length) arrive(pick(away), "stands");
    }
    publish();
    later(6000 + rnd() * 9000, churn);
  }

  function react(ph: "open" | "sealed" | "seeded" | "settled"): void {
    const chance = { open: 0.5, sealed: 0.35, seeded: 0.3, settled: 0.65 }[ph];
    if (rnd() > chance) return;
    later(700 + rnd() * 2200, () => {
      const s = ph === "open" ? speaker() : stageSpeaker() ?? speaker();
      if (s) say(s, fill(draw(`phase:${ph}`, PHASE_LINES[ph]), s));
    });
  }

  function onWindow(nw: LiveWindow): void {
    w = nw;
    if (nw.id !== windowId) {
      // last round's entrants step down to the stands, and will drift out
      for (const p of [...present.values()]) {
        if (p.seat !== "stage" || p.profile.id === me?.id) continue;
        const id = p.profile.id;
        setSeat(id, "stands");
        transient.add(id);
        // most walk out over the next half minute; a few stay to watch
        if (rnd() < 0.8) later(2000 + rnd() * 28_000, () => { if (transient.has(id) && present.get(id)?.seat === "stands") { leave(id); publish(); } });
      }
      entrants.clear();
      windowId = nw.id;
      phase = "";
    }
    for (const e of nw.entries) {
      if (e.mine) continue;
      const key = `${nw.id}:${e.index}`;
      let p = entrants.get(key);
      if (!p) {
        p = entrant(e);
        entrants.set(key, p);
        const who = p;
        // now and then an entrant says what they put in (one such line every few seconds at most)
        if (rnd() < 0.12 && Date.now() - startedAt > 1500 && Date.now() - lastEntryLineAt > 5000 && (lastEntryLineAt = Date.now())) later(600 + rnd() * 1500, () => say(who, fill(draw("entry", ENTRY_LINES), who, { sol: solStr(e.amount) })));
      }
      transient.delete(p.id);
      arrive(p, "stage");
    }
    if (me) setSeat(me.id, nw.mineIndex !== null ? "stage" : "stands");
    if (nw.phase !== phase) {
      const was = phase;
      phase = nw.phase;
      const ph = nw.phase === "sold" ? null : nw.phase;
      // no burst of reactions when the page opens mid-round
      if (ph && Date.now() - startedAt > 1500 && !(was === "settled" && ph === "settled")) react(ph);
    }
    publish();
  }

  function seed(): void {
    const now = Date.now();
    const regulars = [...DEMO_NAMES].sort(() => rnd() - 0.5).slice(0, 38);
    for (const n of new Set([...DEMO_TALKERS, ...regulars])) {
      if (present.size >= DEMO_CROWD - 10) break;
      arrive(regular(n), "stands", now - Math.floor(rnd() * 25 * 60_000));
    }
    // a few lines already said before the viewer came in
    const past: ChatLine[] = [];
    const calm = (t: string) => !t.startsWith("logging off") && !t.startsWith("back.") && !t.includes("{prev}");
    let at = now;
    const times: number[] = [];
    for (let i = 0; i < 5; i++) times.unshift((at -= 9000 + Math.floor(rnd() * 16_000)));
    for (const t of times) {
      const s = speaker();
      let text = draw("idle", IDLE_LINES);
      for (let k = 0; k < 8 && !calm(text); k++) text = draw("idle", IDLE_LINES);
      if (s && calm(text)) past.push(line(s, fill(text, s), t));
    }
    store.addLines(past);
    publish();
  }

  return {
    kind: "demo",
    start() {
      if (running) return;
      running = true;
      startedAt = Date.now();
      store.set({ status: "demo", slowMs: null });
      if (!present.size) seed();
      if (me) { arrive(me, "stands"); publish(); }
      unsub = getDataSource().subscribe(onWindow);
      later(2500 + rnd() * 2500, idleTick);
      later(6000, churn);
    },
    stop() {
      running = false;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      unsub?.();
      unsub = null;
    },
    async say(text: string): Promise<SendResult> {
      if (!me) return { ok: false, reason: "no-profile", hint: hintFor("no-profile") };
      const b = bucket.take();
      if (!b.ok) return { ok: false, reason: "rate-limited", retryMs: b.retryMs, hint: hintFor("rate-limited", { retryMs: b.retryMs, everyMs: 1500 }) };
      const mine = me;
      say(mine, text);
      store.flush();
      if (!greeted) {
        greeted = true;
        if (rnd() < 0.85) later(1200 + rnd() * 1800, () => { const s = speaker(); if (s) say(s, fill(draw("greet", GREETINGS), s, { species: mine.species })); });
      } else if (text.includes("?") && Date.now() - lastHelpAt > 8000) {
        lastHelpAt = Date.now();
        const low = text.toLowerCase();
        const topic = HELP_TOPICS.find(([keys]) => keys.some((k) => low.includes(k)));
        later(1500 + rnd() * 2500, () => { const s = speaker(); if (s) say(s, topic ? topic[1] : draw("help", HELP_REPLIES)); });
      }
      return { ok: true, kind: "talk" };
    },
    setProfile(p) {
      if (me && (!p || p.id !== me.id)) { present.delete(me.id); dirty = true; }
      if (p?.id !== me?.id) greeted = false;
      me = p;
      if (p) {
        const cur = present.get(p.id);
        present.set(p.id, { profile: p, since: cur?.since ?? Date.now(), seat: w?.mineIndex != null ? "stage" : cur?.seat ?? "stands" });
        dirty = true;
      }
      store.setMe(p, !!p);
      publish();
    },
    setSigner() { /* the demo needs no signature */ },
    setSeat(seat) { if (me) { setSeat(me.id, seat); publish(); } },
    async signIn() { return me ? { ok: true, kind: "talk" } : { ok: false, reason: "no-profile", hint: hintFor("no-profile") }; },
  };
}
