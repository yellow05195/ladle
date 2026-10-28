/**
 * High-level client. Read-only by construction: it never holds a key. Every
 * write method returns an unsigned `Transaction` (fee payer and recent
 * blockhash set) for the caller's wallet to sign and send.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type Commitment,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getMint,
} from "@solana/spl-token";
import {
  ACCOUNT_SIZES,
  OFFSETS,
  decodeEntry,
  decodeIntegration,
  decodeMarket,
  decodeWindow,
  parseOraoRandomness,
  parseOraoTreasury,
} from "./accounts.ts";
import {
  claimIx,
  closeEntryIx,
  closeWindowIx,
  enterIx,
  fulfillIx,
  openWindowIx,
  refundEntryIx,
  refundWindowIx,
  requestVrfIx,
  sealIx,
  sellBackIx,
  sellIx,
  settlePageIx,
  tallyPageIx,
} from "./instructions.ts";
import { curveSell, BPS } from "./law.ts";
import { computeUnitLimitIx, settlePageComputeUnits, tallyPageComputeUnits } from "./budget.ts";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MAX_PAGE,
  PLATFORM_TREASURY,
  PULLED_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ata,
  entryPda,
  escrowAta,
  marketPda,
  oraoNetworkStatePda,
  oraoRandomnessPda,
  platformQuoteAta,
  windowPda,
} from "./pda.ts";
import { WindowState, type Entry, type Integration, type Keyed, type Market, type Window, type WindowVerification } from "./types.ts";
import { verifyWindow as verifyWindowPure } from "./verify.ts";
import { PULLED_ERROR_MESSAGES } from "./errors.ts";
import { watchMarket, type LiveState, type WatchOptions } from "./watch.ts";

export interface PulledClientOptions {
  connection: Connection;
  programId?: PublicKey;
  commitment?: Commitment;
}

export interface SellBackQuote {
  /** Tokens that would be sold: min(requested, share - claimed). */
  tokens: bigint;
  /** Exact quote base units paid out (law.ts `curveSell` on the current curve). */
  quoteOut: bigint;
  unclaimed: bigint;
  curveAfter: { x: bigint; y: bigint };
}

/** True when the market is quoted in native SOL (the wSOL mint, classic SPL Token). */
export function isNativeQuote(m: Market): boolean {
  return m.quoteMint.equals(NATIVE_MINT) && m.quoteProgram.equals(TOKEN_PROGRAM_ID);
}

/** Create the wSOL ATA if needed, move `lamports` into it and sync its balance. */
export function wrapSolInstructions(owner: PublicKey, wsolAta: PublicKey, lamports: bigint): TransactionInstruction[] {
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, wsolAta, owner, NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
    SystemProgram.transfer({ fromPubkey: owner, toPubkey: wsolAta, lamports }),
    createSyncNativeInstruction(wsolAta, TOKEN_PROGRAM_ID),
  ];
}

export class PulledClient {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly commitment: Commitment;

  constructor(opts: PulledClientOptions) {
    this.connection = opts.connection;
    this.programId = opts.programId ?? PULLED_PROGRAM_ID;
    this.commitment = opts.commitment ?? "confirmed";
  }

  /** Read-only client from an RPC url (no wallet of any kind). */
  static readOnly(rpcUrl: string, opts: { programId?: PublicKey; wsUrl?: string; commitment?: Commitment } = {}): PulledClient {
    const connection = new Connection(rpcUrl, { commitment: opts.commitment ?? "confirmed", wsEndpoint: opts.wsUrl });
    return new PulledClient({ connection, programId: opts.programId, commitment: opts.commitment });
  }

  /* ------------------------------ PDAs ------------------------------ */

  marketAddress(tokenMint: PublicKey): PublicKey { return marketPda(tokenMint, this.programId)[0]; }
  windowAddress(market: PublicKey, index: bigint | number): PublicKey { return windowPda(market, index, this.programId)[0]; }
  /** A wallet's Entry in a window: ["entry", window, owner] (one per wallet per window). */
  entryAddress(window: PublicKey, owner: PublicKey): PublicKey { return entryPda(window, owner, this.programId)[0]; }

