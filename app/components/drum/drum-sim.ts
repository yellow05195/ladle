/**
 * The drum's state and physics (v21), with no rendering: the 3D scene reads
 * it every frame. Driven by the LiveWindow snapshots only:
 *
 *   open    the cage turns (0.25 rev/s, ramping to 0.8 rev/s over the last
 *           10 slots: the scene sets `omegaOpen`); each new entry is a ball
 *           dropped into the funnel that falls in through the chute, ONE AT A
 *           TIME (the chute is a queue: a ball enters only when the one
 *           before it has cleared the gate), and tumbles inside;
 *   sealed  the cage brakes on a spring (900 ms) and the gate shuts;
 *   settled the cage makes ONE decisive turn, then the ladle serves the
 *           balls (the scene sets `served`), in ARRIVAL order, never by
 *           result. Every ball has the same size; a ball's colour is its
 *           player's (an identity), a result has none.
 *
 * v21 physics: a fixed 240 Hz step with an accumulator (the same motion at
 * any frame rate), two contact passes per step, Coulomb-limited grip on the
 * wires (the pile climbs the turning wall and rolls back instead of being
 * flung), no random forces (a ball's only "noise" is a fixed nudge seeded by
 * its index when it enters). The ball radius follows the entry count, so 2
 * to 120 balls fit loosely and tumble: it shrinks smoothly as a round fills,
 * the same for every ball.
 *
 * Units: the cage radius is 1. Ball positions are relative to the cage
 * centre in the rig's frame (the frame does not turn with the cage: the cage
 * turns around the balls and its wires drag them).
 */
import * as THREE from "three";
import type { LiveWindow } from "../../lib/data/types";
import { playerColor } from "../../lib/colors";
import { easeMech } from "./materials";

export const MAX_BALLS = 120;
export const R = 1;
export const WIRE = 0.0115;
/** The largest ball (a round of up to 6 entries); the radius shrinks with the count. */
export const RB = 0.12;
export const RB_MIN = 0.05;
export const CAGE_Y = 0.4;
export const CHUTE_Y0 = R + 0.04; // the gate, relative to the cage centre
export const CHUTE_Y1 = R + 0.56; // the funnel

/** Ball radius (cage units) for a round of `n` balls: the pile fills about 3 % of the cage. */
export function ballRadiusFor(n: number): number {
  return Math.min(RB, Math.max(RB_MIN, Math.cbrt(0.018 / Math.max(1, n))));
}

const G = 8.5;
const STEP = 1 / 240;
const MAX_STEPS = 12;
/** inner wall: the wires' inside face */
const R_IN = R - WIRE * 1.6;
const E_WALL = 0.32;
const E_BALL = 0.28;
/**
 * v21 fix: stick-slip grip on the wires. A ball moving with the wall grips up
 * to MU_S times the load (it rides up to about atan(MU_S), 40 degrees), then
 * slips and slides back on MU_K: the heap sloshes in the lower third of the
 * cage and the top balls roll down over it, instead of being carried over the
 * top and dropped through the middle (the "totem" and the floating balls).
 */
const MU_S = 0.84;
const MU_K = 0.42;
/** below this slip (cage units / s) a ball is stuck to the wires */
const STICK = 0.14;
/** share of the slip a passing wire takes up (a small knock, only while the ball presses on the wall) */
const CATCH = 0.08;
const MU_BALL = 0.08;
const DRAG = 0.35;
/** the wall speed the balls can be dragged to (cage units / s): a stir, never a centrifuge */
const V_WALL_MAX = 2.6;
const CHUTE_GAP_MS = 170;
/** the chute's gap when a burst backs it up (balls drop like beads on a string, never touching) */
const CHUTE_GAP_BUSY_MS = 80;
/** The time a ball needs to clear `k` radii below the funnel: the next one enters only then (no two touch in the chute). */
function chuteClearMs(r: number, k = 2.4): number {
  const d = k * r;
  return ((-CHUTE_V0 + Math.sqrt(CHUTE_V0 * CHUTE_V0 + 2 * G * d)) / G) * 1000;
}
const CHUTE_V0 = 1.6;
/** an entry already this old when its round is first seen is in the drum (no toss, no drop) */
const FRESH_MS = 1800;
/** time for a ball to fall from the funnel through the gate */
const CHUTE_FALL_MS = 260;

