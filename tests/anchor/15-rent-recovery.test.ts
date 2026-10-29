/**
 * TEST 15 - rent recovery (close_entry / close_window).
 *
 * The rent of a finished entry goes back to its owner, the rent of a finished
 * window (window + escrow) to whoever opened it, never to the caller; nothing
 * that still holds value can be closed; the active window cannot be closed.
 * A Settled window closes without waiting for its entries: sell_back and
 * close_entry read only the Entry and the Market (v22; no claim since v25).
 */
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { PulledClient, WindowState } from "@pulled/sdk";
import {
  createMarket, currentSlot, env, expectError, fund, openWindow, participant, runWindow, send, sleep, waitForSlot,
  type Ctx, type MarketCtx,
} from "./setup.ts";

describe("15. rent recovery", function () {
  this.timeout(1_800_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx, { params: { windowSlots: 25n } }); });

  it("an empty window closes, even while it is the active one; rent goes to the opener", async () => {
    const w0 = await openWindow(ctx, m);
    await waitForSlot(ctx, w0.account.closeSlot);
    await send(ctx, ctx.client.sealInstructions(m.market, w0.pubkey));
    const sealed = (await ctx.client.getWindow(w0.pubkey)).account;
    assert.equal(sealed.state, WindowState.Settled, "an empty window settles at seal");
    const mk = (await ctx.client.getMarket(m.market)).account;

    // still the active window, but finished: it closes (second review: the last round of a market kept its rent)
    assert.ok(PulledClient.isWindowClosable(mk, sealed));
    const stranger = Keypair.generate();
    await fund(ctx, stranger.publicKey, 10_000_000);
    const before = await ctx.connection.getBalance(ctx.payer.publicKey, "confirmed");
    // sent and paid by a stranger: the rent still goes to the opener (ctx.payer)
    await send(ctx, ctx.client.closeWindowInstructions(m.market, mk, w0.pubkey, sealed), [], stranger);
    const after = await ctx.connection.getBalance(ctx.payer.publicKey, "confirmed");
    assert.ok(after > before, "opener got the window + escrow rent back");
    assert.equal(await ctx.connection.getAccountInfo(w0.pubkey, "confirmed"), null, "window closed");
    assert.equal(await ctx.connection.getAccountInfo(sealed.escrow, "confirmed"), null, "escrow closed");
    // the market has no active window now: the next one opens with no previous window
    assert.equal((await ctx.client.getMarket(m.market)).account.hasActiveWindow, false);
    await openWindow(ctx, m);
  });

  it("a settled window closes at once; its entries still sell back and close afterwards", async () => {
    // let the market's previous active window seal so a new one can open
    const mk0 = (await ctx.client.getMarket(m.market)).account;
    const active = await ctx.client.getWindowByIndex(m.market, mk0.activeWindow);
    if (active.account.state === WindowState.Open) {
      await waitForSlot(ctx, active.account.closeSlot);
      await send(ctx, ctx.client.sealInstructions(m.market, active.pubkey));
    }

    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    const w = await runWindow(ctx, m, [{ p: a, amount: 300_000_000n }, { p: b, amount: 200_000_000n }]);
    const entries = await ctx.client.getEntries(w.pubkey);
    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.account.settled && e.account.market.equals(m.market) && e.account.windowIndex === w.account.index));

    // before the share is taken out: refused (unless the share is zero)
    for (const e of entries) {
      if (e.account.share > 0n) await expectError(send(ctx, ctx.client.closeEntryInstructions(e)), "EntryNotClosable");
    }

    // close the window right away (once it is not the active one): the rent
    // goes back to the opener while both entries are still open
    const mkNow = (await ctx.client.getMarket(m.market)).account;
    if (mkNow.hasActiveWindow && mkNow.activeWindow === w.account.index) await openWindow(ctx, m);
    const mkFinal = (await ctx.client.getMarket(m.market)).account;
    const wSettled = (await ctx.client.getWindow(w.pubkey)).account;
    assert.ok(PulledClient.isWindowClosable(mkFinal, wSettled));
    const stranger = Keypair.generate();
    await fund(ctx, stranger.publicKey, 10_000_000);
    const openerBefore = await ctx.connection.getBalance(ctx.payer.publicKey, "confirmed");
    await send(ctx, ctx.client.closeWindowInstructions(m.market, mkFinal, w.pubkey, wSettled), [], stranger);
    assert.ok((await ctx.connection.getBalance(ctx.payer.publicKey, "confirmed")) > openerBefore, "opener got the window + escrow rent back");
    assert.equal(await ctx.connection.getAccountInfo(w.pubkey, "confirmed"), null, "window closed");
    assert.equal(await ctx.connection.getAccountInfo(wSettled.escrow, "confirmed"), null, "escrow closed");

    // a sells back half against the closed window, then the rest (the SDK closes the entry in the same transaction)
    const ea = entries.find((e) => e.account.owner.equals(a.kp.publicKey))!;
    if (ea.account.share > 0n) {
      assert.ok(PulledClient.entryClaimable(mkFinal, ea.account));
      for (const amount of [ea.account.share / 2n || 1n, undefined]) {
        const tx = await ctx.client.sellBack({ entry: ea.pubkey, owner: a.kp.publicKey, amount });
        tx.sign(a.kp);
        await ctx.connection.confirmTransaction(await ctx.connection.sendRawTransaction(tx.serialize()), "confirmed");
        if (amount !== undefined && amount >= ea.account.share) break;
      }
      assert.equal(await ctx.connection.getAccountInfo(ea.pubkey, "confirmed"), null, "a's entry closed by the last sale");
    } else {
      await send(ctx, ctx.client.closeEntryInstructions(ea));
    }

    // b sells everything back against the closed window (closes too)
    const eb = entries.find((e) => e.account.owner.equals(b.kp.publicKey))!;
    if (eb.account.share > 0n) {
      const tx = await ctx.client.sellBack({ entry: eb.pubkey, owner: b.kp.publicKey });
      tx.sign(b.kp);
      await ctx.connection.confirmTransaction(await ctx.connection.sendRawTransaction(tx.serialize()), "confirmed");
    } else {
      await send(ctx, ctx.client.closeEntryInstructions(eb));
    }
    assert.equal(await ctx.connection.getAccountInfo(eb.pubkey, "confirmed"), null, "b's entry closed");
    assert.ok(PulledClient.isEntryClosable({ ...ea.account, claimed: ea.account.share }));
    void currentSlot; void sleep;
  });
});
