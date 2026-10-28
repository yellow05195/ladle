/**
 * The simulator behind "See what a draw looks like": Monte Carlo over many
 * windows with the REAL law from @pulled/sdk/law (computeWeights,
 * computeShares, splitFees, curveBuy). Only the roll source differs from the
 * chain: on-chain a roll is floor((ROLL_MAX+1) · u³) with u the top 21 bits of
 * sha256(seed ‖ owner ‖ index); here u comes from a seeded PRNG, which is the
 * same distribution without the hashing. Runs in a Web Worker (sim.worker.ts)
 * and in node (the bench). Pure: no DOM.
 */
import { computeShares, computeWeights, curveBuy, splitFees, ROLL_MAX, ROLL_EXP, type Curve } from "@pulled/sdk/law";
import { sfc32 } from "./prng";

export interface SimInput {
  /** my stake, in lamports */
  stake: bigint;
  /** the window total including me, in lamports */
  total: bigint;
  /** share of the window taken by the biggest other entry, 0..0.2 */
  biggestShare: number;
  /** host fee, bps (0..300) */
  hostFeeBps: bigint;
  /** windows to simulate */
  windows: number;
  /** PRNG seed */
  seed: number;
}

export interface SimResult {
  windows: number;
  /** multipliers of my entry, sorted ascending (Float64, length = windows) */
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  /** share of windows where my multiplier is below 1 */
  belowProRata: number;
  /** histogram of my multiplier over [lo, hi), `bins` equal bins */
  hist: { lo: number; hi: number; bins: number[] };
  /** fee split of one window of `total`, by the law */
  fees: { platform: bigint; host: bigint; toCurve: bigint };
  /** the stake's entries count, mean over windows */
  meanEntries: number;
  /** wall time of the run, ms */
  ms: number;
  /** every multiplier of the run, sorted ascending */
  mults: Float64Array;
}

const ROLL_MAX_N = Number(ROLL_MAX);
const DEMO_CURVE: Curve = { x: 30_000_000_000n, y: 1_073_000_000_000_000n };

/** One roll by the law's formula, from a uniform u in [0, 1). */
export function rollOf(u: number): bigint {
  const r = Math.floor((ROLL_MAX_N + 1) * Math.pow(u, ROLL_EXP));
  return BigInt(Math.min(ROLL_MAX_N, Math.max(0, r)));
}

/**
 * Builds one window: me, the biggest other entry at `biggestShare` of the
 * total (if any), the rest split between 3..11 others with log-normal sizes.
 * Amounts are integers in lamports and sum exactly to `total`.
 */
function buildAmounts(p: { next(): number; int(n: number): number }, stake: bigint, total: bigint, biggestShare: number): bigint[] {
  const amounts: bigint[] = [stake];
  let rest = total - stake;
  if (rest <= 0n) return amounts;
  if (biggestShare > 0) {
    const big = (total * BigInt(Math.round(biggestShare * 10_000))) / 10_000n;
    if (big > 0n && big < rest) { amounts.push(big); rest -= big; }
  }
  const n = 3 + p.int(9);
  const ws: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const u = Math.max(p.next(), 1e-12), v = p.next(); const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); const w = Math.exp(0.9 * z); ws.push(w); sum += w; }
  let given = 0n;
  for (let i = 0; i < n; i++) {
    const a = i === n - 1 ? rest - given : (rest * BigInt(Math.round((ws[i]! / sum) * 1_000_000))) / 1_000_000n;
    if (a > 0n) { amounts.push(a); given += a; }
  }
  if (given < rest) amounts[amounts.length - 1] = amounts[amounts.length - 1]! + (rest - given);
  return amounts;
}

export function simulate(input: SimInput): SimResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const p = sfc32(input.seed);
  const N = input.windows;
  const mults = new Float64Array(N);
  let entries = 0;
  const fees = splitFees(input.total, input.hostFeeBps);
  const bought = curveBuy(DEMO_CURVE, fees.toCurve);
  const tokens = bought.out;
  const totalN = Number(input.total), stakeN = Number(input.stake), tokensN = Number(tokens);
  for (let k = 0; k < N; k++) {
    const amounts = buildAmounts(p, input.stake, input.total, input.biggestShare);
    const rolls = amounts.map(() => rollOf(p.next()));
    const w = computeWeights(amounts, rolls);
    const shares = computeShares(tokens, w.weights, w.weightSum);
    // share / pro-rata for my entry (index 0)
    mults[k] = (Number(shares[0]!) * totalN) / (stakeN * tokensN);
    entries += amounts.length;
  }
  const sorted = Float64Array.from(mults).sort();
  const q = (x: number) => sorted[Math.min(N - 1, Math.floor(x * N))]!;
  let sum = 0, below = 0;
  for (let k = 0; k < N; k++) { sum += sorted[k]!; if (sorted[k]! < 1) below++; }
  const lo = 0, hi = 2, B = 40;
  const bins = new Array<number>(B).fill(0);
  for (let k = 0; k < N; k++) { const i = Math.min(B - 1, Math.max(0, Math.floor(((sorted[k]! - lo) / (hi - lo)) * B))); bins[i]!++; }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    windows: N,
    mean: sum / N,
    p10: q(0.1), p50: q(0.5), p90: q(0.9),
    min: sorted[0]!, max: sorted[N - 1]!,
    belowProRata: below / N,
    hist: { lo, hi, bins },
    fees: { platform: fees.platform, host: fees.host, toCurve: fees.toCurve },
    meanEntries: entries / N,
    ms: t1 - t0,
    mults: sorted,
  };
}
