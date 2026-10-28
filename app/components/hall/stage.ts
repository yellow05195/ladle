"use client";

/**
 * The stage's shared mutable state (v21): the drum simulation, where each
 * player's character stands (written by Cast, read by the drum for tosses
 * and serves), and the reveal timeline. Plain objects read in useFrame: no
 * React state, no re-render per frame.
 *
 * The reveal (v21), identical for every result:
 *   0      the cage makes its one decisive turn (1150 ms), the gate opens
 *   1150   the ladle dips into the funnel and scoops (the cage empties)
 *   1950   the ladle carries the scoop forward and down to the front of the
 *          drum's pedestal and tilts
 *   2620   it pours: one ball at a time, in ARRIVAL order, each falling onto
 *          the pedestal and rolling in a straight low line to the pedestal's
 *          rim, hopping down onto the felt and rolling to its owner's feet
 *          (owners in the stands: up to the stage's rim, then one low hop)
 *   end    the last ball reaches its owner; the ladle goes home
 * Every ball rolls at the same speed and is the same size; nothing is
 * coloured, sized or slowed by a result.
 */
import * as THREE from "three";
import { DrumSim, SPIN_MS, type SimEvent } from "../drum/drum-sim";

/** The drum cradle (higgsfield/drum-cradle-tripo.glb, 1 unit wide) at scale 3.2 on the stage top. */
export const STAGE_TOP = 0.48;
export const CRADLE_SCALE = 3.2;
/** The cage: R = 1 scaled 0.77, centred between the cradle's hubs. */
export const CAGE_SCALE = 0.77;
export const CAGE_CENTRE = new THREE.Vector3(-0.06, STAGE_TOP + 0.66 * CRADLE_SCALE, -0.16);
/** The cradle's round pedestal under the cage: its top and usable radius (measured on the model). */
export const PED_TOP = 1.13;
export const PED_R = 1.3;
/** The ladle hangs above the drum, handle up, bowl down; its bowl centre (the mark's ball) at this height when it serves. */
export const LADLE_BOWL_Y = 4.6;
export const LADLE_X = 0;
export const LADLE_Z = -0.16;
/**
 * v21 fix: the ladle is the v21 mark (public/brand/ladle-mark.svg, the "d": its cradle holding the
 * ball, the handle with its hanging hole) in polished brass, 0.95 m tall. Mark units to metres; the
 * group's origin is the mark's ball centre.
 */
export const LADLE_H = 0.95;
export const LADLE_S = LADLE_H / 80;
export const MARK_O = { x: 42.51, y: 53.88 };
/** the cradle's inner radius (metres) and its lip's angle from straight down, toward the lip (the mark's left) */
export const LADLE_CUP_R = 19.18 * LADLE_S;
export const LADLE_LIP_A = THREE.MathUtils.degToRad(72);
/**
 * v21 fix: between serves the ladle is parked up under the spotlight's rig, out of the desktop shots
 * (never cut by their top edge); it comes down during the decisive turn and goes back up after.
 */
export const LADLE_PARK_DY = 1.3;
export const LADLE_PARK_Y = LADLE_BOWL_Y + LADLE_PARK_DY;
/** the ball centre of a ball of radius r resting in the cradle at angle a (from straight down, toward the lip), ladle frame */
export function cupPoint(a: number, r: number, out: { x: number; y: number }): { x: number; y: number } {
  const rc = Math.max(0.01, LADLE_CUP_R - r);
  out.x = -rc * Math.sin(a); out.y = -rc * Math.cos(a);
  return out;
}
/**
 * Where the ladle pours: low in front of the pedestal, left of centre, tipped toward its lip (the mark's
 * left) so the balls drop straight down onto the pedestal; the cradle and the handle stay under and
 * beside the (empty) cage, never across it.
 */
export const POUR_POS = new THREE.Vector3(-0.3, 1.6, 0.95);
export const POUR_TILT = THREE.MathUtils.degToRad(70);
/** the scoop's dip: the lip leans into the funnel */
const DIP_TILT = THREE.MathUtils.degToRad(25);

