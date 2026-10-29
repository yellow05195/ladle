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
 * v21.3, the scroll model: the page's one passive scroll listener
 * (tour/scroll.ts) writes the scroll y into `tourBus.y`; the camera rig
 * follows it inside useFrame with one short critically damped spring and
 * maps the followed y to the tour position (`tourAt`, C1, holds at the
 * stops) and the tour position to a pose (`tourPose`, the path sampled by
 * perceptual distance). One path, one spring, no modes: a fling, a
 * reversal and a slow read all ride the same curve. A scroll never
 * re-renders React. Nothing here imports React.
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
  // II · how a round plays: the drum front-on between its two uprights, the crank at the side and the balls in the cage,
  // the felt crowd round it (text left). r2: from the front, not the crank side (scouted, screenshots/v21/fix-tour3d-r2)
  {
    id: "how",
    desk: { pos: [1.6, 3.4, 6.6], look: [0, 2.4, -0.2], fov: 36, off: 0.18 },
    // fix:scroll:1: portrait from the front left, a step in from the phone's first screen (it was the front right, low:
    // 12 m and 80 degrees of sweep under the first swipe)
    port: { pos: [-0.8, 3.6, 8.4], look: [0, 2.1, -0.1], fov: 61.7, off: 0.22 },
  },
  // III · the room: high over the front left, the whole felt ring round the drum and the stands behind it, the far
  // ring's and the stands' faces toward the lens (text right). r2: never from head height behind the crowd
  {
    id: "room",
    desk: { pos: [-3.0, 5.9, 6.6], look: [0.5, 0.8, -1.0], fov: 42, off: -0.10 },
    port: { pos: [-1.8, 6.4, 8.6], look: [0.3, 0.9, -0.8], fov: 58, off: 0.16 },
  },
  // IV · the scoop: the ladle parked over the drum, turned about 30 degrees so its bowl reads, in the upper third, and the
  // cage with its balls in the lower third (text left). r2: from the front left, the spot's can no longer a black hole
  {
    id: "scoop",
    desk: { pos: [-3.3, 4.6, 5.7], look: [0, 4.5, -0.16], fov: 50, off: 0.15 },
    port: { pos: [0.66, 6.68, 9.22], look: [0.05, 4.6, -0.16], fov: 59.9, off: 0.18 },
  },
  // V · the curve: the floor ticker along the front of the stage's rim, from the front left at 1.6 m, readable in the left
  // half and curving out of view before the caption; the felt seen from above, every pet whole (text right). r2: searched
  // (screenshots/v21/fix-tour3d-r2/solve-curve.mjs) so no rim glyph lies in the caption's box
  {
    id: "curve",
    desk: { pos: [-3.5, 1.6, 7.0], look: [1.39, 0.45, 2.99], fov: 36, off: -0.10 },
    // fix:scroll:1: portrait from the front left too (the ticker read left to right, as on desktop), so the camera then
    // crosses the front to the bear instead of turning in place
    port: { pos: [-3.56, 1.12, 5.38], look: [-0.8, 0.3, 3.5], fov: 50.7, off: 0.24 },
  },
  // VI · open books: the bear host, the house, from above its front (text left, over the dark floor)
  {
    id: "books",
    // (v25.1: the bear stands on a 0.38 m podium now: the look rises with him)
    desk: { pos: [2.53, 3.0, 0.21], look: [4.5, 1.3, -1.0], fov: 41.8, off: 0.14 },
    // fix:scroll:1: portrait from in front of the bear, low (the desktop's view from above would leave the drum under the text)
    port: { pos: [3.53, 1.59, 2.41], look: [4.5, 0.9, -1.0], fov: 58.6, off: 0.23 },
    // fix:scroll:1: a push in from the front, over the felt's edge (2.9 m and more while over it), the view turning only
    // from the ticker to the bear (51 to 58 degrees of heading, never away and back: it swung 68 degrees off and back)
    // fix:scroll:r3: a last point on the line in (the path turns back at the bear, so without it the curve looped past the
    // stop and the heading hooked 4 degrees past 58 and back as the camera landed; 0.8 now)
    viaDesk: [{ pos: [-0.5, 3.3, 4.7], look: [4.7, 1.0, 0.8] }, { pos: [2.1, 3.45, 2.7], look: [4.9, 1.0, 0.64] }, { pos: [2.45, 3.1, 0.9], look: [4.6, 1.0, -0.6] }],
    // portrait: along the open front, over the felt's heads and outside its edge, panning from the ticker to the bear, then
    // down in front of it
    viaPort: [{ pos: [0.2, 2.6, 5.7], look: [3.25, 0.5, 0.95] }, { pos: [3.1, 2.3, 4.2], look: [4.45, 0.55, -0.4] }],
  },
  // VII · hosts: the fox bellhop at the left door, close (text right, over the dark wall and the doorway)
  {
    id: "hosts",
    // fix:scroll:1: desktop from the front left of the door too (a three-quarter view of the fox), so the bear, the fox, the
    // stands and the whole room are met turning one way, 60 to 90 degrees a leg (they were 140 to 215 each, round the back)
    desk: { pos: [-8.82, 2.07, 2.78], look: [-11.2, 0.8, -1.6], fov: 36.5, off: -0.14 },
    port: { pos: [-8.0, 2.15, 1.8], look: [-11.2, 0.8, -1.6], fov: 45.2, off: 0.24 },
    // fix:scroll:1: back out over the felt's edge (2.9 m and more over it) and across the open front, panning from the bear
    // past the drum to the door, then round the outside of the left stands (never over their tiers: their pets passed under
    // the lens a metre away)
    // fix:scroll:r3: the last point out past the stands' front end (it was over their top tier: a pet crossed the bottom of
    // the frame 3.5 m from the lens as the camera came down to the fox; 4 m and more now, r3/nearoff.mjs)
    viaDesk: [{ pos: [0.6, 3.55, 3.9], look: [3.6, 1.2, -1.7] }, { pos: [-4.0, 3.9, 6.6], look: [-5.7, 1.0, -2.3] }, { pos: [-8.6, 3.2, 5.6], look: [-10.2, 1.0, -1.4] }],
    // fix:scroll:r3-2 (portrait): up and back out first with the view still on the bear (it panned onto the felt from 1.6 m
    // up, and the front ring's pets filled the lower half), across the open front higher and farther out (the front
    // ring's pets hopping to their seats passed under the lens at 2.5 m), and onto the fox sooner (the frames before it
    // showed only the floor and an armchair's corner)
    viaPort: [{ pos: [3.0, 2.9, 5.2], look: [4.3, 0.7, -0.9] }, { pos: [-0.6, 3.55, 6.5], look: [-2.4, 0.9, -1.0] }, { pos: [-4.2, 3.7, 6.8], look: [-10.0, 0.9, -1.7] }, { pos: [-7.4, 3.2, 5.4], look: [-11.0, 0.85, -1.7] }],
  },
  // VIII · Genesis: close on the back stands' faces and scarves (text left, over the dark stage)
  {
    id: "genesis",
    // fix:scroll:1: the back left stands from the left of the front, the row's faces turned to the stage and so to the lens
    // (searched: screenshots/v21/scroll/fix1/search.mjs; checked in the page: scout-tour.mjs), a pan on from the fox
    // fix:scroll:r3-2: 1.5 m further back along the same view (the stands' end pet nearest the lens grew to over half the
    // frame's height as the camera came in; a third now)
    desk: { pos: [-9.48, 3.26, 2.08], look: [-2.82, 1.08, -6.33], fov: 28.9, off: 0.19 },
    port: { pos: [-5.55, 2.87, 3.43], look: [-4.63, 1.08, -5.15], fov: 51.6, off: 0.23 },
    // fix:scroll:r3: up and out over the stands' front end (4.6 m, past their top tier), the view panning from the door
    // to the back stands with the view held level (pitched 11 degrees down, so the near tier stays under the frame), then
    // down onto the row (straight from the fox, the lens passed 1.3 m from a top-tier pet, which filled the lower half of
    // a phone: in transit no pet in the frame is nearer than 3.2 m or over a quarter of its height now, r3/nearoff.mjs)
    // fix:scroll:r3-2: first up and back with the view held on the fox, then one pan on to the stands (the look drifted
    // along the left wall: a pilaster, a plant and an armchair for 0.8 s of reading)
    viaPort: [{ pos: [-8.1, 3.3, 3.1], look: [-10.9, 0.9, -1.8] }, { pos: [-7.4, 4.6, 4.0], look: [-6.6, 2.4, -3.4] }, { pos: [-6.2, 3.9, 3.9], look: [-5.4, 2.2, -4.4] }],
  },
  // IX · questions: up and out to the whole room (text left, the hall dimmed)
  {
    id: "questions",
    // desktop: from high on the left (fix:scroll:1: the camera is on the left already; it was high on the right, 15 m and
    // 170 degrees away), the room across the stage, the wide caption (now on the right) over the dark front
    desk: { pos: [-10.43, 5.59, -0.93], look: [0.8, 1.6, 0], fov: 41.4, off: -0.23 },
    // portrait: up and back out to the front left (the stands were behind the stage: no detour now)
    port: { pos: [-2.6, 6.5, 10.6], look: [0, 1.5, 0], fov: 62, off: 0.12 },
  },
];

