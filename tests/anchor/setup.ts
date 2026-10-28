/**
 * Shared harness of the Anchor suite. NOT RUN ON THIS MACHINE (no validator,
 * no Solana CLI): see tests/anchor/README.md for the devnet commands.
 *
 * `anchor test` exports ANCHOR_PROVIDER_URL and ANCHOR_WALLET; nothing else is
 * needed (no @coral-xyz/anchor dependency: the SDK builds every instruction
 * from the Rust layouts).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import assert from "node:assert/strict";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import {
  DEFAULT_VRF_TIMEOUT_SLOTS,
  DEFAULT_WINDOW_SLOTS,
  PulledClient,
  SETTLE_PAGE_LEGACY,
  TALLY_PAGE_LEGACY,
  WindowState,
  createIntegrationIx,
  createMarketIx,
  deriveVrfSeed,
  enterIx,
  integrationPda,
  marketPda,
  parseProgramError,
  quoteVaultAta,
  tokenVaultAta,
  type CreateMarketParams,
  type Keyed,
  type Market,
  type PulledErrorName,
  type Window,
} from "@pulled/sdk";

export interface Ctx {
  connection: Connection;
  payer: Keypair;
  client: PulledClient;
}

export function env(): Ctx {
  const url = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = (process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json").replace(/^~/, homedir());
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
  const connection = new Connection(url, "confirmed");
  return { connection, payer, client: new PulledClient({ connection }) };
}

/** Measured defaults (research/G6.md, research/G2.md). */
export function defaultParams(over: Partial<CreateMarketParams> = {}): CreateMarketParams {
  return {
    windowSlots: DEFAULT_WINDOW_SLOTS,
    vrfTimeoutSlots: DEFAULT_VRF_TIMEOUT_SLOTS,
    maxEntryAmount: 10n ** 12n,
    maxEntryBps: 10_000,
    entryFloorAmount: 0n,
    name: "Ladle Test",
    symbol: "LADLT",
    uri: "https://useladle.fun/test.json",
    ...over,
  };
}

export async function send(ctx: Ctx, ixs: TransactionInstruction[], signers: Keypair[] = [], feePayer: Keypair = ctx.payer): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = feePayer.publicKey;
  const all = [feePayer, ...signers.filter((s) => !s.publicKey.equals(feePayer.publicKey))];
  return sendAndConfirmTransaction(ctx.connection, tx, all, { commitment: "confirmed" });
}

/** Assert a transaction fails with the given PULLED error (or at all). */
export async function expectError(p: Promise<unknown>, name?: PulledErrorName): Promise<void> {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  assert.ok(err, `expected failure${name ? ` (${name})` : ""}, got success`);
  if (name) {
    const parsed = parseProgramError(err);
    assert.ok(parsed, `expected ${name}, got unparseable error: ${String((err as Error).message ?? err)}`);
    assert.equal(parsed.name, name, `expected ${name}, got ${parsed.name ?? parsed.code}`);
  }
}

export async function fund(ctx: Ctx, to: PublicKey, lamports: number): Promise<void> {
  await send(ctx, [SystemProgram.transfer({ fromPubkey: ctx.payer.publicKey, toPubkey: to, lamports })]);
}

export async function currentSlot(ctx: Ctx): Promise<bigint> { return BigInt(await ctx.connection.getSlot("confirmed")); }

