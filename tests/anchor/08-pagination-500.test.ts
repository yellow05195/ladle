/**
 * TEST 8 - 500 entries, paginated tally/settle, idempotent by the cursor rule.
 *
 * 500 wallets stake once each (one entry per wallet per window), 4 `enter`
 * per transaction. Then: tally in pages of 20 (the largest page in a legacy
 * transaction) with one page replayed (no-op success), one page
 * skipped (PageOutOfOrder), one oversize page (PageTooLarge); settle likewise;
 * finally every page replayed after completion changes nothing and
 * sum(shares) == tokens_out.
 */
import assert from "node:assert/strict";
import { PulledClient, SETTLE_PAGE_LEGACY, TALLY_PAGE_LEGACY, WindowState } from "@pulled/sdk";
import {
  createMarket, crowd, enterInstruction, env, expectError, fulfill, openWindow, sealAndRequest, send, waitFulfilled, type Ctx, type MarketCtx,
} from "./setup.ts";

describe("8. pagination with 500 entries", function () {
  this.timeout(1_800_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx, { params: { windowSlots: 600n } }); });

  it("tally/settle pages are idempotent and exact", async () => {
    const window = await openWindow(ctx, m);
    const N = 500, PER_TX = 4;
    const people = await crowd(ctx, m, N, 10n ** 9n);
    for (let i = 0; i < N; i += PER_TX) {
      const group = people.slice(i, i + PER_TX);
      await send(ctx, group.map((p, k) => enterInstruction(ctx, m, window, p.kp.publicKey, p.quote, 1_000n + BigInt(i + k))), group.map((p) => p.kp));
    }
    const w0 = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(w0.entryCount, N);

    await sealAndRequest(ctx, m, window);
    await waitFulfilled(ctx, window.pubkey);
    await fulfill(ctx, window.pubkey);

    const mk = (await ctx.client.getMarket(m.market)).account;
    const w = (await ctx.client.getWindow(window.pubkey)).account;
    const entries = await ctx.client.getPageEntries(window.pubkey, N);
    await send(ctx, await ctx.client.feeAccountsInstructions(ctx.payer.publicKey, mk));
    const tally = (from: number, to: number) => ctx.client.tallyPageInstructions(ctx.payer.publicKey, m.market, mk, window.pubkey, w, from, to, entries.slice(from, to)).then((ixs) => send(ctx, ixs));
    const settle = (from: number, to: number) => send(ctx, ctx.client.settlePageInstructions(m.market, window.pubkey, from, to, entries.slice(from, to)));

    const P = TALLY_PAGE_LEGACY;
    const pages = PulledClient.pages(0, N, P);
    assert.equal(pages.length, Math.ceil(N / P));
    await tally(0, P);
    await tally(0, P); // replay: no-op success
    assert.equal((await ctx.client.getWindow(window.pubkey)).account.tallyCursor, P);
    await expectError(tally(2 * P, 3 * P), "PageOutOfOrder"); // skip
    await expectError(tally(P - 5, P + 5), "PageOutOfOrder"); // overlap
    // an entry list that does not match the page (an entry from elsewhere) is refused
    await expectError(ctx.client.tallyPageInstructions(ctx.payer.publicKey, m.market, mk, window.pubkey, w, P, 2 * P, entries.slice(P + 1, 2 * P + 1)).then((ixs) => send(ctx, ixs)), "InvalidEntryPda");
    for (const [from, to] of pages.slice(1)) await tally(from, to);
    const tallied = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(tallied.state, WindowState.Tallied);
    assert.equal(tallied.tallyCursor, N);
    await expectError(tally(N - 20, N), "WrongWindowState"); // replay after finalize: state moved on

    const S = SETTLE_PAGE_LEGACY;
    const spages = PulledClient.pages(0, N, S);
    await settle(0, S);
    await settle(0, S);
    await expectError(settle(2 * S, 3 * S), "PageOutOfOrder");
    for (const [from, to] of spages.slice(1)) await settle(from, to);
    const settled = (await ctx.client.getWindow(window.pubkey)).account;
    assert.equal(settled.state, WindowState.Settled);
    assert.equal(settled.settleCursor, N);

    const all = await ctx.client.getEntries(window.pubkey);
    assert.equal(all.length, N);
    assert.equal(all.reduce((s, e) => s + e.account.share, 0n), settled.tokensOut);
    const v = await ctx.client.verifyWindow(window.pubkey);
    assert.ok(v.ok, v.notes.join("; "));
  });
});
