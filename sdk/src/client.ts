/**
 * High-level client. Read-only by construction: it never holds a key. Every
 * write method returns an unsigned `Transaction` (fee payer and recent
 * blockhash set) for the caller's wallet to sign and send.
 */
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
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
  DISCRIMINATORS,
  OFFSETS,
  decodeEntry,
  decodeIntegration,
  decodeMarket,
  decodeWindow,
  parseOraoRandomness,
  parseOraoTreasury,
} from "./accounts.ts";
import {
  closeEntryIx,
  closeMarketIx,
  closeWindowIx,
  enterIx,
  forceExitIx,
  fulfillIx,
  openWindowIx,
  refundEntryIx,
  refundWindowIx,
  requestVrfIx,
  sealIx,
  sellBackIx,
  sellIx,
  settlePageIx,
  startWindDownIx,
  tallyPageIx,
} from "./instructions.ts";
import { curveSell, BPS } from "./law.ts";
import { computeUnitLimitIx, settlePageComputeUnits, tallyPageComputeUnits } from "./budget.ts";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MAX_PAGE,
  MIN_ENTRY_AMOUNT,
  PLATFORM_TREASURY,
  PULLED_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ata,
  entryPda,
  escrowAta,
  marketPda,
  newVrfSalt,
  oraoNetworkStatePda,
  platformQuoteAta,
  unwrapPda,
  vrfRequestFor,
  INITIAL_VIRTUAL_Y,
  WIND_DOWN_NOTICE_SECS,
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
  /**
   * The platform treasury the program was built with (`LADLE_TREASURY`):
   * the finalizing `tally_page` pays its ATA. Resolve it per cluster with
   * `resolveTreasury(cluster, process.env.LADLE_TREASURY)`; defaults to the
   * devnet key.
   */
  treasury?: PublicKey;
}

/** Default tolerance of a sale's `min_quote_out` below its quote: 1 %. */
export const DEFAULT_SLIPPAGE_BPS = 100;

