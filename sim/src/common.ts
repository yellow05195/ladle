/**
 * Shared pieces of the Monte Carlo simulations (G3, G4).
 * Float64 arithmetic: these simulations study the STATISTICAL law
 * (expectations per decile, concentration), not integer rounding. The
 * integer-exact invariant is proven separately by the property test in
 * /tests/props (10,000 adversarial windows at the lamport).
 */

export const ROLL_MAX = 10_000;
export const ROLL_EXP = 3;

/** sfc32 - small fast PRNG with a fixed seed so every run is reproducible. */
export function makeRng(seed = 0x5eed_1234) {
  let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 20; i++) next();
  return next;
}

/** The roll law: r = floor((ROLL_MAX+1) * u^k), u uniform on [0,1). */
export function rollOf(u: number, k = ROLL_EXP): number {
  let p = u;
  for (let i = 1; i < k; i++) p *= u;
  const r = Math.floor((ROLL_MAX + 1) * p);
  return r > ROLL_MAX ? ROLL_MAX : r;
}

/** Standard normal via Box-Muller. */
export function randn(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Pareto (power law) with shape alpha, min 1. */
export function pareto(rng: () => number, alpha: number): number {
  return Math.pow(1 - rng(), -1 / alpha);
}

export interface Family {
  key: string;
  label: string;
  /** Fill `amounts` (Float64Array, len >= 512) and return the entry count. */
  draw: (rng: () => number, amounts: Float64Array) => number;
}

/** The window compositions required by the brief. */
export const FAMILIES: Family[] = [
  {
    key: "two",
    label: "2 players, log-normal stakes",
    draw: (rng, a) => { a[0] = Math.exp(randn(rng)); a[1] = Math.exp(randn(rng)); return 2; },
  },
  {
    key: "fifty",
    label: "50 players, log-normal stakes (sigma 1)",
    draw: (rng, a) => { for (let i = 0; i < 50; i++) a[i] = Math.exp(randn(rng)); return 50; },
  },
  {
    key: "whale",
    label: "1 big (10x) vs 10 small",
    draw: (rng, a) => { a[0] = 10; for (let i = 1; i < 11; i++) a[i] = 1; return 11; },
  },
  {
    key: "power",
    label: "Power-law stakes (Pareto alpha 1.5), 2-200 players",
    draw: (rng, a) => {
      const n = 2 + Math.floor(rng() * 199);
      for (let i = 0; i < n; i++) a[i] = pareto(rng, 1.5);
      return n;
    },
  },
  {
    key: "equal",
    label: "10 equal stakes",
    draw: (_rng, a) => { for (let i = 0; i < 10; i++) a[i] = 1; return 10; },
  },
];

/** Decile edges (10 upper bounds, last = +inf) from a sorted sample. */
export function decileEdges(sorted: Float64Array): number[] {
  const edges: number[] = [];
  for (let d = 1; d < 10; d++) edges.push(sorted[Math.floor((sorted.length * d) / 10)]!);
  edges.push(Number.POSITIVE_INFINITY);
  return edges;
}

export function decileOf(x: number, edges: number[]): number {
  let d = 0;
  while (d < 9 && x >= edges[d]!) d++;
  return d;
}

/** Welford-free accumulator: n, sum, sumsq -> mean, 95% CI half-width. */
export class Acc {
  n = 0; s = 0; s2 = 0;
  add(x: number) { this.n++; this.s += x; this.s2 += x * x; }
  get mean() { return this.n ? this.s / this.n : NaN; }
  get variance() { return this.n > 1 ? Math.max(0, (this.s2 - (this.s * this.s) / this.n) / (this.n - 1)) : NaN; }
  get ci95() { return this.n > 1 ? 1.96 * Math.sqrt(this.variance / this.n) : NaN; }
}
