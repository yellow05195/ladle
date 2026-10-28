/**
 * `LadleError` codes, in declaration order of `programs/ladle/src/errors.rs`\n * (checked against the IDL by tests/idl-sdk-consistency.ts).
 * Anchor numbers custom errors from 6000 upwards.
 */
export const PULLED_ERRORS = [
  "HostFeeTooHigh", "WindowSlotsOutOfRange", "VrfTimeoutOutOfRange", "MaxEntryBpsOutOfRange", "MaxEntryAmountZero",
  "MetadataTooLong", "QuoteMintHasFreezeAuthority", "QuoteMintHasTransferFee", "QuoteMintHasTransferHook",
  "QuoteMintHasPermanentDelegate", "QuoteMintUnknownProgram",
  "WindowStillOpen", "WrongPreviousWindow", "WrongWindowState", "WindowClosed", "WindowNotClosed", "WindowFull",
  "ZeroAmount", "EntryTooLarge", "EntryAboveCap", "SettleOutOfOrder",
  "VrfAlreadyRequested", "VrfNotRequested", "VrfNotFulfilled", "VrfBadOwner", "VrfBadAccountData", "VrfSeedMismatch",
  "VrfRequestMismatch", "VrfBadNetworkState", "VrfBadTreasury", "MustFulfill", "VrfRequestMissing", "VrfTimeoutNotReached", "VrfSeedZero",
  "PageEmpty", "PageTooLarge", "PageOutOfOrder", "PageBeyondEnd", "PageAccountsMismatch", "EntryNotWritable",
  "InvalidEntryPda", "WeightSumMismatch",
  "AlreadyRefunded", "RecipientNotOwner", "NothingToClaim", "InsufficientQuoteLiquidity", "IntegrationMismatch",
  "HostAccountMismatch", "PlatformAccountMismatch",
  "Overflow",
  "EntryNotClosable", "EntriesStillOpen", "WindowIsActive",
  "AlreadyEntered",
] as const;
export type PulledErrorName = (typeof PULLED_ERRORS)[number];

export const ANCHOR_ERROR_BASE = 6000;

/**
 * Human sentences for every error. The program carries no #[msg] strings
 * (they cost program bytes, i.e. deploy rent): its logs say
 * "Error Code: <Name>", and clients show the sentence from here.
 */
export const PULLED_ERROR_MESSAGES: Record<PulledErrorName, string> = {
  HostFeeTooHigh: "host fee above the hard maximum (300 bps)",
  WindowSlotsOutOfRange: "window length out of the allowed range",
  VrfTimeoutOutOfRange: "randomness timeout too short or not longer than the window",
  MaxEntryBpsOutOfRange: "per-entry cap out of [5 %, 100 %]",
  MaxEntryAmountZero: "maximum entry amount must be above zero",
  MetadataTooLong: "token name, symbol or uri too long",
  QuoteMintHasFreezeAuthority: "the quote token has a freeze authority",
  QuoteMintHasTransferFee: "the quote token charges a transfer fee",
  QuoteMintHasTransferHook: "the quote token has a transfer hook",
  QuoteMintHasPermanentDelegate: "the quote token has a permanent delegate",
  QuoteMintUnknownProgram: "the quote token is not an SPL token",
  WindowStillOpen: "the current round is still open",
  WrongPreviousWindow: "wrong previous round",
  WrongWindowState: "the round is not at the step this action needs",
  WindowClosed: "this round is closed to new entries",
  WindowNotClosed: "this round is still open",
  WindowFull: "this round is full (2048 entries)",
  ZeroAmount: "the amount must be above zero",
  EntryTooLarge: "amount above the maximum entry",
  EntryAboveCap: "amount above the per-entry share of this round",
  SettleOutOfOrder: "an earlier round settles first",
  VrfAlreadyRequested: "randomness already requested for this round",
  VrfNotRequested: "randomness not requested yet",
  VrfNotFulfilled: "randomness not delivered yet",
  VrfBadOwner: "the randomness account does not belong to ORAO",
  VrfBadAccountData: "the randomness account has an unknown layout",
  VrfSeedMismatch: "the randomness account is for another round",
  VrfRequestMismatch: "this is not the round's randomness request",
  VrfBadNetworkState: "invalid ORAO network state",
  VrfBadTreasury: "wrong ORAO treasury",
  MustFulfill: "the randomness exists: the round must be drawn, not refunded",
  VrfRequestMissing: "the round's randomness request account is missing",
  VrfTimeoutNotReached: "the randomness timeout is not reached yet",
  VrfSeedZero: "derived randomness seed is zero",
  PageEmpty: "empty page",
  PageTooLarge: "page larger than 48 entries",
  PageOutOfOrder: "page does not start at the cursor",
  PageBeyondEnd: "page runs past the last entry",
  PageAccountsMismatch: "page accounts do not match the page size",
  EntryNotWritable: "entry account not writable",
  InvalidEntryPda: "not the expected entry account",
  WeightSumMismatch: "weights do not add up at the end of settlement",
  AlreadyRefunded: "this entry was already refunded",
  RecipientNotOwner: "the refund must go to the entry's owner",
  NothingToClaim: "nothing left to claim or sell back",
  InsufficientQuoteLiquidity: "the curve's vault cannot cover this sale",
  IntegrationMismatch: "wrong host integration for this market",
  HostAccountMismatch: "wrong host fee account",
  PlatformAccountMismatch: "wrong platform fee account",
  Overflow: "arithmetic overflow",
  EntryNotClosable: "this entry still has tokens to claim or a stake to refund",
  EntriesStillOpen: "every entry of the round must be closed first",
  WindowIsActive: "the current round cannot be closed",
  AlreadyEntered: "this wallet already has an entry in this round",
};

