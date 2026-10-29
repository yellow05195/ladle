//! Anchor events. Everything an indexer or the browser "recompute" button
//! needs is emitted here or stored in the accounts.

use anchor_lang::prelude::*;

#[event]
pub struct WindowOpened {
    pub market: Pubkey,
    pub window: Pubkey,
    pub index: u64,
    pub open_slot: u64,
    pub close_slot: u64,
}

#[event]
pub struct Entered {
    pub window: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub amount: u64,
    pub total_after: u64,
    pub slot: u64,
}

#[event]
pub struct WindowSealed {
    pub window: Pubkey,
    pub index: u64,
    pub total_amount: u64,
    pub entry_count: u32,
    pub sealed_slot: u64,
    /// True when the window had no entries and went straight to Settled.
    pub empty: bool,
    /// ORAO request seed fixed at seal (zero for an empty window).
    pub vrf_seed: [u8; 32],
}

#[event]
pub struct VrfRequested {
    pub window: Pubkey,
    pub request: Pubkey,
    /// sha256("ladle:vrf:req" || seal seed || salt): the seed ORAO answers.
    pub seed: [u8; 32],
    pub salt: [u8; 32],
    /// Paid ORAO; the window's keeper bounty goes to its quote ATA.
    pub payer: Pubkey,
}

#[event]
pub struct WindowDrawn {
    pub window: Pubkey,
    pub seed: [u8; 64],
}

#[event]
pub struct WindowTallied {
    pub window: Pubkey,
    pub index: u64,
    pub total: u64,
    pub roll_sum: u128,
    pub tokens_out: u64,
    pub to_curve: u64,
    pub fee_platform: u64,
    pub fee_host: u64,
    /// Paid to the finalizer's account; 0 when it went to the treasury (a
    /// window that asked ORAO, finalized with another account than its
    /// request payer's ATA).
    pub keeper_bounty: u64,
}

#[event]
pub struct EntrySettled {
    pub window: Pubkey,
    pub index: u32,
    pub roll: u64,
    pub share: u64,
}

#[event]
pub struct WindowSettled {
    pub window: Pubkey,
    pub index: u64,
    pub tokens_out: u64,
    pub total: u64,
}

/// Emitted by the `claim` instruction of builds before v25 (removed: LADLE
/// no longer leaves the game to a wallet); kept so their history decodes.
#[event]
pub struct Claimed {
    pub window: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SoldBack {
    pub window: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub amount_tokens: u64,
    pub quote_out: u64,
}

#[event]
pub struct Sold {
    pub market: Pubkey,
    pub seller: Pubkey,
    pub amount_tokens: u64,
    pub quote_out: u64,
}

#[event]
pub struct WindowRefunding {
    pub window: Pubkey,
    pub index: u64,
    pub slot: u64,
}

#[event]
pub struct EntryRefunded {
    pub window: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EntryClosed {
    pub window: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
}

#[event]
pub struct WindowClosed {
    pub window: Pubkey,
    pub index: u64,
    pub opener: Pubkey,
    /// Quote found in the escrow at close (sent there from outside) and
    /// swept into the market's quote vault. Zero in normal operation.
    pub dust_swept: u64,
}

/// Wind-down build: a market's notice started.
#[event]
pub struct WindDownStarted {
    pub market: Pubkey,
    /// Cluster clock (unix seconds) when the notice started.
    pub notice_start: i64,
    /// First second `force_exit` / `close_market` may run.
    pub exit_after: i64,
}

/// Wind-down build: an entry paid out to its owner and closed.
#[event]
pub struct ForcedExit {
    pub window: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    /// Unsold share sold to the curve (0 for a refund or a finished entry).
    pub tokens_sold: u64,
    /// Quote paid to the owner: the sale, or the refunded stake (base units).
    pub paid: u64,
    /// True when `paid` is the stake of a refunded round.
    pub refunded: bool,
}

/// Wind-down build: a drained market closed.
#[event]
pub struct MarketClosed {
    pub market: Pubkey,
    pub creator: Pubkey,
    /// LADLE burned from the token vault (the unsold supply).
    pub tokens_burned: u64,
    /// Quote left in the vault (the curve's rounding, anything sent there
    /// from outside), paid to the creator.
    pub quote_left: u64,
}
