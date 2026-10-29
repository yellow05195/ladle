/**
 * Instruction builders for the 18 instructions of the Ladle program: the 15
 * of the normal build and the 3 shutdown instructions of the wind-down build
 * (`startWindDownIx`, `forceExitIx`, `closeMarketIx`). There is no
 * `claim` since v25: LADLE never leaves the game to a wallet.
 *
 * Account order mirrors each `#[derive(Accounts)]` struct in
 * `programs/pulled/src/instructions/*.rs` exactly. Anchor `Option<...>`
 * accounts are passed as the program id (readonly, non-signer) when absent.
 * Instruction discriminator = sha256("global:<name>")[..8]; arguments are
 * borsh-encoded after it.
 */
import { PublicKey, SystemProgram, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { CreateMarketParams } from "./types.ts";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MAX_PAGE,
  MPL_TOKEN_METADATA_ID,
  ORAO_VRF_ID,
  PLATFORM_TREASURY,
  PULLED_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  concatBytes,
  oraoNetworkStatePda,
  tokenMetadataPda,
  u16Le,
  u32Le,
  u64Le,
} from "./pda.ts";

export function instructionDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8);
}

export const INSTRUCTION_NAMES = [
  "create_integration", "create_market", "open_window", "enter", "seal", "request_vrf", "fulfill",
  "tally_page", "settle_page", "refund_window", "refund_entry", "sell_back", "sell",
  "close_entry", "close_window",
  // wind-down build only
  "start_wind_down", "force_exit", "close_market",
] as const;
export type InstructionName = (typeof INSTRUCTION_NAMES)[number];

const DISC: Record<InstructionName, Uint8Array> = Object.fromEntries(
  INSTRUCTION_NAMES.map((n) => [n, instructionDiscriminator(n)]),
) as Record<InstructionName, Uint8Array>;

export function instructionDiscriminators(): Record<InstructionName, Uint8Array> { return { ...DISC }; }

function encodeString(s: string): Uint8Array {
  const b = new TextEncoder().encode(s);
  return concatBytes(u32Le(b.length), b);
}

export function encodeCreateMarketParams(p: CreateMarketParams): Uint8Array {
  return concatBytes(
    u64Le(p.windowSlots), u64Le(p.vrfTimeoutSlots), u64Le(p.maxEntryAmount), u16Le(p.maxEntryBps),
    u64Le(p.entryFloorAmount), encodeString(p.name), encodeString(p.symbol), encodeString(p.uri),
  );
}

const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });
/** Anchor `Option<Account>`: the program id stands for `None`. */
const opt = (pubkey: PublicKey | null | undefined, writable: boolean, programId: PublicKey): AccountMeta =>
  pubkey ? { pubkey, isSigner: false, isWritable: writable } : r(programId);

function ix(programId: PublicKey, name: InstructionName, keys: AccountMeta[], args: Uint8Array = new Uint8Array(0)): TransactionInstruction {
  return new TransactionInstruction({ programId, keys, data: Buffer.from(concatBytes(DISC[name], args)) });
}

/* ------------------------------ 1 ------------------------------ */

export interface CreateIntegrationAccounts { host: PublicKey; integration: PublicKey }
export function createIntegrationIx(a: CreateIntegrationAccounts, hostFeeBps: number, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "create_integration", [w(a.host, true), w(a.integration), r(SystemProgram.programId)], u16Le(hostFeeBps));
}

/* ------------------------------ 2 ------------------------------ */

export interface CreateMarketAccounts {
  creator: PublicKey;
  /** Fresh keypair; must also sign the transaction. */
  tokenMint: PublicKey;
  quoteMint: PublicKey;
  market: PublicKey;
  tokenVault: PublicKey;
  quoteVault: PublicKey;
  integration?: PublicKey | null;
  quoteTokenProgram: PublicKey;
  /** The treasury the program was built with (`resolveTreasury`); the devnet key when omitted. */
  platformTreasury?: PublicKey;
}
export function createMarketIx(a: CreateMarketAccounts, params: CreateMarketParams, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "create_market", [
    w(a.creator, true),
    w(a.tokenMint, true),
    r(a.quoteMint),
    w(a.market),
    w(a.tokenVault),
    w(a.quoteVault),
    opt(a.integration, false, programId),
    w(a.platformTreasury ?? PLATFORM_TREASURY),
    w(tokenMetadataPda(a.tokenMint)[0]),
    r(MPL_TOKEN_METADATA_ID),
    r(TOKEN_PROGRAM_ID),
    r(a.quoteTokenProgram),
    r(ASSOCIATED_TOKEN_PROGRAM_ID),
    r(SystemProgram.programId),
  ], encodeCreateMarketParams(params));
}

