/**
 * TEST 5 - no withdrawal after seal.
 *
 * There is no withdraw instruction at all (tests/idl-authority.ts). The only
 * paths that move a stake out of escrow are refund_entry (Refunding) and
 * finalize. Assert refund_entry and refund_window fail in Sealed, Drawn,
 * Tallied and Settled, and that enter fails once closed.
 */
import assert from "node:assert/strict";
import { WindowState } from "@pulled/sdk";
import {
  createMarket, enter, enterInstruction, env, expectError, fulfill, openWindow, participant, sealAndRequest, send, settleAll, tallyAll,
  tokenBalance, waitFulfilled, type Ctx, type MarketCtx,
} from "./setup.ts";

describe("5. no withdrawal after seal", function () {
  this.timeout(1_200_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx); });

  it("refund_entry / refund_window fail in every post-seal state; the stake only leaves escrow at finalize", async () => {
    const window = await openWindow(ctx, m);
    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    await enter(ctx, m, window, a, 500_000_000n);
    await enter(ctx, m, window, b, 500_000_000n);
    const mk = (await ctx.client.getMarket(m.market)).account;
    const entry = (await ctx.client.getEntries(window.pubkey))[0]!;
    const refundEntry = async () => {
      const w = (await ctx.client.getWindow(window.pubkey)).account;
      return send(ctx, ctx.client.refundEntryInstructions(ctx.payer.publicKey, m.market, mk, window.pubkey, w, entry));
    };
    const refundWindow = async () => {
      const w = (await ctx.client.getWindow(window.pubkey)).account;
      return send(ctx, ctx.client.refundWindowInstructions(m.market, window.pubkey, w));
    };

    await sealAndRequest(ctx, m, window);
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.state, WindowState.Sealed);
    await expectError(refundEntry(), "WrongWindowState");
    await expectError(refundWindow(), "VrfTimeoutNotReached");
    // entering a closed window
    const w = await ctx.client.getWindow(window.pubkey);
    const late = await participant(ctx, m, 10n ** 9n);
    await expectError(send(ctx, [enterInstruction(ctx, m, w, late.kp.publicKey, late.quote, 100_000n)], [late.kp], late.kp), "WrongWindowState");
    assert.equal(await tokenBalance(ctx, w.account.escrow, m.quoteProgram), 1_000_000_000n, "stakes still in escrow");

    await waitFulfilled(ctx, window.pubkey);
    await fulfill(ctx, window.pubkey);
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.state, WindowState.Drawn);
    await expectError(refundEntry(), "WrongWindowState");
    await expectError(refundWindow(), "WrongWindowState");

    await tallyAll(ctx, m, window.pubkey);
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.state, WindowState.Tallied);
    await expectError(refundEntry(), "WrongWindowState");
    await expectError(refundWindow(), "WrongWindowState");
    assert.equal(await tokenBalance(ctx, w.account.escrow, m.quoteProgram), 0n, "escrow paid out at finalize, not before");

    await settleAll(ctx, m, window.pubkey);
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.state, WindowState.Settled);
    await expectError(refundEntry(), "WrongWindowState");
    await expectError(refundWindow(), "WrongWindowState");
  });
});