export type TourMode = "desk" | "port";

/** Desktop framing (text beside the subject) from 1024 px wide in landscape; portrait framing (text below) otherwise. */
export function tourMode(w: number, h: number): TourMode {
  return w >= 1024 && w >= h ? "desk" : "port";
}

/**
 * The shared tour state (v21.3). The page writes the scroll (`y`, from the one passive scroll listener, tour/scroll.ts)
 * and what it maps to (`target`); the camera rig writes where the camera is along the tour (`t`) and the first screen's
 * fade (`w`). Nothing here is React state.
 */
export const tourBus = {
  /** a tour page is mounted */
  on: false,
  /** the page's scroll y (px) as of the last scroll event (read once per frame in the scroll event, never in rAF) */
  y: 0,
  /** where the scroll says the camera is, in stop units (0 = the first screen, 1 = the first chapter...): tourAt(y) */
  target: 0,
  /** reduced motion: the stop the camera shows */
  cut: 0,
  /** the camera's position along the tour, in stop units (camera rig: tourAt of its follow of y) */
  t: 0,
  /** 0 on the first screen, 1 once the tour has left it, eased (camera rig; the house lights read it) */
  w: 0,
  /** a flight's progress (the way back from /play), 0 → 1; 1 when no flight is under way (camera rig; the name tags wait for it) */
  fly: 1,
  /** the page asks the camera to land on the scroll at once (a cut behind the veil: a long jump, a restored scroll) */
  snap: false,
  /**
   * a jump the page started (the side index, Home, End): the camera glides along the path to stop-unit position `to`
   * over `dur` seconds from `t0` (performance.now()) while the page glides there too; null when none (the page clears
   * it when the reader interrupts, the rig when it lands)
   */
  jump: null as null | { id: number; to: number; t0: number; dur: number },
  /** the page's scroll y at which each stop is reached */
  anchors: [0] as number[],
  /** how far (px) the camera keeps holding each stop after reaching it, past the usual hold (portrait: the caption's read) */
  holds: [0] as number[],
};

