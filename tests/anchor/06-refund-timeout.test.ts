/**
 * TEST 6 - refund on a silent VRF passes only after the timeout, with no
 * privileged signer.
 *
 * The window is sealed but the randomness is never requested (a silent
 * keeper). Before `sealed_slot + vrf_timeout_slots`: VrfTimeoutNotReached.
 * After: refund_window from an unrelated keypair, then refund_entry by a
 * third party pays the FULL stake back (no fee), and a second refund_entry
 * is refused (AlreadyRefunded).
 */
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { WindowState } from "@pulled/sdk";
import {
  createMarket, currentSlot, enter, env, expectError, fund, openWindow, participant, send, tokenBalance, waitForSlot, type Ctx, type MarketCtx,
} from "./setup.ts";

describe("6. refund on silent VRF", function () {
  this.timeout(1_200_000);
  let ctx: Ctx; let m: MarketCtx;
  // minimum timeout (150 slots ~ 33 s) to keep the wait short; > window_slots (25)
  before(async () => { ctx = env(); m = await createMarket(ctx, { params: { windowSlots: 25n, vrfTimeoutSlots: 150n } }); });

  it("refuses before the timeout, passes after it, refunds every stake in full", async () => {
    const window = await openWindow(ctx, m);
    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    await enter(ctx, m, window, a, 4_000_000n);
    await enter(ctx, m, window, b, 6_000_000n);
    const w0 = (await ctx.client.getWindow(window.pubkey)).account;
    await waitForSlot(ctx, w0.closeSlot);
    await send(ctx, ctx.client.sealInstructions(m.market, window.pubkey)); // seal only: nobody requests randomness
    const sealed = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(sealed.state, WindowState.Sealed);
    assert.equal(sealed.vrfRequested, false);

    await expectError(send(ctx, ctx.client.refundWindowInstructions(m.market, window.pubkey, sealed)), "VrfTimeoutNotReached");

    await waitForSlot(ctx, sealed.sealedSlot + 150n + 2n);
    assert.ok((await currentSlot(ctx)) > sealed.sealedSlot + 150n);
    const stranger = Keypair.generate();
    await fund(ctx, stranger.publicKey, 30_000_000);
    await send(ctx, ctx.client.refundWindowInstructions(m.market, window.pubkey, sealed), [], stranger);
    const refunding = await ctx.client.getWindow(window.pubkey);
    assert.equal(refunding.account.state, WindowState.Refunding);
    assert.equal((await ctx.client.getMarket(m.market)).account.nextSettleIndex, refunding.account.index + 1n, "cursor advanced past the refunded window");

    const mk = (await ctx.client.getMarket(m.market)).account;
    const beforeA = await tokenBalance(ctx, a.quote, m.quoteProgram);
    const beforeB = await tokenBalance(ctx, b.quote, m.quoteProgram);
    for (const e of await ctx.client.getEntries(window.pubkey)) {
      // third party pays the fee, the owner never signs
      await send(ctx, ctx.client.refundEntryInstructions(stranger.publicKey, m.market, mk, window.pubkey, refunding.account, e), [], stranger);
    }
    assert.equal((await tokenBalance(ctx, a.quote, m.quoteProgram)) - beforeA, 4_000_000n, "full stake back, no fee");
    assert.equal((await tokenBalance(ctx, b.quote, m.quoteProgram)) - beforeB, 6_000_000n);
    assert.equal(await tokenBalance(ctx, refunding.account.escrow, m.quoteProgram), 0n);
    const entries = await ctx.client.getEntries(window.pubkey);
    assert.ok(entries.every((e) => e.account.refunded));
    await expectError(send(ctx, ctx.client.refundEntryInstructions(stranger.publicKey, m.market, mk, window.pubkey, refunding.account, entries[0]!), [], stranger), "AlreadyRefunded");
  });
});
