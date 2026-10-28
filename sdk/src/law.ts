/**
 * PULLED - the draw law and the settlement arithmetic.
 *
 * This file is the canonical off-chain reference of what the on-chain program
 * does. Anyone can recompute every draw of every window from public data with
 * it (the browser "recompute" button uses exactly these functions).
 *
 * Everything here is exact integer arithmetic (BigInt). No floats.
 *
 * -- THE LAW (validated by gate G3, see /research/G3.md) ---------------------
 *
 * Each entry i has a stake a_i (lamports of the quote asset) and a roll r_i in
 * [0, ROLL_MAX], derived deterministically from the window seed. Let
 *     A  = sum(a_j)                 (total stake of the window)
 *     W  = sum(a_j * r_j)           (stake-weighted roll sum)
 *     rbar = W / A                  (stake-weighted average roll)
 * The share of entry i in the tokens the curve sold for the window is
 *     share_i = tokens * (a_i / A) * (1 + (r_i - rbar) / ROLL_MAX)
 * i.e. the pro-rata share, scaled by a multiplier between 0 and 2 that is
 * LINEAR in the entry's own roll. Because it is linear, the expectation of the
 * multiplier is exactly 1 for every entry whatever its size (E[r_i] = E[rbar]),
 * so every stake decile has exactly its pro-rata expectation. The naive
 * multiplicative law (a_i*r_i / sum(a_j*r_j)) does NOT have this property; G3
 * measured it and it was rejected. sum(share_i) = tokens by construction.
 *
 * Integer form (no division before the final one):
 *     w_i = a_i * (A*(ROLL_MAX + r_i) - W)        (always >= 0)
 *     S   = sum(w_i) = ROLL_MAX * A^2
 *     share_i = tokens * w_i / S   rounded by cumulative quota rounding.
 *
 * -- ROUNDING ----------------------------------------------------------------
 * Shares are integers and must sum EXACTLY to tokens. We use cumulative quota
 * rounding: with C_i = w_0 + ... + w_i,
 *     share_i = floor(tokens*C_i / S) - floor(tokens*C_{i-1} / S).
 * This telescopes to exactly `tokens`, every share is within 1 base unit of its
 * exact rational value, the remainder is spread over the entries where the
 * cumulative fraction crosses an integer (never dumped on the last entry, never
 * dropped), and it is computable one entry at a time, which is what makes the
 * on-chain settlement paginable with O(1) state (the running C). The largest-
 * remainder method gives the same +-1 bound but needs a global sort of the
 * remainders, which cannot be paginated across transactions. See /docs/MECHANICS.md.
 */

import { sha256 } from "@noble/hashes/sha2.js";

export const ROLL_MAX = 10_000n;          // rolls are integers in [0, ROLL_MAX]
export const ROLL_BITS = 21n;             // bits of the hash used as the uniform source
export const ROLL_EXP = 3;                // r = floor((ROLL_MAX+1) * u^3), u uniform
export const BPS = 10_000n;

/** Platform fee, hard-coded in the program as well. Taken on the window total before the curve buy. */
export const PLATFORM_FEE_BPS = 100n;     // 1.00 %
/** Maximum host (integrator) fee share an integration can set at creation. */
export const MAX_HOST_FEE_BPS = 300n;     // 3.00 %

export interface Entry {
  owner: Uint8Array;  // 32-byte pubkey
  index: number;      // u32 position in the window
  amount: bigint;     // lamports of quote asset
}

/* ---------------------------- rolls ---------------------------- */

/**
 * Draw of a single roll from a 32-byte hash.
 * u64 = first 8 bytes little-endian; n = top 21 bits of it (uniform on [0, 2^21));
 * r = floor((ROLL_MAX+1) * (n / 2^21)^3)  computed exactly as ((n^3) * (ROLL_MAX+1)) >> 63.
 * n^3 < 2^63 so the product fits in 128 bits; result is in [0, ROLL_MAX].
 */
export function rollFromHash(hash: Uint8Array): bigint {
  if (hash.length < 8) throw new Error("hash too short");
  let u64 = 0n;
  for (let i = 7; i >= 0; i--) u64 = (u64 << 8n) | BigInt(hash[i]!);
  const n = u64 >> (64n - ROLL_BITS);
  const cube = n * n * n;
  const r = (cube * (ROLL_MAX + 1n)) >> 63n;
  return r > ROLL_MAX ? ROLL_MAX : r;
}

/** hash(seed || owner || index_le_u32) - the per-entry hash. */
export function entryHash(seed: Uint8Array, owner: Uint8Array, index: number): Uint8Array {
  if (owner.length !== 32) throw new Error("owner must be 32 bytes");
  const buf = new Uint8Array(seed.length + 32 + 4);
  buf.set(seed, 0);
  buf.set(owner, seed.length);
  const idx = index >>> 0;
  buf[seed.length + 32] = idx & 0xff;
  buf[seed.length + 33] = (idx >>> 8) & 0xff;
  buf[seed.length + 34] = (idx >>> 16) & 0xff;
  buf[seed.length + 35] = (idx >>> 24) & 0xff;
  return sha256(buf);
}

export function deriveRoll(seed: Uint8Array, owner: Uint8Array, index: number): bigint {
  return rollFromHash(entryHash(seed, owner, index));
}

/* ---------------------------- weights ---------------------------- */

