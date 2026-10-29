/**
 * TEST 7 - sell_back and refund work while nothing else is callable (no
 * claim since v25: LADLE never leaves the game to a wallet).
 *
 * There is no freeze/pause in the program, so the property to assert is that
 * these exit paths need nothing beyond the user: the only signer of
 * sell_back is the entry owner, refund_entry has no signer but the fee payer,
 * and no account of theirs is an authority or config account.
 */
import assert from "node:assert/strict";
import { INSTRUCTION_NAMES, refundEntryIx, sellBackIx, type Market } from "@pulled/sdk";
import { Keypair } from "@solana/web3.js";
import { createMarket, env, participant, runWindow, send, tokenBalance, type Ctx, type MarketCtx } from "./setup.ts";

describe("7. exit paths need only the user", function () {
  this.timeout(1_200_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx); });

  it("instruction surface: the signer sets of sell_back / refund_entry; no claim", () => {
    const k = () => Keypair.generate().publicKey;
    const owner = k();
    assert.ok(!(INSTRUCTION_NAMES as readonly string[]).includes("claim"));
    const s = sellBackIx({ owner, market: k(), entry: k(), quoteMint: k(), quoteVault: k(), ownerQuote: k(), quoteTokenProgram: k() }, 1n, 0n);
    assert.deepEqual(s.keys.filter((x) => x.isSigner).map((x) => x.pubkey.toBase58()), [owner.toBase58()]);
    const r = refundEntryIx({ market: k(), window: k(), entry: k(), quoteMint: k(), escrow: k(), recipient: k(), quoteTokenProgram: k() });
    assert.equal(r.keys.filter((x) => x.isSigner).length, 0);
    assert.ok(!INSTRUCTION_NAMES.some((n) => /pause|freeze|admin|authority/.test(n)));
  });

  it("sell_back pays the exact law.ts quote, in two sales signed by the owner only", async () => {
    const a = await participant(ctx, m, 10n ** 9n);
    const b = await participant(ctx, m, 10n ** 9n);
    const w = await runWindow(ctx, m, [{ p: a, amount: 300_000_000n }, { p: b, amount: 700_000_000n }]);
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

    // sell the rest (the SDK closes the entry in the same transaction)
    const tx2 = await ctx.client.sellBack({ entry: mine.pubkey, owner: a.kp.publicKey });
    tx2.sign(a.kp);
    const sig2 = await ctx.connection.sendRawTransaction(tx2.serialize());
    await ctx.connection.confirmTransaction({ signature: sig2, blockhash: tx2.recentBlockhash!, lastValidBlockHeight: tx2.lastValidBlockHeight! }, "confirmed");
    assert.equal(await ctx.connection.getAccountInfo(mine.pubkey, "confirmed"), null, "everything sold: the entry closed");
    // nothing left: another sale is refused
    let failed = false;
    try {
      const k = () => Keypair.generate().publicKey;
      const again = sellBackIx({ owner: a.kp.publicKey, market: m.market, entry: mine.pubkey, quoteMint: k(), quoteVault: mk.quoteVault, ownerQuote: a.quote, quoteTokenProgram: m.quoteProgram }, 1n, 0n);
      await send(ctx, [again], [a.kp], a.kp);
    } catch { failed = true; }
    assert.ok(failed, "the entry is gone");
  });
});