export async function waitForSlot(ctx: Ctx, slot: bigint): Promise<void> {
  while ((await currentSlot(ctx)) < slot) await sleep(400);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ quote mints ------------------------------ */

export type QuoteExtension = "none" | "freeze" | "transferFee" | "transferHook" | "permanentDelegate";

/**
 * A quote mint (6 decimals). `program` classic or Token-2022; `ext` adds the
 * extension (or a freeze authority) that create_market must reject.
 */
export async function createQuoteMint(ctx: Ctx, program: PublicKey = TOKEN_PROGRAM_ID, ext: QuoteExtension = "none"): Promise<PublicKey> {
  const mint = Keypair.generate();
  const exts: ExtensionType[] = [];
  if (program.equals(TOKEN_2022_PROGRAM_ID)) {
    if (ext === "transferFee") exts.push(ExtensionType.TransferFeeConfig);
    if (ext === "transferHook") exts.push(ExtensionType.TransferHook);
    if (ext === "permanentDelegate") exts.push(ExtensionType.PermanentDelegate);
  }
  const space = getMintLen(exts);
  const lamports = await ctx.connection.getMinimumBalanceForRentExemption(space);
  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({ fromPubkey: ctx.payer.publicKey, newAccountPubkey: mint.publicKey, space, lamports, programId: program }),
  ];
  if (ext === "transferFee") ixs.push(createInitializeTransferFeeConfigInstruction(mint.publicKey, ctx.payer.publicKey, ctx.payer.publicKey, 100, 1_000_000n, program));
  if (ext === "transferHook") ixs.push(createInitializeTransferHookInstruction(mint.publicKey, ctx.payer.publicKey, PublicKey.default, program));
  if (ext === "permanentDelegate") ixs.push(createInitializePermanentDelegateInstruction(mint.publicKey, ctx.payer.publicKey, program));
  ixs.push(createInitializeMint2Instruction(mint.publicKey, 6, ctx.payer.publicKey, ext === "freeze" ? ctx.payer.publicKey : null, program));
  await send(ctx, ixs, [mint]);
  return mint.publicKey;
}

export async function mintQuoteTo(ctx: Ctx, mint: PublicKey, program: PublicKey, owner: PublicKey, amount: bigint): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, true, program, ASSOCIATED_TOKEN_PROGRAM_ID);
  await send(ctx, [
    createAssociatedTokenAccountIdempotentInstruction(ctx.payer.publicKey, ata, owner, mint, program, ASSOCIATED_TOKEN_PROGRAM_ID),
    createMintToInstruction(mint, ata, ctx.payer.publicKey, amount, [], program),
  ]);
  return ata;
}

export async function tokenBalance(ctx: Ctx, account: PublicKey, program: PublicKey = TOKEN_PROGRAM_ID): Promise<bigint> {
  try { return (await getAccount(ctx.connection, account, "confirmed", program)).amount; } catch { return 0n; }
}

/* -------------------------------- market -------------------------------- */

export interface MarketCtx {
  market: PublicKey;
  tokenMint: PublicKey;
  quoteMint: PublicKey;
  quoteProgram: PublicKey;
  integration: PublicKey | null;
}

export async function createIntegration(ctx: Ctx, host: Keypair, hostFeeBps: number): Promise<PublicKey> {
  const [integration] = integrationPda(host.publicKey);
  await send(ctx, [createIntegrationIx({ host: host.publicKey, integration }, hostFeeBps)], [host]);
  return integration;
}

export function buildCreateMarket(ctx: Ctx, quoteMint: PublicKey, quoteProgram: PublicKey, params: CreateMarketParams, integration: PublicKey | null = null): { ix: TransactionInstruction; tokenMint: Keypair; market: PublicKey } {
  const tokenMint = Keypair.generate();
  const [market] = marketPda(tokenMint.publicKey);
  const ix = createMarketIx({
    creator: ctx.payer.publicKey,
    tokenMint: tokenMint.publicKey,
    quoteMint,
    market,
    tokenVault: tokenVaultAta(market, tokenMint.publicKey),
    quoteVault: quoteVaultAta(market, quoteMint, quoteProgram),
    integration,
    quoteTokenProgram: quoteProgram,
  }, params);
  return { ix, tokenMint, market };
}

