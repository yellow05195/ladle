/**
 * Off-chain recomputation of a window from public data with `law.ts`,
 * compared with what the program wrote. This is what the browser
 * "recompute" button calls. Pure: takes decoded accounts, no RPC.
 */
import type { PublicKey } from "@solana/web3.js";
import { computeShares, computeWeights, deriveRoll, splitFees } from "./law.ts";
import { WindowState, type Entry, type EntryVerification, type Keyed, type Window, type WindowVerification } from "./types.ts";

export interface VerifyInput {
  windowPubkey: PublicKey;
  window: Window;
  /** Every Entry of the window (any order; sorted by index here). */
  entries: readonly Keyed<Entry>[];
  /** `integration.host_fee_bps`, 0 when the market has none. */
  hostFeeBps: number;
}

/**
 * Recompute every roll and every share of the window and compare with the
 * Entry accounts. Works on Tallied and Settled windows (rolls only for
 * Drawn/Tallied before settle pages ran); for earlier states it reports what
 * can be checked and `ok = false`.
 */
export function verifyWindow(input: VerifyInput): WindowVerification {
  const { window, hostFeeBps } = input;
  const notes: string[] = [];
  const entries = [...input.entries].sort((a, b) => a.account.index - b.account.index);

  // completeness: indices 0..entry_count-1 exactly once
  let complete = entries.length === window.entryCount;
  for (let i = 0; complete && i < entries.length; i++) if (entries[i]!.account.index !== i) complete = false;
  if (!complete) notes.push(`entry set incomplete: have ${entries.length}, window.entry_count = ${window.entryCount}`);

  const drawn = window.state >= WindowState.Drawn && window.state !== WindowState.Refunding;
  const tallied = window.state >= WindowState.Tallied && window.state !== WindowState.Refunding;
  const settled = window.state === WindowState.Settled;
  if (!drawn) notes.push("window not drawn yet: no seed to recompute rolls from");

  const amounts = entries.map((e) => e.account.amount);
  const owners = entries.map((e) => e.account.owner.toBytes());
  const rolls = drawn ? entries.map((e, i) => deriveRoll(window.seed, owners[i]!, e.account.index)) : entries.map(() => 0n);

  let expectedShares: bigint[] = entries.map(() => 0n);
  let rollSumMatch = false;
  let sharesSum = false;
  if (drawn && complete && entries.length > 0) {
    const weights = computeWeights(amounts, rolls);
    rollSumMatch = !tallied || weights.rollSum === window.rollSum;
    if (!rollSumMatch) notes.push(`roll_sum mismatch: recomputed ${weights.rollSum}, on-chain ${window.rollSum}`);
    if (tallied) {
      expectedShares = computeShares(window.tokensOut, weights.weights, weights.weightSum);
      const sum = expectedShares.reduce((a, b) => a + b, 0n);
      sharesSum = sum === window.tokensOut;
      if (!sharesSum) notes.push(`sum(shares) ${sum} != tokens_out ${window.tokensOut}`);
    }
  }

  let feesMatch = false;
  if (tallied) {
    const fees = splitFees(window.totalAmount, BigInt(hostFeeBps));
    feesMatch = fees.platform === window.feePlatform && fees.host === window.feeHost && fees.toCurve === window.toCurve;
    if (!feesMatch) notes.push("fee split mismatch (platform/host/to_curve)");
  }

  const perEntry: EntryVerification[] = entries.map((e, i) => {
    const onChainRoll = e.account.roll;
    const onChainShare = e.account.share;
    const expectedRoll = rolls[i]!;
    const expectedShare = expectedShares[i]!;
    const rollKnown = e.account.index < window.tallyCursor;
    const shareKnown = e.account.index < window.settleCursor;
    return {
      index: e.account.index,
      owner: e.account.owner,
      amount: e.account.amount,
      onChainRoll,
      expectedRoll,
      rollMatch: drawn && rollKnown && onChainRoll === expectedRoll,
      onChainShare,
      expectedShare,
      shareMatch: tallied && shareKnown && onChainShare === expectedShare,
    };
  });

  const ok = settled && complete && rollSumMatch && sharesSum && feesMatch && perEntry.every((p) => p.rollMatch && p.shareMatch);
  return {
    window: input.windowPubkey,
    state: window.state,
    ok,
    entries: perEntry,
    rollSumMatch,
    sharesSumToTokensOut: sharesSum,
    feesMatch,
    hostFeeBps,
    notes,
  };
}
