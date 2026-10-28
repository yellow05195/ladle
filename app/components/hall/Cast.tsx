"use client";

/**
 * The cast (v21): everyone in the round, together in the one room, and the
 * spectators in the stands. Each character is a Kenney Cube Pet with a
 * scarf in its player's identity colour, drawn through the batched crowd
 * (crowd.ts): the whole stage is one draw call, the stands another, at 10,
 * 50 or 120 players alike.
 *
 * Players stand on the stage in ARRIVAL order (seats.ts): two roomy rings
 * (29 seats, 0.85 m characters) for a round of up to 29; past that, three
 * packed rings (60 seats, 0.66 m), everyone hopping to their packed seat
 * together, the same size for all. Past 60 they stand on the lowest tiers of
 * the stands ("+N in the stands"). Spectators (usePresence, or `?watchers=N`
 * in dev) fill the stands from the top tier down, 0.66 m tall. Nobody is placed, sized, lit or animated by
 * a result: the hop (their ball drops), the catch and the look-up (the
 * reveal) are identical for everyone. Idles are desynchronised (phase and
 * pace seeded by the owner) so no two move in step.
 *
 * Your own character (after your profile is made) stands in the gallery,
 * front left, until you enter; then it hops onto the reserved front-left
 * seat of the inner ring, always in view.
 *
 * Name tags are DOM, projected each frame into #hall-tags, from a small
 * pool: you, the one under the pointer, the newest arrivals, and in small
 * rounds everyone (as in v20). In a crowd, the budget goes to the nearest
 * players whose tag can show (not under a HUD pane, not over the cage); the
 * others carry no tag; the screen-reader list (Tags.tsx) still names everyone.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { playerColor, PLAYER_COLORS } from "../../lib/colors";
import { SPECIES } from "../../lib/profile";
import type { Presence } from "../../lib/chat/types";
import { CrowdBatch, bakeSpecies, blobShadows, crowdMaterial, type CrowdClip, type Figure, type SpeciesBake } from "./crowd";
import { seed01, speciesOf, type Species } from "./pets";
import { CHAR_S, GALLERY_SPOT, STANDS_S, feetOf, layout, overflowOf, packedFor, seatOfEntry, sizeOfSeat, type Seat } from "./seats";
import { CAGE_CENTRE, revealEnd, revealTime, stage, T_SERVE } from "./stage";
import { multiplierOf } from "../../lib/law-settle";
import { formatMultiplier } from "../../lib/format";
import { hall, hallBus, type Quality } from "./store";
import { sol2, solShort } from "./fmt";
import { dictionary, format } from "../../i18n";

type Kind = "entry" | "me" | "watch";

class Char {
  fig: Figure | null = null;
  batch: CrowdBatch | null = null;
  bake: SpeciesBake | null = null;
  target = new THREE.Vector3();
  from = new THREE.Vector3();
  pos = new THREE.Vector3();
  moveAt = 0;
  moveMs = 0;
  bornAt = 0;
  leaveAt = 0;
  walking = false;
  walkEnd = 0;
  yaw = 0;
  phase: number;
  pace: number;
  disposed = false;
  /** stands figures are posed every other frame */
  slot = 0;
  /** height now (m), and the move's start and end sizes (the packed stage and the stands are smaller) */
  size = CHAR_S;
  sizeFrom = CHAR_S;
  sizeTo = CHAR_S;
  constructor(public key: string, public kind: Kind, public species: Species, public color: string, seedKey: string, public idx: number, public stands: boolean, public name: string) {
    this.phase = seed01(seedKey, 7);
    this.pace = 0.92 + seed01(seedKey, 3) * 0.16;
  }
}

const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const faceCentre = (x: number, z: number) => Math.atan2(-x, -z);
const feet = { x: 0, y: 0, z: 0 };
const handSeen = new Set<number>();
function setHand(i: number, x: number, y: number, z: number): void {
  let h = stage.hands.get(i);
  if (!h) { h = new THREE.Vector3(); stage.hands.set(i, h); }
  h.set(x, y, z);
  handSeen.add(i);
}
const blobM = new THREE.Matrix4();
const blobQ = new THREE.Quaternion();
const blobS = new THREE.Vector3();

/**
 * Dev only: `?watchers=N` seats N demo spectators in the stands in place of the room's presence
 * (`?watchers=0` empties the stands), to test 0, 40 or 200 watchers. Null without the switch.
 */
