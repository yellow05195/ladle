/**
 * TEST 14 - quote mints: wSOL only (final review, 2026-10-29). The second
 * review had refused Token-2022 as a whole (Pausable, MemoTransfer...); the
 * final one refuses every other classic mint too, since the shutdown must
 * pay every entry out as SOL, a payout no player can block:
 *   any Token-2022 mint, with or without extensions -> QuoteMintNotWsol
 *   a classic SPL Token mint, clean or with a freeze authority -> QuoteMintNotWsol
 *   wSOL -> accepted, stored with the classic SPL Token program
 */
import assert from "node:assert/strict";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildCreateMarket, createMarket, createQuoteMint, defaultParams, env, expectError, send, type Ctx } from "./setup.ts";

describe("14. quote mint checks: wSOL only", function () {
  this.timeout(600_000);
  let ctx: Ctx;
  before(() => { ctx = env(); });

  const attempt = async (program: typeof TOKEN_PROGRAM_ID, ext: "none" | "freeze" | "transferFee" | "transferHook" | "permanentDelegate") => {
    const quoteMint = await createQuoteMint(ctx, program, ext);
    const { ix, tokenMint } = buildCreateMarket(ctx, quoteMint, program, defaultParams());
    return send(ctx, [ix], [tokenMint]);
  };

  for (const ext of ["none", "transferFee", "transferHook", "permanentDelegate", "freeze"] as const) {
    it(`Token-2022 (${ext}) -> QuoteMintNotWsol`, async () => { await expectError(attempt(TOKEN_2022_PROGRAM_ID, ext), "QuoteMintNotWsol"); });
  }
  for (const ext of ["none", "freeze"] as const) {
    it(`classic SPL Token (${ext}) -> QuoteMintNotWsol`, async () => { await expectError(attempt(TOKEN_PROGRAM_ID, ext), "QuoteMintNotWsol"); });
  }
  it("wSOL is accepted and stored with the classic SPL Token program", async () => {
    const m = await createMarket(ctx);
    const mk = (await ctx.client.getMarket(m.market)).account;
    assert.ok(mk.quoteProgram.equals(TOKEN_PROGRAM_ID));
    assert.ok(mk.quoteMint.equals(NATIVE_MINT));
  });
});
