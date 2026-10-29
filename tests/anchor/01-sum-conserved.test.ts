/**
 * TEST 1 - the sum is conserved on chain, 50 windows.
 *
 * For every settled window: sum(entry.share) == window.tokens_out exactly,
 * to_curve + fee_platform + fee_host == total_amount exactly, the escrow is
 * empty after finalize, and the quote vault grew by exactly to_curve.
 *
 * window_slots is set to the minimum (25) here only to keep 50 windows under
 * the mocha timeout; the law does not depend on the window length. Every
 * other market uses the measured defaults (92 / 900).
 */
import assert from "node:assert/strict";
import { WindowState, splitFees } from "@pulled/sdk";
import { createMarket, env, participant, runWindow, tokenBalance, type Ctx, type MarketCtx } from "./setup.ts";

describe("1. sum conserved on chain (50 windows)", function () {
  this.timeout(1_800_000);
  let ctx: Ctx; let m: MarketCtx;
  const players: { kp: import("@solana/web3.js").Keypair; quote: import("@solana/web3.js").PublicKey }[] = [];

  before(async () => {
    ctx = env();
    m = await createMarket(ctx, { params: { windowSlots: 25n } });
    for (let i = 0; i < 6; i++) players.push(await participant(ctx, m, 10n ** 12n, 200_000_000));
  });

  it("50 windows: shares sum to tokens_out and fees + curve sum to the stakes", async () => {
    let rng = 0x9e3779b9;
    const next = () => { rng = (rng * 1_664_525 + 1_013_904_223) >>> 0; return rng; };
    for (let n = 0; n < 50; n++) {
      const k = 1 + (next() % 6);
      const stakes = [];
      for (let i = 0; i < k; i++) stakes.push({ p: players[i]!, amount: 100_000_000n + BigInt(next() % 5_000_000) * 100n });
      const vaultBefore = await tokenBalance(ctx, (await ctx.client.getMarket(m.market)).account.quoteVault, m.quoteProgram);

      const w = await runWindow(ctx, m, stakes);
      const entries = await ctx.client.getEntries(w.pubkey);
      assert.equal(entries.length, k);
      const sumShares = entries.reduce((a, e) => a + e.account.share, 0n);
      assert.equal(sumShares, w.account.tokensOut, `window ${n}: sum(shares) != tokens_out`);
      const total = stakes.reduce((a, s) => a + s.amount, 0n);
      assert.equal(w.account.totalAmount, total);
      assert.equal(w.account.toCurve + w.account.feePlatform + w.account.feeHost, total, `window ${n}: fee identity`);
      const fees = splitFees(total, 0n);
      assert.equal(w.account.feePlatform, fees.platform);
      assert.equal(w.account.toCurve, fees.toCurve);
      assert.equal(await tokenBalance(ctx, w.account.escrow, m.quoteProgram), 0n, `window ${n}: escrow not empty`);
      const vaultAfter = await tokenBalance(ctx, (await ctx.client.getMarket(m.market)).account.quoteVault, m.quoteProgram);
      assert.equal(vaultAfter - vaultBefore, w.account.toCurve, `window ${n}: quote vault delta`);
      assert.equal(w.account.state, WindowState.Settled);
      // off-chain recomputation agrees entry by entry
      const v = await ctx.client.verifyWindow(w.pubkey);
      assert.ok(v.ok, `window ${n}: ${v.notes.join("; ")}`);
    }
  });
});
