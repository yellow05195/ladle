/**
 * The live room: a WebSocket to the relay in chat/ (NEXT_PUBLIC_LADLE_CHAT_URL).
 *
 * - Connects as a spectator (reading needs nothing), reconnects with
 *   exponential backoff and jitter, and resumes: the last line id it saw
 *   (only missed lines replay) and a resume token (no new signature).
 * - Signs in lazily: the wallet is asked to sign the relay's plain text the
 *   first time the viewer talks (or when the UI calls signInToChat()). The
 *   signature function comes from the wallet UI through setChatSigner().
 * - A watchdog closes a socket that stayed silent past two heartbeats.
 */
import { SPECIES, type Species } from "../profile";
import { MAX_TEXT, PROTOCOL, signInMessage, type ClientFrame, type ServerFrame, type WireLimits, type WireLine, type WirePresence, type WireProfile, type WireSayReason } from "./protocol";
import { LocalBucket, type RoomSource } from "./source";
import { sortPresence, type RoomStore } from "./store";
import { hintFor } from "./text";
import type { ChatLine, ChatProfile, ChatSigner, Presence, SendResult } from "./types";

const WATCHDOG_MS = 50_000;
const ACK_MS = 6000;
const SIGN_REPLY_MS = 10_000;

const toProfile = (p: WireProfile): ChatProfile => ({
  id: p.id,
  nickname: p.nickname,
  species: ((SPECIES as readonly string[]).includes(p.species) ? p.species : "fox") as Species,
  scarf: p.scarf,
  genesis: p.genesis,
});
const toLine = (l: WireLine): ChatLine => ({ id: l.id, at: l.at, kind: l.kind, from: l.from ? toProfile(l.from) : null, text: l.text });
const toPresence = (p: WirePresence): Presence => ({ profile: toProfile(p.profile), since: p.since, seat: p.seat });

/* resume tokens: one per wallet, in this browser (memory when storage is refused) */
const tokenMemory = new Map<string, string>();
const TOKEN_KEY = (address: string) => `ladle.chat.resume:${address}`;
function readToken(address: string): string | null {
  try { const v = window.localStorage.getItem(TOKEN_KEY(address)); if (v) return v; } catch { /* refused */ }
  return tokenMemory.get(address) ?? null;
}
function writeToken(address: string, token: string | null): void {
  if (token) tokenMemory.set(address, token); else tokenMemory.delete(address);
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY(address), token);
    else window.localStorage.removeItem(TOKEN_KEY(address));
  } catch { /* refused: memory keeps it for the tab */ }
}

function base64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
}

const sameProfile = (a: ChatProfile, b: ChatProfile) =>
  a.id === b.id && a.nickname === b.nickname && a.species === b.species && a.scarf.toLowerCase() === b.scarf.toLowerCase();

