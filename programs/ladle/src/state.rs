//! Account layouts. All PDAs; seeds are listed on each struct.
//!
//! Mutability summary (enforced by the instruction set, which has no admin
//! and no `set_*`/`update_*`):
//! * `Integration`: immutable after creation.
//! * `Market`: only `curve`, `window_count`, `next_settle_index`,
//!   `has_active_window`/`active_window` (`close_window` of a finished
//!   active window clears `has_active_window`), `live_windows` (open_window
//!   +1, close_window -1) and `notice_start` (set by the wind-down build's
//!   `start_wind_down`, cleared by every `open_window` of a normal build)
//!   ever change. Closed only by the wind-down build's `close_market`.
//!
//! Upgrades (the program stays upgradeable): Anchor reads an account with
//! borsh from its start, so an account larger than its struct still reads
//! and a smaller one does not. A field appended to a struct therefore breaks
//! every live account made before it. `Market` lives as long as its market
//! and ends with `reserved` for that: a later field is carved out of
//! `reserved` and the size stays (v25 carved `notice_start`, `live_windows`
//! and `counts_windows` out of it; 47 bytes are left). (Its strings are
//! allocated at their maximum length, so a market made before `reserved`
//! existed still reads while its name, symbol and uri leave 64 bytes unused,
//! which every market made by keeper/src/ops/create-market.ts does.)
//! `Window` ends with 64 reserved bytes too (third review): the active
//! window and a Refunding window with stakes not yet refunded outlive a
//! round, and an unreadable one would stop the market's next `open_window`
//! or freeze those refunds. `Entry` has no reserve (its rent is paid by its
//! player); a later change to it must ship with a decoder for the old size
//! (or a realloc migration) in the same upgrade, or every live entry stops
//! being sellable until it does. The sizes are pinned in
//! `account_sizes_are_pinned` below.
//! * `Window`: advances through `WindowState` exactly once per state; the
//!   frozen fields (`seed`, `roll_sum`, `tokens_out`, fees) are written once.
//! * `Entry`: `roll`, `share` and `settled` are written once; `claimed`/
//!   `refunded` only grow (`claimed` counts the share sold back; the name
//!   predates v25, when a share could also be taken to a wallet). Closed by
//!   `close_entry` once nothing is left to sell or refund, or by the
//!   wind-down build's `force_exit`, which pays what is left to the owner.
//!   Everything `sell_back`/`close_entry`/`force_exit` need is in the Entry
//!   (and the Market), so a Settled window can be closed while its entries
//!   are still open.

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
    /// Shutdown notice (wind-down build): the cluster clock (unix seconds)
    /// when `start_wind_down` ran for this market, 0 when no notice runs.
    /// `force_exit` and `close_market` wait for `notice_start +
    /// WIND_DOWN_NOTICE_SECS`. Every `open_window` (normal build) sets it
    /// back to 0, so a shutdown called off by redeploying the normal build
    /// needs a new, full notice. (v25, carved out of `reserved`.)
    pub notice_start: i64,
    /// Windows opened and not yet closed (`open_window` +1, `close_window`
    /// -1), counted when `counts_windows`. `close_market` needs 0: a window
    /// holds its opener's rent and may hold stakes. (v25.)
    pub live_windows: u64,
    /// Set by `create_market` from v25 on: `live_windows` has counted every
    /// window of this market. A market made earlier never closes
    /// (`close_market` refuses it; its entries and windows still pay out
    /// and close as usual). (v25.)
    pub counts_windows: bool,
    /// Zero, never written: room for a field added by an upgrade (see the
    /// module comment).
    pub reserved: [u8; 47],
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
    /// At `seal`, the seal seed:
    /// sha256("ladle:vrf:v1" || window || close_slot || entry_count || entries_commitment).
    /// `request_vrf(salt)` replaces it with the seed it asks ORAO for:
    /// sha256("ladle:vrf:req" || seal seed || salt) (`fulfill` and
    /// `refund_window` read that one).
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
    /// Stakes returned by refund_entry. A Refunding window can be closed only
    /// once refunded_entries == entry_count (refund_entry pays from the
    /// escrow, signed by the window); a Settled window needs no count.
    pub refunded_entries: u32,
    /// Who paid ORAO at `request_vrf` (default key until then): the keeper
    /// bounty of a window that went through ORAO goes to this key's quote
    /// ATA, not to whoever sends the final page.
    pub vrf_payer: Pubkey,
    /// Zero, never written: room for a field added by an upgrade (see the
    /// module comment). Costs the opener 64 bytes of rent per round, back at
    /// `close_window`.
    pub reserved: [u8; 64],
}

