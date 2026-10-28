/**
 * The home's scroll tour (v21): the camera that shows the game on the first
 * screen takes the reader round the live hall while the text scrolls over
 * it. One stop per chapter of the home, each framing what its text talks
 * about, the subject on one side and the text on the other (alternating on
 * desktop; on portrait screens the subject above and the text below).
 *
 * Stop 0 is the first screen: its position and target are SHOTS.home, its
 * lens and framing are whatever the first screen uses (the view shift, the
 * phone band), so the page at scroll 0 is unchanged. Positions and targets
 * run on centripetal Catmull-Rom curves through the stops (and through the
 * `via` points authored to keep the path clear of the drum, the crowd, the
 * staff, the stands and the walls; scripts check it); lens and framing are
 * interpolated between stops.
 *
 * The page writes one number, `tourBus.target` (in stop units, 0 = the
 * first screen, 1 = the first chapter...), from a passive scroll listener;
 * the camera rig eases toward it inside useFrame (critically damped), so a
 * scroll never re-renders React. Nothing here imports React.
 */
import * as THREE from "three";
import { SHOTS } from "./shots";

export type V3 = [number, number, number];

/**
 * A framing. `off` is, on desktop, the horizontal view shift (a fraction of
 * the width, positive moves the subject right, the text sits left) and, on
 * portrait screens, the lift (a fraction of the height, positive raises the
 * subject, the text sits below).
 */
export interface TourKey { pos: V3; look: V3; fov: number; off: number }

export interface TourStop {
  /** the chapter's element id on the home */
  id: string;
  /** desktop (landscape, 1024 px and wider) */
  desk: TourKey;
  /** portrait screens (phones, tablets held upright) */
  port: TourKey;
  /** optional points the path passes through on its way INTO this stop (position and target) */
  viaDesk?: Array<{ pos: V3; look: V3 }>;
  viaPort?: Array<{ pos: V3; look: V3 }>;
}

const H = SHOTS.home;

/**
 * The stops, in page order. World metres, y up; the home camera looks from +Z.
 * Landmarks: the drum assembly in |x|,|z| < 1.3, y 0.48 to 4.75; the ladle
 * parked at (0, 5.9, -0.16) between serves (its bowl at 4.6 when it serves);
 * the stage r 3.6 (top y 0.48), the crowd on it up to y 1.4; the stands r 5.0
 * to 7.2 from 50 to 310 degrees (the front wedge is open floor); the bear host
 * at (4.5, 0, -1.0), facing the front left; the left door and the fox bellhop
 * at azimuth 100 degrees (about (-11.4, 0, -2.0)), facing the centre; the wall
 * r 13, the ceiling 7.5.
 *
 * v21 fix: every stop is aimed so the caption's half of the frame shows the
 * room's dark (floor, wall, curtain, the open front) and never a character or
 * the drum: chosen by a search over the live scene (50 players, 40 watchers;
 * screenshots/v21/fix-tour3d/search.mjs) and checked in the page
 * (scout-tour.mjs projects every character and the drum against each caption).
 * The route runs round the right side, behind the stage and down the left.
 */