export function liveSource(store: RoomStore, url: string): RoomSource {
  let ws: WebSocket | null = null;
  let running = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let nonce: string | null = null;
  let host = "";
  let limits: WireLimits = { maxText: MAX_TEXT, burst: 3, everyMs: 1500 };
  let bucket = new LocalBucket(3, 1500);
  let slowMs: number | null = null;
  let lastId: string | undefined;
  /** who the relay says we are (null: a spectator) */
  let signedAs: ChatProfile | null = null;
  /** who the app says we are */
  let profile: ChatProfile | null = null;
  let signer: ChatSigner | null = null;
  let seat: "stage" | "stands" = "stands";
  /** the token sent in this connection's hello, if any */
  let sentToken: string | null = null;
  let resumeNow = false;
  const resumeTried = new Set<string>();
  const presence = new Map<string, Presence>();
  const acks = new Map<string, (r: SendResult) => void>();
  let signWait: ((m: ServerFrame) => void) | null = null;
  let signing: Promise<SendResult> | null = null;
  let cidSeq = 0;

  const ready = () => ws !== null && ws.readyState === WebSocket.OPEN && nonce !== null;
  const send = (f: ClientFrame) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(f)); };
  const offline = (hint = hintFor("offline")): SendResult => ({ ok: false, reason: "offline", hint });

  function setSigned(p: ChatProfile | null): void {
    signedAs = p;
    store.setMe(p, !!p);
  }

  function kick(): void {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => ws?.close(4100, "silent"), WATCHDOG_MS);
  }

  function clearTimers(): void {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
  }

  function dropPending(): void {
    for (const r of acks.values()) r(offline());
    acks.clear();
    signWait?.({ t: "error", code: "protocol", message: "closed" });
  }

  function connect(): void {
    if (!running) return;
    clearTimers();
    nonce = null;
    store.set({ status: attempt < 3 ? "connecting" : "offline" });
    let sock: WebSocket;
    try { sock = new WebSocket(url); } catch { scheduleReconnect(); return; }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      sentToken = profile ? readToken(profile.id) : null;
      if (profile && sentToken) resumeTried.add(profile.id);
      send({ t: "hello", v: PROTOCOL, ...(sentToken ? { resume: sentToken } : {}), ...(lastId ? { since: lastId } : {}) });
      kick();
    };
    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      kick();
      let m: ServerFrame;
      try { m = JSON.parse(String(ev.data)) as ServerFrame; } catch { return; }
      handle(m);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      nonce = null;
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      dropPending();
      if (!running) return;
      if (resumeNow) { resumeNow = false; connect(); return; }
      scheduleReconnect();
    };
    sock.onerror = () => { /* a close follows */ };
  }

  function scheduleReconnect(): void {
    attempt++;
    const base = Math.min(15_000, 500 * 2 ** Math.min(attempt, 5));
    store.set({ status: attempt < 3 ? "connecting" : "offline" });
    reconnectTimer = setTimeout(connect, base * (0.5 + Math.random()));
  }

  function retryNow(): void {
    if (!running || ws) return;
    attempt = 0;
    connect();
  }
  const onOnline = () => retryNow();
  const onVisible = () => { if (document.visibilityState === "visible") retryNow(); };

  /** The app's profile and the relay's view disagree: sign out, or reconnect to resume. */
  function reconcile(): void {
    if (!ready()) return;
    if (signedAs && (!profile || !sameProfile(signedAs, profile))) {
      // the token holds the old profile of this wallet: drop it, the next line signs again
      if (profile && profile.id === signedAs.id) writeToken(profile.id, null);
      send({ t: "signout" });
      setSigned(null);
      return;
    }
    if (!signedAs && profile && !resumeTried.has(profile.id) && readToken(profile.id)) {
      // a token for this wallet exists: one quick reconnect resumes without a signature
      resumeNow = true;
      ws?.close(1000, "resume");
    }
  }

  function failFromAck(reason: WireSayReason, retryMs?: number): SendResult {
    switch (reason) {
      case "no-profile": setSigned(null); return { ok: false, reason: "not-signed", hint: hintFor("not-signed") };
      case "rate-limited": return { ok: false, reason: "rate-limited", retryMs, hint: hintFor("rate-limited", { retryMs, slowMs, everyMs: limits.everyMs }) };
      case "command": return { ok: false, reason: "unknown-command", hint: hintFor("unknown-command") };
      default: return { ok: false, reason, hint: hintFor(reason) };
    }
  }

  function handle(m: ServerFrame): void {
    switch (m.t) {
      case "welcome": {
        attempt = 0;
        nonce = m.nonce;
        host = m.host;
        limits = m.limits;
        bucket = new LocalBucket(limits.burst, limits.everyMs);
        slowMs = m.slowMs;
        presence.clear();
        for (const p of m.presence.list) presence.set(p.profile.id, toPresence(p));
        const lines = m.history.map(toLine);
        store.addLines(lines, m.reset);
        if (lines.length) lastId = lines[lines.length - 1]!.id;
        else if (m.reset) lastId = undefined;
        if (m.signed) {
          const you = toProfile(m.you);
          if (m.resume) writeToken(you.id, m.resume);
          setSigned(you);
        } else {
          if (sentToken && profile) writeToken(profile.id, null); // the relay did not take it (expired, new secret)
          setSigned(null);
        }
        sentToken = null;
        store.set({ status: "live", online: m.presence.count, slowMs, present: sortPresence(presence.values()) });
        reconcile();
        if (signedAs && seat === "stage") send({ t: "seat", seat });
        break;
      }
      case "signed": {
        nonce = m.nonce;
        const you = toProfile(m.you);
        writeToken(you.id, m.resume);
        setSigned(you);
        if (seat === "stage") send({ t: "seat", seat });
        signWait?.(m);
        break;
      }
      case "signedout": nonce = m.nonce; setSigned(null); break;
      case "error": if (m.nonce) nonce = m.nonce; signWait?.(m); break;
      case "ack": {
        const r = m.cid ? acks.get(m.cid) : undefined;
        if (!r) break;
        acks.delete(m.cid!);
        r(m.ok ? { ok: true, kind: "talk" } : failFromAck(m.reason, m.retryMs));
        break;
      }
      case "line": {
        // a page that joined while a tick was pending has this line in its welcome history already
        const known = store.peek().lines;
        for (let i = known.length - 1; i >= 0 && i >= known.length - 50; i--) if (known[i]!.id === m.line.id) return;
        store.addLines([toLine(m.line)]);
        lastId = m.line.id;
        break;
      }
      case "presence": {
        for (const id of m.leave) presence.delete(id);
        for (const p of m.join) presence.set(p.profile.id, toPresence(p));
        for (const [id, s] of m.seat) { const cur = presence.get(id); if (cur) presence.set(id, { ...cur, seat: s }); }
        store.set({ present: sortPresence(presence.values()), online: m.count });
        break;
      }
      case "slow": slowMs = m.ms; store.set({ slowMs }); break;
      case "hb": if (store.peek().online !== m.count) store.set({ online: m.count }); break;
      case "many": for (const x of m.m) handle(x); break;
      case "pong": case "bye": break;
    }
  }

  function signIn(): Promise<SendResult> {
    if (signedAs) return Promise.resolve({ ok: true, kind: "talk" });
    if (signing) return signing;
    signing = (async (): Promise<SendResult> => {
      if (!profile) return { ok: false, reason: "no-profile", hint: hintFor("no-profile") };
      if (!signer) return { ok: false, reason: "not-signed", hint: "This wallet cannot sign messages: it can read the room, not talk." };
      if (!ready()) return offline();
      const n = nonce!, addr = profile.id, sock = ws;
      let sig: Uint8Array;
      try { sig = await signer(new TextEncoder().encode(signInMessage({ address: addr, nonce: n, host }))); }
      catch { return { ok: false, reason: "not-signed", hint: "The signature was declined. You can still read the room and use commands." }; }
      if (ws !== sock || !ready() || nonce !== n) return offline("The room reconnected while you were signing. Send the line again.");
      if (!profile || profile.id !== addr) return { ok: false, reason: "no-profile", hint: hintFor("no-profile") };
      const p = profile;
      const reply = await new Promise<ServerFrame>((resolve) => {
        const timer = setTimeout(() => { signWait = null; resolve({ t: "error", code: "protocol", message: "timeout" }); }, SIGN_REPLY_MS);
        signWait = (m) => { clearTimeout(timer); signWait = null; resolve(m); };
        send({ t: "signin", address: addr, nonce: n, signature: base64(sig), profile: { nickname: p.nickname, species: p.species, scarf: p.scarf, genesis: p.genesis } });
      });
      if (reply.t === "signed") return { ok: true, kind: "talk" };
      if (reply.t === "error") {
        switch (reply.code) {
          case "nickname-reserved": return { ok: false, reason: "no-profile", hint: "The room keeps this nickname for the house. Pick another one in your profile." };
          case "bad-profile": return { ok: false, reason: "no-profile", hint: "The room could not read this profile. Save it again from the profile panel." };
          case "rate-limited": return { ok: false, reason: "rate-limited", hint: "Too many sign-ins from this address. Try again in a minute." };
          case "protocol": return offline();
          default: return { ok: false, reason: "not-signed", hint: "The room could not check that signature. Send the line again to retry." };
        }
      }
      return offline();
    })().finally(() => { signing = null; });
    return signing;
  }

  return {
    kind: "live",
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      window.addEventListener("online", onOnline);
      document.addEventListener("visibilitychange", onVisible);
      // a short wait lets the profile land first, so the first hello can resume
      reconnectTimer = setTimeout(connect, 250);
    },
    stop() {
      running = false;
      clearTimers();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      const s = ws;
      ws = null;
      nonce = null;
      dropPending();
      s?.close(1000, "bye");
    },
    async say(text: string): Promise<SendResult> {
      if (!profile) return { ok: false, reason: "no-profile", hint: hintFor("no-profile") };
      if (!ready()) return offline();
      if (!signedAs) {
        const r = await signIn();
        if (!r.ok) return r;
      }
      const b = bucket.take();
      if (!b.ok) return { ok: false, reason: "rate-limited", retryMs: b.retryMs, hint: hintFor("rate-limited", { retryMs: b.retryMs, slowMs, everyMs: limits.everyMs }) };
      const cid = `c${++cidSeq}`;
      return new Promise<SendResult>((resolve) => {
        const timer = setTimeout(() => { acks.delete(cid); resolve(offline()); }, ACK_MS);
        acks.set(cid, (r) => { clearTimeout(timer); if (!r.ok && r.reason !== "rate-limited") bucket.refund(); resolve(r); });
        send({ t: "say", text, cid });
      });
    },
    setProfile(p) {
      if (p?.id !== profile?.id) resumeTried.clear();
      profile = p;
      reconcile();
    },
    setSigner(s) { signer = s; },
    setSeat(s) {
      if (s === seat) return;
      seat = s;
      if (signedAs && ready()) send({ t: "seat", seat: s });
    },
    signIn,
  };
}
