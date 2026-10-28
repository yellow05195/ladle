/**
 * Decoded account and event types of the PULLED program.
 *
 * Field names mirror `programs/pulled/src/state.rs` and `events.rs` in
 * camelCase; integer widths follow the Rust types (u64/u128 -> bigint,
 * u32/u16/u8 -> number).
 */
import type { PublicKey } from "@solana/web3.js";
import type { Curve } from "./law.ts";

/** `WindowState` enum, one byte on chain in this order. */
export const WindowState = {
  Open: 0,
  Sealed: 1,
  Drawn: 2,
  Tallied: 3,
  Settled: 4,
  Refunding: 5,
} as const;
export type WindowState = (typeof WindowState)[keyof typeof WindowState];
export const WINDOW_STATE_NAMES = ["Open", "Sealed", "Drawn", "Tallied", "Settled", "Refunding"] as const;
export type WindowStateName = (typeof WINDOW_STATE_NAMES)[number];

export interface Integration {
  host: PublicKey;
  hostFeeBps: number;
  bump: number;
}

export interface Market {
  creator: PublicKey;
  tokenMint: PublicKey;
  quoteMint: PublicKey;
  quoteProgram: PublicKey;
  /** `PublicKey.default` when the market has no integration. */
  integration: PublicKey;
  curve: Curve;
  windowSlots: bigint;
  vrfTimeoutSlots: bigint;
  maxEntryAmount: bigint;
  maxEntryBps: number;
  entryFloorAmount: bigint;
  windowCount: bigint;
  nextSettleIndex: bigint;
  hasActiveWindow: boolean;
  activeWindow: bigint;
  quoteVault: PublicKey;
  tokenVault: PublicKey;
  bump: number;
  name: string;
  symbol: string;
  uri: string;
}

export interface Window {
  market: PublicKey;
  index: bigint;
  state: WindowState;
  openSlot: bigint;
  closeSlot: bigint;
  sealedSlot: bigint;
  totalAmount: bigint;
  entryCount: number;
  entriesCommitment: Uint8Array;
  vrfSeed: Uint8Array;
  vrfRequested: boolean;
  vrfRequestedSlot: bigint;
  vrfRequest: PublicKey;
  /** 64 bytes of ORAO randomness; all zero until Drawn. */
  seed: Uint8Array;
  rollSum: bigint;
  tallyCursor: number;
  settleCursor: number;
  cumWeight: Uint8Array;
  tokensOut: bigint;
  feePlatform: bigint;
  feeHost: bigint;
  toCurve: bigint;
  escrow: PublicKey;
  bump: number;
  /** Who paid for open_window; receives the rent back at close_window. */
  opener: PublicKey;
  /** Entries closed by close_entry. close_window needs closedEntries == entryCount. */
  closedEntries: number;
}

export interface Entry {
  window: PublicKey;
  owner: PublicKey;
  index: number;
  amount: bigint;
  roll: bigint;
  share: bigint;
  claimed: bigint;
  refunded: boolean;
  bump: number;
}

/** An account together with its address. */
export interface Keyed<T> {
  pubkey: PublicKey;
  account: T;
}

export interface CreateMarketParams {
  windowSlots: bigint;
  vrfTimeoutSlots: bigint;
  maxEntryAmount: bigint;
  maxEntryBps: number;
  entryFloorAmount: bigint;
  name: string;
  symbol: string;
  uri: string;
}

/* ------------------------------- events ------------------------------- */

export interface WindowOpenedEvent { name: "WindowOpened"; market: PublicKey; window: PublicKey; index: bigint; openSlot: bigint; closeSlot: bigint }
export interface EnteredEvent { name: "Entered"; window: PublicKey; index: number; owner: PublicKey; amount: bigint; totalAfter: bigint; slot: bigint }
export interface WindowSealedEvent { name: "WindowSealed"; window: PublicKey; index: bigint; totalAmount: bigint; entryCount: number; sealedSlot: bigint; empty: boolean; vrfSeed: Uint8Array }
export interface VrfRequestedEvent { name: "VrfRequested"; window: PublicKey; request: PublicKey; seed: Uint8Array }
export interface WindowDrawnEvent { name: "WindowDrawn"; window: PublicKey; seed: Uint8Array }
export interface WindowTalliedEvent { name: "WindowTallied"; window: PublicKey; index: bigint; total: bigint; rollSum: bigint; tokensOut: bigint; toCurve: bigint; feePlatform: bigint; feeHost: bigint; keeperBounty: bigint }
export interface EntrySettledEvent { name: "EntrySettled"; window: PublicKey; index: number; roll: bigint; share: bigint }
export interface WindowSettledEvent { name: "WindowSettled"; window: PublicKey; index: bigint; tokensOut: bigint; total: bigint }
export interface ClaimedEvent { name: "Claimed"; window: PublicKey; index: number; owner: PublicKey; amount: bigint }
export interface SoldBackEvent { name: "SoldBack"; window: PublicKey; index: number; owner: PublicKey; amountTokens: bigint; quoteOut: bigint }
export interface SoldEvent { name: "Sold"; market: PublicKey; seller: PublicKey; amountTokens: bigint; quoteOut: bigint }
export interface WindowRefundingEvent { name: "WindowRefunding"; window: PublicKey; index: bigint; slot: bigint }
export interface EntryRefundedEvent { name: "EntryRefunded"; window: PublicKey; index: number; owner: PublicKey; amount: bigint }

export interface EntryClosedEvent { name: "EntryClosed"; window: PublicKey; index: number; owner: PublicKey }
export interface WindowClosedEvent { name: "WindowClosed"; window: PublicKey; index: bigint; opener: PublicKey; dustSwept: bigint }

export type PulledEvent =
  | WindowOpenedEvent | EnteredEvent | WindowSealedEvent | VrfRequestedEvent | WindowDrawnEvent
  | WindowTalliedEvent | EntrySettledEvent | WindowSettledEvent | ClaimedEvent | SoldBackEvent
  | SoldEvent | WindowRefundingEvent | EntryRefundedEvent | EntryClosedEvent | WindowClosedEvent;

export type PulledEventName = PulledEvent["name"];

/** Result of `verifyWindow`: every roll and share recomputed off chain. */
export interface EntryVerification {
  index: number;
  owner: PublicKey;
  amount: bigint;
  onChainRoll: bigint;
  expectedRoll: bigint;
  rollMatch: boolean;
  onChainShare: bigint;
  expectedShare: bigint;
  shareMatch: boolean;
}

export interface WindowVerification {
  window: PublicKey;
  state: WindowState;
  /** True only when the window is Settled and every check below passed. */
  ok: boolean;
  entries: EntryVerification[];
  rollSumMatch: boolean;
  /** sum(expected shares) == window.tokens_out (exact conservation). */
  sharesSumToTokensOut: boolean;
  feesMatch: boolean;
  hostFeeBps: number;
  notes: string[];
}