/** v21.3: the share of each leg the camera holds still at each of its two stops (the caption is read there) */
export const TOUR_HOLD = 0.08;
/** v21.3: the share of a leg's travel spent speeding up, and again slowing down (a trapezoid: the peak pace is 1.25x the mean) */
export const TOUR_RAMP = 0.2;
/** fix:scroll:1: the longest hold after a stop, as a share of the leg (with the end's TOUR_HOLD, the travel keeps 60 %) */
export const TOUR_HOLD_MAX = 0.32;

/**
 * Trapezoid velocity profile on [0, 1]: a linear ramp up over `pa`, a constant cruise, a linear ramp down over `pb`.
 * Position and velocity are continuous everywhere (C1): no dead zone, no surge.
 */
function trap(u: number, pa: number, pb: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const v = 1 / (1 - (pa + pb) / 2);
  if (u < pa) return (v * u * u) / (2 * pa);
  if (u > 1 - pb) return 1 - (v * (1 - u) * (1 - u)) / (2 * pb);
  return v * (u - pa / 2);
}

/**
 * Scroll y to tour position (stop units), C1 (v21.3). Each leg holds its two stops for TOUR_HOLD of its length (the
 * caption is read there and the camera sits exactly on its subject: no snapping, no settling) and travels in between
 * at an even pace, ramping in and out over TOUR_RAMP of the travel. The first leg moves from the first pixel (no hold,
 * no ramp at the top), so the first notch visibly moves the camera. `holds` (px, per stop) lengthens the hold after a
 * stop (portrait: the caption is read by scrolling while the camera stays on its subject); fix:scroll:1: never past
 * TOUR_HOLD_MAX of the leg, so the travel keeps 60 % of it or more (a long portrait hold squeezed the travel into a
 * third of the leg, and the camera into a pace twice the desktop's).
 */