  /* ------------------------------ reads ------------------------------ */

  private async data(pubkey: PublicKey, what: string): Promise<Uint8Array> {
    const info = await this.connection.getAccountInfo(pubkey, this.commitment);
    if (!info) throw new Error(`${what} ${pubkey.toBase58()} not found`);
    return new Uint8Array(info.data);
  }

  async getMarket(market: PublicKey): Promise<Keyed<Market>> {
    return { pubkey: market, account: decodeMarket(await this.data(market, "market")) };
  }

  async getMarketByMint(tokenMint: PublicKey): Promise<Keyed<Market>> {
    return this.getMarket(this.marketAddress(tokenMint));
  }

  async getIntegration(integration: PublicKey): Promise<Keyed<Integration>> {
    return { pubkey: integration, account: decodeIntegration(await this.data(integration, "integration")) };
  }

  /** `integration.host_fee_bps` of a market, 0 when it has none. */
  async getHostFeeBps(market: Market): Promise<number> {
    if (market.integration.equals(PublicKey.default)) return 0;
    return (await this.getIntegration(market.integration)).account.hostFeeBps;
  }

  async getWindow(window: PublicKey): Promise<Keyed<Window>> {
    return { pubkey: window, account: decodeWindow(await this.data(window, "window")) };
  }

  async getWindowByIndex(market: PublicKey, index: bigint | number): Promise<Keyed<Window>> {
    return this.getWindow(this.windowAddress(market, index));
  }

  /** The market's active window (whatever its state), or null before the first open. */
  async getLiveWindow(market: PublicKey): Promise<Keyed<Window> | null> {
    const m = await this.getMarket(market);
    if (!m.account.hasActiveWindow) return null;
    return this.getWindowByIndex(market, m.account.activeWindow);
  }

  /** Every Window account of a market (getProgramAccounts). */
  async getWindows(market: PublicKey): Promise<Keyed<Window>[]> {
    const accs = await this.connection.getProgramAccounts(this.programId, {
      commitment: this.commitment,
      filters: [{ dataSize: ACCOUNT_SIZES.Window }, { memcmp: { offset: OFFSETS.windowMarket, bytes: market.toBase58() } }],
    });
    return accs
      .map((a) => ({ pubkey: a.pubkey, account: decodeWindow(new Uint8Array(a.account.data)) }))
      .sort((a, b) => (a.account.index < b.account.index ? -1 : a.account.index > b.account.index ? 1 : 0));
  }

  /** Every Entry of a window, sorted by index. */
  async getEntries(window: PublicKey): Promise<Keyed<Entry>[]> {
    const accs = await this.connection.getProgramAccounts(this.programId, {
      commitment: this.commitment,
      filters: [{ dataSize: ACCOUNT_SIZES.Entry }, { memcmp: { offset: OFFSETS.entryWindow, bytes: window.toBase58() } }],
    });
    return accs
      .map((a) => ({ pubkey: a.pubkey, account: decodeEntry(new Uint8Array(a.account.data)) }))
      .sort((a, b) => a.account.index - b.account.index);
  }

  /** A wallet's entry in a window, or null (one read: the address is derived from the owner). */
  async getEntryOf(window: PublicKey, owner: PublicKey): Promise<Keyed<Entry> | null> {
    const pubkey = this.entryAddress(window, owner);
    const info = await this.connection.getAccountInfo(pubkey, this.commitment);
    if (!info || info.data.length === 0) return null;
    return { pubkey, account: decodeEntry(new Uint8Array(info.data)) };
  }