function devWatchers(): Presence[] | null {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return null;
  const raw = new URLSearchParams(window.location.search).get("watchers");
  if (raw === null) return null;
  const n = Math.min(400, Math.max(0, Math.floor(Number(raw)) || 0));
  const SYL = ["ka", "mo", "ri", "te", "lu", "na", "so", "vi", "do", "pe", "ha", "ze", "ol", "ib", "um", "ar"];
  const out: Presence[] = [];
  for (let k = 0; k < n; k++) {
    const h = Math.imul(k + 1, 2654435761) >>> 0;
    const nick = SYL[h & 15]! + SYL[(h >>> 4) & 15]! + SYL[(h >>> 8) & 15]!.slice(0, 1);
    out.push({ profile: { id: `dev-watch:${k}`, nickname: nick, species: SPECIES[(h >>> 12) % SPECIES.length]!, scarf: PLAYER_COLORS[(h >>> 16) % PLAYER_COLORS.length]!, genesis: null }, since: k, seat: "stands" });
  }
  return out;
}

/** How many spectators each tier draws (the stands hold about 120). */
const WATCH_CAP: Record<Quality, number> = { high: 160, mid: 80, low: 36, none: 0 };
/** v21 §8.16: you plus 14 others on /play (12 in all on the home), you plus the 2 nearest on phones; never more than 15 tag nodes. */
const TAGS_PLAY = 15, TAGS_HOME = 12, TAGS_PHONE = 3, TAG_NODES = 15, TAG_NODES_PHONE = 4;