export function errorMessage(name: PulledErrorName): string {
  return PULLED_ERROR_MESSAGES[name];
}

export function errorCode(name: PulledErrorName): number {
  return ANCHOR_ERROR_BASE + PULLED_ERRORS.indexOf(name);
}

export function errorName(code: number): PulledErrorName | null {
  const i = code - ANCHOR_ERROR_BASE;
  return i >= 0 && i < PULLED_ERRORS.length ? PULLED_ERRORS[i]! : null;
}

/**
 * Extract the PULLED error from anything web3.js throws (SendTransactionError
 * message, simulation logs, confirm result). Returns null when it is not one
 * of ours.
 */
export function parseProgramError(err: unknown): { code: number; name: PulledErrorName | null } | null {
  const texts: string[] = [];
  if (err instanceof Error) texts.push(err.message);
  else texts.push(String(err));
  const logs = (err as { logs?: unknown })?.logs;
  if (Array.isArray(logs)) texts.push(...logs.map(String));
  const transactionLogs = (err as { transactionLogs?: unknown })?.transactionLogs;
  if (Array.isArray(transactionLogs)) texts.push(...transactionLogs.map(String));
  const all = texts.join("\n");
  const named = /Error Code: (\w+)\. Error Number: (\d+)/.exec(all);
  if (named) {
    const code = Number(named[2]);
    return { code, name: errorName(code) ?? (PULLED_ERRORS as readonly string[]).includes(named[1]!) ? (named[1] as PulledErrorName) : null };
  }
  const hex = /custom program error: 0x([0-9a-fA-F]+)/.exec(all);
  if (hex) {
    const code = parseInt(hex[1]!, 16);
    return { code, name: errorName(code) };
  }
  const json = /"Custom":\s*(\d+)/.exec(all);
  if (json) {
    const code = Number(json[1]);
    return { code, name: errorName(code) };
  }
  return null;
}

/**
 * A sentence for anything a send/simulate throws: the program error's
 * sentence when it is one of ours (also the client-side `AlreadyEntered`
 * check of `PulledClient.enter`), the raw message otherwise.
 */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.startsWith("AlreadyEntered:")) return PULLED_ERROR_MESSAGES.AlreadyEntered;
  const p = parseProgramError(err);
  return p?.name ? PULLED_ERROR_MESSAGES[p.name] : raw;
}
