/** TEST 4 - request_vrf while the window is Open fails (WrongWindowState). */
import { deriveVrfSeed } from "@pulled/sdk";
import { createMarket, enter, env, expectError, openWindow, participant, send, type Ctx, type MarketCtx } from "./setup.ts";

describe("4. request_vrf while Open", function () {
  this.timeout(600_000);
  let ctx: Ctx; let m: MarketCtx;
  before(async () => { ctx = env(); m = await createMarket(ctx); });

  it("is refused with WrongWindowState, with or without entries", async () => {
    const window = await openWindow(ctx, m);
    const w0 = (await ctx.client.getWindow(window.pubkey)).account;
    const seed0 = deriveVrfSeed(window.pubkey, w0.closeSlot, w0.entryCount, w0.entriesCommitment);
    await expectError(send(ctx, await ctx.client.requestVrfInstructions(ctx.payer.publicKey, window.pubkey, seed0)), "WrongWindowState");
    const a = await participant(ctx, m, 10n ** 9n);
    await enter(ctx, m, window, a, 100_000_000n);
    const w1 = (await ctx.client.getWindow(window.pubkey)).account;
    const seed1 = deriveVrfSeed(window.pubkey, w1.closeSlot, w1.entryCount, w1.entriesCommitment);
    await expectError(send(ctx, await ctx.client.requestVrfInstructions(ctx.payer.publicKey, window.pubkey, seed1)), "WrongWindowState");
  });
});
