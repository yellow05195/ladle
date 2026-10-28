/**
 * TEST 14 - quote mints that could break `escrow == sum(stakes)` or freeze
 * funds are rejected at create_market with the specific error:
 *   Token-2022 + TransferFeeConfig   -> QuoteMintHasTransferFee
 *   Token-2022 + TransferHook        -> QuoteMintHasTransferHook
 *   Token-2022 + PermanentDelegate   -> QuoteMintHasPermanentDelegate
 *   any program + freeze authority   -> QuoteMintHasFreezeAuthority
 * A plain Token-2022 mint (no extension, no freeze authority) is accepted.
 */
import assert from "node:assert/strict";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildCreateMarket, createMarket, createQuoteMint, defaultParams, env, expectError, send, type Ctx } from "./setup.ts";

describe("14. Token-2022 quote mint checks", function () {
  this.timeout(600_000);
  let ctx: Ctx;
  before(() => { ctx = env(); });

  const attempt = async (program: typeof TOKEN_PROGRAM_ID, ext: "none" | "freeze" | "transferFee" | "transferHook" | "permanentDelegate") => {
    const quoteMint = await createQuoteMint(ctx, program, ext);
    const { ix, tokenMint } = buildCreateMarket(ctx, quoteMint, program, defaultParams());
    return send(ctx, [ix], [tokenMint]);
  };

  it("TransferFeeConfig -> QuoteMintHasTransferFee", async () => { await expectError(attempt(TOKEN_2022_PROGRAM_ID, "transferFee"), "QuoteMintHasTransferFee"); });
  it("TransferHook -> QuoteMintHasTransferHook", async () => { await expectError(attempt(TOKEN_2022_PROGRAM_ID, "transferHook"), "QuoteMintHasTransferHook"); });
  it("PermanentDelegate -> QuoteMintHasPermanentDelegate", async () => { await expectError(attempt(TOKEN_2022_PROGRAM_ID, "permanentDelegate"), "QuoteMintHasPermanentDelegate"); });
  it("freeze authority (Token-2022) -> QuoteMintHasFreezeAuthority", async () => { await expectError(attempt(TOKEN_2022_PROGRAM_ID, "freeze"), "QuoteMintHasFreezeAuthority"); });
  it("freeze authority (classic SPL Token) -> QuoteMintHasFreezeAuthority", async () => { await expectError(attempt(TOKEN_PROGRAM_ID, "freeze"), "QuoteMintHasFreezeAuthority"); });
  it("a clean Token-2022 mint is accepted and stored with its program id", async () => {
    const m = await createMarket(ctx, { quoteProgram: TOKEN_2022_PROGRAM_ID });
    const mk = (await ctx.client.getMarket(m.market)).account;
    assert.ok(mk.quoteProgram.equals(TOKEN_2022_PROGRAM_ID));
    assert.ok(mk.quoteMint.equals(m.quoteMint));
  });
});
