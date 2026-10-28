//! Account layouts. All PDAs; seeds are listed on each struct.
//!
//! Mutability summary (enforced by the instruction set, which has no admin
//! and no `set_*`/`update_*`):
//! * `Integration`: immutable after creation.
//! * `Market`: only `curve`, `window_count`, `next_settle_index`,
//!   `has_active_window`/`active_window` ever change.
//! * `Window`: advances through `WindowState` exactly once per state; the
//!   frozen fields (`seed`, `roll_sum`, `tokens_out`, fees) are written once.
//! * `Entry`: `roll` and `share` are written once; `claimed`/`refunded` only
//!   grow. Closed by `close_entry` once nothing is left to claim or refund.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::consts::*;
use crate::law::Curve;

/// seeds = ["integration", host]
#[account]
#[derive(InitSpace, Debug)]
pub struct Integration {
    pub host: Pubkey,
    /// <= MAX_HOST_FEE_BPS (300). Immutable.
    pub host_fee_bps: u16,
    pub bump: u8,
}

/// seeds = ["market", token_mint]
#[account]
#[derive(InitSpace, Debug)]
pub struct Market {
    pub creator: Pubkey,
    pub token_mint: Pubkey,
    pub quote_mint: Pubkey,
    /// Token program that owns `quote_mint` (SPL Token or Token-2022).
    pub quote_program: Pubkey,
    /// `Pubkey::default()` when the market has no integration.
    pub integration: Pubkey,
    /// Constant-product curve with virtual reserves. Moves only in
    /// `tally_page` (finalize buy), `sell_back` and `sell`.
    pub curve: Curve,
    pub window_slots: u64,
    pub vrf_timeout_slots: u64,
    pub max_entry_amount: u64,
    pub max_entry_bps: u16,
    pub entry_floor_amount: u64,
    /// Index the next `open_window` will use.
    pub window_count: u64,
    /// Windows execute the curve strictly in index order; this is the index
    /// of the next window allowed to finalize (or be refunded / sealed empty).
    pub next_settle_index: u64,
    pub has_active_window: bool,
    pub active_window: u64,
    /// ATA of the market PDA for `quote_mint`.
    pub quote_vault: Pubkey,
    /// ATA of the market PDA for `token_mint`.
    pub token_vault: Pubkey,
    pub bump: u8,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_SYMBOL_LEN)]
    pub symbol: String,
    #[max_len(MAX_URI_LEN)]
    pub uri: String,
}

impl Market {
    pub fn signer_seeds(&self) -> [&[u8]; 3] {
        [MARKET_SEED, self.token_mint.as_ref(), std::slice::from_ref(&self.bump)]
    }
}

/// Lifecycle of a window. Transitions:
/// Open -> Sealed -> Drawn -> Tallied -> Settled
/// Open -> Drawn (exactly one entry: its share is the whole buy, no randomness)
/// Open -> Settled (no entries)
/// Sealed -> Refunding (VRF timed out without fulfilling)
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum WindowState {
    Open,
    Sealed,
    Drawn,
    Tallied,
    Settled,
    Refunding,
}

/// seeds = ["window", market, index.to_le_bytes()]
#[account]
#[derive(InitSpace, Debug)]
pub struct Window {
    pub market: Pubkey,
    pub index: u64,
    pub state: WindowState,
    pub open_slot: u64,
    pub close_slot: u64,
    pub sealed_slot: u64,
    /// Sum of all entry amounts (quote base units). Incremented before the
    /// transfer CPI in `enter`.
    pub total_amount: u64,
    pub entry_count: u32,
    /// Running sha256 over every entry (owner, amount, index), folded in
    /// `enter`. Makes the VRF seed depend on the final entry set, so nobody
    /// (ORAO included) can evaluate the draw before the window is closed.
    pub entries_commitment: [u8; 32],
    /// ORAO request seed, fixed at `seal`:
    /// sha256("ladle:vrf:v1" || window || close_slot || entry_count || entries_commitment).
    pub vrf_seed: [u8; 32],
    pub vrf_requested: bool,
    /// Slot of `request_vrf` (0 if never requested). The refund timeout runs
    /// from here once a request exists, from `sealed_slot` otherwise.
    pub vrf_requested_slot: u64,
    /// ORAO randomness account (PDA of the ORAO program for `vrf_seed`).
    pub vrf_request: Pubkey,
    /// The 64 bytes of ORAO randomness. Zero until Drawn.
    pub seed: [u8; 64],
    /// W = sum(amount_i * roll_i). Frozen when tallying finishes.
    pub roll_sum: u128,
    pub tally_cursor: u32,
    pub settle_cursor: u32,
    /// Running cumulative weight of settlement (U256, little-endian).
    pub cum_weight: [u8; 32],
    /// Tokens the curve sold for this window. Frozen at finalize.
    pub tokens_out: u64,
    pub fee_platform: u64,
    pub fee_host: u64,
    pub to_curve: u64,
    /// ATA of the window PDA for the quote mint. Holds the stakes until
    /// finalize (fees + curve) or refunds.
    pub escrow: Pubkey,
    pub bump: u8,
    /// Who paid for open_window; gets the Window + escrow rent back at
    /// close_window.
    pub opener: Pubkey,
    /// Entries closed by close_entry (rent returned to their owners).
    /// close_window requires closed_entries == entry_count.
    pub closed_entries: u32,
}

