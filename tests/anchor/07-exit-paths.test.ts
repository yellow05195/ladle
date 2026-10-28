/**
 * TEST 7 - sell_back, claim and refund work while nothing else is callable.
 *
 * There is no freeze/pause in the program, so the property to assert is that
 * these exit paths need nothing beyond the user: the only signer of claim and
 * sell_back is the entry owner, refund_entry has no signer but the fee payer,
 * and no account of theirs is an authority or config account.
 */
import assert from "node:assert/strict";
import { INSTRUCTION_NAMES, claimIx, refundEntryIx, sellBackIx, type Market } from "@pulled/sdk";
import { Keypair } from "@solana/web3.js";
import { createMarket, env, participant, runWindow, send, tokenBalance, type Ctx, type MarketCtx } from "./setup.ts";

describe("7. exit paths need only the user", function () {
  this.timeout(1_200_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx); });

  it("instruction surface: the signer sets of claim / sell_back / refund_entry", () => {
    const k = () => Keypair.generate().publicKey;
    const owner = k();
    const c = claimIx({ owner, market: k(), window: k(), entry: k(), tokenMint: k(), tokenVault: k(), ownerTokenAccount: k() });
    assert.deepEqual(c.keys.filter((x) => x.isSigner).map((x) => x.pubkey.toBase58()), [owner.toBase58()]);
    const s = sellBackIx({ owner, market: k(), window: k(), entry: k(), quoteMint: k(), quoteVault: k(), ownerQuote: k(), quoteTokenProgram: k() }, 1n);
    assert.deepEqual(s.keys.filter((x) => x.isSigner).map((x) => x.pubkey.toBase58()), [owner.toBase58()]);
    const r = refundEntryIx({ market: k(), window: k(), entry: k(), quoteMint: k(), escrow: k(), recipient: k(), quoteTokenProgram: k() });
    assert.equal(r.keys.filter((x) => x.isSigner).length, 0);
    assert.ok(!INSTRUCTION_NAMES.some((n) => /pause|freeze|admin|authority/.test(n)));
  });

  it("sell_back pays the exact law.ts quote; claim moves the rest; both signed by the owner only", async () => {
    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    const w = await runWindow(ctx, m, [{ p: a, amount: 3_000_000n }, { p: b, amount: 7_000_000n }]);
    const entries = await ctx.client.getEntries(w.pubkey);
    const mine = entries.find((e) => e.account.owner.equals(a.kp.publicKey))!;

    // sell back half, exact quote
    const mk: Market = (await ctx.client.getMarket(m.market)).account;
    const half = mine.account.share / 2n;
    const q = ctx.client.quoteSellBackSync(mk, mine.account, half);
    const before = await tokenBalance(ctx, a.quote, m.quoteProgram);
    const tx = await ctx.client.sellBack({ entry: mine.pubkey, owner: a.kp.publicKey, amount: half });
    tx.sign(a.kp);
    const sig = await ctx.connection.sendRawTransaction(tx.serialize());
    await ctx.connection.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! }, "confirmed");
    assert.equal((await tokenBalance(ctx, a.quote, m.quoteProgram)) - before, q.quoteOut, "quote out == curveSell on the current curve");
    const after = (await ctx.client.getMarket(m.market)).account;
    assert.deepEqual(after.curve, q.curveAfter, "curve moved exactly as predicted");

    // claim the rest
    const tx2 = await ctx.client.claim({ entry: mine.pubkey, owner: a.kp.publicKey });
    tx2.sign(a.kp);
    const sig2 = await ctx.connection.sendRawTransaction(tx2.serialize());
    await ctx.connection.confirmTransaction({ signature: sig2, blockhash: tx2.recentBlockhash!, lastValidBlockHeight: tx2.lastValidBlockHeight! }, "confirmed");
    const e2 = (await ctx.client.getEntry(mine.pubkey)).account;
    assert.equal(e2.claimed, e2.share);
    const tokenAta = ctx.client.getEntriesByOwner; // keep the API referenced for readers
    void tokenAta;
    // nothing left: a second claim is refused
    let failed = false;
    try {
      const tx3 = await ctx.client.claim({ entry: mine.pubkey, owner: a.kp.publicKey });
      tx3.sign(a.kp);
      await send(ctx, [...tx3.instructions], [a.kp], a.kp);
    } catch { failed = true; }
    assert.ok(failed, "NothingToClaim");
  });
});