/* ------------------------------ 3 ------------------------------ */

export interface OpenWindowAccounts {
  payer: PublicKey;
  market: PublicKey;
  /** Required when `market.has_active_window`. */
  prevWindow?: PublicKey | null;
  window: PublicKey;
  quoteMint: PublicKey;
  escrow: PublicKey;
  quoteTokenProgram: PublicKey;
}
export function openWindowIx(a: OpenWindowAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "open_window", [
    w(a.payer, true),
    w(a.market),
    opt(a.prevWindow, false, programId),
    w(a.window),
    r(a.quoteMint),
    w(a.escrow),
    r(a.quoteTokenProgram),
    r(ASSOCIATED_TOKEN_PROGRAM_ID),
    r(SystemProgram.programId),
  ]);
}

/* ------------------------------ 4 ------------------------------ */

export interface EnterAccounts {
  owner: PublicKey;
  market: PublicKey;
  window: PublicKey;
  /** PDA ["entry", window, owner] (`entryPda(window, owner)`): one per wallet per window. */
  entry: PublicKey;
  quoteMint: PublicKey;
  ownerQuote: PublicKey;
  escrow: PublicKey;
  quoteTokenProgram: PublicKey;
}
export function enterIx(a: EnterAccounts, amount: bigint, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "enter", [
    w(a.owner, true),
    r(a.market),
    w(a.window),
    w(a.entry),
    r(a.quoteMint),
    w(a.ownerQuote),
    w(a.escrow),
    r(a.quoteTokenProgram),
    r(SystemProgram.programId),
  ], u64Le(amount));
}

/* ------------------------------ 5 ------------------------------ */

export interface SealAccounts { market: PublicKey; window: PublicKey }
export function sealIx(a: SealAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "seal", [w(a.market), w(a.window)]);
}

/* ------------------------------ 6 ------------------------------ */

export interface RequestVrfAccounts {
  payer: PublicKey;
  window: PublicKey;
  /** ORAO network state PDA (defaults to the derivation). */
  networkState?: PublicKey;
  /** `network_state.config.treasury`, read from chain. */
  treasury: PublicKey;
  /** ORAO request PDA for the salted seed (`vrfRequestFor(window.vrf_seed, salt)`). */
  vrfRequest: PublicKey;
}
/** `request_vrf(salt)`: `salt` is 32 bytes, fresh per attempt (`newVrfSalt`). */
export function requestVrfIx(a: RequestVrfAccounts, salt: Uint8Array, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  if (salt.length !== 32) throw new Error("salt must be 32 bytes");
  return ix(programId, "request_vrf", [
    w(a.payer, true),
    w(a.window),
    w(a.networkState ?? oraoNetworkStatePda()[0]),
    w(a.treasury),
    w(a.vrfRequest),
    r(ORAO_VRF_ID),
    r(SystemProgram.programId),
  ], salt);
}

/* ------------------------------ 7 ------------------------------ */

export interface FulfillAccounts { window: PublicKey; vrfRequest: PublicKey }
export function fulfillIx(a: FulfillAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "fulfill", [w(a.window), r(a.vrfRequest)]);
}

/* ------------------------------ 8 ------------------------------ */

export interface TallyPageAccounts {
  payer: PublicKey;
  market: PublicKey;
  window: PublicKey;
  quoteMint: PublicKey;
  escrow: PublicKey;
  quoteVault: PublicKey;
  /** ATA of PLATFORM_TREASURY for the quote mint. */
  platformQuoteAccount: PublicKey;
  /** Any quote token account chosen by the payer; receives the bounty. */
  keeperQuoteAccount: PublicKey;
  integration?: PublicKey | null;
  hostQuoteAccount?: PublicKey | null;
  quoteTokenProgram: PublicKey;
}

function pageRange(from: number, to: number) {
  if (!(from < to)) throw new Error("page range is empty or inverted");
  if (to - from > MAX_PAGE) throw new Error(`page larger than MAX_PAGE (${MAX_PAGE})`);
}

/**
 * The page's Entry accounts, writable: the entries with index from..to-1,
 * in index order (`entries[k]` has index `from + k`). Entry addresses are
 * ["entry", window, owner], so they come from the chain
 * (`PulledClient.getEntries`, sorted by index), not from the index.
 */