/// Domain tag of the VRF seed derivation.
pub const VRF_SEED_DOMAIN: &[u8] = b"ladle:vrf:v1";

impl Window {
    pub fn is_open(&self) -> bool {
        self.state == WindowState::Open
    }

    /// `sha256(prev || owner || amount_le || index_le)`; called once per entry.
    pub fn fold_entry_commitment(prev: &[u8; 32], owner: &Pubkey, amount: u64, index: u32) -> [u8; 32] {
        hashv(&[prev, owner.as_ref(), &amount.to_le_bytes(), &index.to_le_bytes()]).to_bytes()
    }

    /// The ORAO request seed. Every input is frozen when the window closes
    /// and none is chosen by the caller of `seal`/`request_vrf`.
    pub fn derive_vrf_seed(
        window: &Pubkey,
        close_slot: u64,
        entry_count: u32,
        entries_commitment: &[u8; 32],
    ) -> [u8; 32] {
        hashv(&[
            VRF_SEED_DOMAIN,
            window.as_ref(),
            &close_slot.to_le_bytes(),
            &entry_count.to_le_bytes(),
            entries_commitment,
        ])
        .to_bytes()
    }

    /// Slot after which `refund_window` may run: the timeout counts from the
    /// request when there is one (so a late request cannot be refunded the
    /// moment it lands), from the seal otherwise (so a window nobody
    /// requested for is still refundable).
    pub fn refund_deadline(&self, vrf_timeout_slots: u64) -> Option<u64> {
        let start = if self.vrf_requested { self.vrf_requested_slot } else { self.sealed_slot };
        start.checked_add(vrf_timeout_slots)
    }
}

/// `enter` cap rule: with `new_total = total + amount`, the entry is allowed
/// when `amount * 10000 <= max_entry_bps * new_total` or when the window is
/// still at or under the floor.
pub fn cap_allows(amount: u64, new_total: u64, max_entry_bps: u16, entry_floor_amount: u64) -> bool {
    // u64 * 10_000 and u16 * u64 both fit in u128.
    let lhs = (amount as u128) * (crate::law::BPS as u128);
    let rhs = (max_entry_bps as u128) * (new_total as u128);
    lhs <= rhs || new_total <= entry_floor_amount
}

/// seeds = ["entry", window, owner]: one entry per wallet per window.
/// `index` is assigned by `enter` in arrival order (the window counter).
#[account]
#[derive(InitSpace, Debug)]
pub struct Entry {
    pub window: Pubkey,
    pub owner: Pubkey,
    pub index: u32,
    pub amount: u64,
    /// In [0, ROLL_MAX]; written by `tally_page`.
    pub roll: u64,
    /// Tokens allotted; written by `settle_page`.
    pub share: u64,
    /// Tokens already claimed or sold back (<= share).
    pub claimed: u64,
    pub refunded: bool,
    pub bump: u8,
}