/** `quote` minus `slippageBps` (rounded down): the least a sale signed now accepts. */
export function minQuoteOut(quote: bigint, slippageBps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) throw new Error("slippageBps must be an integer in [0, 10000]");
  return (quote * BigInt(10_000 - slippageBps)) / 10_000n;
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
  readonly treasury: PublicKey;

  constructor(opts: PulledClientOptions) {
    this.connection = opts.connection;
    this.programId = opts.programId ?? PULLED_PROGRAM_ID;
    this.commitment = opts.commitment ?? "confirmed";
    this.treasury = opts.treasury ?? PLATFORM_TREASURY;
  }

  /** Read-only client from an RPC url (no wallet of any kind). */
  static readOnly(rpcUrl: string, opts: { programId?: PublicKey; wsUrl?: string; commitment?: Commitment; treasury?: PublicKey } = {}): PulledClient {
    const connection = new Connection(rpcUrl, { commitment: opts.commitment ?? "confirmed", wsEndpoint: opts.wsUrl });
    return new PulledClient({ connection, programId: opts.programId, commitment: opts.commitment, treasury: opts.treasury });
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

  /** The market, or null once it is closed (`close_market`, wind-down build). */
  async getMarketOrNull(market: PublicKey): Promise<Keyed<Market> | null> {
    const info = await this.connection.getAccountInfo(market, this.commitment);
    return info ? { pubkey: market, account: decodeMarket(new Uint8Array(info.data)) } : null;
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

  /**
   * Entries owned by `owner`, optionally within one window or one market.
   * Entries outlive their window (a Settled window is closed while its
   * entries can still sell back), so this is how a wallet finds what it
   * can still sell back: filter on `settled && claimed < share`.
   */
  async getEntriesByOwner(owner: PublicKey, window?: PublicKey, market?: PublicKey): Promise<Keyed<Entry>[]> {
    const filters: ({ dataSize: number } | { memcmp: { offset: number; bytes: string } })[] = [
      { dataSize: ACCOUNT_SIZES.Entry },
      { memcmp: { offset: OFFSETS.entryOwner, bytes: owner.toBase58() } },
    ];
    if (window) filters.push({ memcmp: { offset: OFFSETS.entryWindow, bytes: window.toBase58() } });
    if (market) filters.push({ memcmp: { offset: OFFSETS.entryMarket, bytes: market.toBase58() } });
    const accs = await this.connection.getProgramAccounts(this.programId, { commitment: this.commitment, filters });
    return accs.map((a) => ({ pubkey: a.pubkey, account: decodeEntry(new Uint8Array(a.account.data)) }));
  }

  /**
   * Every Entry of a market, whatever its window (closed or not), sorted by
   * window then index: what the shutdown drain pays out.
   */
  async getEntriesByMarket(market: PublicKey): Promise<Keyed<Entry>[]> {
    const accs = await this.connection.getProgramAccounts(this.programId, {
      commitment: this.commitment,
      filters: [{ dataSize: ACCOUNT_SIZES.Entry }, { memcmp: { offset: OFFSETS.entryMarket, bytes: market.toBase58() } }],
    });
    return accs
      .map((a) => ({ pubkey: a.pubkey, account: decodeEntry(new Uint8Array(a.account.data)) }))
      .sort((a, b) => (a.account.windowIndex < b.account.windowIndex ? -1 : a.account.windowIndex > b.account.windowIndex ? 1 : a.account.index - b.account.index));
  }

  /**
   * Every account of the program carrying this account's discriminator
   * (base64 memcmp: no base58 helper needed), raw. Markets of two sizes
   * exist (626 bytes, 562 before the second review), so scans go by
   * discriminator, not by size.
   */
  private async scanAll(name: keyof typeof DISCRIMINATORS, dataLength?: number) {
    return this.connection.getProgramAccounts(this.programId, {
      commitment: this.commitment,
      filters: [{ memcmp: { offset: 0, bytes: Buffer.from(DISCRIMINATORS[name]).toString("base64"), encoding: "base64" } }],
      ...(dataLength === undefined ? {} : { dataSlice: { offset: 0, length: dataLength } }),
    });
  }

  /**
   * Every Market of the program, whoever created it (`create_market` is open
   * to anyone, and the program closes only once every market is drained).
   * Accounts of a layout this SDK cannot decode are skipped.
   */
  async getAllMarkets(): Promise<Keyed<Market>[]> {
    const out: Keyed<Market>[] = [];
    for (const a of await this.scanAll("Market")) {
      try { out.push({ pubkey: a.pubkey, account: decodeMarket(new Uint8Array(a.account.data)) }); } catch { /* another layout */ }
    }
    return out;
  }

  /**
   * Every Entry of the program, whatever its market: also those of a market
   * already closed (`close_market` does not count entries; what is left in
   * them is only their owner's rent, which `close_entry` returns). Accounts
   * of another layout are skipped.
   */
  async getAllEntries(): Promise<Keyed<Entry>[]> {
    const out: Keyed<Entry>[] = [];
    for (const a of await this.scanAll("Entry")) {
      try { out.push({ pubkey: a.pubkey, account: decodeEntry(new Uint8Array(a.account.data)) }); } catch { /* another layout */ }
    }
    return out;
  }

  /** The addresses of every account of the program carrying this account's discriminator (no data fetched). */
  async getAccountKeys(name: keyof typeof DISCRIMINATORS): Promise<PublicKey[]> {
    return (await this.scanAll(name, 0)).map((a) => a.pubkey);
  }

  /**
   * The cluster clock (`Clock.unix_timestamp`, seconds): what the program
   * compares the closing notice with (not the local clock).
   */
  async getClusterTime(): Promise<bigint> {
    const info = await this.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, this.commitment);
    if (!info || info.data.length < 40) throw new Error("Clock sysvar unreadable");
    // slot u64, epoch_start_timestamp i64, epoch u64, leader_schedule_epoch u64, unix_timestamp i64
    return Buffer.from(info.data).readBigInt64LE(32);
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
    const m = await this.getMarket(e.account.market);
    return this.quoteSellBackSync(m.account, e.account, amount);
  }

  /**
   * True when `sell_back` accepts this entry now: its window is
   * Settled (the program's `Entry::window_settled`: `settled` and the
   * market's settlement cursor past the window) and part of the share is
   * left. Works whether the window account still exists or not.
   */
  static entryClaimable(market: Market, e: Entry): boolean {
    return e.settled && e.windowIndex < market.nextSettleIndex && e.claimed < e.share;
  }

  /** Why `enter(amount)` would fail right now, or null when it should pass. */
  checkEnter(market: Market, window: Window, amount: bigint, slot: number): string | null {
    if (window.state !== WindowState.Open) return "window is not open";
    if (BigInt(slot) >= window.closeSlot) return "window closed";
    if (window.entryCount >= 2048) return "window is full";
    if (amount < MIN_ENTRY_AMOUNT) return "amount below the minimum stake (0.1 SOL)";
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

  /**
   * Sell back `amount` (default: everything unsold) of an entry's share to
   * the curve (works after the window is closed). The sale is bound by
   * `minQuoteOut`: pass the quote the user saw minus a tolerance
   * (`minQuoteOut(quote, bps)`); by default the quote of the curve read
   * here minus `slippageBps` (1 %). Sales that land first and move the
   * price beyond it make this one fail (SlippageExceeded) instead of paying
   * less than the user accepted.
   */
  async sellBack(args: { entry: PublicKey; owner: PublicKey; amount?: bigint; ownerQuote?: PublicKey; minQuoteOut?: bigint; slippageBps?: number }): Promise<Transaction> {
    const e = await this.getEntry(args.entry);
    const m = await this.getMarket(e.account.market);
    const q = m.account;
    const ownerQuote = args.ownerQuote ?? ata(q.quoteMint, args.owner, q.quoteProgram);
    const unclaimed = e.account.share - e.account.claimed;
    const amount = args.amount ?? unclaimed;
    const closes = amount >= unclaimed;
    const bound = args.minQuoteOut ?? minQuoteOut(this.quoteSellBackSync(q, e.account, amount).quoteOut, args.slippageBps);
    return this.toTransaction([
      createAssociatedTokenAccountIdempotentInstruction(args.owner, ownerQuote, args.owner, q.quoteMint, q.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
      sellBackIx({
        owner: args.owner,
        market: e.account.market,
        entry: args.entry,
        quoteMint: q.quoteMint,
        quoteVault: q.quoteVault,
        ownerQuote,
        quoteTokenProgram: q.quoteProgram,
      }, amount, bound, this.programId),
      // Native SOL quote: unwrap the proceeds straight back to SOL.
      ...(isNativeQuote(q) && !args.ownerQuote ? [createCloseAccountInstruction(ownerQuote, args.owner, args.owner)] : []),
      // everything sold: give the entry's rent back in the same transaction
      ...(closes ? [closeEntryIx({ entry: args.entry, owner: args.owner }, this.programId)] : []),
    ], args.owner);
  }

  /**
   * Sell wallet-held tokens to the curve (LADLE taken out by a pre-v25
   * claim: none can reach a wallet since). Bound like `sellBack`.
   */
  async sell(args: { market: PublicKey; owner: PublicKey; amount: bigint; sellerTokenAccount?: PublicKey; sellerQuote?: PublicKey; minQuoteOut?: bigint; slippageBps?: number }): Promise<Transaction> {
    const m = await this.getMarket(args.market);
    const q = m.account;
    const bound = args.minQuoteOut ?? minQuoteOut(curveSell(q.curve, args.amount).out, args.slippageBps);
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
      }, args.amount, bound, this.programId),
      ...(isNativeQuote(q) && !args.sellerQuote ? [createCloseAccountInstruction(sellerQuote, args.owner, args.owner)] : []),
    ], args.owner);
  }

  /**
   * True when `owner` can take the stake of this entry back now: its round
   * is Refunding and the stake is still there, or it is Sealed past the VRF
   * timeout and next in settlement order (then `refund` also switches it to
   * refunds: anyone may). `slot` is the current slot. For a Sealed round
   * this reads only the window: when its ORAO request was answered after
   * all, `refund_window` fails (`MustFulfill`); check
   * `getFulfilledRandomness(w)` before offering it.
   */
  static entryRefundable(market: Market, w: Window, e: Entry, slot: bigint | number): boolean {
    if (e.refunded) return false;
    if (w.state === WindowState.Refunding) return true;
    if (w.state !== WindowState.Sealed || w.index !== market.nextSettleIndex) return false;
    const start = w.vrfRequested ? w.vrfRequestedSlot : w.sealedSlot;
    return BigInt(slot) > start + market.vrfTimeoutSlots;
  }

  /**
   * Take an entry's stake back from a round that will not be drawn, paid by
   * its owner: `refund_window` first when the round is still Sealed past the
   * VRF timeout (`entryRefundable`), then `refund_entry` into the owner's
   * quote ATA (created if needed), `close_entry` (the entry's rent back)
   * and, on a native SOL market, the wSOL account closed again: the stake
   * and both rents arrive as SOL, the owner pays only the fees. The keeper
   * refunds entries whose owner already has a quote account; this is the
   * way for the others.
   */
  async refund(args: { entry: PublicKey; owner: PublicKey }): Promise<Transaction> {
    const e = await this.getEntry(args.entry);
    const m = await this.getMarket(e.account.market);
    const w = await this.getWindow(e.account.window);
    // ORAO answered after all: the program refuses the refund (MustFulfill); the round is drawn and settled instead
    if (w.account.state === WindowState.Sealed && (await this.getFulfilledRandomness(w.account))) {
      throw new Error("this round was drawn after all: it settles, it does not refund");
    }
    const q = m.account;
    const recipient = ata(q.quoteMint, args.owner, q.quoteProgram);
    const native = isNativeQuote(q);
    return this.toTransaction([
      ...(w.account.state === WindowState.Sealed ? this.refundWindowInstructions(e.account.market, w.pubkey, w.account) : []),
      ...this.refundEntryInstructions(args.owner, e.account.market, q, w.pubkey, w.account, e),
      closeEntryIx({ entry: args.entry, owner: e.account.owner }, this.programId),
      ...(native ? [createCloseAccountInstruction(recipient, args.owner, args.owner)] : []),
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
   * `request_vrf(salt)` for a window whose seal seed is `sealSeed` (the
   * window's `vrfSeed` once sealed, or `deriveVrfSeed` of its fields when
   * seal rides in the same transaction). The request asks ORAO for
   * `deriveRequestSeed(sealSeed, salt)`; use a fresh salt on every attempt
   * (the default): a salt someone saw in flight may have been used up at
   * ORAO, and that attempt then fails.
   */
  async requestVrfInstructions(payer: PublicKey, window: PublicKey, sealSeed: Uint8Array, salt: Uint8Array = newVrfSalt()): Promise<TransactionInstruction[]> {
    const treasury = await this.getOraoTreasury();
    return [requestVrfIx({
      payer,
      window,
      networkState: oraoNetworkStatePda()[0],
      treasury,
      vrfRequest: vrfRequestFor(sealSeed, salt),
    }, salt, this.programId)];
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
   * `tally_page` pays into: the platform treasury's ATA and the keeper's ATA
   * (unless `keeperQuoteAccount` is given). Send once per market before the
   * first tally; the page transactions then carry none of it (more entries
   * per page). Not the host's ATA (final review): the program no longer
   * needs it (a round whose host has no account keeps the host fee in its
   * buy), and creating it for the host let a host close it and keep the
   * rent, round after round.
   */
  async feeAccountsInstructions(payer: PublicKey, m: Market, keeperQuoteAccount?: PublicKey): Promise<TransactionInstruction[]> {
    const ixs: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(payer, platformQuoteAta(m.quoteMint, m.quoteProgram, this.treasury), this.treasury, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
    ];
    if (!keeperQuoteAccount) {
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer, ata(m.quoteMint, payer, m.quoteProgram), payer, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    return ixs;
  }

  /**
   * One `tally_page` for [from, to) with every finalization account. The
   * keeper bounty goes to `keeperQuoteAccount` (default: `payer`'s quote
   * ATA) for a window that never asked ORAO, and for one that did only when
   * that is the ATA of `window.vrfPayer`; otherwise it goes to the treasury.
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
      platformQuoteAccount: platformQuoteAta(m.quoteMint, m.quoteProgram, this.treasury),
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

  /**
   * True when `close_entry` would pass: the stake is refunded, or the share
   * is final and fully sold back (a zero share right after its
   * settle page). Read from the Entry alone, like the program.
   */
  static isEntryClosable(e: Entry): boolean {
    return e.refunded || (e.settled && e.claimed === e.share);
  }

  /** @deprecated the window no longer matters: `isEntryClosable(e)`. */
  static entryClosable(_w: Window | null, e: Entry): boolean {
    return PulledClient.isEntryClosable(e);
  }

  /**
   * True when `close_window` would pass: Settled (right away: the entries
   * keep their share without it) or Refunding with every stake refunded.
   * The market's active window too (second review): closing it leaves the
   * market with no active window, and the next `open_window` needs no
   * previous one. `_m` is kept for callers of the older signature.
   */
  static isWindowClosable(_m: Market, w: Window): boolean {
    if (w.state === WindowState.Settled) return true;
    return w.state === WindowState.Refunding && w.refundedEntries === w.entryCount;
  }

  /* ------------------------- shutdown (wind-down build) ------------------------- */

  /**
   * When a market's closing notice ends (unix seconds), or null when no
   * notice runs. The wind-down build sets `noticeStart` in
   * `start_wind_down`; a round opening under the normal build clears it.
   */
  static noticeEnd(m: Market, noticeSecs: bigint = WIND_DOWN_NOTICE_SECS): bigint | null {
    return m.noticeStart > 0n ? m.noticeStart + noticeSecs : null;
  }

  /** `start_wind_down` for a market (anyone; wind-down build only; once per notice). */
  startWindDownInstructions(market: PublicKey): TransactionInstruction[] {
    return [startWindDownIx({ market }, this.programId)];
  }

  /**
   * `force_exit` of an entry, sent by `payer` (anyone) after the notice: the
   * unsold share or the unrefunded stake goes to the owner as SOL, through
   * the PDA ["unwrap", entry] (whose rent `payer` lends for the instruction
   * and gets back), the entry's rent too. `w` is the entry's window:
   * required when its stake is still to refund (Refunding round). Throws for
   * a market not quoted in wSOL (only an earlier build could make one; the
   * program refuses it with QuoteMintNotWsol).
   */
  forceExitInstructions(payer: PublicKey, m: Market, entry: Keyed<Entry>, w?: Keyed<Window> | null): TransactionInstruction[] {
    const e = entry.account;
    const refund = !e.refunded && !e.settled;
    if (!isNativeQuote(m)) throw new Error(`force_exit: market ${e.market.toBase58()} is not quoted in wSOL`);
    const payout = unwrapPda(entry.pubkey, this.programId)[0];
    return [
      forceExitIx({
        payer,
        market: e.market,
        entry: entry.pubkey,
        owner: e.owner,
        window: refund ? w?.pubkey ?? null : null,
        escrow: refund ? w?.account.escrow ?? null : null,
        quoteMint: m.quoteMint,
        quoteVault: m.quoteVault,
        payout,
        quoteTokenProgram: m.quoteProgram,
      }, this.programId),
    ];
  }

  /**
   * True when `close_market` would pass, from the Market alone: v25 market,
   * no round account left, no LADLE out, notice over at `nowSecs`.
   */
  static isMarketClosable(m: Market, nowSecs: bigint, noticeSecs: bigint = WIND_DOWN_NOTICE_SECS): boolean {
    const end = PulledClient.noticeEnd(m, noticeSecs);
    return end !== null && nowSecs >= end && m.countsWindows && m.liveWindows === 0n && !m.hasActiveWindow && m.curve.y === INITIAL_VIRTUAL_Y;
  }

  /**
   * `close_market`: burns the unsold LADLE, closes the vaults and the market;
   * rents and the quote left go to `market.creator` as SOL (wSOL markets
   * only). Entries left (only their owners' rent) close with `close_entry`
   * afterwards: `getAllEntries`. `_payer` is kept for callers of the older
   * signature (nothing is paid for anyone any more).
   */
  closeMarketInstructions(_payer: PublicKey, market: PublicKey, m: Market): TransactionInstruction[] {
    return [
      closeMarketIx({
        market,
        creator: m.creator,
        tokenMint: m.tokenMint,
        tokenVault: m.tokenVault,
        quoteMint: m.quoteMint,
        quoteVault: m.quoteVault,
        quoteTokenProgram: m.quoteProgram,
      }, this.programId),
    ];
  }

  /** `close_entry`: rent back to the entry owner (anyone may send it, before or after its window is closed). */
  closeEntryInstructions(entry: Keyed<Entry>): TransactionInstruction[];
  /** @deprecated close_entry no longer takes the window: `closeEntryInstructions(entry)`. */
  closeEntryInstructions(window: PublicKey, entry: Keyed<Entry>): TransactionInstruction[];
  closeEntryInstructions(a: PublicKey | Keyed<Entry>, b?: Keyed<Entry>): TransactionInstruction[] {
    const entry = a instanceof PublicKey ? b : a;
    if (!entry) throw new Error("closeEntryInstructions: entry missing");
    return [closeEntryIx({ entry: entry.pubkey, owner: entry.account.owner }, this.programId)];
  }

  /**
   * `close_window`: window + escrow rent back to the opener
   * (`isWindowClosable`). A Settled window can ride along with its last
   * `settle_page` once the next window is open.
   */
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

  /**
   * `refund_entry` into the owner's quote ATA. `createRecipient` (default
   * true) creates that ATA first when missing, `payer` funding its rent
   * (~0.002 SOL, which then belongs to the owner): a keeper passes false and
   * refunds only owners whose account exists, or anyone could make it pay
   * that rent once per entry.
   */
  refundEntryInstructions(payer: PublicKey, market: PublicKey, m: Market, window: PublicKey, w: Window, entry: Keyed<Entry>, createRecipient = true): TransactionInstruction[] {
    const recipient = ata(m.quoteMint, entry.account.owner, m.quoteProgram);
    return [
      ...(createRecipient ? [createAssociatedTokenAccountIdempotentInstruction(payer, recipient, entry.account.owner, m.quoteMint, m.quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID)] : []),
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
