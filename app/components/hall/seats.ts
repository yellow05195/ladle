/**
 * Who stands where (v21): everyone in the round is in the one room.
 *
 * The stage has two layouts, both on the felt round the drum, across 296
 * degrees (the 64 degree wedge facing the camera stays clear so the HUD card
 * never hides anyone and the drum stays in view):
 *   roomy   two rings (r 2.05, 2.92), 29 seats, characters 0.85 m tall:
 *           a round of up to 29 players;
 *   packed  three rings (r 1.96, 2.60, 3.24), 60 seats, characters 0.66 m:
 *           a bigger round. When the 30th player arrives, everyone hops to
 *           their packed seat and shrinks to the packed size, together, once.
 * Seat spacing follows the Cube Pets' measured footprint (pet-footprint.mjs:
 * median 0.89 wide and 0.95 deep per metre of height), so bodies never
 * overlap. The size is the same for every player on the stage at any moment.
 *
 * Seats are given in ARRIVAL order (never by result), the inner ring first;
 * inside a ring the order is a bit-reversal permutation, so 6 players or 13
 * are spread evenly round the drum instead of bunched on one side. The
 * viewer's own entry always takes the reserved front-left seat of the inner
 * ring (in view on every shot); every other entry keeps the seat its arrival
 * gave it.
 *
 * The stands: four walnut tiers round the back of the room (r 5.0 to 7.2,
 * from 50 to 310 degrees, aisles at the two doors), characters 0.66 m tall.
 * Entries beyond the stage's seats stand on the lowest tiers, nearest the
 * stage ("+N in the stands"); spectators fill the stands from the top tier
 * down. On every tier the back of the room (in view behind the drum) fills
 * first.
 *
 * Azimuth: degrees from +Z (the camera side), positive toward -X (left);
 * position = (-r sin a, y, r cos a).
 */
export const STAGE_TOP = 0.48;
export const GALLERY_SPOT: [number, number, number] = [-2.6, 0, 4.9];
/** A character's height on the roomy stage and in the gallery (m). */
export const CHAR_S = 0.85;
/** A character's height on the packed stage (more players than the roomy stage seats). */
export const CHAR_S_PACKED = 0.66;
/** A character's height in the stands. */
export const STANDS_S = 0.66;
export const WEDGE = 64;
const ROOMY = { rings: [2.05, 2.92], spacing: 0.84, scale: CHAR_S };
const PACKED = { rings: [1.96, 2.6, 3.24], spacing: 0.66, scale: CHAR_S_PACKED };
/** Back-compat: the roomy rings and spacing. */
export const STAGE_RINGS = ROOMY.rings;
export const SEAT_SPACING = ROOMY.spacing;

export const STANDS = {
  from: 50,
  to: 310,
  aisles: [[100, 11], [260, 11]] as Array<[number, number]>,
  /** the tiers' front edge, depth and step height */
  r0: 5.0,
  depth: 0.55,
  rise: 0.18,
  tiers: 4,
  spacing: 0.72,
};

export interface Seat { x: number; z: number; y: number; a: number; ring: number; stands: boolean }

/** v21 fix: the stands fill outward from this azimuth (the back, leaning right), the stage's rings from RIGHT_FIRST round to the right first. */
const FILL_FROM = 212;
const RIGHT_FIRST = 140;

export function azimuthToXZ(a: number, r: number): [number, number] {
  const t = (a * Math.PI) / 180;
  return [-r * Math.sin(t), r * Math.cos(t)];
}

function seat(a: number, r: number, y: number, ring: number, stands: boolean): Seat {
  const [x, z] = azimuthToXZ(a, r);
  return { x, z, y, a, ring, stands };
}

/** A permutation of 0 … n-1 whose every prefix is spread evenly (bit reversal). */
export function spreadOrder(n: number): number[] {
  if (n <= 0) return [];
  let bits = 0;
  while ((1 << bits) < n) bits++;
  const out: number[] = [];
  for (let k = 0; k < 1 << bits; k++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (k & (1 << b)) r |= 1 << (bits - 1 - b);
    if (r < n) out.push(r);
  }
  return out;
}

function ringSeats(r: number, ring: number, spacing: number): Seat[] {
  const span = 360 - WEDGE;
  const n = Math.floor(((r * span * Math.PI) / 180) / spacing);
  const out: Seat[] = [];
  for (let k = 0; k < n; k++) out.push(seat(WEDGE / 2 + ((k + 0.5) * span) / n, r, STAGE_TOP, ring, false));
  return out;
}

export interface Layout {
  /** the stage characters' height (m) */
  scale: number;
  /** the viewer's own seat (inner ring, front left) */
  mine: Seat;
  /** stage seats for everyone else, in the order arrivals take them */
  stage: Seat[];
  /** stands seats, nearest the stage first (overflow entries take them in this order) */
  standsFront: Seat[];
  /** stands seats, top tier first (spectators take them in this order) */
  standsBack: Seat[];
}