/// Domain tag of the VRF seed derivation.
pub const VRF_SEED_DOMAIN: &[u8] = b"ladle:vrf:v1";

/// Domain tag of the seed `request_vrf` asks ORAO for.
pub const VRF_REQUEST_DOMAIN: &[u8] = b"ladle:vrf:req";

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

    /// The seed `request_vrf` asks ORAO for:
    /// sha256("ladle:vrf:req" || seal seed || salt).
    ///
    /// Why a salt: the seal seed is public from `close_slot` on, and ORAO
    /// accepts each seed once (`SeedAlreadyInUse`), from anyone. Requested
    /// directly at ORAO by a stranger first, it could never be drawn for the
    /// window and every round would end in a refund. The salt is chosen by
    /// the requester in the request itself, so nobody can use its seed up
    /// beforehand; a request that loses that race is retried with another
    /// salt. Choosing the salt does not choose the draw: ORAO's output for a
    /// new seed is unknown until ORAO answers it on chain (unless every ORAO
    /// fulfilment authority colludes with the requester: SECURITY.md §3),
    /// and the first request that lands fixes the seed for good
    /// (`VrfAlreadyRequested`).
    pub fn derive_request_seed(seal_seed: &[u8; 32], salt: &[u8; 32]) -> [u8; 32] {
        hashv(&[VRF_REQUEST_DOMAIN, seal_seed, salt]).to_bytes()
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
    /// Tokens of the share already sold back (<= share); before v25 also
    /// those claimed to a wallet.
    pub claimed: u64,
    pub refunded: bool,
    pub bump: u8,
    /// `window.market`, copied by `enter`: `sell_back`/`force_exit` bind the
    /// entry to the market's vaults without reading the Window.
    pub market: Pubkey,
    /// `window.index`, copied by `enter`: compared with the market's
    /// settlement cursor (see `window_settled`).
    pub window_index: u64,
    /// Set by `settle_page` together with `share`: the share is final and
    /// the window went through `Tallied` (so it can never be `Refunding`).
    pub settled: bool,
}

impl Entry {
    /// True once this entry's window is `Settled`, from the Entry and its
    /// Market alone (the Window may already be closed). Windows leave the
    /// settlement queue strictly in index order and only as `Settled` or
    /// `Refunding` (`market.next_settle_index` moves only in `seal` (empty),
    /// `refund_window` and the last `settle_page`, each for the window at the
    /// cursor), so `window_index < next_settle_index` means the window is
    /// Settled or Refunding for good; `settled` rules out Refunding. Callers
    /// pass `market.next_settle_index` of the market they checked against
    /// `entry.market` (has_one).
    pub fn window_settled(&self, next_settle_index: u64) -> bool {
        self.settled && self.window_index < next_settle_index
    }
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
    fn account_sizes_are_pinned() {
        // what is deployed (sdk ACCOUNT_SIZES): a change here breaks live accounts
        assert_eq!(8 + Integration::INIT_SPACE, 43);
        assert_eq!(8 + Market::INIT_SPACE, 626);
        assert_eq!(8 + Window::INIT_SPACE, 507);
        assert_eq!(8 + Entry::INIT_SPACE, 151);
    }

    fn market_with(name: &str, symbol: &str, uri: &str) -> Market {
        Market {
            creator: Pubkey::new_unique(),
            token_mint: Pubkey::new_unique(),
            quote_mint: Pubkey::new_unique(),
            quote_program: Pubkey::new_unique(),
            integration: Pubkey::default(),
            curve: Curve { x: INITIAL_VIRTUAL_X, y: INITIAL_VIRTUAL_Y },
            window_slots: 560,
            vrf_timeout_slots: 900,
            max_entry_amount: 5_000_000_000,
            max_entry_bps: 2_000,
            entry_floor_amount: 500_000_000,
            window_count: 7,
            next_settle_index: 6,
            has_active_window: true,
            active_window: 6,
            quote_vault: Pubkey::new_unique(),
            token_vault: Pubkey::new_unique(),
            bump: 254,
            name: name.into(),
            symbol: symbol.into(),
            uri: uri.into(),
            notice_start: 0,
            live_windows: 0,
            counts_windows: false,
            reserved: [0; 47],
        }
    }