export async function createMarket(ctx: Ctx, opts: { quoteMint?: PublicKey; quoteProgram?: PublicKey; params?: Partial<CreateMarketParams>; integration?: PublicKey | null } = {}): Promise<MarketCtx> {
  const quoteProgram = opts.quoteProgram ?? TOKEN_PROGRAM_ID;
  const quoteMint = opts.quoteMint ?? (await createQuoteMint(ctx, quoteProgram));
  const { ix, tokenMint, market } = buildCreateMarket(ctx, quoteMint, quoteProgram, defaultParams(opts.params), opts.integration ?? null);
  await send(ctx, [ix], [tokenMint]);
  return { market, tokenMint: tokenMint.publicKey, quoteMint, quoteProgram, integration: opts.integration ?? null };
}

/* -------------------------------- windows -------------------------------- */

export async function openWindow(ctx: Ctx, m: MarketCtx): Promise<Keyed<Window>> {
  const mk = (await ctx.client.getMarket(m.market)).account;
  await send(ctx, await ctx.client.openWindowInstructions(ctx.payer.publicKey, m.market, mk));
  return ctx.client.getWindowByIndex(m.market, mk.windowCount);
}

/** A participant with `amount` quote already minted; returns their keypair and quote ATA. */
export async function participant(ctx: Ctx, m: MarketCtx, quoteAmount: bigint, lamports = 20_000_000): Promise<{ kp: Keypair; quote: PublicKey }> {
  const kp = Keypair.generate();
  await fund(ctx, kp.publicKey, lamports);
  const quote = await mintQuoteTo(ctx, m.quoteMint, m.quoteProgram, kp.publicKey, quoteAmount);
  return { kp, quote };
}

/**
 * Many participants at once, funded in batches (SOL for the Entry rent and
 * fees, a quote ATA with `quoteAmount`): one entry per wallet per window.
 */
export async function crowd(ctx: Ctx, m: MarketCtx, n: number, quoteAmount: bigint, lamports = 2_000_000): Promise<{ kp: Keypair; quote: PublicKey }[]> {
  const out = Array.from({ length: n }, () => ({ kp: Keypair.generate(), quote: PublicKey.default }));
  for (let i = 0; i < n; i += 15) {
    await send(ctx, out.slice(i, i + 15).map((p) => SystemProgram.transfer({ fromPubkey: ctx.payer.publicKey, toPubkey: p.kp.publicKey, lamports })));
  }
  for (let i = 0; i < n; i += 4) {
    const ixs: TransactionInstruction[] = [];
    for (const p of out.slice(i, i + 4)) {
      p.quote = getAssociatedTokenAddressSync(m.quoteMint, p.kp.publicKey, true, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(ctx.payer.publicKey, p.quote, p.kp.publicKey, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID));
      ixs.push(createMintToInstruction(m.quoteMint, p.quote, ctx.payer.publicKey, quoteAmount, [], m.quoteProgram));
    }
    await send(ctx, ixs);
  }
  return out;
}

/** `enter` for `owner`: the Entry PDA is ["entry", window, owner], whatever arrived before. */
export function enterInstruction(ctx: Ctx, m: MarketCtx, window: Keyed<Window>, owner: PublicKey, ownerQuote: PublicKey, amount: bigint): TransactionInstruction {
  return enterIx({
    owner,
    market: m.market,
    window: window.pubkey,
    entry: ctx.client.entryAddress(window.pubkey, owner),
    quoteMint: m.quoteMint,
    ownerQuote,
    escrow: window.account.escrow,
    quoteTokenProgram: m.quoteProgram,
  }, amount);
}

/** Enter and return the index the program assigned (arrival order). */
export async function enter(ctx: Ctx, m: MarketCtx, window: Keyed<Window>, p: { kp: Keypair; quote: PublicKey }, amount: bigint): Promise<number> {
  await send(ctx, [enterInstruction(ctx, m, window, p.kp.publicKey, p.quote, amount)], [p.kp], p.kp);
  return (await ctx.client.getEntry(ctx.client.entryAddress(window.pubkey, p.kp.publicKey))).account.index;
}