export const TOUR: TourStop[] = [
  // 0 · the first screen (the home shot; lens and framing from the first screen)
  { id: "top", desk: { pos: H.pos, look: H.look, fov: H.fov, off: 0 }, port: { pos: H.posPhone ?? H.pos, look: H.lookPhone ?? H.look, fov: H.fovPhone, off: 0 } },
  // II · how a round plays: the drum, its cradle, the crank, the hopper and the chute, from high on the right (text left, over the dark front)
  {
    id: "how",
    desk: { pos: [6.16, 5.3, -2.18], look: [0, 2.3, -0.1], fov: 38.4, off: 0.18 },
    port: { pos: [7.18, 1.65, 5.99], look: [0, 2.3, -0.1], fov: 60.5, off: 0.22 },
  },
  // III · the room: the players on the felt, close, the bear and the stands behind them (text right, over the stage's dark rim)
  {
    id: "room",
    desk: { pos: [0.53, 1.85, 5.7], look: [1.99, 0.84, 2.56], fov: 33.1, off: -0.17 },
    port: { pos: [0.61, 1.75, 5.62], look: [-2.11, 0.84, 1.52], fov: 51, off: 0.11 },
    // portrait: over the front-right booth, not through it
    viaPort: [{ pos: [4.4, 1.95, 6.6], look: [-0.6, 1.2, 1.0] }],
  },
  // IV · the scoop: the ladle parked over the drum, where it comes down to serve (text left, over the dark wall)
  {
    id: "scoop",
    desk: { pos: [4.02, 6.2, 4.1], look: [0.05, 5.05, -0.16], fov: 38, off: 0.16 },
    port: { pos: [0.66, 6.68, 9.22], look: [0.05, 4.6, -0.16], fov: 59.9, off: 0.18 },
  },
  // V · the curve: the floor ticker on the stage's rim, close (text right, over the dark felt)
  {
    id: "curve",
    desk: { pos: [3.5, 1.09, 3.83], look: [0.8, 0.3, 3.5], fov: 31.7, off: -0.14 },
    port: { pos: [3.56, 1.44, 5.57], look: [0.8, 0.3, 3.5], fov: 54.1, off: 0.2 },
  },
  // VI · open books: the bear host, the house, from above its front (text left, over the dark floor)
  {
    id: "books",
    desk: { pos: [2.53, 2.5, 0.21], look: [4.5, 0.7, -1.0], fov: 41.8, off: 0.14 },
    port: { pos: [2.53, 2.6, 0.21], look: [4.5, 0.7, -1.0], fov: 50, off: 0.2 },
    // up over the stage's rim and the crowd (1.8 m over the felt), never through them
    viaDesk: [{ pos: [3.68, 2.25, 3.72], look: [3.6, 0.7, 1.6] }, { pos: [3.6, 2.6, 2.3], look: [4.3, 0.8, -0.5] }],
    viaPort: [{ pos: [3.68, 2.3, 4.2], look: [3.6, 0.7, 1.6] }, { pos: [3.6, 2.7, 2.3], look: [4.3, 0.8, -0.5] }],
  },
  // VII · hosts: the fox bellhop at the left door, close (text right, over the dark wall and the doorway)
  {
    id: "hosts",
    desk: { pos: [-7.78, 1.53, -2.99], look: [-11.4, 0.6, -2.0], fov: 35.8, off: -0.12 },
    port: { pos: [-8.0, 2.15, 1.8], look: [-11.2, 0.8, -1.6], fov: 45.2, off: 0.24 },
    // desktop: round the back of the stage, over the stanchions, then down the left aisle; portrait: round the open front
    viaDesk: [{ pos: [3.0, 2.8, -3.6], look: [0.5, 1.2, -5.5] }, { pos: [-2.8, 2.8, -4.0], look: [-6.5, 1.0, -3.5] }, { pos: [-6.2, 2.3, -3.6], look: [-10.5, 0.8, -2.3] }],
    viaPort: [{ pos: [3.0, 2.8, -3.6], look: [0.5, 1.2, -5.5] }, { pos: [-2.8, 2.8, -4.0], look: [-6.5, 1.0, -3.5] }, { pos: [-6.2, 2.4, -3.6], look: [-10.5, 0.8, -2.3] }],
  },
  // VIII · Genesis: close on the back stands' faces and scarves (text left, over the dark stage)
  {
    id: "genesis",
    // over the back stands, the row's faces turned to the stage (and so to the lens)
    desk: { pos: [-3.3, 3.14, -6.46], look: [4.63, 1.08, -5.15], fov: 35.2, off: 0.21 },
    port: { pos: [-3.42, 2.31, -5.26], look: [2.15, 0.9, -6.0], fov: 49, off: 0.12 },
  },
  // IX · questions: up and out to the whole room (text left, the hall dimmed)
  {
    id: "questions",
    // desktop: from high on the right, the room across the stage, the wide caption over the dark front
    desk: { pos: [9.88, 5.59, -0.69], look: [0, 1.6, 0], fov: 42.6, off: 0.22 },
    port: { pos: [-2.6, 6.5, 10.6], look: [0, 1.5, 0], fov: 62, off: 0.12 },
  },
];

