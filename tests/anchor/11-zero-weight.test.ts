/**
 * TEST 11 - zero total weight is impossible.
 *
 * S = ROLL_MAX * A^2 and A > 0 as soon as one entry exists, because
 * enter refuses any stake below MIN_ENTRY_AMOUNT (EntryTooSmall), 0
 * included. On a settled window the on-chain
 * cum_weight equals S exactly (settle_page asserts it) and every roll is in
 * [0, ROLL_MAX], so each w_i >= 0 and sum(w_i) = S > 0.
 */
import assert from "node:assert/strict";
import { MIN_ENTRY_AMOUNT, ROLL_MAX, computeWeights } from "@pulled/sdk";
import { createMarket, enter, enterInstruction, env, expectError, openWindow, participant, runWindow, send, type Ctx, type MarketCtx } from "./setup.ts";

function u256Le(b: Uint8Array): bigint { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]!); return v; }

describe("11. zero weight impossible", function () {
  this.timeout(900_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx); });

  it("enter(0) and any stake below the minimum are refused", async () => {
    const window = await openWindow(ctx, m);
    const a = await participant(ctx, m, 10n ** 9n);
    const w = await ctx.client.getWindow(window.pubkey);
    await expectError(send(ctx, [enterInstruction(ctx, m, w, a.kp.publicKey, a.quote, 0n)], [a.kp], a.kp), "EntryTooSmall");
    await expectError(send(ctx, [enterInstruction(ctx, m, w, a.kp.publicKey, a.quote, MIN_ENTRY_AMOUNT - 1n)], [a.kp], a.kp), "EntryTooSmall");
    await enter(ctx, m, window, a, MIN_ENTRY_AMOUNT); // the smallest stake is fine
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.totalAmount, MIN_ENTRY_AMOUNT);
  });

  it("on a settled window cum_weight == ROLL_MAX * A^2 > 0 and all weights are >= 0", async () => {
    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    const w = await runWindow(ctx, m, [{ p: a, amount: MIN_ENTRY_AMOUNT }, { p: b, amount: 999_999_999n }]);
    const A = w.account.totalAmount;
    assert.equal(u256Le(w.account.cumWeight), ROLL_MAX * A * A);
    const entries = await ctx.client.getEntries(w.pubkey);
    const wt = computeWeights(entries.map((e) => e.account.amount), entries.map((e) => e.account.roll));
    assert.equal(wt.rollSum, w.account.rollSum);
    assert.ok(wt.weights.every((x) => x >= 0n));
    assert.ok(wt.weightSum > 0n);
  });
});