export function tourAt(y: number, anchors: number[], holds?: number[]): number {
  const n = anchors.length;
  if (n < 2 || y <= anchors[0]!) return 0;
  if (y >= anchors[n - 1]!) return n - 1;
  let i = 0;
  while (i < n - 2 && y >= anchors[i + 1]!) i++;
  const a = anchors[i]!, L = anchors[i + 1]! - a;
  if (L <= 0) return i + 1;
  // fix:scroll:r3: the first leg holds only when the page asks (portrait: while the playbill still covers the hall)
  const hs = i === 0 ? Math.min(0.5 * L, holds?.[0] ?? 0) : Math.min(TOUR_HOLD_MAX * L, Math.max(TOUR_HOLD * L, holds?.[i] ?? 0)), he = TOUR_HOLD * L;
  return i + trap((y - a - hs) / Math.max(1, L - hs - he), i === 0 && hs <= 0 ? 0 : TOUR_RAMP, TOUR_RAMP);
}

/**
 * The path as data (v21.3): the Catmull-Rom curves sampled densely along their own (index) parameter, with the
 * perceptual distance walked so far at every sample. A pose is one binary search on that distance, so within a leg
 * the picture moves at an even pace (no speed jump at a via point, no whip where the look swings); position and look
 * always come from the same sample.
 *
 * fix:scroll:r3: the distance is the picture's own motion, as the eye (and the checks) see it: each degree the view
 * turns, plus each metre travelled as the turn that slides a subject 4 m away by the same amount (FLOW_M), both over
 * the lens at that point (a narrow lens magnifies both; FOV_REF keeps the unit near a metre). The sections' heights
 * are then sized from it (TourDriver), so every leg moves the picture at about the same pace per pixel of scroll: the
 * room's crossing no longer rushes and the scoop no longer crawls (they were 4x apart).
 */
const FLOW_M = 4;
const FOV_REF = 40;
export const TOUR_FLOW_M = FLOW_M;
/** samples per control-point segment */
const PER = 160;
interface Built {
  pos: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3; idx: number[]; S: Float64Array; N: number; stopS: number[];
  /**
   * fix:scroll:r3: the view's unit direction integrated along the distance, once (I1) and twice (I2), per axis, for the
   * look window (tourPose); D0, D1: the directions at the two ends (the path is extended past them along them)
   */
  I1: Float64Array[]; I2: Float64Array[]; D0: number[]; D1: number[];
}
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
  const pos = new THREE.CatmullRomCurve3(P, false, "centripetal"), look = new THREE.CatmullRomCurve3(L, false, "centripetal");
  const N = (P.length - 1) * PER;
  // every sample's travel and turn, once
  const dm = new Float64Array(N + 1), da = new Float64Array(N + 1);
  const dir: number[] = new Array((N + 1) * 3);
  {
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), d0 = new THREE.Vector3(), d1 = new THREE.Vector3(), l = new THREE.Vector3();
    pos.getPoint(0, p0); look.getPoint(0, l); d0.subVectors(l, p0).normalize();
    dir[0] = d0.x; dir[1] = d0.y; dir[2] = d0.z;
    for (let k = 1; k <= N; k++) {
      pos.getPoint(k / N, p1); look.getPoint(k / N, l); d1.subVectors(l, p1).normalize();
      dm[k] = p1.distanceTo(p0);
      da[k] = Math.acos(Math.min(1, Math.max(-1, d0.dot(d1))));
      dir[k * 3] = d1.x; dir[k * 3 + 1] = d1.y; dir[k * 3 + 2] = d1.z;
      p0.copy(p1); d0.copy(d1);
    }
  }
  // the lens along the path: its value at the stops on the same monotone cubic as tourPose, first by sample index, then
  // (a second pass) by the distance the first pass gave
  const fovs = TOUR.map((s) => s[mode].fov), m: number[] = [];
  const S = new Float64Array(N + 1);
  let stopS: number[] = idx.map((i) => i * PER);
  for (let pass = 0; pass < 2; pass++) {
    let leg = 0;
    for (let k = 1; k <= N; k++) {
      while (leg < idx.length - 2 && k > idx[leg + 1]! * PER) leg++;
      const a = idx[leg]! * PER, b = idx[leg + 1]! * PER;
      const f = pass === 0 ? (k - a) / Math.max(1, b - a) : (S[k - 1]! - stopS[leg]!) / Math.max(1e-9, stopS[leg + 1]! - stopS[leg]!);
      const fov = Math.max(10, mono(leg + Math.min(1, Math.max(0, f)), fovs, m));
      S[k] = S[k - 1]! + (dm[k]! + FLOW_M * da[k]!) * (FOV_REF / fov);
    }
    stopS = idx.map((i) => S[i * PER]!);
  }
  const I1 = [0, 1, 2].map(() => new Float64Array(N + 1)), I2 = [0, 1, 2].map(() => new Float64Array(N + 1));
  for (let k = 1; k <= N; k++) {
    const w = S[k]! - S[k - 1]!;
    for (let a = 0; a < 3; a++) {
      I1[a]![k] = I1[a]![k - 1]! + ((dir[(k - 1) * 3 + a]! + dir[k * 3 + a]!) / 2) * w;
      I2[a]![k] = I2[a]![k - 1]! + ((I1[a]![k - 1]! + I1[a]![k]!) / 2) * w;
    }
  }
  const b: Built = { pos, look, idx, S, N, stopS, I1, I2, D0: [dir[0]!, dir[1]!, dir[2]!], D1: [dir[N * 3]!, dir[N * 3 + 1]!, dir[N * 3 + 2]!] };
  built[mode] = b;
  return b;
}