/* reveal timeline (ms after the decisive turn starts), identical for every result */
export const T_SPIN = SPIN_MS;            // 1150: the turn ends, the gate opens
export const T_DOWN = 320;                // the ladle descends to the gate
export const T_TILT = 100;                // dips
export const T_HOLD = 80;                 // holds
export const T_UP = 300;                  // lifts
export const T_SCOOP = T_SPIN + T_DOWN + T_TILT;           // balls leave the cage, sit on the ladle
export const T_CARRY = T_SCOOP + T_HOLD + T_UP;            // 1950: the ladle carries the scoop to the pedestal
export const CARRY_MS = 560;
export const POUR_TILT_MS = 220;
export const T_POUR = T_CARRY + CARRY_MS + POUR_TILT_MS - 30; // 2620: the first ball leaves the lip
/** kept for older callers (the art stills): the serve starts with the pour */
export const T_SERVE = T_POUR;
export const RETURN_MS = 700;
/** rolling speed on the pedestal and the felt (m/s) */
export const ROLL_V = 3.2;
export const HOP_MS = 200;
export const STANDS_HOP_MS = 460;
export const CATCH_MS = 170;
/** gap between two balls leaving the lip: the whole pour takes about 1.3 s at most */
export const staggerFor = (n: number) => Math.min(110, Math.max(11, 1300 / Math.max(1, n)));
export const pourEnd = (n: number) => T_POUR + Math.max(0, n - 1) * staggerFor(n);
/** Kept for callers that need an end before the paths are known: the longest path a ball can take. */
export const revealEnd = (n: number) => (stage.serveEnd > 0 && stage.serveN === n ? stage.serveEnd : pourEnd(n) + 2300);
/** When the ladle starts home: after the last ball has left its lip. */
export const ladleHomeAt = (n: number) => pourEnd(n) + 160;

const easeInOut2 = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface LadlePose { x: number; y: number; z: number; tilt: number; /** the scoop rides on the ladle */ full: boolean }

/**
 * The ladle's pose at reveal time t (ms), a pure function: the ladle, the
 * balls riding on it and the poured balls all read it, so they never lag.
 * `drop` is how far it dips into the funnel; `n` the number of balls.
 */
export function ladlePose(t: number, n: number, drop: number, out: LadlePose): LadlePose {
  // parked under the rig between serves (and always under reduced motion: no ladle moves)
  out.x = LADLE_X; out.y = LADLE_PARK_Y; out.z = LADLE_Z; out.tilt = 0; out.full = false;
  if (t < 0 || stage.reduced) return out;
  // comes down from its park during the decisive turn
  if (t < T_SPIN) { out.y = LADLE_BOWL_Y + LADLE_PARK_DY * (1 - easeInOut2(clamp01(t / (T_SPIN - 150)))); return out; }
  out.y = LADLE_BOWL_Y;
  const a = t - T_SPIN;
  if (a < T_DOWN) { out.y -= drop * easeInOut2(a / T_DOWN); return out; }
  if (a < T_DOWN + T_TILT) { out.y -= drop; out.tilt = DIP_TILT * easeInOut2((a - T_DOWN) / T_TILT); return out; }
  out.full = true;
  if (a < T_DOWN + T_TILT + T_HOLD) { out.y -= drop; out.tilt = DIP_TILT; return out; }
  if (t < T_CARRY) { const u = easeInOut2((t - T_SCOOP - T_HOLD) / T_UP); out.y -= drop * (1 - u); out.tilt = DIP_TILT * (1 - u); return out; }
  const home = ladleHomeAt(n);
  // the carry: forward first (clear of the funnel and the cage), then down in front of the drum
  const carry = (u: number) => {
    const fz = easeInOut2(clamp01(u / 0.55)), fy = easeInOut2(clamp01((u - 0.25) / 0.75));
    out.x = LADLE_X + (POUR_POS.x - LADLE_X) * fz;
    out.z = LADLE_Z + (POUR_POS.z - LADLE_Z) * fz;
    out.y = LADLE_BOWL_Y + (POUR_POS.y - LADLE_BOWL_Y) * fy;
  };
  if (t < T_CARRY + CARRY_MS) { carry((t - T_CARRY) / CARRY_MS); return out; }
  carry(1);
  if (t < home) { out.tilt = POUR_TILT * easeInOut2(clamp01((t - T_CARRY - CARRY_MS) / POUR_TILT_MS)); return out; }
  out.full = false;
  // home again: untilt, then the carry backwards
  const b = (t - home) / RETURN_MS;
  // home, then back up to its park
  if (b >= 1) { out.x = LADLE_X; out.z = LADLE_Z; out.y = LADLE_BOWL_Y + LADLE_PARK_DY * easeInOut2(clamp01((t - home - RETURN_MS) / 1000)); return out; }
  out.tilt = POUR_TILT * (1 - easeInOut2(clamp01(b / 0.25)));
  carry(1 - clamp01((b - 0.15) / 0.85));
  return out;
}


/** One served ball's path, fixed when the pour starts (world metres, ms on the reveal clock). */
export interface ServePath {
  /** leaves the lip */
  t0: number;
  lip: THREE.Vector3;
  /** lands on the pedestal */
  land: THREE.Vector3;
  tLand: number;
  /** the pedestal's rim */
  rim: THREE.Vector3;
  tRim: number;
  /** on the felt, below the rim */
  felt: THREE.Vector3;
  tFelt: number;
  /** the owner's feet (stage) or the stage's rim (stands) */
  end: THREE.Vector3;
  tEnd: number;
  /** stands owners: the hop target, and when it lands */
  hop: THREE.Vector3 | null;
  tHop: number;
  /** the ball's radius (world) */
  r: number;
}

