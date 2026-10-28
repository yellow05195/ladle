use anchor_lang::prelude::*;

// No #[msg] strings: they cost ~4.4 KB of program (rent) for text the logs
// already carry as the variant name ("Error Code: AlreadyEntered"). The
// sentences below are doc comments only; the client-side copy is
// PULLED_ERROR_MESSAGES in sdk/src/errors.ts. Codes are positional: append
// new variants at the end.
#[error_code]
pub enum LadleError {
    // --- creation ---
    /// host fee above the hard maximum (300 bps)
    HostFeeTooHigh,
    /// window_slots out of [MIN_WINDOW_SLOTS, MAX_WINDOW_SLOTS]
    WindowSlotsOutOfRange,
    /// vrf_timeout_slots must be >= MIN_VRF_TIMEOUT_SLOTS and > window_slots
    VrfTimeoutOutOfRange,
    /// max_entry_bps out of [500, 10000]
    MaxEntryBpsOutOfRange,
    /// max_entry_amount must be > 0
    MaxEntryAmountZero,
    /// name/symbol/uri too long
    MetadataTooLong,
    /// quote mint has a freeze authority
    QuoteMintHasFreezeAuthority,
    /// quote mint carries the TransferFeeConfig extension
    QuoteMintHasTransferFee,
    /// quote mint carries the TransferHook extension
    QuoteMintHasTransferHook,
    /// quote mint carries the PermanentDelegate extension
    QuoteMintHasPermanentDelegate,
    /// quote mint is owned by neither SPL Token nor Token-2022
    QuoteMintUnknownProgram,

    // --- windows ---
    /// an open window already exists for this market
    WindowStillOpen,
    /// the given previous window does not match the market's active window
    WrongPreviousWindow,
    /// window is not in the state this instruction requires
    WrongWindowState,
    /// window close slot reached: entries are closed
    WindowClosed,
    /// window close slot not reached yet
    WindowNotClosed,
    /// window is full
    WindowFull,
    /// amount must be > 0
    ZeroAmount,
    /// amount above max_entry_amount
    EntryTooLarge,
    /// entry would exceed max_entry_bps of the window total
    EntryAboveCap,
    /// windows settle strictly in index order; a previous window is still pending
    SettleOutOfOrder,

    // --- vrf ---
    /// randomness already requested for this window
    VrfAlreadyRequested,
    /// randomness not requested for this window
    VrfNotRequested,
    /// randomness account not fulfilled yet
    VrfNotFulfilled,
    /// randomness account does not belong to the ORAO VRF program
    VrfBadOwner,
    /// randomness account has an unknown layout
    VrfBadAccountData,
    /// randomness account seed does not match the window
    VrfSeedMismatch,
    /// randomness account key does not match window.vrf_request
    VrfRequestMismatch,
    /// ORAO network state account is invalid
    VrfBadNetworkState,
    /// treasury does not match the ORAO network state
    VrfBadTreasury,
    /// the randomness exists: the window must be fulfilled, not refunded
    MustFulfill,
    /// randomness was requested but the ORAO request account is missing
    VrfRequestMissing,
    /// vrf timeout not reached
    VrfTimeoutNotReached,
    /// derived vrf seed is zero (ORAO rejects zero seeds)
    VrfSeedZero,

    // --- pagination ---
    /// page range is empty or inverted
    PageEmpty,
    /// page larger than MAX_PAGE
    PageTooLarge,
    /// page does not start at the cursor (no skipping)
    PageOutOfOrder,
    /// page extends past entry_count
    PageBeyondEnd,
    /// remaining accounts do not match the page size
    PageAccountsMismatch,
    /// entry account is not writable
    EntryNotWritable,
    /// entry account is not the expected PDA
    InvalidEntryPda,
    /// cumulative weight does not equal the weight sum at the end of settlement
    WeightSumMismatch,

    // --- user paths ---
    /// entry already refunded
    AlreadyRefunded,
    /// recipient token account is not owned by the entry owner
    RecipientNotOwner,
    /// nothing left to claim or sell back
    NothingToClaim,
    /// quote vault cannot cover this sale
    InsufficientQuoteLiquidity,
    /// integration account missing or does not match the market
    IntegrationMismatch,
    /// host quote token account is not the host's associated token account
    HostAccountMismatch,
    /// platform quote token account is not the platform treasury's associated token account
    PlatformAccountMismatch,

    /// arithmetic overflow
    Overflow,

    // --- cleanup (appended: existing codes unchanged) ---
    /// entry still has tokens to claim or a stake to refund
    EntryNotClosable,
    /// every entry of the window must be closed first
    EntriesStillOpen,
    /// the market's active window cannot be closed
    WindowIsActive,

    // --- crowd entering (appended: existing codes unchanged) ---
    /// this wallet already has an entry in this window
    AlreadyEntered,
}