/** The perceptual distance (the picture's motion, see FLOW_M) from the first screen to each stop along the path. */
export function tourStopS(mode: TourMode): number[] {
  return build(mode).stopS;
}

export interface TourPose { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number; vs: number; lift: number }

const tmp = new THREE.Vector3();
const smooth = (u: number) => u * u * (3 - 2 * u);

/** Monotone cubic (Fritsch-Carlson) through ys at x = 0, 1, 2...: never overshoots, flat at every turn, C1 (m: scratch). */
function mono(x: number, ys: number[], m: number[]): number {
  const n = ys.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(x)));
  for (let k = 0; k < n; k++) {
    const dl = k > 0 ? ys[k]! - ys[k - 1]! : ys[1]! - ys[0]!, dr = k < n - 1 ? ys[k + 1]! - ys[k]! : dl;
    m[k] = k === 0 ? dr : k === n - 1 ? dl : dl * dr <= 0 ? 0 : (dl + dr) / 2;
  }
  for (let k = 0; k < n - 1; k++) {
    const d = ys[k + 1]! - ys[k]!;
    if (d === 0) { m[k] = 0; m[k + 1] = 0; continue; }
    const a = m[k]! / d, b = m[k + 1]! / d, h = a * a + b * b;
    if (h > 9) { const r = 3 / Math.sqrt(h); m[k] = r * a * d; m[k + 1] = r * b * d; }
  }
  const t = Math.min(1, Math.max(0, x - i)), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * m[i + 1]!;
}
const lensK: number[] = [], offK: number[] = [], scratch: number[] = [];

/** fix:scroll:r3: the view's direction integrated twice (Built I2) at distance s; past either end the path runs straight on */
function dirI2(b: Built, s: number, out: number[]): number[] {
  const S = b.S, end = S[b.N]!;
  for (let a = 0; a < 3; a++) {
    if (s <= 0) out[a] = ((s * s) / 2) * b.D0[a]!;
    else if (s >= end) { const x = s - end; out[a] = b.I2[a]![b.N]! + b.I1[a]![b.N]! * x + ((x * x) / 2) * b.D1[a]!; }
  }
  if (s <= 0 || s >= end) return out;
  let lo = 0, hi = b.N;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid]! <= s) lo = mid; else hi = mid; }
  const span = S[hi]! - S[lo]!, f = span > 1e-12 ? (s - S[lo]!) / span : 0;
  for (let a = 0; a < 3; a++) out[a] = b.I2[a]![lo]! + (b.I2[a]![hi]! - b.I2[a]![lo]!) * f;
  return out;
}
const wA = [0, 0, 0], wB = [0, 0, 0], wC = [0, 0, 0];

/** fix:scroll:r3: the perceptual distance at tour position t (stop units) */
export function tourSAt(t: number, mode: TourMode): number {
  const S = build(mode).stopS, n = S.length - 1;
  const tc = Math.min(n, Math.max(0, t)), i = Math.min(n - 1, Math.floor(tc));
  return S[i]! + (tc - i) * (S[i + 1]! - S[i]!);
}

