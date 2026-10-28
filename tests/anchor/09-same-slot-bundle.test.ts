/**
 * TEST 9 - bundles of entries respect the cumulative cap, and concurrent
 * bundles all land.
 *
 * max_entry_bps = 500 (5 %), entry_floor_amount = 1_000_000. Thirty wallets
 * stake 50_000 each, in ten 3-wallet transactions sent at the same time
 * (Entry PDAs are ["entry", window, owner], so the transactions do not
 * depend on each other's order and none has to be rebuilt): the first 20
 * pass under the floor, the next 10 pass the 5 % rule against the
 * CUMULATIVE total (`total_amount` is updated before the transfer CPI, so
 * entries in one transaction see each other). Then a bundle whose last entry
 * breaks the cap fails atomically and entry_count does not move.
 */
import assert from "node:assert/strict";
import { createMarket, crowd, enterInstruction, env, expectError, openWindow, send, type Ctx, type MarketCtx } from "./setup.ts";

describe("9. same-slot bundles and the cumulative cap", function () {
  this.timeout(600_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => {
    ctx = env();
    m = await createMarket(ctx, { params: { maxEntryBps: 500, entryFloorAmount: 1_000_000n, windowSlots: 600n } });
  });

  it("30 x 50_000 from concurrent bundles pass; a 100_000 entry inside a bundle fails the whole bundle", async () => {
    const window = await openWindow(ctx, m);
    const people = await crowd(ctx, m, 40, 10n ** 9n);
    const bundle = (group: typeof people, amounts: bigint[]) =>
      send(ctx, group.map((p, k) => enterInstruction(ctx, m, window, p.kp.publicKey, p.quote, amounts[k]!)), group.map((p) => p.kp));

    // ten bundles of three, all built before any lands, sent together
    const groups = Array.from({ length: 10 }, (_, g) => people.slice(3 * g, 3 * g + 3));
    await Promise.all(groups.map((g) => bundle(g, [50_000n, 50_000n, 50_000n])));
    let w = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(w.entryCount, 30);
    assert.equal(w.totalAmount, 1_500_000n);
    const entries = await ctx.client.getEntries(window.pubkey);
    assert.deepEqual(entries.map((e) => e.account.index), Array.from({ length: 30 }, (_, i) => i), "indices 0..29, each once");

    const [p30, p31, p32, p33, p34] = people.slice(30);
    // 100_000 at total 1_600_000: 100_000 * 10_000 = 1e9 > 500 * 1_600_000 = 8e8 -> EntryAboveCap
    await expectError(bundle([p30!], [100_000n]), "EntryAboveCap");
    // inside a bundle: [50_000, 50_000, 100_000] -> the third breaks the cap, all three are rolled back
    await expectError(bundle([p30!, p31!, p32!], [50_000n, 50_000n, 100_000n]), "EntryAboveCap");
    w = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(w.entryCount, 30, "atomic: nothing from the failed bundle landed");
    assert.equal(w.totalAmount, 1_500_000n);
    // the largest entry allowed now: amount <= 5 % of (total + amount) -> amount <= 1_500_000 / 19 = 78_947
    await bundle([p33!], [78_947n]);
    await expectError(bundle([p34!], [78_948n + 5_000n]), "EntryAboveCap");
    // the same wallet cannot enter twice
    await expectError(bundle([p33!], [1_000n]), "AlreadyEntered");
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.entryCount, 31);
  });
});