    #[test]
    fn a_market_made_before_reserved_still_reads() {
        // the 562-byte market of the build before `reserved` (devnet), with the
        // strings create-market.ts writes: the reserve reads from the string slack
        let m = market_with("Ladle", "LADLE", "https://useladle.fun/token.json");
        let mut data = Vec::new();
        m.try_serialize(&mut data).unwrap();
        data.truncate(data.len() - 64); // the old layout ends at `uri`
        data.resize(562, 0);
        let back = Market::try_deserialize(&mut &data[..]).unwrap();
        assert_eq!(back.reserved, [0u8; 47]);
        // the v25 fields read as zero: no notice, an uncounted market (never closable)
        assert_eq!((back.notice_start, back.live_windows, back.counts_windows), (0, 0, false));
        assert_eq!(back.uri, m.uri);
        assert_eq!(back.window_count, 7);
        // and it writes back into the same 562 bytes
        let mut out = Vec::new();
        back.try_serialize(&mut out).unwrap();
        assert!(out.len() <= 562);
        // strings at their maximum leave no slack: such an old market would not read
        let full = market_with(&"n".repeat(MAX_NAME_LEN), &"s".repeat(MAX_SYMBOL_LEN), &"u".repeat(MAX_URI_LEN));
        let mut data = Vec::new();
        full.try_serialize(&mut data).unwrap();
        data.truncate(data.len() - 64);
        assert_eq!(data.len(), 562);
        assert!(Market::try_deserialize(&mut &data[..]).is_err());
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
    fn request_seed_is_salted_and_never_the_seal_seed() {
        let seal = Window::derive_vrf_seed(&Pubkey::new_unique(), 100, 3, &[7u8; 32]);
        let a = Window::derive_request_seed(&seal, &[1u8; 32]);
        let b = Window::derive_request_seed(&seal, &[2u8; 32]);
        // a pre-request of the public seal seed does not touch the seed asked for
        assert_ne!(a, seal);
        assert_ne!(a, b);
        assert_ne!(a, [0u8; 32]);
        // domain separated from the seal derivation, and bound to the seal seed
        assert_ne!(a, Window::derive_request_seed(&[0u8; 32], &[1u8; 32]));
        assert_eq!(a, hashv(&[b"ladle:vrf:req", &seal, &[1u8; 32]]).to_bytes());
        assert_eq!(a, Window::derive_request_seed(&seal, &[1u8; 32]));
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
            refunded_entries: 0,
            vrf_payer: Pubkey::default(),
            reserved: [0; 64],
        };
        assert_eq!(w.refund_deadline(150), Some(200));
        w.vrf_requested = true;
        w.vrf_requested_slot = 90;
        assert_eq!(w.refund_deadline(150), Some(240));
        assert_eq!(w.refund_deadline(u64::MAX), None);
    }

    #[test]
    fn entry_window_settled_needs_flag_and_cursor() {
        let mut e = Entry {
            window: Pubkey::default(),
            owner: Pubkey::default(),
            index: 0,
            amount: 1,
            roll: 0,
            share: 0,
            claimed: 0,
            refunded: false,
            bump: 0,
            market: Pubkey::default(),
            window_index: 7,
            settled: false,
        };
        // a Refunding window's entries are never settled, whatever the cursor
        assert!(!e.window_settled(8));
        assert!(!e.window_settled(u64::MAX));
        e.settled = true;
        // settled entry, window still at the cursor (Tallied, pages pending)
        assert!(!e.window_settled(7));
        assert!(!e.window_settled(0));
        // the cursor moved past the window: Settled
        assert!(e.window_settled(8));
        assert!(e.window_settled(u64::MAX));
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
