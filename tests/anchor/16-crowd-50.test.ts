/**
 * TEST 16 - 50 wallets enter the same round at the same moment.
 *
 * Every wallet builds its `enter` from the same read of the window (as 50
 * browsers would) and all 50 transactions are sent at once. With Entry PDAs
 * ["entry", window, owner] none depends on how many landed before it: all 50
 * land, indices 0..49 are assigned in arrival order, each exactly once, and
 * the round settles with keeper-sized pages (legacy transactions) to
 * sum(shares) == tokens_out.
 */
import assert from "node:assert/strict";
import { PulledClient, WindowState } from "@pulled/sdk";
import {
  createMarket, crowd, enterInstruction, env, expectError, fulfill, openWindow, sealAndRequest, send, settleAll, tallyAll, waitFulfilled,
  type Ctx, type MarketCtx,
} from "./setup.ts";

describe("16. a crowd of 50 in one round", function () {
  this.timeout(1_800_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx, { params: { windowSlots: 300n, maxEntryBps: 2_000, entryFloorAmount: 5_000_000_000n } }); });

  it("50 enters built from the same snapshot all land and settle exactly", async () => {
    const window = await openWindow(ctx, m);
    const people = await crowd(ctx, m, 50, 10n ** 9n);
    const snapshot = await ctx.client.getWindow(window.pubkey);
    const amounts = people.map((_, i) => 100_000_000n + BigInt(i) * 1_000_000n);
    const results = await Promise.allSettled(people.map((p, i) =>
      send(ctx, [enterInstruction(ctx, m, snapshot, p.kp.publicKey, p.quote, amounts[i]!)], [p.kp], p.kp)));
    const failed = results.filter((r) => r.status === "rejected");
    assert.equal(failed.length, 0, `${failed.length} of 50 enters failed: ${failed.map((r) => String((r as PromiseRejectedResult).reason)).slice(0, 2).join(" | ")}`);

    const w = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(w.entryCount, 50);
    assert.equal(w.totalAmount, amounts.reduce((a, b) => a + b, 0n));
    const entries = await ctx.client.getEntries(window.pubkey);
    assert.deepEqual(entries.map((e) => e.account.index), Array.from({ length: 50 }, (_, i) => i));
    assert.equal(new Set(entries.map((e) => e.account.owner.toBase58())).size, 50, "one entry per wallet");
    await expectError(send(ctx, [enterInstruction(ctx, m, snapshot, people[7]!.kp.publicKey, people[7]!.quote, 100_000n)], [people[7]!.kp], people[7]!.kp), "AlreadyEntered");

    await sealAndRequest(ctx, m, window);
    await waitFulfilled(ctx, window.pubkey);
    await fulfill(ctx, window.pubkey);
    await tallyAll(ctx, m, window.pubkey);
    await settleAll(ctx, m, window.pubkey);
    const settled = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(settled.state, WindowState.Settled);
    const after = await ctx.client.getEntries(window.pubkey);
    assert.equal(after.reduce((s, e) => s + e.account.share, 0n), settled.tokensOut);
    assert.equal(PulledClient.pages(0, 50, 20).length, 3);
    const v = await ctx.client.verifyWindow(window.pubkey);
    assert.ok(v.ok, v.notes.join("; "));
  });
});
