/**
 * The demo's deterministic round plans (moved out of mock.ts in v20 so the
 * demo ledger can replay them): who enters round n, with how much, when,
 * which seed the demo oracle returns and after which delay. Everything is
 * derived from sfc32(n): the same on every visit.
 */
import { sfc32, type Prng } from "../prng";
import { base58, LAMPORTS_PER_SOL } from "../format";
import { revealLatency, slotMs, windowSlots } from "../measurements";

export const DEMO_SLOT_MS = slotMs().value.ms;
export const DEMO_SLOTS = windowSlots().value;
export const DEMO_CAP_BPS = 2000n; // 20 %, from G4
export const DEMO_HOST_FEE_BPS = 0n;
/** Absolute floor for the first entrant (the cap has nothing to bite on yet). */
export const DEMO_CAP_FLOOR = LAMPORTS_PER_SOL / 2n; // 0.5 SOL
export const DEMO_DEFAULT_ENTRY = LAMPORTS_PER_SOL / 4n; // 0.25 SOL
export const DEMO_MINT = "DEMOmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
/** The demo caps the sampled oracle delay so a viewer never waits more than this (v21 fix: 12 s, was 30 s). */
export const DEMO_DELAY_CAP_MS = 12_000;
/** v21 fix: a visit's first live rounds never draw the oracle's slow tail (they stay within 1.5x the median). */
export const DEMO_CALM_ROUNDS = 8;
/** The first live round of a visit; rounds 1 … FIRST_WINDOW-1 are the replayed history. */
export const FIRST_WINDOW = 1100;
export const WINDOW_MS = DEMO_SLOTS * DEMO_SLOT_MS;
/** Seed fall before the split is served (beat 2). */
export const SEED_FALL_MS = 550;

const SYL = ["ka", "mo", "ri", "te", "lu", "na", "so", "vi", "do", "pe", "ha", "ze", "ol", "ib", "um", "ar"];

/** The short pseudonym the demo gives an owner (display only). */
export function pseudonym(owner: Uint8Array): string {
  const a = owner[0]! & 15, b = owner[1]! & 15, c = owner[2]! & 15;
  return SYL[a]! + SYL[b]! + SYL[c]!.slice(0, 1);
}

/** a <= max(FLOOR, cap * (A_before + a))  <=>  a <= max(FLOOR, A_before * cap / (1 - cap)). */
export function applyCap(amount: bigint, totalBefore: bigint, capBps: bigint, floor: bigint): bigint {
  const byCap = (totalBefore * capBps) / (10_000n - capBps);
  const max = byCap > floor ? byCap : floor;
  return amount > max ? max : amount;
}

/**
 * Inverse CDF of the measured request -> usable value latency, piecewise linear
 * between the published percentiles (G2). Returns ms. Capped for the demo.
 * The measured distribution is bimodal (G2: most answers within seconds, the
 * slow tail is one node): below the 90th percentile the demo stays between the
 * minimum and 1.5x the median, then jumps to the measured p90/p95/p99/max.
 */
export function sampleOracleDelayMs(u: number): number {
  const l = revealLatency().value;
  const pts: Array<[number, number]> = [
    [0, l.minS], [0.5, l.medianS], [0.899, l.medianS * 1.5], [0.9, l.p90S], [0.95, l.p95S], [0.99, l.p99S], [1, l.maxS],
  ];
  let s = l.maxS;
  for (let i = 1; i < pts.length; i++) {
    const [p0, v0] = pts[i - 1]!, [p1, v1] = pts[i]!;
    if (u <= p1) { s = v0 + ((u - p0) / (p1 - p0)) * (v1 - v0); break; }
  }
  return Math.min(DEMO_DELAY_CAP_MS, Math.round(s * 1000));
}

export interface PlanEntry { owner: Uint8Array; label: string; amount: bigint; frac: number }
export interface Plan {
  n: number;
  seed: Uint8Array;
  vrfAccount: string;
  settleTx: string;
  entries: PlanEntry[];
  delayMs: number;
}

function lognormalLamports(p: Prng): bigint {
  // Box-Muller
  const u = Math.max(p.next(), 1e-12), v = p.next();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const sol = Math.min(5, Math.max(0.02, Math.exp(Math.log(0.3) + 0.9 * z)));
  return BigInt(Math.round(sol * 1000)) * 1_000_000n; // 0.001 SOL steps
}

/**
 * v21: `?crowd=N` (1 … 120) sets how many players enter every live demo
 * round, to show the hall with 10, 50 or 120 players together. The demo
 * source only (this file plans the demo's rounds; the chain source never
 * reads it), in development and in production builds alike. The replayed
 * history (rounds before FIRST_WINDOW) is never changed. Read once, from the
 * URL the page was opened with.
 */
let crowdOverride: number | null | undefined;
export function demoCrowd(): number | null {
  if (crowdOverride !== undefined) return crowdOverride;
  if (typeof window === "undefined") return null;
  crowdOverride = null;
  try {
    const v = Number(new URLSearchParams(window.location.search).get("crowd"));
    if (Number.isFinite(v) && v >= 1) crowdOverride = Math.min(120, Math.floor(v));
  } catch { /* no URL */ }
  return crowdOverride;
}

export function plan(n: number): Plan {
  const p = sfc32(0x5eed0000 + n * 7919);
  const seed = p.bytes(32);
  const vrfAccount = base58(p.bytes(32));
  const settleTx = base58(p.bytes(64));
  const natural = 6 + p.int(9);
  const forced = n >= FIRST_WINDOW ? demoCrowd() : null;
  const count = forced ?? natural;
  const fracs: number[] = [];
  for (let i = 0; i < count; i++) fracs.push(0.04 + p.next() * 0.81);
  fracs.sort((a, b) => a - b);
  const entries: PlanEntry[] = [];
  let total = 0n;
  for (let i = 0; i < count; i++) {
    const owner = p.bytes(32);
    const amount = applyCap(lognormalLamports(p), total, DEMO_CAP_BPS, DEMO_CAP_FLOOR);
    total += amount;
    entries.push({ owner, label: pseudonym(owner), amount, frac: fracs[i]! });
  }
  const u = p.next();
  const delayMs = sampleOracleDelayMs(n >= FIRST_WINDOW && n < FIRST_WINDOW + DEMO_CALM_ROUNDS ? Math.min(u, 0.899) : u);
  return { n, seed, vrfAccount, settleTx, entries, delayMs };
}
