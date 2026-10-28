//! Hard-coded program constants. None of these can be changed by any
//! instruction: there is no admin, no config account and no `set_*`.

use anchor_lang::prelude::*;

/// Receives the market creation fee (lamports) and the platform fee (quote
/// tokens, into its associated token account for each market's quote mint).
///
/// DEVNET: the Ladle devnet deployer. For mainnet, replace with the owner's
/// treasury key and rebuild (also sdk/src/pda.ts PLATFORM_TREASURY).
pub const PLATFORM_TREASURY: Pubkey = pubkey!("A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat");

/// Paid once by the market creator, in SOL, to `PLATFORM_TREASURY`.
pub const MARKET_CREATION_FEE_LAMPORTS: u64 = 50_000_000;

/// Decimals of every launched token.
pub const TOKEN_DECIMALS: u8 = 6;

/// Total supply of every launched token (base units): 1,000,000,000 tokens.
/// Minted once into the market's token vault; the mint authority is then set
/// to `None`, so this is also the maximum supply forever.
pub const TOKEN_SUPPLY: u64 = 1_000_000_000 * 1_000_000;

/// Initial virtual quote reserve of the curve, in quote base units
/// (30 SOL-equivalent for a 9-decimal quote mint).
pub const INITIAL_VIRTUAL_X: u64 = 30 * 1_000_000_000;

/// Initial virtual token reserve of the curve.
///
/// Equal to `TOKEN_SUPPLY` on purpose: the curve can never sell more than
/// `INITIAL_VIRTUAL_Y - 1` tokens (its reserve stays >= 1), so the token vault
/// can always honour every claim. A virtual reserve larger than the real
/// supply (pump.fun style 1.073e9) would need a graduation/cap mechanism,
/// which this program does not have.
pub const INITIAL_VIRTUAL_Y: u64 = TOKEN_SUPPLY;

// Compile-time proof of the claim above.
const _: () = assert!(INITIAL_VIRTUAL_Y <= TOKEN_SUPPLY);

/// Window length bounds (slots).
pub const MIN_WINDOW_SLOTS: u64 = 25;
pub const MAX_WINDOW_SLOTS: u64 = 600;

/// Minimum time (slots) after sealing before a window without randomness
/// can switch to refunds.
pub const MIN_VRF_TIMEOUT_SLOTS: u64 = 150;

/// `max_entry_bps` bounds: an entry may be at most this share of the window.
pub const MIN_MAX_ENTRY_BPS: u16 = 500;
pub const MAX_MAX_ENTRY_BPS: u16 = 10_000;

/// Entries per window, hard cap.
pub const MAX_ENTRIES_PER_WINDOW: u32 = 2048;

/// Maximum entries per tally/settle page.
pub const MAX_PAGE: u32 = 48;

/// Bounded metadata strings stored in the Market account.
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;

/// PDA seeds.
pub const INTEGRATION_SEED: &[u8] = b"integration";
pub const MARKET_SEED: &[u8] = b"market";
pub const WINDOW_SEED: &[u8] = b"window";
pub const ENTRY_SEED: &[u8] = b"entry";