let stands: { front: Seat[]; back: Seat[] } | null = null;
function standsSeats(): { front: Seat[]; back: Seat[] } {
  if (stands) return stands;
  const tiers: Seat[][] = [];
  for (let t = 0; t < STANDS.tiers; t++) {
    const r = STANDS.r0 + STANDS.depth * (t + 0.5);
    const y = STANDS.rise * (t + 1);
    const segs: Array<[number, number]> = [];
    let a = STANDS.from;
    for (const [c, half] of STANDS.aisles) { segs.push([a, c - half]); a = c + half; }
    segs.push([a, STANDS.to]);
    const list: Seat[] = [];
    for (const [a0, a1] of segs) {
      const n = Math.floor(((r * (a1 - a0) * Math.PI) / 180) / STANDS.spacing);
      for (let k = 0; k < n; k++) list.push(seat(a0 + ((k + 0.5) * (a1 - a0)) / n, r, y, 10 + t, true));
    }
    // the back of the room first (in view behind the drum), then outward, the right side before the left
    // (v21 fix: the left of the home's first screen is the playbill's; its stands fill last)
    list.sort((p, q) => Math.abs(p.a - FILL_FROM) - Math.abs(q.a - FILL_FROM));
    tiers.push(list);
  }
  // the seat objects are shared by both stage layouts (Cast compares them by identity)
  stands = { front: tiers.flat(), back: tiers.slice().reverse().flat() };
  return stands;
}

const cache: { roomy: Layout | null; packed: Layout | null } = { roomy: null, packed: null };

/** The roomy layout, or the packed one. */
export function layout(packed = false): Layout {
  const hit = packed ? cache.packed : cache.roomy;
  if (hit) return hit;
  const spec = packed ? PACKED : ROOMY;
  const rings = spec.rings.map((r, i) => ringSeats(r, i, spec.spacing));
  // the inner ring's first seat (front left, beside the wedge) is the viewer's
  const inner = rings[0]!;
  const mine = inner[0]!;
  const stage: Seat[] = [];
  // v21 fix: each ring fills its back and right first (spread evenly there), then its front left: the left of the
  // home's first screen (the playbill) and of /play (the chat) stays clear until the room is busy. Arrival order only.
  const spreadRing = (ring: Seat[]) => {
    const first = ring.filter((s) => s.a >= RIGHT_FIRST), then = ring.filter((s) => s.a < RIGHT_FIRST);
    for (const k of spreadOrder(first.length)) stage.push(first[k]!);
    for (const k of spreadOrder(then.length)) stage.push(then[k]!);
  };
  spreadRing(inner.slice(1));
  for (const ring of rings.slice(1)) spreadRing(ring);
  // when the viewer is not in the round, their seat is the stage's last one
  stage.push(mine);
  const st = standsSeats();
  const L: Layout = { scale: spec.scale, mine, stage, standsFront: st.front, standsBack: st.back };
  if (packed) cache.packed = L; else cache.roomy = L;
  return L;
}

/** Whether a round of `n` entries stands in the packed layout (more players than the roomy stage seats). */
export function packedFor(n: number): boolean { return n > layout(false).stage.length; }
/** The layout of a round of `n` entries. */
export function layoutFor(n: number): Layout { return layout(packedFor(n)); }
/** The stage characters' height in a round of `n` entries (the same for all of them). */
export function stageScaleFor(n: number): number { return layoutFor(n).scale; }

/** How many entries the stage seats (the viewer's seat included), at most. */
export function stageCapacity(): number { return layout(true).stage.length; }

/**
 * Where entry `i` of a round of `n` entries stands, from the arrival order
 * alone (and which entry is the viewer's): identical for every result.
 * Entries beyond the stage stand in the stands, lowest tiers first; null
 * past the stands too.
 */
export function seatOfEntry(i: number, mineIndex: number | null, n: number): Seat | null {
  const L = layoutFor(n);
  if (mineIndex !== null && i === mineIndex) return L.mine;
  const rank = mineIndex !== null && i > mineIndex ? i - 1 : i;
  const cap = mineIndex !== null ? L.stage.length - 1 : L.stage.length;
  if (rank < cap) return L.stage[rank]!;
  return L.standsFront[rank - cap] ?? null;
}

/** The height of the character on a seat in a round of `n` entries. */
export function sizeOfSeat(s: Seat, n: number): number { return s.stands ? STANDS_S : stageScaleFor(n); }

/** How many entries stand in the stands (beyond the stage's seats). */
export function overflowOf(n: number, mineIndex: number | null): number {
  const L = layoutFor(n);
  const cap = mineIndex !== null ? L.stage.length - 1 : L.stage.length;
  const others = mineIndex !== null ? n - 1 : n;
  return Math.max(0, others - cap);
}

/** The point in front of a character where a served ball stops (toward the drum); `lead` scales with its size. */
export function feetOf(s: Seat, out: { x: number; y: number; z: number }, lead = 0.34): { x: number; y: number; z: number } {
  const r = Math.hypot(s.x, s.z) || 1;
  out.x = s.x * (1 - lead / r); out.z = s.z * (1 - lead / r); out.y = s.y;
  return out;
}

/** Back-compat (v20 callers): the roomy stage seats in order. */
export function seatsFor(_phone: boolean): Seat[] { return layout().stage; }