export interface Weights {
  total: bigint;      // A
  rollSum: bigint;    // W = sum(a_j r_j)
  weights: bigint[];  // w_i
  weightSum: bigint;  // S = ROLL_MAX * A^2
}

export function computeWeights(amounts: readonly bigint[], rolls: readonly bigint[]): Weights {
  if (amounts.length !== rolls.length) throw new Error("length mismatch");
  let total = 0n;
  let rollSum = 0n;
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i]!, r = rolls[i]!;
    if (a <= 0n) throw new Error("amount must be > 0");
    if (r < 0n || r > ROLL_MAX) throw new Error("roll out of range");
    total += a;
    rollSum += a * r;
  }
  const weights = amounts.map((a, i) => a * (total * (ROLL_MAX + rolls[i]!) - rollSum));
  const weightSum = ROLL_MAX * total * total;
  // Sanity: sum(w_i) == S exactly (algebraic identity).
  let check = 0n;
  for (const w of weights) { if (w < 0n) throw new Error("negative weight"); check += w; }
  if (check !== weightSum) throw new Error("weight sum identity broken");
  return { total, rollSum, weights, weightSum };
}

/* ---------------------------- shares ---------------------------- */

/**
 * Cumulative quota rounding. sum(result) == tokens exactly. Paginable: to resume
 * at entry k you only need C_{k-1} (sum of the previous weights).
 */
export function computeShares(tokens: bigint, weights: readonly bigint[], weightSum: bigint): bigint[] {
  if (tokens < 0n) throw new Error("tokens < 0");
  if (weightSum <= 0n) throw new Error("zero weight");
  const shares: bigint[] = new Array(weights.length);
  let cum = 0n;
  let prev = 0n;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i]!;
    const cur = (tokens * cum) / weightSum;
    shares[i] = cur - prev;
    prev = cur;
  }
  return shares;
}

/** One page of the same computation, exactly what settle_page does on-chain. */
export function sharePage(
  tokens: bigint, weightSum: bigint, cumBefore: bigint, pageWeights: readonly bigint[],
): { shares: bigint[]; cumAfter: bigint } {
  const shares: bigint[] = [];
  let cum = cumBefore;
  let prev = (tokens * cum) / weightSum;
  for (const w of pageWeights) {
    cum += w;
    const cur = (tokens * cum) / weightSum;
    shares.push(cur - prev);
    prev = cur;
  }
  return { shares, cumAfter: cum };
}

/* ---------------------------- fees ---------------------------- */

export interface FeeSplit { platform: bigint; host: bigint; toCurve: bigint }

/** Fees come off the window total BEFORE the curve buy. sum == total exactly. */
export function splitFees(total: bigint, hostFeeBps: bigint): FeeSplit {
  if (hostFeeBps < 0n || hostFeeBps > MAX_HOST_FEE_BPS) throw new Error("host fee out of range");
  const platform = (total * PLATFORM_FEE_BPS) / BPS;
  const host = (total * hostFeeBps) / BPS;
  return { platform, host, toCurve: total - platform - host };
}

/* ---------------------------- curve ---------------------------- */

/**
 * Constant-product curve with virtual reserves (x: quote, y: tokens).
 * Rounding is always against the trader so the pool can never be drained
 * below its invariant by rounding.
 */
export interface Curve { x: bigint; y: bigint }

function ceilDiv(a: bigint, b: bigint): bigint { return (a + b - 1n) / b; }

/** Buy with dx quote -> tokens out. */
export function curveBuy(c: Curve, dx: bigint): { out: bigint; next: Curve } {
  if (dx <= 0n) return { out: 0n, next: c };
  const k = c.x * c.y;
  const newX = c.x + dx;
  const newY = ceilDiv(k, newX);
  const out = c.y - newY;
  return { out, next: { x: newX, y: newY } };
}

/** Sell dy tokens -> quote out. */
export function curveSell(c: Curve, dy: bigint): { out: bigint; next: Curve } {
  if (dy <= 0n) return { out: 0n, next: c };
  const k = c.x * c.y;
  const newY = c.y + dy;
  const newX = ceilDiv(k, newY);
  const out = c.x - newX;
  return { out, next: { x: newX, y: newY } };
}

/* ---------------------------- whole window ---------------------------- */

export interface Settlement {
  rolls: bigint[];
  weights: Weights;
  fees: FeeSplit;
  tokensOut: bigint;
  shares: bigint[];
  curveAfter: Curve;
}

/** Full off-chain recomputation of a window from public data. */
export function settleWindow(
  seed: Uint8Array, entries: readonly Entry[], curve: Curve, hostFeeBps: bigint,
): Settlement {
  const amounts = entries.map((e) => e.amount);
  const rolls = entries.map((e) => deriveRoll(seed, e.owner, e.index));
  const weights = computeWeights(amounts, rolls);
  const fees = splitFees(weights.total, hostFeeBps);
  const { out: tokensOut, next: curveAfter } = curveBuy(curve, fees.toCurve);
  const shares = computeShares(tokensOut, weights.weights, weights.weightSum);
  return { rolls, weights, fees, tokensOut, shares, curveAfter };
}

/** Human-facing multiplier of one entry: share / pro-rata, as a float (display only). */
export function multiplierOf(share: bigint, amount: bigint, total: bigint, tokens: bigint): number {
  if (tokens === 0n) return 1;
  return Number((share * total * 1_000_000n) / (amount * tokens)) / 1_000_000;
}