/**
 * The camera at tour position t (stop units). `first` is the first screen's lens and framing (the camera rig's current
 * values for the home shot), used at stop 0. Position and look come from the path at the perceptual distance t asks
 * for; lens and framing run on monotone cubics through the stops' values (no kink and no bounce at a stop).
 *
 * fix:scroll:r3, `win` (perceptual distance, 0 by default): the look window. The view looks along the average of the
 * path's view directions from `win` behind to `win` ahead of the camera (a centred average: no lag, it simply cuts the
 * corners and smooths the turns). The camera rig opens it with the speed of the scroll only (a fling), so the view
 * pans across the room like a camera on a fast crane instead of whipping from subject to subject; at a reading pace
 * it is shut and the view is exactly the path's.
 */
export function tourPose(t: number, mode: TourMode, first: { fov: number; vs: number; pos?: V3; look?: V3 }, out: TourPose, win = 0): TourPose {
  const b = build(mode);
  const n = TOUR.length;
  const tc = Math.min(n - 1, Math.max(0, t));
  const i = Math.min(n - 2, Math.floor(tc));
  const f = tc - i;
  const s = b.stopS[i]! + f * (b.stopS[i + 1]! - b.stopS[i]!);
  let lo = b.idx[i]! * PER, hi = b.idx[i + 1]! * PER;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (b.S[mid]! <= s) lo = mid; else hi = mid; }
  const span = b.S[hi]! - b.S[lo]!;
  const u = (lo + (span > 1e-9 ? Math.min(1, Math.max(0, (s - b.S[lo]!) / span)) : 0)) / b.N;
  b.pos.getPoint(u, tmp); out.px = tmp.x; out.py = tmp.y; out.pz = tmp.z;
  b.look.getPoint(u, tmp); out.lx = tmp.x; out.ly = tmp.y; out.lz = tmp.z;
  if (win > 1e-3) {
    // a triangle window (the average of a box over a box: its turn rate has no step where an edge of the window meets a
    // turn), centred on the camera; past the path's ends the view runs straight on, so near them it still averages
    dirI2(b, s + win, wA); dirI2(b, s, wB); dirI2(b, s - win, wC);
    const x = wA[0]! - 2 * wB[0]! + wC[0]!, y = wA[1]! - 2 * wB[1]! + wC[1]!, z = wA[2]! - 2 * wB[2]! + wC[2]!;
    const len = Math.hypot(x, y, z);
    if (len > 1e-9) {
      const k = Math.hypot(out.lx - out.px, out.ly - out.py, out.lz - out.pz) / len;
      out.lx = out.px + x * k; out.ly = out.py + y * k; out.lz = out.pz + z * k;
    }
  }
  const k0 = TOUR[0]![mode];
  // the first leg starts from the first screen's own shot (a tablet held upright has the desktop's home shot, a phone its own),
  // its difference from stop 0's key fading out over the leg
  if (i === 0 && first.pos && first.look) {
    const g = 1 - smooth(f);
    out.px += (first.pos[0] - k0.pos[0]) * g; out.py += (first.pos[1] - k0.pos[1]) * g; out.pz += (first.pos[2] - k0.pos[2]) * g;
    out.lx += (first.look[0] - k0.look[0]) * g; out.ly += (first.look[1] - k0.look[1]) * g; out.lz += (first.look[2] - k0.look[2]) * g;
  }
  for (let k = 0; k < n; k++) {
    const key = TOUR[k]![mode];
    lensK[k] = k === 0 ? first.fov : key.fov;
    offK[k] = k === 0 ? (mode === "desk" ? first.vs : 0) : key.off;
  }
  lensK.length = offK.length = n;
  out.fov = mono(tc, lensK, scratch);
  if (mode === "desk") { out.vs = mono(tc, offK, scratch); out.lift = 0; }
  else { out.lift = mono(tc, offK, scratch); out.vs = tc < 1 ? first.vs * (1 - smooth(tc)) : 0; }
  return out;
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
 * v21 fix: a flight between two shots (v21.3: only the way back from /play
 * to the tour; a scroll never flies, it rides the path) as a cubic Bezier
 * from `a` to `b`: it rises to clear the
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

// dev captures (screenshots/v21/tour/*.mjs) read the tour state; r2 scouting (screenshots/v21/fix-tour3d-r2) edits the keys live
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  Object.assign(window as unknown as Record<string, unknown>, { __tour: tourBus, __tourDev: { TOUR, rebuild: () => { delete built.desk; delete built.port; }, stopS: tourStopS, tourAt, tourPose, tourSAt } });
}
