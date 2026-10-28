/**
 * Compute units and transaction sizes for the keeper side.
 *
 * Compute units were measured on LiteSVM with the mainnet feature set
 * (tests/cu-bench, program built with opt-level "z", 397,832 bytes), CPIs
 * included. The limits below add a margin on top of the worst case seen
 * over windows of 1 to 2048 entries; the hard ceiling of a transaction is
 * 1,400,000.
 *
 * Page sizes: an Entry is a remaining account, 32 bytes of a 1232-byte
 * legacy transaction each, so a page that fits a legacy transaction is far
 * below the program's MAX_PAGE (48, which needs an address lookup table).
 * The sizes are checked by serialising the worst case in sdk/test.
 */
import { ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";

/** Measured maxima (compute units), LiteSVM, mainnet features. */
export const MEASURED_CU = {
  enter: 47_705,
  openWindow: 61_466,
  seal: 17_157,
  fulfill: 9_604,
  /** non-final page of 48 entries */
  tallyPage48: 229_409,
  /** final page (fee payout CPIs) of 32 entries */
  tallyFinalPage32: 175_983,
  settlePage48: 528_738,
  sellBack: 29_901,
  claim: 24_818,
  closeEntry: 13_470,
  closeWindow: 21_052,
} as const;

export const MAX_TX_COMPUTE_UNITS = 1_400_000;

/** Limit to request for a `tally_page` of `n` entries (final page included). */
export function tallyPageComputeUnits(n: number): number {
  return Math.min(MAX_TX_COMPUTE_UNITS, 60_000 + 5_000 * n);
}

/** Limit to request for a `settle_page` of `n` entries. */
export function settlePageComputeUnits(n: number): number {
  return Math.min(MAX_TX_COMPUTE_UNITS, 60_000 + 12_000 * n);
}

export const SEAL_COMPUTE_UNITS = 25_000;
export const FULFILL_COMPUTE_UNITS = 15_000;
export const OPEN_WINDOW_COMPUTE_UNITS = 80_000;

/** `ComputeBudgetProgram.setComputeUnitLimit`, capped at the transaction maximum. */
export function computeUnitLimitIx(units: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(MAX_TX_COMPUTE_UNITS, Math.ceil(units)) });
}

/**
 * Entries per `tally_page` in one legacy transaction (with a compute-unit
 * limit instruction, a market with a host integration, the fee accounts
 * already created: `PulledClient.feeAccountsInstructions`).
 */
export const TALLY_PAGE_LEGACY = 20;
/** Entries per `settle_page` in one legacy transaction (with a compute-unit limit instruction). */
export const SETTLE_PAGE_LEGACY = 28;
/**
 * Windows up to this many entries settle in ONE legacy transaction once the
 * randomness is there: fulfill + tally_page(0, n) + settle_page(0, n) (the
 * Entry accounts are shared by the two pages).
 */
export const ONE_TX_SETTLE_MAX = 17;
