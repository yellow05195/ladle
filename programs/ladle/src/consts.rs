//! Hard-coded program constants. None of these can be changed by any
//! instruction: there is no admin, no config account and no `set_*`.

use anchor_lang::prelude::*;

/// Treasury of a build made without `LADLE_TREASURY`: the Ladle devnet
/// deployer.
pub const DEVNET_PLATFORM_TREASURY: &str = "A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat";

/// Receives the market creation fee (lamports) and the platform fee (quote
/// tokens, into its associated token account for each market's quote mint).
///
/// Fixed at BUILD time from the `LADLE_TREASURY` environment variable
/// (base58), `DEVNET_PLATFORM_TREASURY` when it is unset:
/// `LADLE_TREASURY=<key> cargo build-sbf ...` (docs/DEPLOY.md). The string is
/// decoded at compile time, so a malformed key fails the build; cargo
/// rebuilds when the variable changes. Clients pass the same key
/// (sdk `resolveTreasury`); a different one fails on chain without moving
/// funds.
pub const PLATFORM_TREASURY: Pubkey = Pubkey::from_str_const(match option_env!("LADLE_TREASURY") {
    Some(key) => key,
    None => DEVNET_PLATFORM_TREASURY,
});

// The all-zero key is the System Program: never a treasury.
const _: () = {
    let b = PLATFORM_TREASURY.to_bytes();
    let mut i = 0;
    let mut zero = true;
    while i < 32 {
        if b[i] != 0 {
            zero = false;
        }
        i += 1;
    }
    assert!(!zero, "LADLE_TREASURY is the all-zero key");
};

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

/// Maximum VRF timeout (slots, about 32 min at today's ~0.21 s a slot). Without a
/// bound a market could be created whose refunds never open (`u64::MAX`
/// overflows `refund_deadline`), and since windows settle in order, one
/// round that is never drawn would hold every later stake for good.
pub const MAX_VRF_TIMEOUT_SLOTS: u64 = 9_000;

/// Windows opened and not yet out of the settlement queue
/// (`window_count - next_settle_index`) at which `open_window` stops. The
/// queue moves strictly in index order: if one round cannot finish (a final
/// page that keeps failing, a draw that never comes), every later round
/// waits behind it, so new rounds must stop taking stakes instead of
/// piling them up. Normal running keeps 1 to 3 in flight (the open round,
/// the one drawing, an ORAO delay); an ORAO outage with the 900-slot
/// timeout about 4.
pub const MAX_WINDOWS_IN_FLIGHT: u64 = 8;

/// Most `request_vrf` may take from its payer (lamports), measured across
/// the ORAO CPI: ORAO's fee and the request account's rent, 4,955,160 on
/// mainnet and devnet on 2026-10-28 (0.0005 SOL fee + 4,455,160 for 749
/// bytes, of which ORAO returns 3,108,960 at fulfilment): about twice
/// that. ORAO's fee lives in ORAO's own mutable network state and its
/// program is upgradeable; past this the request fails (the round refunds
/// after its timeout) instead of taking the payer's balance.
pub const MAX_VRF_REQUEST_COST_LAMPORTS: u64 = 10_000_000;

/// `wind-down` build (`cargo build-sbf --features wind-down`): the build the
/// operator upgrades to to stop the game (docs/LAUNCH.md, "Arrêter le
/// jeu"). It refuses `create_market`, `open_window` and `enter`
/// (`WindingDown`), so no money can come in; every other instruction (seal,
/// draw, settle, refund, sell back, sell, close) works as in the normal
/// build, and it adds the three shutdown instructions: `start_wind_down`
/// (starts a market's notice), then, once the notice is over, `force_exit`
/// (pays an entry out to its owner) and `close_market`. Always false in the
/// normal build, where the check compiles away and the three shutdown
/// instructions do not exist.
pub const WIND_DOWN: bool = cfg!(feature = "wind-down");

/// Notice between `start_wind_down` and the first `force_exit` /
/// `close_market` of a market, in seconds of the cluster clock: 7 days.
/// Players exit by themselves during it (sell back, refunds); after it the
/// keeper pays every remaining entry out to its owner's wallet.
///
/// The `rehearsal` feature (devnet only) shortens it to 10 minutes; such a
/// build cannot carry the production program id (see lib.rs), so it can
/// never run at the mainnet address.
pub const WIND_DOWN_NOTICE_SECS: i64 = if cfg!(feature = "rehearsal") { 10 * 60 } else { 7 * 24 * 60 * 60 };

/// The production program id (mainnet-beta and the long-lived devnet
/// deployment). A `rehearsal` build must declare another one.
pub const PRODUCTION_PROGRAM_ID: Pubkey = Pubkey::from_str_const("85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj");

/// Wrapped SOL: the only quote mint `create_market` accepts (final review,
/// `check_quote_mint`), so `force_exit` always pays out in plain SOL to the
/// owner's wallet (unwrapped on the way), which nobody can block.
pub const NATIVE_MINT: Pubkey = Pubkey::from_str_const("So11111111111111111111111111111111111111112");

/// Smallest stake `enter` accepts (quote base units: 0.1 SOL on a wSOL
/// market). A round with two entries asks ORAO for randomness, which costs
/// its requester about 0.00186 SOL (fee, request rent, transactions); at this
/// minimum the 1 % platform fee of the smallest such round (0.002 SOL) covers
/// it, so dust entries cannot make the operator pay for draws. Every
/// market's `max_entry_amount` must be at least this.
pub const MIN_ENTRY_AMOUNT: u64 = 100_000_000;

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
/// ["unwrap", entry]: the token account `force_exit` opens and closes in the
/// same instruction to turn a wSOL payout into SOL for the entry's owner.
pub const UNWRAP_SEED: &[u8] = b"unwrap";