export async function sealAndRequest(ctx: Ctx, m: MarketCtx, window: Keyed<Window>, payer: Keypair = ctx.payer): Promise<void> {
  const w = (await ctx.client.getWindow(window.pubkey)).account;
  await waitForSlot(ctx, w.closeSlot);
  const seed = deriveVrfSeed(window.pubkey, w.closeSlot, w.entryCount, w.entriesCommitment);
  const ixs = [...ctx.client.sealInstructions(m.market, window.pubkey)];
  // 0 entries: Settled at seal; 1 entry: Drawn at seal (no randomness needed); 2+: ORAO
  if (w.entryCount > 1) ixs.push(...(await ctx.client.requestVrfInstructions(payer.publicKey, window.pubkey, seed)));
  await send(ctx, ixs, [], payer);
}

/** Wait for ORAO to fulfil (devnet: usually seconds, measured p99 113 s on mainnet). */
export async function waitFulfilled(ctx: Ctx, window: PublicKey, timeoutMs = 240_000): Promise<Uint8Array> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const w = (await ctx.client.getWindow(window)).account;
    const r = await ctx.client.getFulfilledRandomness(w);
    if (r) return r;
    await sleep(1500);
  }
  throw new Error("ORAO did not fulfil in time");
}

export async function fulfill(ctx: Ctx, window: PublicKey, caller: Keypair = ctx.payer): Promise<void> {
  const w = (await ctx.client.getWindow(window)).account;
  await send(ctx, ctx.client.fulfillInstructions(window, w), [], caller);
}

/** Page size defaults: the largest pages that fit a legacy transaction. */
export async function tallyAll(ctx: Ctx, m: MarketCtx, window: PublicKey, payer: Keypair = ctx.payer, pageSize = TALLY_PAGE_LEGACY): Promise<void> {
  const mk = (await ctx.client.getMarket(m.market)).account;
  const w = (await ctx.client.getWindow(window)).account;
  const entries = await ctx.client.getPageEntries(window, w.entryCount);
  await send(ctx, await ctx.client.feeAccountsInstructions(payer.publicKey, mk), [], payer);
  for (const [from, to] of PulledClient.pages(w.tallyCursor, w.entryCount, pageSize)) {
    await send(ctx, await ctx.client.tallyPageInstructions(payer.publicKey, m.market, mk, window, w, from, to, entries.slice(from, to)), [], payer);
  }
}

export async function settleAll(ctx: Ctx, m: MarketCtx, window: PublicKey, pageSize = SETTLE_PAGE_LEGACY): Promise<void> {
  const w = (await ctx.client.getWindow(window)).account;
  const entries = await ctx.client.getPageEntries(window, w.entryCount);
  for (const [from, to] of PulledClient.pages(w.settleCursor, w.entryCount, pageSize)) {
    await send(ctx, ctx.client.settlePageInstructions(m.market, window, from, to, entries.slice(from, to)));
  }
}

/** Open -> enter -> seal(+request) -> [fulfil] -> tally -> settle. One entry needs no randomness. */
export async function runWindow(ctx: Ctx, m: MarketCtx, stakes: { p: { kp: Keypair; quote: PublicKey }; amount: bigint }[]): Promise<Keyed<Window>> {
  const window = await openWindow(ctx, m);
  for (const s of stakes) await enter(ctx, m, window, s.p, s.amount);
  await sealAndRequest(ctx, m, window);
  if (stakes.length > 1) {
    await waitFulfilled(ctx, window.pubkey);
    await fulfill(ctx, window.pubkey);
  }
  await tallyAll(ctx, m, window.pubkey);
  await settleAll(ctx, m, window.pubkey);
  const w = await ctx.client.getWindow(window.pubkey);
  assert.equal(w.account.state, WindowState.Settled);
  return w;
}

export function marketOf(ctx: Ctx, m: MarketCtx): Promise<Market> { return ctx.client.getMarket(m.market).then((x) => x.account); }

export { AuthorityType, createSetAuthorityInstruction, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID };
