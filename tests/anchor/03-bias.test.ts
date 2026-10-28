/**
 * TEST 3 - bias attempts by every role fail or have no effect on the seed.
 *
 *  participant  grinding entries: the VRF seed is a hash of the final entry
 *               set that nobody can evaluate before ORAO answers; the roll of
 *               an entry is fixed by (ORAO randomness, owner, index) only.
 *  creator      re-ordering: indices are assigned by the program in arrival
 *               order; the creator has no instruction to touch them.
 *  keeper       withholding fulfill: anyone else can fulfil; once the
 *               randomness exists, refund_window is refused (MustFulfill).
 *  leader       aborting: no instruction cancels a sealed window; a second
 *               request_vrf is refused; a request with a different account
 *               is refused by ORAO's seed constraint.
 */
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { WindowState, deriveVrfSeed, deriveRoll, oraoRandomnessPda, requestVrfIx, oraoNetworkStatePda } from "@pulled/sdk";
import {
  createMarket, currentSlot, enter, env, expectError, fulfill, fund, openWindow, participant, sealAndRequest, send, settleAll, tallyAll,
  waitFulfilled, waitForSlot, type Ctx, type MarketCtx,
} from "./setup.ts";

describe("3. bias attempts", function () {
  this.timeout(1_800_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx); });

  it("the seed is fixed by the entry set and the roll by (randomness, owner, index): nothing a participant chooses", async () => {
    const window = await openWindow(ctx, m);
    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    const c = await participant(ctx, m, 10n ** 9n);
    await enter(ctx, m, window, a, 1_000_000n);
    await enter(ctx, m, window, b, 2_000_000n);
    // one entry per wallet per window: a second stake from the same wallet is refused
    await expectError(enter(ctx, m, window, a, 1_000n), "AlreadyEntered");
    // a "grinder" sees the seed only once the window is closed: before the last entry it is a different value
    const w1 = (await ctx.client.getWindow(window.pubkey)).account;
    const seedIfStoppedNow = deriveVrfSeed(window.pubkey, w1.closeSlot, w1.entryCount, w1.entriesCommitment);
    await enter(ctx, m, window, c, 3_000_000n);
    const w2 = (await ctx.client.getWindow(window.pubkey)).account;
    const seedFinal = deriveVrfSeed(window.pubkey, w2.closeSlot, w2.entryCount, w2.entriesCommitment);
    assert.notDeepEqual(seedIfStoppedNow, seedFinal, "one more entry changes the seed");
    assert.equal(w2.entryCount, 3);
    // indices follow arrival order; nobody re-orders
    const entries = await ctx.client.getEntries(window.pubkey);
    assert.deepEqual(entries.map((e) => e.account.index), [0, 1, 2]);
    assert.deepEqual(entries.map((e) => e.account.amount), [1_000_000n, 2_000_000n, 3_000_000n]);

    await sealAndRequest(ctx, m, window);
    const sealed = (await ctx.client.getWindow(window.pubkey)).account;
    assert.deepEqual(sealed.vrfSeed, seedFinal, "on-chain vrf_seed == public derivation");
    assert.ok(sealed.vrfRequest.equals(oraoRandomnessPda(seedFinal)[0]), "request PDA == ORAO PDA of the seed");

    // leader: a second request is refused
    await expectError(send(ctx, await ctx.client.requestVrfInstructions(ctx.payer.publicKey, window.pubkey, seedFinal)), "VrfAlreadyRequested");
    // leader: aborting - refund before the timeout is refused, sealing twice is refused
    await expectError(send(ctx, ctx.client.refundWindowInstructions(m.market, window.pubkey, sealed)), "VrfTimeoutNotReached");
    await expectError(send(ctx, ctx.client.sealInstructions(m.market, window.pubkey)), "WrongWindowState");

    // keeper withholds fulfill: an unrelated keypair fulfils
    const randomness = await waitFulfilled(ctx, window.pubkey);
    const stranger = Keypair.generate();
    await fund(ctx, stranger.publicKey, 20_000_000);
    await fulfill(ctx, window.pubkey, stranger);
    const drawn = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(drawn.state, WindowState.Drawn);
    assert.deepEqual(drawn.seed, randomness, "window.seed is the ORAO randomness, byte for byte");

    // rolls are exactly deriveRoll(randomness, owner, index): the keeper who tallies cannot change them
    await tallyAll(ctx, m, window.pubkey, stranger);
    await settleAll(ctx, m, window.pubkey);
    for (const e of await ctx.client.getEntries(window.pubkey)) {
      assert.equal(e.account.roll, deriveRoll(randomness, e.account.owner.toBytes(), e.account.index));
    }
  });

  it("a request with a foreign randomness account is refused (ORAO seed constraint)", async () => {
    const window = await openWindow(ctx, m);
    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    await enter(ctx, m, window, a, 1_000_000n);
    await enter(ctx, m, window, b, 1_000_000n); // two entries: a draw is needed
    const w = (await ctx.client.getWindow(window.pubkey)).account;
    await waitForSlot(ctx, w.closeSlot);
    await send(ctx, ctx.client.sealInstructions(m.market, window.pubkey));
    const treasury = await ctx.client.getOraoTreasury();
    const wrong = oraoRandomnessPda(new Uint8Array(32).fill(0x55))[0];
    await expectError(send(ctx, [requestVrfIx({ payer: ctx.payer.publicKey, window: window.pubkey, networkState: oraoNetworkStatePda()[0], treasury, vrfRequest: wrong })]));
    // the honest request then goes through
    const sealed = (await ctx.client.getWindow(window.pubkey)).account;
    await send(ctx, await ctx.client.requestVrfInstructions(ctx.payer.publicKey, window.pubkey, sealed.vrfSeed));
  });

  it("once the randomness exists the window cannot be refunded, only fulfilled (MustFulfill), even after the timeout", async () => {
    // short timeout market so the wait stays reasonable (>= 150 slots, > window_slots)
    const m2 = await createMarket(ctx, { params: { windowSlots: 25n, vrfTimeoutSlots: 150n } });
    const window = await openWindow(ctx, m2);
    const a = await participant(ctx, m2, 10n ** 9n);
    const b = await participant(ctx, m2, 10n ** 9n);
    await enter(ctx, m2, window, a, 1_000_000n);
    await enter(ctx, m2, window, b, 1_000_000n);
    await sealAndRequest(ctx, m2, window);
    await waitFulfilled(ctx, window.pubkey);
    const w = (await ctx.client.getWindow(window.pubkey)).account;
    await waitForSlot(ctx, w.vrfRequestedSlot + 150n + 2n);
    assert.ok((await currentSlot(ctx)) > w.vrfRequestedSlot + 150n);
    await expectError(send(ctx, ctx.client.refundWindowInstructions(m2.market, window.pubkey, w)), "MustFulfill");
    await fulfill(ctx, window.pubkey);
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.state, WindowState.Drawn);
  });
});