export interface Spot { pos: THREE.Vector3; ready: boolean }

export const stage = {
  sim: new DrumSim(),
  /** entry index → where its owner's hands are (world), for tosses */
  hands: new Map<number, THREE.Vector3>(),
  /** entry index → where its owner stands (world, feet), for serves */
  owners: new Map<number, { x: number; y: number; z: number; a: number; stands: boolean }>(),
  /** entry index → performance.now() of its hop (ball drop) */
  hopAt: new Map<number, number>(),
  /** entry index → performance.now() its served ball lands (catch + tag flip) */
  landAt: new Map<number, number>(),
  /** the ladle's bowl, world (written by the ladle) */
  bowl: new THREE.Vector3(LADLE_X, LADLE_BOWL_Y, LADLE_Z),
  /** the funnel's mouth, world (written by the drum) */
  funnel: new THREE.Vector3(CAGE_CENTRE.x, CAGE_CENTRE.y + 1.7 * CAGE_SCALE, CAGE_CENTRE.z),
  /** how far the ladle dips (written by the drum from the funnel) */
  dip: 0.13,
  /** the reveal in progress: window id and its start (performance.now()), or none */
  revealId: "",
  revealT0: 0,
  revealN: 0,
  /** the serve paths of the reveal in progress, by entry index */
  serve: new Map<number, ServePath>(),
  /** the last ball's arrival (reveal ms) for `serveN` balls, 0 before the paths are known */
  serveEnd: 0,
  serveN: 0,
  /** reduced motion: no turn, no ladle, no arcs */
  reduced: false,
  /** characters loaded on the stage (dev captures wait for them) */
  castReady: 0,
};

type SimListener = (e: SimEvent, i?: number) => void;
const simListeners = new Set<SimListener>();
stage.sim.onEvent = (e, i) => simListeners.forEach((l) => l(e, i));
/** Listen to the drum's events (drop, clack, spin). */
export function onSim(l: SimListener): () => void { simListeners.add(l); return () => { simListeners.delete(l); }; }

export function revealTime(now: number): number {
  return stage.revealT0 ? now - stage.revealT0 : -1;
}

/** The pedestal's arms (the cradle's uprights) stand at azimuths 77-117 and 243-283: balls leave the rim beside them. */
function exitAzimuth(a: number): number {
  const A = ((a % 360) + 360) % 360;
  if (A >= 74 && A < 97) return 70;
  if (A >= 97 && A <= 120) return 124;
  if (A >= 240 && A < 263) return 236;
  if (A >= 263 && A <= 286) return 290;
  return A;
}

const lipLocal = new THREE.Vector3();
const cupXY = { x: 0, y: 0 };
const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const e4 = new THREE.Euler();
const one = new THREE.Vector3(1, 1, 1);

/** The world position of a point given in the ladle's frame, at a pose. */
export function ladlePoint(pose: LadlePose, lx: number, ly: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
  q4.setFromEuler(e4.set(0, 0, pose.tilt));
  m4.compose(lipLocal.set(pose.x, pose.y, pose.z), q4, one);
  return out.set(lx, ly, lz).applyMatrix4(m4);
}

/**
 * Lays out the serve: every ball's path from the lip to its owner, from the
 * owners' places (stage.owners) and the ball radius (world). Arrival order
 * gives the departure; the paths only depend on where the owners stand.
 */
