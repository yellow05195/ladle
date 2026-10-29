/**
 * TEST 10 - a single entry receives the whole window: share == tokens_out,
 * whatever the roll, so the window needs no randomness: seal moves it
 * straight to Drawn with an all-zero seed and no ORAO request (no ORAO fee,
 * no request rent), and it can never be refunded.
 */
import assert from "node:assert/strict";
import { ROLL_MAX, WindowState, curveBuy, splitFees } from "@pulled/sdk";
import { createMarket, env, expectError, participant, runWindow, send, type Ctx, type MarketCtx } from "./setup.ts";

describe("10. single player", function () {
  this.timeout(900_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx); });

  it("share == tokens_out exactly, tokens_out == curveBuy(to_curve), and no ORAO request", async () => {
    const a = await participant(ctx, m, 10n ** 9n);
    const curveBefore = (await ctx.client.getMarket(m.market)).account.curve;
    const w = await runWindow(ctx, m, [{ p: a, amount: 250_000_000n }]);
    assert.equal(w.account.vrfRequested, false, "no randomness requested for a lone entry");
    assert.ok(w.account.seed.every((b) => b === 0), "seed stays zero");
    assert.ok(w.account.vrfSeed.every((b) => b === 0));
    const [e] = await ctx.client.getEntries(w.pubkey);
    assert.ok(e);
    assert.ok(e.account.roll >= 0n && e.account.roll <= ROLL_MAX);
    assert.equal(e.account.share, w.account.tokensOut, "the only entry gets everything");
    const fees = splitFees(250_000_000n, 0n);
    const { out, next } = curveBuy(curveBefore, fees.toCurve);
    assert.equal(w.account.tokensOut, out);
    assert.deepEqual((await ctx.client.getMarket(m.market)).account.curve, next);
    // nothing to wait for, nothing to refund
    assert.equal(w.account.state, WindowState.Settled);
    await expectError(send(ctx, ctx.client.refundWindowInstructions(m.market, w.pubkey, w.account)), "WrongWindowState");
  });
});