export const OMEGA_IDLE = Math.PI * 2 * 0.25;
export const OMEGA_FAST = Math.PI * 2 * 0.8;
export const BRAKE_MS = 900;
export const SPIN_MS = 1150;
export const TAG_MS = 2400;
export const OUT_MS = 320;
/** the owner's hop, before their ball drops into the funnel (v21 fix: no toss across the room) */
export const TOSS_MS = 420;
/** the ball's short fall into the funnel's mouth, just before it enters the chute */
export const DROP_IN_MS = 190;
/** how far above the chute's start the ball appears (cage units): a short ballistic drop, never a hover */
export const DROP_IN_H = 0.16;

export type Mode = "drop" | "drum" | "out";

export interface SimBall {
  i: number;
  key: string;
  label: string;
  initials: string;
  mine: boolean;
  /** the player's colour: an identity, never a result */
  color: string;
  amount: bigint;
  p: THREE.Vector3;
  v: THREE.Vector3;
  w: THREE.Vector3;
  q: THREE.Quaternion;
  mode: Mode;
  /** when the ball enters the funnel (after its toss) */
  born: number;
  /** when the toss from the owner's character starts (0: no toss) */
  tossAt: number;
  outAt: number;
  /** world position, written by the scene each frame */
  world: THREE.Vector3;
  /** first knock on the cage floor (the clack), 0 once played */
  landAt?: number;
  /** touching the wall in the last step (rolling) */
  onWall: boolean;
  /** the wire sector under the ball (a change is a catch) */
  wire?: number;
}

export const inDrum = (b: SimBall) => b.mode === "drum";

const tmpN = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export type SimEvent = "clack" | "spin" | "drop";