export function pageEntryMetas(from: number, to: number, entries: readonly PublicKey[]): AccountMeta[] {
  pageRange(from, to);
  if (entries.length !== to - from) throw new Error(`page [${from}, ${to}) needs ${to - from} entries, got ${entries.length}`);
  return entries.map((e) => w(e));
}

export function tallyPageIx(a: TallyPageAccounts, from: number, to: number, entries: readonly PublicKey[], programId = PULLED_PROGRAM_ID): TransactionInstruction {
  pageRange(from, to);
  return ix(programId, "tally_page", [
    w(a.payer, true),
    w(a.market),
    w(a.window),
    r(a.quoteMint),
    w(a.escrow),
    w(a.quoteVault),
    w(a.platformQuoteAccount),
    w(a.keeperQuoteAccount),
    opt(a.integration, false, programId),
    opt(a.hostQuoteAccount, true, programId),
    r(a.quoteTokenProgram),
    ...pageEntryMetas(from, to, entries),
  ], concatBytes(u32Le(from), u32Le(to)));
}

/* ------------------------------ 9 ------------------------------ */

export interface SettlePageAccounts { market: PublicKey; window: PublicKey }
export function settlePageIx(a: SettlePageAccounts, from: number, to: number, entries: readonly PublicKey[], programId = PULLED_PROGRAM_ID): TransactionInstruction {
  pageRange(from, to);
  return ix(programId, "settle_page", [
    w(a.market),
    w(a.window),
    ...pageEntryMetas(from, to, entries),
  ], concatBytes(u32Le(from), u32Le(to)));
}

/* ------------------------------ 10 ------------------------------ */

export interface RefundWindowAccounts {
  market: PublicKey;
  window: PublicKey;
  /** Required when `window.vrf_requested`. */
  vrfRequest?: PublicKey | null;
}
export function refundWindowIx(a: RefundWindowAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "refund_window", [w(a.market), w(a.window), opt(a.vrfRequest, false, programId)]);
}

/* ------------------------------ 11 ------------------------------ */

export interface RefundEntryAccounts {
  market: PublicKey;
  /** Writable: counts the refund (`refunded_entries`). */
  window: PublicKey;
  entry: PublicKey;
  quoteMint: PublicKey;
  escrow: PublicKey;
  /** Quote token account owned by `entry.owner`. */
  recipient: PublicKey;
  quoteTokenProgram: PublicKey;
}
export function refundEntryIx(a: RefundEntryAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "refund_entry", [
    r(a.market),
    w(a.window),
    w(a.entry),
    r(a.quoteMint),
    w(a.escrow),
    w(a.recipient),
    r(a.quoteTokenProgram),
  ]);
}

/* ------------------------------ 12 ------------------------------ */

/** No Window account: the program reads the entry's market and window index from the Entry. */
export interface SellBackAccounts {
  owner: PublicKey;
  /** `entry.market`. */
  market: PublicKey;
  entry: PublicKey;
  quoteMint: PublicKey;
  quoteVault: PublicKey;
  ownerQuote: PublicKey;
  quoteTokenProgram: PublicKey;
}
/**
 * `sell_back(amount, min_quote_out)`: fails with SlippageExceeded when the
 * sale would pay less than `minQuoteOut` (sales landing first move the
 * price). `minQuoteOut = 0n` accepts any price.
 */
export function sellBackIx(a: SellBackAccounts, amount: bigint, minQuoteOut: bigint, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "sell_back", [
    r(a.owner, true),
    w(a.market),
    w(a.entry),
    r(a.quoteMint),
    w(a.quoteVault),
    w(a.ownerQuote),
    r(a.quoteTokenProgram),
  ], concatBytes(u64Le(amount), u64Le(minQuoteOut)));
}

/* ------------------------------ 13 ------------------------------ */

export interface SellAccounts {
  seller: PublicKey;
  market: PublicKey;
  tokenMint: PublicKey;
  sellerTokenAccount: PublicKey;
  tokenVault: PublicKey;
  quoteMint: PublicKey;
  quoteVault: PublicKey;
  sellerQuote: PublicKey;
  quoteTokenProgram: PublicKey;
}
/** `sell(amount, min_quote_out)` of LADLE held in a wallet (taken out by a pre-v25 claim). */
export function sellIx(a: SellAccounts, amount: bigint, minQuoteOut: bigint, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "sell", [
    r(a.seller, true),
    w(a.market),
    r(a.tokenMint),
    w(a.sellerTokenAccount),
    w(a.tokenVault),
    r(a.quoteMint),
    w(a.quoteVault),
    w(a.sellerQuote),
    r(TOKEN_PROGRAM_ID),
    r(a.quoteTokenProgram),
  ], concatBytes(u64Le(amount), u64Le(minQuoteOut)));
}