/// Cursor rule shared by `tally_page` and `settle_page`.
///
/// Returns `Ok(true)` when the page [from, to) must be processed, `Ok(false)`
/// when it is a replay of already-processed entries (no-op success), and an
/// error when it would skip entries or run past the end.
pub fn check_page(cursor: u32, from: u32, to: u32, count: u32) -> Result<bool> {
    require!(from < to, crate::errors::LadleError::PageEmpty);
    // from < to so `to - from` cannot underflow.
    require!(to - from <= MAX_PAGE, crate::errors::LadleError::PageTooLarge);
    if to <= cursor {
        return Ok(false);
    }
    require!(from == cursor, crate::errors::LadleError::PageOutOfOrder);
    require!(to <= count, crate::errors::LadleError::PageBeyondEnd);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEN_KB: usize = 10 * 1024;

    #[test]
    fn account_sizes_under_10kb() {
        assert!(8 + Integration::INIT_SPACE < TEN_KB, "Integration {}", Integration::INIT_SPACE);
        assert!(8 + Market::INIT_SPACE < TEN_KB, "Market {}", Market::INIT_SPACE);
        assert!(8 + Window::INIT_SPACE < TEN_KB, "Window {}", Window::INIT_SPACE);
        assert!(8 + Entry::INIT_SPACE < TEN_KB, "Entry {}", Entry::INIT_SPACE);
    }

    #[test]
    fn window_state_is_one_byte() {
        assert_eq!(WindowState::INIT_SPACE, 1);
        let bytes = anchor_lang::prelude::borsh::to_vec(&WindowState::Refunding).unwrap();
        assert_eq!(bytes, vec![5u8]);
    }

    #[test]
    fn cap_rule() {
        // 10% cap, floor 1000
        assert!(cap_allows(100, 1000, 1000, 1000)); // exactly 10%
        assert!(!cap_allows(101, 1001, 1000, 1000)); // just above, above floor
        assert!(cap_allows(1000, 1000, 1000, 1000)); // first entry within floor
        assert!(!cap_allows(1000, 1000, 1000, 999)); // first entry above floor, 100% > 10%
        assert!(cap_allows(u64::MAX, u64::MAX, 10_000, 0)); // 100% cap never overflows
        assert!(!cap_allows(u64::MAX, u64::MAX, 9_999, 0));
    }

    #[test]
    fn vrf_seed_depends_on_every_input() {
        let w = Pubkey::new_unique();
        let c0 = [0u8; 32];
        let c1 = Window::fold_entry_commitment(&c0, &Pubkey::new_unique(), 5, 0);
        assert_ne!(c1, c0);
        let s = Window::derive_vrf_seed(&w, 100, 1, &c1);
        assert_ne!(s, [0u8; 32]);
        assert_ne!(s, Window::derive_vrf_seed(&w, 101, 1, &c1));
        assert_ne!(s, Window::derive_vrf_seed(&w, 100, 2, &c1));
        assert_ne!(s, Window::derive_vrf_seed(&w, 100, 1, &c0));
        assert_ne!(s, Window::derive_vrf_seed(&Pubkey::new_unique(), 100, 1, &c1));
        assert_eq!(s, Window::derive_vrf_seed(&w, 100, 1, &c1));
    }

    #[test]
    fn refund_deadline_counts_from_request_when_present() {
        let mut w = Window {
            market: Pubkey::default(),
            index: 0,
            state: WindowState::Sealed,
            open_slot: 0,
            close_slot: 50,
            sealed_slot: 50,
            total_amount: 0,
            entry_count: 1,
            entries_commitment: [0; 32],
            vrf_seed: [0; 32],
            vrf_requested: false,
            vrf_requested_slot: 0,
            vrf_request: Pubkey::default(),
            seed: [0; 64],
            roll_sum: 0,
            tally_cursor: 0,
            settle_cursor: 0,
            cum_weight: [0; 32],
            tokens_out: 0,
            fee_platform: 0,
            fee_host: 0,
            to_curve: 0,
            escrow: Pubkey::default(),
            bump: 0,
            opener: Pubkey::default(),
            closed_entries: 0,
        };
        assert_eq!(w.refund_deadline(150), Some(200));
        w.vrf_requested = true;
        w.vrf_requested_slot = 90;
        assert_eq!(w.refund_deadline(150), Some(240));
        assert_eq!(w.refund_deadline(u64::MAX), None);
    }

    #[test]
    fn page_rule() {
        // normal progression
        assert!(check_page(0, 0, 48, 100).unwrap());
        assert!(check_page(48, 48, 96, 100).unwrap());
        // last partial page
        assert!(check_page(96, 96, 100, 100).unwrap());
        // replay: no-op
        assert!(!check_page(48, 0, 48, 100).unwrap());
        assert!(!check_page(100, 96, 100, 100).unwrap());
        // overlap / skip / too big / past end / empty
        assert!(check_page(48, 40, 60, 100).is_err());
        assert!(check_page(48, 49, 60, 100).is_err());
        assert!(check_page(0, 0, 49, 100).is_err());
        assert!(check_page(96, 96, 101, 100).is_err());
        assert!(check_page(0, 5, 5, 100).is_err());
        assert!(check_page(0, 6, 5, 100).is_err());
    }
}