export function planServe(n: number, rWorld: number): void {
  stage.serve.clear();
  const st = staggerFor(n);
  const pose: LadlePose = { x: 0, y: 0, z: 0, tilt: 0, full: false };
  ladlePose(T_POUR + 1, n, stage.dip, pose);
  let end = 0;
  for (let i = 0; i < n; i++) {
    const o = stage.owners.get(i);
    if (!o) continue;
    const t0 = T_POUR + i * st;
    // the lip of the cradle (the mark's left), tipped down: the ball drops straight onto the pedestal
    const c = cupPoint(LADLE_LIP_A + 0.06, rWorld, cupXY);
    const lip = ladlePoint(pose, c.x, c.y, 0, new THREE.Vector3());
    const land = new THREE.Vector3(lip.x - 0.03, PED_TOP + rWorld, lip.z);
    const fall = Math.sqrt((2 * Math.max(0.01, lip.y - land.y)) / 9.8) * 1000;
    const tLand = t0 + fall;
    const ea = exitAzimuth(o.a);
    const er = (ea * Math.PI) / 180;
    const rim = new THREE.Vector3(-Math.sin(er) * (PED_R - rWorld), PED_TOP + rWorld, Math.cos(er) * (PED_R - rWorld));
    const tRim = tLand + (land.distanceTo(rim) / ROLL_V) * 1000;
    // off the pedestal onto the felt: never past the owner's feet (the inner ring's feet are nearer than 1.88 m)
    const fr = o.stands ? 1.88 : Math.max(1.6, Math.min(1.88, Math.hypot(o.x, o.z)));
    const felt = new THREE.Vector3(-Math.sin(er) * fr, STAGE_TOP + rWorld, Math.cos(er) * fr);
    const tFelt = tRim + HOP_MS;
    let endP: THREE.Vector3, hop: THREE.Vector3 | null = null;
    if (!o.stands) {
      endP = new THREE.Vector3(o.x, STAGE_TOP + rWorld, o.z);
    } else {
      const ar = (o.a * Math.PI) / 180;
      endP = new THREE.Vector3(-Math.sin(ar) * 3.45, STAGE_TOP + rWorld, Math.cos(ar) * 3.45);
      hop = new THREE.Vector3(o.x, o.y + rWorld, o.z);
    }
    const tEnd = tFelt + (felt.distanceTo(endP) / ROLL_V) * 1000;
    const tHop = hop ? tEnd + STANDS_HOP_MS : tEnd;
    stage.serve.set(i, { t0, lip, land, tLand, rim, tRim, felt, tFelt, end: endP, tEnd, hop, tHop, r: rWorld });
    end = Math.max(end, tHop + CATCH_MS);
  }
  stage.serveEnd = Math.max(end, pourEnd(n) + 400);
  stage.serveN = n;
}

const tA = new THREE.Vector3();

/**
 * Where a served ball is at reveal time t: "lip" (still riding the ladle),
 * "road" (falling or rolling: `out` is set, `roll` is the distance rolled),
 * "caught" (at its owner, shrinking: `catchF` 0 … 1) or "gone".
 */
export function servedAt(p: ServePath, t: number, out: THREE.Vector3): { state: "lip" | "road" | "caught" | "gone"; roll: number; catchF: number } {
  if (t < p.t0) return { state: "lip", roll: 0, catchF: 0 };
  if (t < p.tLand) {
    const u = (t - p.t0) / (p.tLand - p.t0);
    out.lerpVectors(p.lip, p.land, 0).setY(p.lip.y + (p.land.y - p.lip.y) * u * u);
    out.x = p.lip.x + (p.land.x - p.lip.x) * u; out.z = p.lip.z + (p.land.z - p.lip.z) * u;
    return { state: "road", roll: 0, catchF: 0 };
  }
  if (t < p.tRim) {
    const u = (t - p.tLand) / (p.tRim - p.tLand);
    out.lerpVectors(p.land, p.rim, u);
    // a small bounce on landing
    out.y += Math.max(0, Math.sin(Math.min(1, u * 4) * Math.PI)) * 0.04 * (1 - u);
    return { state: "road", roll: p.land.distanceTo(p.rim) * u, catchF: 0 };
  }
  const d0 = p.land.distanceTo(p.rim);
  if (t < p.tFelt) {
    const u = (t - p.tRim) / (p.tFelt - p.tRim);
    out.lerpVectors(p.rim, p.felt, u);
    out.y = p.rim.y + (p.felt.y - p.rim.y) * u * u + Math.sin(u * Math.PI) * 0.08;
    return { state: "road", roll: d0 + p.rim.distanceTo(p.felt) * u, catchF: 0 };
  }
  const d1 = d0 + p.rim.distanceTo(p.felt);
  if (t < p.tEnd) {
    const u = (t - p.tFelt) / (p.tEnd - p.tFelt);
    out.lerpVectors(p.felt, p.end, u);
    return { state: "road", roll: d1 + p.felt.distanceTo(p.end) * u, catchF: 0 };
  }
  const d2 = d1 + p.felt.distanceTo(p.end);
  if (p.hop && t < p.tHop) {
    const u = (t - p.tEnd) / (p.tHop - p.tEnd);
    out.lerpVectors(p.end, p.hop, u);
    out.y += Math.sin(u * Math.PI) * 0.7;
    return { state: "road", roll: d2 + tA.subVectors(p.hop, p.end).length() * u, catchF: 0 };
  }
  const last = p.hop ?? p.end;
  const c = (t - p.tHop) / CATCH_MS;
  if (c >= 1) return { state: "gone", roll: 0, catchF: 1 };
  out.copy(last);
  return { state: "caught", roll: d2, catchF: c };
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __stage?: typeof stage }).__stage = stage;