/* ------------------------------ 14 ------------------------------ */

export interface CloseEntryAccounts {
  entry: PublicKey;
  /** entry.owner: receives the rent. */
  owner: PublicKey;
}
/** Return a finished entry's rent to its owner (permissionless; no Window account, it may be closed). */
export function closeEntryIx(a: CloseEntryAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "close_entry", [w(a.entry), w(a.owner)]);
}

/* ------------------------------ 15 ------------------------------ */

export interface CloseWindowAccounts {
  market: PublicKey;
  window: PublicKey;
  /** window.opener: receives the rent of the window and of its escrow. */
  opener: PublicKey;
  quoteMint: PublicKey;
  escrow: PublicKey;
  quoteVault: PublicKey;
  quoteTokenProgram: PublicKey;
}
/**
 * Return a finished window's rent (window + escrow) to its opener
 * (permissionless): a Settled window at once, a Refunding window once every
 * stake is refunded. The market is writable: closing its active window
 * clears `has_active_window`.
 */
export function closeWindowIx(a: CloseWindowAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "close_window", [
    w(a.market),
    w(a.window),
    w(a.opener),
    r(a.quoteMint),
    w(a.escrow),
    w(a.quoteVault),
    r(a.quoteTokenProgram),
  ]);
}

/* --------------------- 17-19: shutdown (wind-down build) --------------------- */

/** Start a market's 7-day closing notice (anyone; wind-down build only; once). */
export function startWindDownIx(a: { market: PublicKey }, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "start_wind_down", [w(a.market)]);
}

export interface ForceExitAccounts {
  /** Anyone: puts up the unwrap account's rent for the instruction and gets it back. */
  payer: PublicKey;
  market: PublicKey;
  entry: PublicKey;
  /** entry.owner: receives the payout (as SOL) and the entry's rent. */
  owner: PublicKey;
  /** The entry's window and its escrow, only for a stake still to refund (window Refunding). */
  window?: PublicKey | null;
  escrow?: PublicKey | null;
  quoteMint: PublicKey;
  quoteVault: PublicKey;
  /** `unwrapPda(entry)`: the wSOL account the payout passes through on its way to the owner as SOL. */
  payout: PublicKey;
  quoteTokenProgram: PublicKey;
}
/**
 * After a market's notice: pay what is left in an entry to its owner as SOL
 * (its unsold share sold to the curve, or its unrefunded stake) and close it
 * (anyone; wind-down build only; wSOL markets, i.e. every market this build
 * can create: another quote mint fails with QuoteMintNotWsol).
 */
export function forceExitIx(a: ForceExitAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "force_exit", [
    w(a.payer, true),
    w(a.market),
    w(a.entry),
    w(a.owner),
    opt(a.window, true, programId),
    opt(a.escrow, true, programId),
    r(a.quoteMint),
    w(a.quoteVault),
    w(a.payout),
    r(a.quoteTokenProgram),
    r(SystemProgram.programId),
  ]);
}

export interface CloseMarketAccounts {
  market: PublicKey;
  /** market.creator: receives the rents and the quote left, as SOL. */
  creator: PublicKey;
  tokenMint: PublicKey;
  tokenVault: PublicKey;
  quoteMint: PublicKey;
  quoteVault: PublicKey;
  quoteTokenProgram: PublicKey;
}
/**
 * After the notice, with no round left and no LADLE out: burn the unsold
 * LADLE, close the vaults and the market, everything to the creator
 * (anyone; wind-down build only).
 */
export function closeMarketIx(a: CloseMarketAccounts, programId = PULLED_PROGRAM_ID): TransactionInstruction {
  return ix(programId, "close_market", [
    w(a.market),
    w(a.creator),
    w(a.tokenMint),
    w(a.tokenVault),
    r(a.quoteMint),
    w(a.quoteVault),
    r(TOKEN_PROGRAM_ID),
    r(a.quoteTokenProgram),
  ]);
}

/* --------------------------- decoding helper --------------------------- */

/** Name of a PULLED instruction from its data, or null. */
export function identifyInstruction(data: Uint8Array): InstructionName | null {
  if (data.length < 8) return null;
  outer: for (const name of INSTRUCTION_NAMES) {
    const d = DISC[name];
    for (let i = 0; i < 8; i++) if (d[i] !== data[i]) continue outer;
    return name;
  }
  return null;
}