export type TourMode = "desk" | "port";

/** Desktop framing (text beside the subject) from 1024 px wide in landscape; portrait framing (text below) otherwise. */
export function tourMode(w: number, h: number): TourMode {
  return w >= 1024 && w >= h ? "desk" : "port";
}

/** The shared tour state: written by the page (target, cut, anchors) and by the camera rig (t, w). */
export const tourBus = {
  /** a tour page is mounted */
  on: false,
  /** where the scroll says the camera should be, in stop units */
  target: 0,
  /** reduced motion: the stop the camera cuts to */
  cut: 0,
  /** the camera's eased position along the tour, in stop units (camera rig) */
  t: 0,
  /** the eased velocity of t (camera rig) */
  v: 0,
  /** 0 on the first screen, 1 once the tour has left it, eased (camera rig; the house lights read it) */
  w: 0,
  /** the page's scroll y at which each stop is reached */
  anchors: [0] as number[],
};

/** smootherstep, 0 at 0 and 1 at 1, flat at both ends */
const ease = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

/**
 * Scroll y to tour position. Between two anchors the camera holds still for
 * the first and last `dwell` of the distance (the text is read there) and
 * travels in between, eased in and out. v21 fix: a short hold (7 %), so the
 * travel spreads over most of the scroll instead of a sprint between holds.
 */
export function tourAt(y: number, anchors: number[], dwell = 0.07): number {
  const n = anchors.length;
  if (n < 2 || y <= anchors[0]!) return 0;
  if (y >= anchors[n - 1]!) return n - 1;
  let i = 0;
  while (i < n - 2 && y >= anchors[i + 1]!) i++;
  const a = anchors[i]!, b = anchors[i + 1]!;
  const u = b > a ? (y - a) / (b - a) : 1;
  const v = Math.min(1, Math.max(0, (u - dwell) / (1 - 2 * dwell)));
  return i + ease(v);
}

interface Built { pos: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3; idx: number[]; last: number }
const built: Partial<Record<TourMode, Built>> = {};

function build(mode: TourMode): Built {
  const cached = built[mode];
  if (cached) return cached;
  const P: THREE.Vector3[] = [], L: THREE.Vector3[] = [], idx: number[] = [];
  for (const s of TOUR) {
    for (const v of (mode === "desk" ? s.viaDesk : s.viaPort) ?? []) { P.push(new THREE.Vector3(...v.pos)); L.push(new THREE.Vector3(...v.look)); }
    const k = s[mode];
    idx.push(P.length);
    P.push(new THREE.Vector3(...k.pos));
    L.push(new THREE.Vector3(...k.look));
  }
  const b: Built = { pos: new THREE.CatmullRomCurve3(P, false, "centripetal"), look: new THREE.CatmullRomCurve3(L, false, "centripetal"), idx, last: P.length - 1 };
  built[mode] = b;
  return b;
}

export interface TourPose { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number; vs: number; lift: number }

const tmp = new THREE.Vector3();

/**
 * The camera at tour position t. `first` is the first screen's lens and
 * framing (the camera rig's current values for the home shot), used at stop 0.
 */