  /**
   * The Entry addresses of a window in index order (what `tally_page` /
   * `settle_page` take as remaining accounts). Throws when the RPC does not
   * return exactly indices 0..entry_count-1 (e.g. a lagging node): retry.
   */
  async getPageEntries(window: PublicKey, entryCount: number): Promise<PublicKey[]> {
    const entries = await this.getEntries(window);
    if (entries.length !== entryCount || entries.some((e, i) => e.account.index !== i)) {
      throw new Error(`window ${window.toBase58()}: RPC returned ${entries.length} of ${entryCount} entries`);
    }
    return entries.map((e) => e.pubkey);
  }

  /** Entries owned by `owner` (optionally within one window). */
  async getEntriesByOwner(owner: PublicKey, window?: PublicKey): Promise<Keyed<Entry>[]> {
    const filters: ({ dataSize: number } | { memcmp: { offset: number; bytes: string } })[] = [
      { dataSize: ACCOUNT_SIZES.Entry },
      { memcmp: { offset: OFFSETS.entryOwner, bytes: owner.toBase58() } },
    ];
    if (window) filters.push({ memcmp: { offset: OFFSETS.entryWindow, bytes: window.toBase58() } });
    const accs = await this.connection.getProgramAccounts(this.programId, { commitment: this.commitment, filters });
    return accs.map((a) => ({ pubkey: a.pubkey, account: decodeEntry(new Uint8Array(a.account.data)) }));
  }

  async getEntry(entry: PublicKey): Promise<Keyed<Entry>> {
    return { pubkey: entry, account: decodeEntry(await this.data(entry, "entry")) };
  }

  async getQuoteDecimals(market: Market): Promise<number> {
    return (await getMint(this.connection, market.quoteMint, this.commitment, market.quoteProgram)).decimals;
  }

  async getSlot(): Promise<number> { return this.connection.getSlot(this.commitment); }

  /** ORAO `network_state.config.treasury`, read from chain. */
  async getOraoTreasury(): Promise<PublicKey> {
    return parseOraoTreasury(await this.data(oraoNetworkStatePda()[0], "ORAO network state"));
  }

  /** 64 bytes when the window's ORAO request is fulfilled, null when pending or absent. */
  async getFulfilledRandomness(window: Window): Promise<Uint8Array | null> {
    if (!window.vrfRequested) return null;
    const info = await this.connection.getAccountInfo(window.vrfRequest, this.commitment);
    if (!info || info.data.length === 0) return null;
    return parseOraoRandomness(new Uint8Array(info.data), window.vrfSeed);
  }

  /* ------------------------------ quotes ------------------------------ */

  /** Exact quote for selling back (part of) an entry's unclaimed share at the current curve. */
  quoteSellBackSync(market: Market, entry: Entry, amount?: bigint): SellBackQuote {
    const unclaimed = entry.share - entry.claimed;
    const tokens = amount === undefined ? unclaimed : (amount < unclaimed ? amount : unclaimed);
    const { out, next } = curveSell(market.curve, tokens > 0n ? tokens : 0n);
    return { tokens: tokens > 0n ? tokens : 0n, quoteOut: out, unclaimed, curveAfter: next };
  }

  async quoteSellBack(entry: PublicKey | Keyed<Entry>, amount?: bigint): Promise<SellBackQuote> {
    const e = entry instanceof PublicKey ? await this.getEntry(entry) : entry;
    const w = await this.getWindow(e.account.window);
    const m = await this.getMarket(w.account.market);
    return this.quoteSellBackSync(m.account, e.account, amount);
  }

  /** Why `enter(amount)` would fail right now, or null when it should pass. */
  checkEnter(market: Market, window: Window, amount: bigint, slot: number): string | null {
    if (window.state !== WindowState.Open) return "window is not open";
    if (BigInt(slot) >= window.closeSlot) return "window closed";
    if (window.entryCount >= 2048) return "window is full";
    if (amount <= 0n) return "amount must be > 0";
    if (amount > market.maxEntryAmount) return "amount above max_entry_amount";
    const newTotal = window.totalAmount + amount;
    const ok = amount * BPS <= BigInt(market.maxEntryBps) * newTotal || newTotal <= market.entryFloorAmount;
    return ok ? null : "entry would exceed max_entry_bps of the window total";
  }

