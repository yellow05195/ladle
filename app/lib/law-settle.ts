/**
 * Thin wrapper over the sdk law. Everything the UI recomputes goes through
 * these five functions and nothing else: deriveRoll, computeWeights,
 * splitFees, curveBuy, computeShares (+ multiplierOf / curveSell for display).
 */
import {
  deriveRoll,
  computeWeights,
  computeShares,
  curveBuy,
  curveSell,
  splitFees,
  multiplierOf,
  type Curve,
} from "@pulled/sdk/law";

export interface SettleInput {
  owner: Uint8Array;
  index: number;
  amount: bigint;
}

export interface SettleOutput {
  rolls: bigint[];
  shares: bigint[];
  total: bigint;
  platform: bigint;
  host: bigint;
  toCurve: bigint;
  tokensOut: bigint;
  curveAfter: Curve;
}

export function settle(seed: Uint8Array, entries: readonly SettleInput[], curve: Curve, hostFeeBps: bigint): SettleOutput {
  const rolls = entries.map((e) => deriveRoll(seed, e.owner, e.index));
  const amounts = entries.map((e) => e.amount);
  const w = computeWeights(amounts, rolls);
  const fees = splitFees(w.total, hostFeeBps);
  const bought = curveBuy(curve, fees.toCurve);
  const shares = computeShares(bought.out, w.weights, w.weightSum);
  return {
    rolls,
    shares,
    total: w.total,
    platform: fees.platform,
    host: fees.host,
    toCurve: fees.toCurve,
    tokensOut: bought.out,
    curveAfter: bought.next,
  };
}

export function sellBackQuote(curveAfter: Curve, share: bigint): bigint {
  return curveSell(curveAfter, share).out;
}

export function curveSellOut(c: Curve, tokens: bigint): { out: bigint; next: Curve } {
  return curveSell(c, tokens);
}

export { multiplierOf, deriveRoll, splitFees, curveBuy };
export type { Curve };