export function tourPose(t: number, mode: TourMode, first: { fov: number; vs: number; pos?: V3; look?: V3 }, out: TourPose): TourPose {
  const b = build(mode);
  const n = TOUR.length;
  const tc = Math.min(n - 1, Math.max(0, t));
  const i = Math.min(n - 2, Math.floor(tc));
  const f = tc - i;
  const ci = b.idx[i]! + f * (b.idx[i + 1]! - b.idx[i]!);
  const u = b.last > 0 ? ci / b.last : 0;
  b.pos.getPoint(u, tmp); out.px = tmp.x; out.py = tmp.y; out.pz = tmp.z;
  b.look.getPoint(u, tmp); out.lx = tmp.x; out.ly = tmp.y; out.lz = tmp.z;
  const k0 = TOUR[i]![mode], k1 = TOUR[i + 1]![mode];
  // the first leg starts from the first screen's own shot (a tablet held upright has the desktop's home shot, a phone its own),
  // its difference from stop 0's key fading out over the leg
  if (i === 0 && first.pos && first.look) {
    const g = 1 - f * f * (3 - 2 * f);
    out.px += (first.pos[0] - k0.pos[0]) * g; out.py += (first.pos[1] - k0.pos[1]) * g; out.pz += (first.pos[2] - k0.pos[2]) * g;
    out.lx += (first.look[0] - k0.look[0]) * g; out.ly += (first.look[1] - k0.look[1]) * g; out.lz += (first.look[2] - k0.look[2]) * g;
  }
  const fov0 = i === 0 ? first.fov : k0.fov;
  out.fov = fov0 + (k1.fov - fov0) * f;
  if (mode === "desk") {
    const o0 = i === 0 ? first.vs : k0.off;
    out.vs = o0 + (k1.off - o0) * f;
    out.lift = 0;
  } else {
    const o0 = i === 0 ? 0 : k0.off;
    out.lift = o0 + (k1.off - o0) * f;
    out.vs = i === 0 ? first.vs * (1 - f) : 0;
  }
  return out;
}

const tmpB = new THREE.Vector3();
/** Metres the camera travels per stop unit around tour position t (for the rig's speed limit). */
export function tourMetresPerUnit(t: number, mode: TourMode): number {
  const b = build(mode);
  const n = TOUR.length;
  const at = (x: number, out: THREE.Vector3) => {
    const tc = Math.min(n - 1, Math.max(0, x));
    const i = Math.min(n - 2, Math.floor(tc));
    const ci = b.idx[i]! + (tc - i) * (b.idx[i + 1]! - b.idx[i]!);
    return b.pos.getPoint(b.last > 0 ? ci / b.last : 0, out);
  };
  const h = 0.02;
  at(t - h, tmp); at(t + h, tmpB);
  return tmp.distanceTo(tmpB) / (2 * h);
}

/**
 * v21 fix: what the camera must stay out of (world metres): the same volumes
 * as screenshots/v21/tour/check-path.mjs. Returns the height the camera needs
 * at (x, z) to pass over them (0 when the spot is clear at any height under
 * the ceiling), or Infinity where nothing may pass at all (the walls; the
 * drum, the ladle and its rod, which a flight goes round).
 */
export function clearHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let a = (Math.atan2(-x, z) * 180) / Math.PI;
  if (a < 0) a += 360;
  if (r > 11.4) return Infinity;
  if (r < 1.7) return Infinity;
  // the felt crowd (up to 1.4 m) and the stage's rim: 1.8 m over the felt
  if (r < 4.4) return 2.3;
  if (a > 43 && a < 317 && r > 4.7 && r < 7.6) return 2.15;
  if (a > 112 && a < 248 && r < 4.7) return 1.4;
  if (Math.hypot(x - 4.5, z + 1.0) < 1.1) return 1.9;
  if ((Math.abs(a - 60) < 12 || Math.abs(a - 300) < 12 || Math.abs(a - 120) < 12 || Math.abs(a - 240) < 12) && r > 7.3 && r < 8.8) return 1.5;
  return 0.7;
}

/**
 * v21 fix: a jump's flight (an anchor link, the side index, coming back to a
 * restored scroll) as a cubic Bezier from `a` to `b`: it rises to clear the
 * crowd, the stage's rim and the stands, and bows round the drum when the
 * straight line would cross it. Never through the felt crowd, never under
 * 0.6 m, never over 6.6 m (the ceiling and the spotlight's rig).
 */
