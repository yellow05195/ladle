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
    pub seed: [u8; 32],
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
