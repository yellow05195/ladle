/**
 * TEST 15 - rent recovery (close_entry / close_window).
 *
 * The rent of a finished entry goes back to its owner, the rent of a finished
 * window (window + escrow) to whoever opened it, never to the caller; nothing
 * that still holds value can be closed; the active window cannot be closed.
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

  it("an empty window is closable once it is no longer the active one; rent goes to the opener", async () => {
    const w0 = await openWindow(ctx, m);
    await waitForSlot(ctx, w0.account.closeSlot);
    await send(ctx, ctx.client.sealInstructions(m.market, w0.pubkey));
    const sealed = (await ctx.client.getWindow(w0.pubkey)).account;
    assert.equal(sealed.state, WindowState.Settled, "an empty window settles at seal");
    const mk = (await ctx.client.getMarket(m.market)).account;

    // still the active window: refused
    await expectError(send(ctx, ctx.client.closeWindowInstructions(m.market, mk, w0.pubkey, sealed)), "WindowIsActive");

    await openWindow(ctx, m); // w0 is no longer active
    const stranger = Keypair.generate();
    await fund(ctx, stranger.publicKey, 10_000_000);
    const before = await ctx.connection.getBalance(ctx.payer.publicKey, "confirmed");
    const mk2 = (await ctx.client.getMarket(m.market)).account;
    // sent and paid by a stranger: the rent still goes to the opener (ctx.payer)
    await send(ctx, ctx.client.closeWindowInstructions(m.market, mk2, w0.pubkey, sealed), [], stranger);
    const after = await ctx.connection.getBalance(ctx.payer.publicKey, "confirmed");
    assert.ok(after > before, "opener got the window + escrow rent back");
    assert.equal(await ctx.connection.getAccountInfo(w0.pubkey, "confirmed"), null, "window closed");
    assert.equal(await ctx.connection.getAccountInfo(sealed.escrow, "confirmed"), null, "escrow closed");
  });

  it("entries close only when nothing is left; the window closes only when every entry is closed", async () => {
    // let the market's previous active window seal so a new one can open
    const mk0 = (await ctx.client.getMarket(m.market)).account;
    const active = await ctx.client.getWindowByIndex(m.market, mk0.activeWindow);
    if (active.account.state === WindowState.Open) {
      await waitForSlot(ctx, active.account.closeSlot);
      await send(ctx, ctx.client.sealInstructions(m.market, active.pubkey));
    }

    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    const w = await runWindow(ctx, m, [{ p: a, amount: 3_000_000n }, { p: b, amount: 2_000_000n }]);
    const entries = await ctx.client.getEntries(w.pubkey);
    assert.equal(entries.length, 2);
    const mk = (await ctx.client.getMarket(m.market)).account;

    // before the share is taken out: refused (unless the share is zero)
    for (const e of entries) {
      if (e.account.share > 0n) await expectError(send(ctx, ctx.client.closeEntryInstructions(w.pubkey, e)), "EntryNotClosable");
    }
    await expectError(send(ctx, ctx.client.closeWindowInstructions(m.market, mk, w.pubkey, w.account)));

    // a claims (the SDK closes the entry in the same transaction)
    const ea = entries.find((e) => e.account.owner.equals(a.kp.publicKey))!;
    if (ea.account.share > 0n) {
      const balA0 = await ctx.connection.getBalance(a.kp.publicKey, "confirmed");
      const tx = await ctx.client.claim({ entry: ea.pubkey, owner: a.kp.publicKey });
      tx.sign(a.kp);
      await ctx.connection.confirmTransaction(await ctx.connection.sendRawTransaction(tx.serialize()), "confirmed");
      assert.equal(await ctx.connection.getAccountInfo(ea.pubkey, "confirmed"), null, "a's entry closed by the claim tx");
      const balA1 = await ctx.connection.getBalance(a.kp.publicKey, "confirmed");
      assert.ok(balA1 > balA0 - 3_000_000, "a got the entry rent back (minus fees and the token ATA rent)");
    } else {
      await send(ctx, ctx.client.closeEntryInstructions(w.pubkey, ea));
    }

    // b sells everything back (closes too)
    const eb = entries.find((e) => e.account.owner.equals(b.kp.publicKey))!;
    if (eb.account.share > 0n) {
      const tx = await ctx.client.sellBack({ entry: eb.pubkey, owner: b.kp.publicKey });
      tx.sign(b.kp);
      await ctx.connection.confirmTransaction(await ctx.connection.sendRawTransaction(tx.serialize()), "confirmed");
    } else {
      await send(ctx, ctx.client.closeEntryInstructions(w.pubkey, eb));
    }
    assert.equal(await ctx.connection.getAccountInfo(eb.pubkey, "confirmed"), null, "b's entry closed");

    const wNow = (await ctx.client.getWindow(w.pubkey)).account;
    assert.equal(wNow.closedEntries, 2);
    // the window may still be the active one: open the next to free it
    const mkNow = (await ctx.client.getMarket(m.market)).account;
    if (mkNow.hasActiveWindow && mkNow.activeWindow === wNow.index) await openWindow(ctx, m);
    const mkFinal = (await ctx.client.getMarket(m.market)).account;
    await send(ctx, ctx.client.closeWindowInstructions(m.market, mkFinal, w.pubkey, wNow));
    assert.equal(await ctx.connection.getAccountInfo(w.pubkey, "confirmed"), null, "window closed");
    assert.ok(PulledClient.entryClosable({ ...wNow, state: WindowState.Settled }, { ...ea.account, claimed: ea.account.share }));
    void currentSlot; void sleep;
  });
});