export function planFlight(a: THREE.Vector3, b: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3): void {
  // round the drum: the straight line's nearest point to the centre, pushed out to r >= 3.2
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  const u = L2 > 1e-6 ? Math.min(1, Math.max(0, -(a.x * dx + a.z * dz) / L2)) : 0.5;
  const nx = a.x + dx * u, nz = a.z + dz * u, nr = Math.hypot(nx, nz);
  let px = 0, pz = 0;
  if (nr < 3.2 && u > 0.08 && u < 0.92) {
    // push perpendicular to the line, on the side the nearest point already leans to (or the front, z > 0)
    let sx = -dz, sz = dx;
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl; sz /= sl;
    if (sx * (nx || 0) + sz * (nz || 1) < 0) { sx = -sx; sz = -sz; }
    const k = (3.2 - nr) * 1.6;
    px = sx * k; pz = sz * k;
  }
  const pt = new THREE.Vector3();
  // w1, w2: how much of the bow each control point takes (a lopsided bow leaves a low stop straight up first)
  const bez = (h: number, t: number, w1: number, w2: number) => {
    const s = 1 - t;
    c1.set(a.x + px * w1, Math.min(6.6, a.y + h), a.z + pz * w1);
    c2.set(b.x + px * w2, Math.min(6.6, b.y + h), b.z + pz * w2);
    return pt.set(
      s * s * s * a.x + 3 * s * s * t * c1.x + 3 * s * t * t * c2.x + t * t * t * b.x,
      s * s * s * a.y + 3 * s * s * t * c1.y + 3 * s * t * t * c2.y + t * t * t * b.y,
      s * s * s * a.z + 3 * s * s * t * c1.z + 3 * s * t * t * c2.z + t * t * t * b.z,
    );
  };
  const clear = (h: number, w1: number, w2: number) => {
    for (let k = 1; k < 64; k++) {
      const p = bez(h, k / 64, w1, w2);
      const need = clearHeightAt(p.x, p.z);
      if (need === Infinity || p.y < need + 0.08 || p.y > 6.9) return false;
    }
    return true;
  };
  // the least rise that clears every sample (stops themselves are clear; the samples in between must be)
  // either side of the drum (the side the line leans to first), evenly or lopsided
  const bows: Array<[number, number]> = [[1, 1], [0.3, 1.5], [1.5, 0.3], [0, 1.8], [1.8, 0], [-1, -1], [-0.3, -1.5], [-1.5, -0.3], [0, -1.8], [-1.8, 0]];
  for (let h = 0; h <= 4.4; h += 0.2) {
    for (const [w1, w2] of bows) if (clear(h, w1, w2)) { bez(h, 0, w1, w2); return; }
  }
  bez(4.4, 0, 1, 1);
}

/** A point of a flight planned by planFlight. */
export function flightPoint(a: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const s = 1 - t;
  return out.set(
    s * s * s * a.x + 3 * s * s * t * c1.x + 3 * s * t * t * c2.x + t * t * t * b.x,
    s * s * s * a.y + 3 * s * s * t * c1.y + 3 * s * t * t * c2.y + t * t * t * b.y,
    s * s * s * a.z + 3 * s * s * t * c1.z + 3 * s * t * t * c2.z + t * t * t * b.z,
  );
}

/** Sample the path (for the clearance check script): positions every `step` stop units. */
export function samplePath(mode: TourMode, step = 0.02): V3[] {
  const out: V3[] = [];
  const p: TourPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 0, vs: 0, lift: 0 };
  for (let t = 0; t <= TOUR.length - 1 + 1e-9; t += step) { tourPose(t, mode, { fov: 30, vs: 0 }, p); out.push([p.px, p.py, p.pz]); }
  return out;
}

// dev captures (screenshots/v21/tour/*.mjs) read the tour state
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __tour?: unknown }).__tour = tourBus;