  /* --------------------------- transactions --------------------------- */

  async toTransaction(ixs: TransactionInstruction[], feePayer: PublicKey): Promise<Transaction> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.commitment);
    const tx = new Transaction({ feePayer, blockhash, lastValidBlockHeight });
    tx.add(...ixs);
    return tx;
  }

  /**
   * Stake `amount` (quote base units) into the market's open window.
   * The Entry PDA is ["entry", window, owner]: it does not depend on how many
   * entries landed before, so the transaction stays valid however many
   * wallets enter in the same slot (no rebuild, no retry). One entry per
   * wallet per window: a wallet that already entered gets `AlreadyEntered`
   * here, before signing.
   */
  async enter(args: { market: PublicKey; amount: bigint; owner: PublicKey; ownerQuote?: PublicKey }): Promise<Transaction> {
    const m = await this.getMarket(args.market);
    const w = await this.getLiveWindow(args.market);
    if (!w || w.account.state !== WindowState.Open) throw new Error("no open window");
    const entry = this.entryAddress(w.pubkey, args.owner);
    if (await this.connection.getAccountInfo(entry, this.commitment)) {
      throw new Error(`AlreadyEntered: ${PULLED_ERROR_MESSAGES.AlreadyEntered}`);
    }
    const q = m.account;
    const ownerQuote = args.ownerQuote ?? ata(q.quoteMint, args.owner, q.quoteProgram);
    const native = isNativeQuote(q) && !args.ownerQuote;
    return this.toTransaction([
      // Native SOL quote: wrap exactly `amount` into the owner's wSOL ATA first.
      ...(native ? wrapSolInstructions(args.owner, ownerQuote, args.amount) : []),
      enterIx({
        owner: args.owner,
        market: args.market,
        window: w.pubkey,
        entry,
        quoteMint: q.quoteMint,
        ownerQuote,
        escrow: w.account.escrow,
        quoteTokenProgram: q.quoteProgram,
      }, args.amount, this.programId),
      // ...and close the wSOL ATA afterwards so any leftover goes back as SOL.
      ...(native ? [createCloseAccountInstruction(ownerQuote, args.owner, args.owner)] : []),
    ], args.owner);
  }

  /** Claim the unclaimed share of an entry into the owner's token ATA (created idempotently). */
  async claim(args: { entry: PublicKey; owner: PublicKey }): Promise<Transaction> {
    const e = await this.getEntry(args.entry);
    const w = await this.getWindow(e.account.window);
    const m = await this.getMarket(w.account.market);
    const ownerToken = ata(m.account.tokenMint, args.owner, TOKEN_PROGRAM_ID);
    return this.toTransaction([
      createAssociatedTokenAccountIdempotentInstruction(args.owner, ownerToken, args.owner, m.account.tokenMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
      claimIx({
        owner: args.owner,
        market: w.account.market,
        window: e.account.window,
        entry: args.entry,
        tokenMint: m.account.tokenMint,
        tokenVault: m.account.tokenVault,
        ownerTokenAccount: ownerToken,
      }, this.programId),
      // claimed == share now: give the entry's rent back in the same transaction
      closeEntryIx({ window: e.account.window, entry: args.entry, owner: args.owner }, this.programId),
    ], args.owner);
  }

  /** Sell back `amount` (default: everything unclaimed) of an entry's share to the curve. */
  async sellBack(args: { entry: PublicKey; owner: PublicKey; amount?: bigint; ownerQuote?: PublicKey }): Promise<Transaction> {
    const e = await this.getEntry(args.entry);
    const w = await this.getWindow(e.account.window);
    const m = await this.getMarket(w.account.market);
    const q = m.account;
    const ownerQuote = args.ownerQuote ?? ata(q.quoteMint, args.owner, q.quoteProgram);
    const unclaimed = e.account.share - e.account.claimed;
    const amount = args.amount ?? unclaimed;
    const closes = amount >= unclaimed;
    return this.toTransaction([
      createAssociatedTokenAccountIdempotentInstruction(args.owner, ownerQuote, args.owner, q.quoteMint, q.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
      sellBackIx({
        owner: args.owner,
        market: w.account.market,
        window: e.account.window,
        entry: args.entry,
        quoteMint: q.quoteMint,
        quoteVault: q.quoteVault,
        ownerQuote,
        quoteTokenProgram: q.quoteProgram,
      }, amount, this.programId),
      // Native SOL quote: unwrap the proceeds straight back to SOL.
      ...(isNativeQuote(q) && !args.ownerQuote ? [createCloseAccountInstruction(ownerQuote, args.owner, args.owner)] : []),
      // everything sold: give the entry's rent back in the same transaction
      ...(closes ? [closeEntryIx({ window: e.account.window, entry: args.entry, owner: args.owner }, this.programId)] : []),
    ], args.owner);
  }

  /** Sell wallet-held tokens to the curve. */
  async sell(args: { market: PublicKey; owner: PublicKey; amount: bigint; sellerTokenAccount?: PublicKey; sellerQuote?: PublicKey }): Promise<Transaction> {
    const m = await this.getMarket(args.market);
    const q = m.account;
    const sellerQuote = args.sellerQuote ?? ata(q.quoteMint, args.owner, q.quoteProgram);
    return this.toTransaction([
      createAssociatedTokenAccountIdempotentInstruction(args.owner, sellerQuote, args.owner, q.quoteMint, q.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
      sellIx({
        seller: args.owner,
        market: args.market,
        tokenMint: q.tokenMint,
        sellerTokenAccount: args.sellerTokenAccount ?? ata(q.tokenMint, args.owner, TOKEN_PROGRAM_ID),
        tokenVault: q.tokenVault,
        quoteMint: q.quoteMint,
        quoteVault: q.quoteVault,
        sellerQuote,
        quoteTokenProgram: q.quoteProgram,
      }, args.amount, this.programId),
      ...(isNativeQuote(q) && !args.sellerQuote ? [createCloseAccountInstruction(sellerQuote, args.owner, args.owner)] : []),
    ], args.owner);
  }

  /**
   * Unwrap a wallet's wSOL ATA to SOL (e.g. after a refund, which pays into the
   * owner's quote ATA). Returns null when the market's quote is not native SOL.
   */
  async unwrapSol(args: { market: Market; owner: PublicKey }): Promise<Transaction | null> {
    if (!isNativeQuote(args.market)) return null;
    const a = ata(args.market.quoteMint, args.owner, args.market.quoteProgram);
    return this.toTransaction([createCloseAccountInstruction(a, args.owner, args.owner)], args.owner);
  }

  /* ------------------------ keeper-side instructions ------------------------ */

  /** `open_window` for the market's next index, passing the active window as `prev_window` when there is one. */
  async openWindowInstructions(payer: PublicKey, market: PublicKey, m?: Market): Promise<TransactionInstruction[]> {
    const mk = m ?? (await this.getMarket(market)).account;
    const window = this.windowAddress(market, mk.windowCount);
    return [openWindowIx({
      payer,
      market,
      prevWindow: mk.hasActiveWindow ? this.windowAddress(market, mk.activeWindow) : null,
      window,
      quoteMint: mk.quoteMint,
      escrow: escrowAta(window, mk.quoteMint, mk.quoteProgram),
      quoteTokenProgram: mk.quoteProgram,
    }, this.programId)];
  }

  sealInstructions(market: PublicKey, window: PublicKey): TransactionInstruction[] {
    return [sealIx({ market, window }, this.programId)];
  }

  /**
   * `request_vrf`. The ORAO request PDA is derived from the seed the window
   * will have (or has) so seal + request_vrf can share one transaction.
   */
  async requestVrfInstructions(payer: PublicKey, window: PublicKey, vrfSeed: Uint8Array): Promise<TransactionInstruction[]> {
    const treasury = await this.getOraoTreasury();
    return [requestVrfIx({
      payer,
      window,
      networkState: oraoNetworkStatePda()[0],
      treasury,
      vrfRequest: oraoRandomnessPda(vrfSeed)[0],
    }, this.programId)];
  }

  fulfillInstructions(window: PublicKey, w: Window): TransactionInstruction[] {
    return [fulfillIx({ window, vrfRequest: w.vrfRequest }, this.programId)];
  }

  /** Host of a market's integration (null without one); cached per integration account. */
  private hostCache = new Map<string, PublicKey>();
  async getIntegrationHost(m: Market): Promise<PublicKey | null> {
    if (m.integration.equals(PublicKey.default)) return null;
    const k = m.integration.toBase58();
    let host = this.hostCache.get(k);
    if (!host) { host = (await this.getIntegration(m.integration)).account.host; this.hostCache.set(k, host); }
    return host;
  }

  /**
   * Idempotent creation of the quote token accounts the finalizing
   * `tally_page` pays into: the platform treasury's ATA, the keeper's ATA
   * (unless `keeperQuoteAccount` is given) and the host's ATA when the market
   * has an integration. Send once per market before the first tally; the
   * page transactions then carry none of it (more entries per page).
   */
  async feeAccountsInstructions(payer: PublicKey, m: Market, keeperQuoteAccount?: PublicKey): Promise<TransactionInstruction[]> {
    const ixs: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(payer, platformQuoteAta(m.quoteMint, m.quoteProgram), PLATFORM_TREASURY, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
    ];
    if (!keeperQuoteAccount) {
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer, ata(m.quoteMint, payer, m.quoteProgram), payer, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    const host = await this.getIntegrationHost(m);
    if (host) {
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer, ata(m.quoteMint, host, m.quoteProgram), host, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    return ixs;
  }

  /**
   * One `tally_page` for [from, to) with every finalization account.
   * `entries` are the page's Entry addresses in index order
   * (`getPageEntries(window, count).slice(from, to)`).
   * Options: `createFeeAccounts` prepends `feeAccountsInstructions` (default
   * false: send them once per market instead); `computeUnits` prepends a
   * compute-unit limit sized for the page (default true).
   */
  async tallyPageInstructions(
    payer: PublicKey, market: PublicKey, m: Market, window: PublicKey, w: Window, from: number, to: number,
    entries: readonly PublicKey[],
    opts: { keeperQuoteAccount?: PublicKey; createFeeAccounts?: boolean; computeUnits?: boolean } = {},
  ): Promise<TransactionInstruction[]> {
    const ixs: TransactionInstruction[] = [];
    if (opts.computeUnits ?? true) ixs.push(computeUnitLimitIx(tallyPageComputeUnits(to - from)));
    if (opts.createFeeAccounts) ixs.push(...(await this.feeAccountsInstructions(payer, m, opts.keeperQuoteAccount)));
    ixs.push(await this.tallyPageIxFor(payer, market, m, window, w, from, to, entries, opts.keeperQuoteAccount));
    return ixs;
  }

  /** The bare `tally_page` instruction (no compute-budget or ATA instruction). */
  async tallyPageIxFor(
    payer: PublicKey, market: PublicKey, m: Market, window: PublicKey, w: Window, from: number, to: number,
    entries: readonly PublicKey[], keeperQuoteAccount?: PublicKey,
  ): Promise<TransactionInstruction> {
    const host = await this.getIntegrationHost(m);
    return tallyPageIx({
      payer,
      market,
      window,
      quoteMint: m.quoteMint,
      escrow: w.escrow,
      quoteVault: m.quoteVault,
      platformQuoteAccount: platformQuoteAta(m.quoteMint, m.quoteProgram),
      keeperQuoteAccount: keeperQuoteAccount ?? ata(m.quoteMint, payer, m.quoteProgram),
      integration: host ? m.integration : null,
      hostQuoteAccount: host ? ata(m.quoteMint, host, m.quoteProgram) : null,
      quoteTokenProgram: m.quoteProgram,
    }, from, to, entries, this.programId);
  }

  /** One `settle_page` for [from, to); `entries` as for `tallyPageInstructions`. */
  settlePageInstructions(market: PublicKey, window: PublicKey, from: number, to: number, entries: readonly PublicKey[], opts: { computeUnits?: boolean } = {}): TransactionInstruction[] {
    const ixs: TransactionInstruction[] = [];
    if (opts.computeUnits ?? true) ixs.push(computeUnitLimitIx(settlePageComputeUnits(to - from)));
    ixs.push(settlePageIx({ market, window }, from, to, entries, this.programId));
    return ixs;
  }

  /** True when `close_entry` would pass for this entry in this window. */
  static entryClosable(w: Window, e: Entry): boolean {
    if (w.state === WindowState.Settled) return e.claimed === e.share;
    if (w.state === WindowState.Refunding) return e.refunded;
    return false;
  }

  /** `close_entry`: rent back to the entry owner (anyone may send it). */
  closeEntryInstructions(window: PublicKey, entry: Keyed<Entry>): TransactionInstruction[] {
    return [closeEntryIx({ window, entry: entry.pubkey, owner: entry.account.owner }, this.programId)];
  }

  /** `close_window`: window + escrow rent back to the opener, once every entry is closed. */
  closeWindowInstructions(market: PublicKey, m: Market, window: PublicKey, w: Window): TransactionInstruction[] {
    return [closeWindowIx({
      market,
      window,
      opener: w.opener,
      quoteMint: m.quoteMint,
      escrow: w.escrow,
      quoteVault: m.quoteVault,
      quoteTokenProgram: m.quoteProgram,
    }, this.programId)];
  }

  refundWindowInstructions(market: PublicKey, window: PublicKey, w: Window): TransactionInstruction[] {
    return [refundWindowIx({ market, window, vrfRequest: w.vrfRequested ? w.vrfRequest : null }, this.programId)];
  }

  /** `refund_entry` into the owner's quote ATA (created idempotently; `payer` funds the rent if missing). */
  refundEntryInstructions(payer: PublicKey, market: PublicKey, m: Market, window: PublicKey, w: Window, entry: Keyed<Entry>): TransactionInstruction[] {
    const recipient = ata(m.quoteMint, entry.account.owner, m.quoteProgram);
    return [
      createAssociatedTokenAccountIdempotentInstruction(payer, recipient, entry.account.owner, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
      refundEntryIx({
        market,
        window,
        entry: entry.pubkey,
        quoteMint: m.quoteMint,
        escrow: w.escrow,
        recipient,
        quoteTokenProgram: m.quoteProgram,
      }, this.programId),
    ];
  }

  /** Page bounds [from, to) of size <= MAX_PAGE from `cursor` to `count`. */
  static pages(cursor: number, count: number, pageSize = MAX_PAGE): [number, number][] {
    if (pageSize < 1 || pageSize > MAX_PAGE) throw new Error("bad page size");
    const out: [number, number][] = [];
    for (let from = cursor; from < count; from += pageSize) out.push([from, Math.min(count, from + pageSize)]);
    return out;
  }

  /* ------------------------------ watch ------------------------------ */

  /** Live updates for a market (websocket + polling fallback). Returns the unsubscribe function. */
  watch(market: PublicKey, cb: (state: LiveState) => void, opts?: WatchOptions): () => void {
    return watchMarket(this, market, cb, opts);
  }

  /* ------------------------------ verify ------------------------------ */

  /** Recompute every roll and share of a window from public data and compare with the chain. */
  async verifyWindow(window: PublicKey): Promise<WindowVerification> {
    const w = await this.getWindow(window);
    const m = await this.getMarket(w.account.market);
    const hostFeeBps = await this.getHostFeeBps(m.account);
    const entries = await this.getEntries(window);
    return verifyWindowPure({ windowPubkey: window, window: w.account, entries, hostFeeBps });
  }
}