export function Cast({ quality, phone, compact = false }: { quality: Quality; phone: boolean; compact?: boolean }) {
  const { camera, size, scene } = useThree();
  const chars = useRef(new Map<string, Char>());
  const mine = useRef<Char | null>(null);
  const firstLoaded = useRef(0);
  const lastVersion = useRef(-1);
  const lastPresence = useRef(-1);
  const windowId = useRef("");
  const lastSeating = useRef("");
  const frame = useRef(0);
  const pointer = useRef({ x: -1e4, y: -1e4, at: 0 });
  const dev = useMemo(() => devWatchers(), []);
  const nodeCap = phone ? TAG_NODES_PHONE : TAG_NODES;
  let budget = phone ? TAGS_PHONE : TAGS_PLAY;

  // the batches, their shared material, the contact shadows
  const crowd = useMemo(() => {
    const mat = crowdMaterial(null);
    const stageB = new CrowdBatch(1500, mat, { shadows: quality === "high", cull: false });
    const standsB = new CrowdBatch(2600, mat, { shadows: false, cull: true });
    const blobs = blobShadows(400);
    return { mat, stageB, standsB, blobs };
  }, [quality]);

  useEffect(() => {
    scene.add(crowd.stageB.mesh, crowd.standsB.mesh, crowd.blobs);
    return () => {
      scene.remove(crowd.stageB.mesh, crowd.standsB.mesh, crowd.blobs);
      crowd.stageB.dispose(); crowd.standsB.dispose(); crowd.mat.dispose();
      crowd.blobs.geometry.dispose(); (crowd.blobs.material as THREE.MeshBasicMaterial).map?.dispose(); (crowd.blobs.material as THREE.Material).dispose();
      chars.current.clear(); mine.current = null;
      lastVersion.current = -1; lastPresence.current = -1; windowId.current = "";
    };
  }, [crowd, scene]);

  // a round with fewer than three players still finishes the loader's step
  useEffect(() => {
    const t = setTimeout(() => hall.markLoaded("cast"), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.(".hud-pane, .frame, button, input, a, textarea, [role=dialog]")) { pointer.current.x = -1e4; return; }
      pointer.current.x = e.clientX; pointer.current.y = e.clientY; pointer.current.at = performance.now();
    };
    const leave = () => { pointer.current.x = -1e4; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, []);

  const spawn = (c: Char, batch: CrowdBatch, ready?: () => void) => {
    c.batch = batch;
    void bakeSpecies(c.species).then((b) => {
      if (c.disposed) return;
      if (!crowd.mat.map && b.map) { crowd.mat.map = b.map; crowd.mat.needsUpdate = true; }
      c.bake = b;
      c.fig = batch.add(b, c.color);
      ready?.();
    }).catch((err) => { if (process.env.NODE_ENV !== "production") console.error("crowd: bake failed", c.species, err); });
  };
  const drop = (c: Char) => {
    c.disposed = true;
    if (c.fig && c.batch) c.batch.remove(c.fig);
    c.fig = null;
    chars.current.delete(c.key);
  };
  const loadedOne = () => {
    firstLoaded.current++;
    stage.castReady = firstLoaded.current;
    if (firstLoaded.current >= 3) hall.markLoaded("cast");
  };

  // tags: a small pool of DOM pills, each held by one character (keyed) so a re-sort never restarts its fade
  const pool = useRef<HTMLSpanElement[]>([]);
  const tagByKey = useRef(new Map<string, HTMLSpanElement>());
  const tagHost = () => document.getElementById("hall-tags");
  const tagFor = (key: string, now: number, used: Set<HTMLSpanElement>): HTMLSpanElement | null => {
    const held = tagByKey.current.get(key);
    if (held) return held;
    const busy = new Set(tagByKey.current.values());
    let el = pool.current.find((x) => !busy.has(x) && !used.has(x));
    if (!el) {
      if (pool.current.length >= nodeCap) return null;
      const host = tagHost();
      if (!host) return null;
      el = document.createElement("span");
      el.className = "w-tag";
      el.innerHTML = '<b class="w-tag-a"></b><b class="w-tag-b"></b><i class="w-tag-x"></i>';
      el.style.opacity = "0";
      host.appendChild(el);
      pool.current.push(el);
    }
    (el.firstChild as HTMLElement).textContent = "";
    el.dataset.born = String(now);
    tagByKey.current.set(key, el);
    return el;
  };
  useEffect(() => () => { for (const el of pool.current) el?.remove(); pool.current = []; tagByKey.current.clear(); }, []);

  useFrame(() => {
    const now = performance.now();
    frame.current++;
    const s = hall.get();
    const w = hallBus.w;
    const L = layout();

    // my own character in the gallery (after the profile is made), until my entry takes my seat
    const inRound = !!w && w.mineIndex !== null;
    if (s.me && !inRound) {
      const key = `me:${s.me.species}:${s.me.scarf}`;
      if (!mine.current || mine.current.key !== key) {
        if (mine.current) drop(mine.current);
        const c = new Char(key, "me", s.me.species, s.me.scarf, s.me.pubkey, -1, false, s.me.nickname);
        c.target.set(...GALLERY_SPOT);
        c.bornAt = now;
        if (s.arriving && now - s.arriving < 4000 && !s.reduced) {
          // just seated: walks in from the left door to the gallery spot (1.6 s)
          c.from.set(-10.2, 0, -1.6);
          c.moveAt = now; c.moveMs = 1600; c.walking = true;
          c.yaw = Math.atan2(GALLERY_SPOT[0] - c.from.x, GALLERY_SPOT[2] - c.from.z);
        } else {
          c.from.copy(c.target);
          c.yaw = faceCentre(GALLERY_SPOT[0], GALLERY_SPOT[2]);
        }
        c.pos.copy(c.from);
        chars.current.set(key, c);
        spawn(c, crowd.stageB);
        mine.current = c;
      }
    } else if (mine.current && !s.me) { drop(mine.current); mine.current = null; }

    // the players of the round in focus
    if (w && hallBus.version !== lastVersion.current) {
      lastVersion.current = hallBus.version;
      if (w.id !== windowId.current) {
        // the previous cast steps back and fades
        for (const c of chars.current.values()) if (c.kind === "entry" && !c.leaveAt) c.leaveAt = now;
        windowId.current = w.id;
        stage.hopAt.clear();
      }
      // the seating changed (the viewer took the reserved seat, or the 30th player packed the stage):
      // everyone whose seat moved hops to it together, resizing on the way (the same for every player)
      const n = w.entries.length;
      const seating = `${w.id}:${w.mineIndex}:${packedFor(n) ? 1 : 0}`;
      if (seating !== lastSeating.current) {
        lastSeating.current = seating;
        w.entries.forEach((e, i) => {
          const c = chars.current.get(`${w.id}:${e.index}`);
          const seat = seatOfEntry(i, w.mineIndex, n);
          if (!c || !seat || c.leaveAt) return;
          const size = sizeOfSeat(seat, n);
          if (c.target.x === seat.x && c.target.z === seat.z && c.sizeTo === size) return;
          // a ripple in arrival order (at most 0.4 s), so the room shuffles rather than jumps as one
          c.from.copy(c.pos); c.target.set(seat.x, seat.y, seat.z); c.moveAt = now + Math.min(400, i * 14); c.moveMs = 700; c.yaw = faceCentre(seat.x, seat.z);
          c.sizeFrom = c.size; c.sizeTo = size;
          if (seat.stands !== c.stands) {
            const fig = c.fig, from = c.batch;
            if (fig && from) from.remove(fig);
            c.fig = null; c.stands = seat.stands;
            spawn(c, seat.stands ? crowd.standsB : crowd.stageB);
          }
        });
      }
      w.entries.forEach((e, i) => {
        const key = `${w.id}:${e.index}`;
        if (chars.current.has(key)) return;
        const seat = seatOfEntry(i, w.mineIndex, n);
        if (!seat) return;
        const species = e.mine && s.me ? s.me.species : speciesOf(e.owner);
        const color = e.mine && s.me ? s.me.scarf : playerColor(e.label);
        const c = new Char(key, "entry", species, color, e.label + e.index, i, seat.stands, e.mine ? hallBus.myName : e.label);
        c.target.set(seat.x, seat.y, seat.z);
        c.yaw = faceCentre(seat.x, seat.z);
        c.size = c.sizeFrom = c.sizeTo = sizeOfSeat(seat, n);
        if (e.mine && mine.current) {
          // you: hop from the gallery onto your seat (resizing from the gallery's size)
          c.from.copy(mine.current.pos);
          c.size = c.sizeFrom = mine.current.size;
          c.moveAt = now; c.moveMs = 900;
          drop(mine.current); mine.current = null;
        } else {
          // new entrants rise behind their seat
          const out = Math.hypot(seat.x, seat.z) || 1;
          c.from.set(seat.x * (out + 0.5) / out, seat.y - 0.4, seat.z * (out + 0.5) / out);
          c.moveAt = now; c.moveMs = 300;
        }
        c.pos.copy(c.from);
        c.bornAt = now;
        c.slot = i & 1;
        chars.current.set(key, c);
        spawn(c, seat.stands ? crowd.standsB : crowd.stageB, seat.stands ? undefined : loadedOne);
      });
    }

    // spectators in the stands (presence, or the dev switch), top tier first, skipping seats the overflow took
    const presence = dev ?? hallBus.present;
    const pv = hallBus.presentVersion * 1000 + (w ? w.entries.length : 0);
    if (!compact && pv !== lastPresence.current) {
      lastPresence.current = pv;
      const myId = s.me?.pubkey ?? "";
      const taken = new Set<Seat>();
      if (w) for (let i = 0; i < w.entries.length; i++) { const st = seatOfEntry(i, w.mineIndex, w.entries.length); if (st?.stands) taken.add(st); }
      const free = L.standsBack.filter((st) => !taken.has(st));
      const want = presence.filter((p) => p.seat === "stands" && p.profile.id !== myId).slice(0, Math.min(WATCH_CAP[quality], free.length));
      const keep = new Set<string>();
      want.forEach((p, k) => {
        const key = `w:${p.profile.id}`;
        keep.add(key);
        const seat = free[k]!;
        let c = chars.current.get(key);
        if (c && (c.target.x !== seat.x || c.target.z !== seat.z)) {
          // moved seats (the overflow grew): a quick hop to the new one
          c.from.copy(c.pos); c.target.set(seat.x, seat.y, seat.z); c.moveAt = now; c.moveMs = 500; c.yaw = faceCentre(seat.x, seat.z);
          return;
        }
        if (c) return;
        c = new Char(key, "watch", p.profile.species, p.profile.scarf, p.profile.id, -1, true, p.profile.nickname);
        c.size = c.sizeFrom = c.sizeTo = STANDS_S;
        c.target.set(seat.x, seat.y, seat.z);
        c.yaw = faceCentre(seat.x, seat.z);
        c.from.set(seat.x, seat.y - 0.35, seat.z);
        c.pos.copy(c.from);
        c.moveAt = now; c.moveMs = 350;
        c.bornAt = now;
        c.slot = k & 1;
        chars.current.set(key, c);
        spawn(c, crowd.standsB);
      });
      for (const c of [...chars.current.values()]) if (c.kind === "watch" && !keep.has(c.key) && !c.leaveAt) c.leaveAt = now;
    }

    // motion, poses, hands (toss origins) and owners (serve targets)
    // hands and owners are rewritten in place every frame (no allocation per player per frame)
    handSeen.clear();
    const t = revealTime(now);
    const revealing = !!stage.revealId && w?.id === stage.revealId && t >= 0;
    const lowStands = quality === "low";
    let blobN = 0;
    const blobAll = quality !== "high";
    for (const c of chars.current.values()) {
      // move (rise, hop to the seat, walk in)
      if (c.moveAt) {
        const f = Math.min(1, Math.max(0, (now - c.moveAt) / Math.max(1, c.moveMs)));
        c.pos.lerpVectors(c.from, c.target, c.walking ? f : easeOut(f));
        c.size = c.sizeFrom + (c.sizeTo - c.sizeFrom) * easeOut(f);
        if (c.moveMs > 500 && !c.walking) c.pos.y += Math.sin(f * Math.PI) * 0.6;
        if (f >= 1) {
          c.moveAt = 0;
          c.size = c.sizeTo;
          if (c.walking) { c.walking = false; c.walkEnd = now; c.yaw = faceCentre(c.pos.x, c.pos.z); }
        }
      }
      let sy = 1, sx = 1, lift = 0, tilt = 0, scale = c.size;
      // the hop when this player's ball drops
      if (c.kind === "entry") {
        // the toss leaves their hands when the chute is free for their ball (drum-sim queue)
        const ball = windowId.current === stage.sim.windowId ? stage.sim.balls[c.idx] : undefined;
        const hop = ball && ball.tossAt ? ball.tossAt : stage.hopAt.get(c.idx);
        if (hop !== undefined && windowId.current === stage.sim.windowId) {
          const ht = (now - hop) / 240;
          if (ht >= 0 && ht < 1) lift += Math.sin(ht * Math.PI) * 0.165 * c.size;
        }
        // reveal: the same catch and the same look-up for everyone
        if (revealing && !c.leaveAt) {
          const land = stage.landAt.get(c.idx);
          if (land !== undefined) {
            const ct = now - land;
            if (ct < 120) { sy = 1 - 0.08 * (ct / 120); sx = 1 + 0.04 * (ct / 120); }
            else if (ct < 280) { const u = (ct - 120) / 160; sy = 0.92 + 0.08 * u; sx = 1.04 - 0.04 * u; }
          }
          const look = Math.min(1, Math.max(0, (t - (T_SERVE - 600)) / 300));
          tilt = THREE.MathUtils.degToRad(-10) * look;
        }
      }
      if (c.leaveAt) {
        const f = Math.min(1, (now - c.leaveAt) / 400);
        c.pos.set(c.target.x * (1 + 0.12 * f), c.target.y - 0.3 * f, c.target.z * (1 + 0.12 * f));
        scale *= Math.max(0.001, 1 - f);
        if (f >= 1) { drop(c); continue; }
      }
      // pose: the stands every other frame (unless moving), static on the low tier
      const fig = c.fig;
      if (fig && c.batch) {
        const busy = c.moveAt !== 0 || c.leaveAt !== 0 || lift !== 0 || sy !== 1 || tilt !== 0 || now - c.bornAt < 600;
        if (!c.stands || busy || (frame.current & 1) === c.slot) {
          const walking = c.walking;
          const clip: CrowdClip = walking ? "walk" : c.stands && lowStands ? "static" : "idle";
          const time = (now / 1000) * c.pace + c.phase * 2;
          const blendIn = c.walkEnd ? Math.min(1, (now - c.walkEnd) / 200) : 1;
          c.batch.pose(fig, {
            x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw, sx, sy, lift, tilt, scale, clip, time,
            from: blendIn < 1 ? "walk" : undefined, fromTime: time, blend: blendIn,
          });
        }
        if ((blobAll || c.stands) && blobN < crowd.blobs.instanceMatrix.count && c.pos.y < 1.2) {
          blobQ.identity();
          blobM.compose(v.set(c.pos.x, c.target.y + 0.012, c.pos.z), blobQ, blobS.set(scale * 0.95, 1, scale * 0.95));
          crowd.blobs.setMatrixAt(blobN++, blobM);
        }
      }
      if (c.kind === "entry" && !c.leaveAt) {
        setHand(c.idx, c.pos.x * 0.94, c.pos.y + 0.55 * c.size + lift, c.pos.z * 0.94);
      }
    }
    crowd.blobs.count = blobN;
    crowd.blobs.instanceMatrix.needsUpdate = blobN > 0;
    // my character in the gallery: tosses come from there before it is seated
    if (w && w.mineIndex !== null && mine.current && !handSeen.has(w.mineIndex)) setHand(w.mineIndex, mine.current.pos.x, mine.current.pos.y + 0.55, mine.current.pos.z);
    // serve targets: every entry's place, from its seat alone (ready or not)
    if (w) {
      for (let i = 0; i < w.entries.length; i++) {
        const st = seatOfEntry(i, w.mineIndex, w.entries.length);
        if (!st) continue;
        let o = stage.owners.get(i);
        if (!o) { o = { x: 0, y: 0, z: 0, a: 0, stands: false }; stage.owners.set(i, o); }
        if (st.stands) { o.x = st.x; o.y = st.y; o.z = st.z; }
        else { feetOf(st, feet, 0.4 * sizeOfSeat(st, w.entries.length)); o.x = feet.x; o.y = feet.y; o.z = feet.z; }
        o.a = st.a; o.stands = st.stands;
        if (!handSeen.has(i)) setHand(i, st.x, st.y + 0.55 * sizeOfSeat(st, w.entries.length), st.z);
      }
      for (const i of stage.owners.keys()) if (i >= w.entries.length) stage.owners.delete(i);
    } else stage.owners.clear();
    for (const i of stage.hands.keys()) if (!handSeen.has(i)) stage.hands.delete(i);

    placeTags(now, w, revealing, t);
  });

  // the HUD's panes (chat, cards, dock): a tag never sits under one (you and the hovered one excepted); read every 20 frames
  const panes = useRef<Array<{ x0: number; x1: number; y0: number; y1: number }>>([]);
  const panesAt = useRef(-99);
  const readPanes = () => {
    if (frame.current - panesAt.current < 20) return panes.current;
    panesAt.current = frame.current;
    const out: typeof panes.current = [];
    document.querySelectorAll(".hud-pane").forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x0: r.left, x1: r.right, y0: r.top, y1: r.bottom });
    });
    // v21 fix: the home's playbill column (the headline, the name field, the ticket) is a pane too, with 24 px to spare on its right
    document.querySelectorAll(".playbill").forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x0: r.left, x1: r.right + 24, y0: r.top, y1: r.bottom });
    });
    panes.current = out;
    return out;
  };
  const underPane = (x0: number, x1: number, y0: number, y1: number) => panes.current.some((r) => x0 < r.x1 && r.x0 < x1 && y0 < r.y1 && r.y0 < y1);

  // dev captures (screenshots/v21/fix-tour3d/scout-tour.mjs): every character's screen box, to check the tour's captions stay clear of them
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const pt = new THREE.Vector3();
    (window as unknown as { __castBoxes?: unknown }).__castBoxes = () => {
      const out: Array<{ kind: string; stands: boolean; x0: number; y0: number; x1: number; y1: number; w?: number[] }> = [];
      const all = (window as unknown as { __castAll?: boolean }).__castAll;
      for (const c of chars.current.values()) {
        if (c.leaveAt || !c.fig) continue;
        if (all) { out.push({ kind: c.kind, stands: c.stands, x0: 0, y0: 0, x1: 0, y1: 0, w: [+c.target.x.toFixed(2), +c.target.y.toFixed(2), +c.target.z.toFixed(2), +c.sizeTo.toFixed(2)] }); continue; }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = false;
        for (let i = 0; i < 8; i++) {
          pt.set(c.pos.x + (i & 1 ? 0.4 : -0.4) * c.size, c.pos.y + (i & 2 ? 1.05 : 0) * c.size, c.pos.z + (i & 4 ? 0.4 : -0.4) * c.size).project(camera);
          if (pt.z < 1) front = true;
          const sx = ((pt.x + 1) / 2) * size.width, sy = ((1 - pt.y) / 2) * size.height;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        if (front) out.push({ kind: c.kind, stands: c.stands, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) });
      }
      return out;
    };
  }, [camera, size]);

  const projected = { x: 0, y: 0, ok: false };
  const project = (c: Char, dy: number) => {
    v.set(c.pos.x, c.pos.y + dy, c.pos.z).project(camera);
    projected.ok = v.z < 1 && v.z > -1 && v.x > -0.98 && v.x < 0.98 && v.y > -0.98 && v.y < 0.98;
    projected.x = ((v.x + 1) / 2) * size.width; projected.y = ((1 - v.y) / 2) * size.height;
    return projected;
  };

  const placeTags = (now: number, w: typeof hallBus.w, revealing: boolean, t: number) => {
    const host = tagHost();
    if (!host) return;
    // v21: below the home's first screen the tags are hidden (the tour); nothing to project until they come back
    if (hall.get().tour && hall.get().scroll >= 1) return;
    const W = size.width, H = size.height;
    readPanes();
    const s = hall.get();
    budget = phone ? TAGS_PHONE : s.shot === "home" ? TAGS_HOME : TAGS_PLAY;
    const homeWide = s.shot === "home" && W >= 1100;
    const topH = phone ? 56 : 80;
    /** v21.1: the handle tag's height (§7.11) */
    const TH = phone ? 24 : 26;
    const settled = !!w && (w.phase === "settled" || w.phase === "sold") && !!w.settlement;
    const all = [...chars.current.values()].filter((c) => !c.leaveAt && c.fig);
    const entries = all.filter((c) => c.kind === "entry");
    const onStage = entries.filter((c) => !c.stands).length;
    const crowded = onStage + (mine.current ? 1 : 0) > budget;
    // the drum stays clear: a tag of someone standing behind it never sits over the cage (you and the hovered one excepted)
    v.copy(CAGE_CENTRE).project(camera);
    const dcx = ((v.x + 1) / 2) * W, dcy = ((1 - v.y) / 2) * H, dz = camera.position.distanceTo(CAGE_CENTRE);
    v.copy(CAGE_CENTRE).add(v2.set(0.95, 0, 0)).project(camera);
    const drad = Math.abs(((v.x + 1) / 2) * W - dcx);
    /** whether a tag over this character could show: on screen, clear of the cage and of the HUD's panes (a crowd's budget goes to tags that do) */
    const shows = (c: Char) => {
      const p = project(c, c.size * 1.08);
      if (!p.ok) return false;
      if (camera.position.distanceTo(c.pos) > dz && Math.hypot(p.x - dcx, p.y - 11 - dcy) < drad + 30) return false;
      return !underPane(p.x - 45, p.x + 45, p.y - 28, p.y - 6);
    };
    // who gets a tag: you; the character under the pointer; then everyone in a small round, or the newest arrivals in a crowd
    const pick: Char[] = [];
    const add = (c: Char | undefined | null) => { if (c && !pick.includes(c) && pick.length < budget) pick.push(c); };
    const me = all.find((c) => c.kind === "me" || (c.kind === "entry" && w?.entries[c.idx]?.mine));
    let hovered: Char | null = null;
    add(me);
    if (now - pointer.current.at < 4000 && pointer.current.x > -1e3) {
      let best: Char | null = null, bd = 44 * 44;
      for (const c of all) {
        const p = project(c, 0.45 * c.size);
        if (!p.ok) continue;
        const d = (p.x - pointer.current.x) ** 2 + (p.y - pointer.current.y) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      add(best);
      hovered = best;
    }
    if (!crowded) {
      for (const c of entries) if (!c.stands) add(c);
    } else {
      const fresh = phone ? [] : entries.filter((c) => now - c.bornAt < 5000 && shows(c)).sort((a, b) => b.bornAt - a.bornAt).slice(0, 4);
      for (const c of fresh) add(c);
      // then the front of the stage (nearest the camera, a place never given by a result), up to a small share
      // of the budget: their tags flip at the reveal like everyone's; the others carry none
      const fill = Math.ceil(budget * 0.6);
      const near = entries.filter((c) => !c.stands && !pick.includes(c)).map((c) => ({ c, d: camera.position.distanceToSquared(c.pos) })).sort((a, b) => a.d - b.d);
      for (const { c } of near) { if (pick.length >= fill) break; if (shows(c)) add(c); }
    }
    // v21: every tag changes at the same instant, when the last ball has landed (stage.serveEnd); never one by one
    const allLanded = settled && (revealing ? t >= revealEnd(w!.entries.length) : stage.sim.served || s.quality === "none" || !stage.revealId || stage.revealId !== w!.id);
    const boxes: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    const list: Array<{ c: Char; x: number; y: number }> = [];
    for (const c of pick) {
      const p = project(c, c.size * 1.08);
      if (!p.ok) continue;
      const keep = c === me || c === hovered;
      if (!keep && camera.position.distanceTo(c.pos) > dz && Math.hypot(p.x - dcx, p.y - 11 - dcy) < drad + 30) continue;
      list.push({ c, x: p.x, y: p.y });
    }
    list.sort((a, b) => (a.c === me ? -1 : b.c === me ? 1 : b.y - a.y));
    const used = new Set<HTMLSpanElement>();
    // beyond the stage's seats: one pill over the stands' players, beside the drum (never over it) and clear of the HUD;
    // placed first, so the players' tags step around it
    const extra = w ? overflowOf(w.entries.length, w.mineIndex) : 0;
    if (extra > 0 && w) {
      let best: Char | null = null, bx = Infinity;
      for (const c of entries) {
        if (!c.stands) continue;
        const p = project(c, c.size * 1.25);
        if (!p.ok || Math.abs(p.x - dcx) < drad + 90 || underPane(p.x - 70, p.x + 70, p.y - 26, p.y)) continue;
        const d = Math.abs(p.x - dcx) + p.y * 0.25;
        if (d < bx) { bx = d; best = c; }
      }
      const el = best ? tagFor("stands", now, used) : null;
      if (el && best) {
        used.add(el);
        v.set(best.pos.x, best.pos.y + best.size * 1.25, best.pos.z).project(camera);
        const text = format(dictionary["h.stands"], { k: extra });
        const a = el.firstChild as HTMLElement;
        if (a.textContent !== text) a.textContent = text;
        (el.children[1] as HTMLElement).textContent = "";
        el.title = "";
        el.classList.remove("you", "genesis", "flip");
        el.classList.add("stands-pill");
        const wpx = Math.min(240, 35 + text.length * 7.2);
        const px = Math.round(Math.max(4, Math.min(W - wpx - 4, ((v.x + 1) / 2) * W - wpx / 2)));
        const py = Math.round(Math.max(4, Math.min(H - TH - 8, ((1 - v.y) / 2) * H - TH - 4)));
        boxes.push({ x0: px, x1: px + wpx, y0: py, y1: py + TH });
        el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
        el.style.opacity = "1";
        el.style.visibility = "visible";
      }
    }
    for (const { c, x, y } of list) {
      const e = w && c.kind === "entry" ? w.entries[c.idx] : undefined;
      const name = e ? (e.mine ? hallBus.myName : e.label) : c.kind === "me" ? s.me?.nickname ?? "" : c.name;
      const you = c.kind === "me" || !!e?.mine;
      let fig = "";
      let flipped = false;
      if (e && allLanded && e.share !== undefined) { fig = formatMultiplier(multiplierOf(e.share, e.amount, w!.total, w!.settlement!.tokensOut)); flipped = true; }
      else if (e) fig = sol2(e.amount);
      const text = you ? `you · ${name}` : name;
      const wpx = Math.min(280, 35 + (text.length + fig.length) * 7.1 + (fig ? 6 : 0));
      const want = x - wpx / 2;
      const x0 = Math.max(8, Math.min(W - wpx - 8, want));
      const y1 = y - 8;
      // v21 culling, nearest first: an overlap (4 px margin), a HUD pane, the top bar's band, or a clamp past 24 px drops the tag
      if (Math.abs(x0 - want) > 24) continue;
      if (y1 - TH < topH) continue;
      // v21 fix (§7.5): on the wide home the left 44 % belongs to the playbill; no tag is anchored there
      if (homeWide && c !== hovered && x < 0.44 * W) continue;
      if (boxes.some((bx) => x0 < bx.x1 + 4 && bx.x0 < x0 + wpx + 4 && y1 - TH < bx.y1 + 4 && bx.y0 < y1 + 4)) continue;
      if (c !== hovered && underPane(x0, x0 + wpx, y1 - TH, y1)) continue;
      const el = tagFor(c.key, now, used);
      if (!el) break;
      used.add(el);
      const a = el.firstChild as HTMLElement;
      const b = el.children[1] as HTMLElement;
      if (a.textContent !== text) a.textContent = text;
      if (b.textContent !== fig) {
        const had = b.textContent !== "";
        b.textContent = fig;
        el.classList.remove("flip");
        if (flipped && had && !s.reduced) { void el.offsetWidth; el.classList.add("flip"); }
      }
      const hover = e ? `${name} · in ${solShort(e.amount)} SOL · joined ${Math.max(0, Math.round((Date.now() - (w!.openedAt + e.arrivedAt)) / 1000))} s ago` : name;
      if (el.title !== hover) el.title = hover;
      el.classList.toggle("you", you);
      if (el.dataset.scarf !== c.color) { el.dataset.scarf = c.color; el.style.setProperty("--tag-scarf", c.color); }
      el.classList.toggle("genesis", you && !!s.me?.genesis);
      el.classList.remove("stands-pill");
      boxes.push({ x0, x1: x0 + wpx, y0: y1 - TH, y1 });
      const tf = `translate3d(${Math.round(x0)}px, ${Math.round(y1 - TH)}px, 0)`;
      if (el.style.transform !== tf) el.style.transform = tf;
      const rise = Math.min(1, (now - Math.max(c.bornAt, Number(el.dataset.born) || 0)) / 160);
      el.style.opacity = String(rise);
      el.style.visibility = "visible";
    }
    // tags nobody holds this frame go back to the pool
    for (const [key, el] of tagByKey.current) {
      if (used.has(el)) continue;
      tagByKey.current.delete(key);
      el.style.visibility = "hidden"; el.style.opacity = "0";
      (el.firstChild as HTMLElement).textContent = "";
      (el.children[1] as HTMLElement).textContent = "";
    }
  };

  return null;
}