/** A fixed nudge per index in [-1, 1] (no Math.random in the drum: the same round tumbles the same way). */
function nudge(i: number, salt: number): number {
  let h = (i * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

export class DrumSim {
  /** Sound hooks (the scene's owner sets it). */
  onEvent: ((e: SimEvent, i?: number) => void) | null = null;
  balls: SimBall[] = [];
  leaving: SimBall[] = [];
  windowId = "";
  phase: LiveWindow["phase"] = "open";
  angle = 0;
  omega = 0;
  /** the ball radius now (cage units), easing toward `rbTarget` */
  rb = RB;
  rbTarget = RB;
  /** the scene sets it from the slots left */
  omegaOpen = OMEGA_IDLE;
  /** the ladle has taken the balls out of the cage */
  served = false;
  /** display name of an entry (the viewer's nickname for their own) */
  nameOf: (label: string, mine: boolean) => string = (l, m) => (m ? "you" : l);
  /** the viewer's identity colour (their scarf), when they have a profile */
  myColor: string | null = null;
  spinAt = 0;
  private spinFrom = 0;
  private spinFired = false;
  lockAt = 0;
  /** when the gate starts to shut: the seal, or later if balls are still in the chute */
  gateAt = 0;
  openAt = 0;
  settledAt = 0;
  sold = false;
  /** the chute is free from this time (performance.now()) */
  private chuteFree = 0;
  private dragOmega = 0;
  private brakeFrom = 0;
  private curOmega = OMEGA_IDLE;
  private synced = false;
  private acc = 0;

  /** Feed a snapshot. `now` is performance.now(). */
  setWindow(w: LiveWindow, now: number): void {
    const fresh0 = w.id !== this.windowId;
    if (fresh0) {
      const first = this.windowId === "";
      this.windowId = w.id;
      for (const b of this.balls) { b.mode = "out"; b.outAt = now; }
      this.leaving.push(...this.balls);
      this.balls = [];
      this.spinAt = 0; this.lockAt = 0; this.gateAt = 0; this.settledAt = 0; this.spinFired = false;
      this.sold = false; this.served = false;
      this.chuteFree = 0;
      this.openAt = first ? now - 2000 : now;
    }
    this.phase = w.phase;
    const first = !this.synced;
    this.synced = true;

    const n = Math.min(MAX_BALLS, w.entries.length);
    this.rbTarget = ballRadiusFor(n);
    const fresh = this.balls.length === 0;
    if (fresh && n > 0) this.rb = this.rbTarget;
    let queued = 0;
    const placed: SimBall[] = [];
    const wall = Date.now();
    for (let i = this.balls.length; i < n; i++) {
      const e = w.entries[i]!;
      // a round seen for the first time mid-way (the focus moved to it, the page woke up): the entries
      // that landed a while ago are already in the drum; only the new ones are tossed and drop
      const stale = fresh0 && wall - (w.openedAt + e.arrivedAt) > FRESH_MS;
      const drops = !first && w.phase === "open" && !stale;
      const name = this.nameOf(e.label, e.mine);
      let born = now - TAG_MS, tossAt = 0;
      if (drops) {
        // the chute takes one ball at a time: the toss is timed to reach the funnel when it is free;
        // a backed-up chute runs its balls closer together
        const busy = this.chuteFree - now > 900;
        born = Math.max(now + TOSS_MS + 120 * queued++, this.chuteFree);
        this.chuteFree = born + Math.max(busy ? CHUTE_GAP_BUSY_MS : CHUTE_GAP_MS, chuteClearMs(Math.max(this.rb, this.rbTarget)));
        tossAt = born - TOSS_MS;
      }
      const b: SimBall = {
        i, key: `${w.id}:${i}`, label: name, initials: initialsOf(name), mine: e.mine, color: e.mine && this.myColor ? this.myColor : playerColor(name), amount: e.amount,
        p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(nudge(i, 1) * 3, nudge(i, 2) * 3, nudge(i, 3) * 3)),
        mode: drops ? "drop" : "drum", born, tossAt, outAt: 0, world: new THREE.Vector3(), onWall: false,
      };
      if (drops) { b.p.set(0, CHUTE_Y1 + 0.08, 0); b.v.set(0, -CHUTE_V0, 0); this.onEvent?.("drop", i); }
      else placed.push(b);
      this.balls.push(b);
    }
    if (placed.length) this.pack(placed);
    for (let i = 0; i < n; i++) {
      const e = w.entries[i]!, b = this.balls[i]!;
      if (b.mine !== e.mine) { b.mine = e.mine; b.label = this.nameOf(e.label, e.mine); b.initials = initialsOf(b.label); b.color = e.mine && this.myColor ? this.myColor : playerColor(b.label); }
    }

    if (w.phase !== "open" && this.lockAt === 0) {
      this.lockAt = first ? now - 2000 : now;
      this.brakeFrom = this.curOmega;
      // the gate shuts behind the last ball still on its way down the chute, never through it
      let last = 0;
      for (const b of this.balls) if (b.mode === "drop") last = Math.max(last, b.born + CHUTE_FALL_MS);
      this.gateAt = Math.max(this.lockAt, last);
    }
    if ((w.phase === "settled" || w.phase === "sold") && w.settlement && this.settledAt === 0) {
      this.settledAt = now;
      // the decisive turn starts when the round is served; a page opened on a served round shows it at rest
      this.spinAt = first ? now - 99_999 : now;
      this.spinFrom = this.angle;
      this.spinFired = first;
      if (first) this.served = true;
    }
    this.sold = w.phase === "sold";
  }

  /**
   * Balls that are already in the drum when the page opens (or a burst):
   * a loose heap on the cage floor, relaxed so no two overlap.
   */
  private pack(list: SimBall[]): void {
    const r = this.rb, lim = R_IN - r;
    const all = this.balls.filter((b) => b.mode === "drum");
    list.forEach((b, k) => {
      const i = b.i;
      // a golden-angle spiral over the floor, rising in layers
      const layerN = Math.max(4, Math.floor(((lim * 0.9) / (r * 2.05)) ** 2 * 0.8));
      const layer = Math.floor(i / layerN), j = i % layerN;
      const rho = Math.sqrt((j + 0.5) / layerN) * lim * 0.82;
      const a = j * 2.39996 + layer * 0.9;
      const x = Math.cos(a) * rho, z = Math.sin(a) * rho * 0.9;
      const floor = -Math.sqrt(Math.max(0, lim * lim - x * x - z * z));
      b.p.set(x, floor + layer * r * 1.8, z);
      void k;
    });
    // relax: positions only
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < all.length; i++) {
        const a = all[i]!;
        for (let j = i + 1; j < all.length; j++) {
          const c = all[j]!;
          tmpN.subVectors(c.p, a.p);
          const d2 = tmpN.lengthSq(), min = 2 * r;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(Math.max(d2, 1e-12));
          if (d2 < 1e-12) tmpN.set(1, 0, 0); else tmpN.divideScalar(d);
          const push = (min - d) / 2;
          a.p.addScaledVector(tmpN, -push); c.p.addScaledVector(tmpN, push);
        }
      }
      for (const b of all) {
        b.p.y -= 0.004; // settle downward
        const d = b.p.length();
        if (d > lim) b.p.multiplyScalar(lim / d);
      }
    }
    for (const b of list) b.v.set(0, 0, 0);
  }

  get locked(): boolean { return this.phase !== "open"; }
  get spinning(): boolean { return this.spinAt !== 0 && this.omega !== 0; }

  step(dt: number, now: number): void {
    const prevAngle = this.angle;
    if (this.spinAt && !this.spinFired && now >= this.spinAt) { this.spinFired = true; this.onEvent?.("spin"); }
    if (this.spinAt && now >= this.spinAt && now < this.spinAt + SPIN_MS) {
      this.angle = this.spinFrom + Math.PI * 2 * easeMech((now - this.spinAt) / SPIN_MS);
    } else if (this.spinAt && now >= this.spinAt + SPIN_MS) {
      this.angle = this.spinFrom + Math.PI * 2;
    } else if (this.phase === "open") {
      this.curOmega += (this.omegaOpen - this.curOmega) * Math.min(1, dt * 2.2);
      this.angle += this.curOmega * dt;
    } else {
      // sealed: a spring brake, 900 ms, with one small overshoot
      const t = Math.min(1, (now - this.lockAt) / BRAKE_MS);
      const om = t >= 1 ? 0 : this.brakeFrom * Math.exp(-t * 4.2) * Math.cos(t * Math.PI * 1.12);
      this.angle += om * dt + this.dragOmega * dt;
      this.dragOmega *= Math.exp(-dt * 16);
    }
    if (this.phase === "open") this.dragOmega *= Math.exp(-dt * 6);
    const raw = dt > 0 ? (this.angle - prevAngle) / dt : 0;
    this.omega = Math.abs(raw) < 1e-4 ? 0 : raw;
    if (dt <= 0) return;
    // the radius eases to the count's (the same for every ball)
    this.rb += (this.rbTarget - this.rb) * Math.min(1, dt * 1.2);

    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
    let steps = 0;
    while (this.acc >= STEP) { this.acc -= STEP; steps++; }
    const t0 = now - steps * STEP * 1000;
    for (let s = 0; s < steps; s++) this.substep(STEP, t0 + (s + 1) * STEP * 1000);

    for (const b of this.balls) if (b.landAt && now >= b.landAt) { b.landAt = 0; this.onEvent?.("clack"); }
    this.leaving = this.leaving.filter((b) => now - b.outAt < OUT_MS);
  }

  private substep(h: number, now: number): void {
    const balls = this.balls;
    const r = this.rb, lim = R_IN - r, om = this.omega;
    const live: SimBall[] = [];
    for (const b of balls) {
      if (now < b.born || !(b.mode === "drop" || inDrum(b))) continue;
      if (b.mode !== "drop") b.v.y -= G * h;
      if (b.mode === "drop") {
        // the chute: on its axis, straight down through the gate, a pure function of the time since the
        // ball entered the funnel (so a slow frame never holds a ball in the chute or stacks the next on it)
        const s = Math.max(0, now - b.born) / 1000;
        b.p.set(0, CHUTE_Y1 + 0.08 - CHUTE_V0 * s - 0.5 * G * s * s, 0);
        b.v.set(0, -CHUTE_V0 - G * s, 0);
        b.w.set(0.9, 0, 0.4).multiplyScalar(6);
        if (b.p.y < lim - 0.02) {
          b.mode = "drum";
          b.v.x += nudge(b.i, 7) * 0.7; b.v.z += nudge(b.i, 8) * 0.45;
          b.landAt = now + 200;
        }
        this.spin(b, h);
        continue;
      }
      b.v.multiplyScalar(1 - DRAG * h);
      b.p.addScaledVector(b.v, h);
      b.onWall = false;
      live.push(b);
    }
    // contacts: two passes, velocities resolved on the first
    for (let pass = 0; pass < 2; pass++) {
      const vel = pass === 0;
      for (let i = 0; i < live.length; i++) {
        const a = live[i]!;
        for (let j = i + 1; j < live.length; j++) {
          const c = live[j]!;
          const dx = c.p.x - a.p.x;
          const min = 2 * r;
          if (dx > min || dx < -min) continue;
          const dy = c.p.y - a.p.y;
          if (dy > min || dy < -min) continue;
          const dz = c.p.z - a.p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(Math.max(d2, 1e-12));
          if (d2 < 1e-12) tmpN.set(0, 1, 0); else tmpN.set(dx / d, dy / d, dz / d);
          const push = (min - d) * 0.5;
          a.p.addScaledVector(tmpN, -push); c.p.addScaledVector(tmpN, push);
          if (!vel) continue;
          tmpA.subVectors(c.v, a.v);
          const rv = tmpA.dot(tmpN);
          if (rv < 0) {
            const jn = (-(1 + E_BALL) * rv) / 2;
            a.v.addScaledVector(tmpN, -jn); c.v.addScaledVector(tmpN, jn);
            // a little friction between balls
            tmpA.addScaledVector(tmpN, -rv);
            a.v.addScaledVector(tmpA, MU_BALL * 0.5); c.v.addScaledVector(tmpA, -MU_BALL * 0.5);
          }
        }
      }
      for (const b of live) {
        const d = b.p.length();
        if (d <= lim) continue;
        tmpN.copy(b.p).divideScalar(d);
        b.p.copy(tmpN).multiplyScalar(lim);
        if (!vel) continue;
        b.onWall = true;
        const vn = b.v.dot(tmpN);
        let jn = 0;
        // a resting contact (gravity's step into the wall) takes no bounce; a knock does
        if (vn > 0) { jn = vn * (1 + (vn > 0.4 ? E_WALL : 0)); b.v.addScaledVector(tmpN, -jn); }
        // the wires' velocity at the contact (the cage turns by -angle about x), its tangent part capped
        tmpW.set(0, om * b.p.z, -om * b.p.y);
        tmpW.addScaledVector(tmpN, -tmpW.dot(tmpN));
        const ws = tmpW.length();
        if (ws > V_WALL_MAX) tmpW.multiplyScalar(V_WALL_MAX / ws);
        tmpB.copy(b.v).addScaledVector(tmpN, -b.v.dot(tmpN));
        tmpA.subVectors(tmpW, tmpB);
        const slip = tmpA.length();
        if (slip > 1e-6) {
          // a meridian wire passing under the ball catches it (12 catches per turn), like the ribs of a real cage
          const sector = Math.floor((Math.atan2(b.p.z, b.p.y) + this.angle) / (Math.PI / 6));
          const caught = b.wire !== undefined && sector !== b.wire;
          b.wire = sector;
          // grip limited by the load (Coulomb, stick-slip): the load is the normal impulse of this step
          // (gravity's push into the wall, the pile above, the turn's centripetal pull), nothing more
          const load = jn;
          const max = (slip < STICK ? MU_S : MU_K) * load + (caught && load > 0 ? slip * CATCH : 0);
          const k = Math.min(slip, max) / slip;
          b.v.addScaledVector(tmpA, k);
        }
      }
    }
    // rolling (looks only): on the wall the ball rolls against the wires, else it spins down slowly
    for (const b of live) {
      if (b.onWall) {
        tmpN.copy(b.p).normalize();
        tmpW.set(0, om * b.p.z, -om * b.p.y);
        tmpA.copy(b.v).sub(tmpW);
        tmpB.crossVectors(tmpN, tmpA).multiplyScalar(-1 / r);
        b.w.lerp(tmpB, Math.min(1, 30 * h));
      } else {
        b.w.multiplyScalar(Math.exp(-0.8 * h));
      }
      // quiet the last millimetres per second (a heap at rest stays at rest)
      if (b.v.lengthSq() < 0.0004 && om === 0) b.v.multiplyScalar(0.9);
      this.spin(b, h);
    }
  }

  private spin(b: SimBall, h: number): void {
    const wl = b.w.length();
    const a = wl * h;
    if (a < 1e-6) return;
    tmpA.copy(b.w).divideScalar(wl);
    tmpQ.setFromAxisAngle(tmpA, a);
    b.q.premultiply(tmpQ);
  }
}

function initialsOf(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "··";
}
