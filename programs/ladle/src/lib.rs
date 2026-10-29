//! Ladle — everyone pays into a window counted in slots; after it closes one
//! external random seed (ORAO VRF) decides how the window's single
//! bonding-curve buy is split among the entries; every entry can then sell
//! back to the curve.
//!
//! The program has no admin, no pause, no upgradeable parameters: every fee,
//! bound and timeout is a `pub const` in `consts.rs`/`law.rs` or an immutable
//! field written once at creation. The program account itself stays
//! upgradeable (SECURITY.md §2): whoever holds its upgrade authority can
//! replace all of this. The `wind-down` feature builds the version that stops
//! the game (`consts::WIND_DOWN`): no new round or entry, a 7-day notice per
//! market, then every remaining entry paid out to its owner (`force_exit`)
//! and the market closed (`close_market`), so the program can be closed
//! without leaving any player's money behind.
//!
//! LADLE never leaves the game to a wallet: there is no `claim` (removed in
//! v25). A share stays in the market's vault until its owner sells it back
//! (`sell_back`) or the shutdown sells it for them (`force_exit`).

#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod consts;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod law;
pub mod metadata;
pub mod state;
pub mod vrf;

#[cfg(test)]
mod tests_pages;

use instructions::*;

// The program id: the public key of target/deploy/ladle-keypair.json, the
// same on devnet and mainnet-beta (also in Anchor.toml and sdk/src/pda.ts;
// scripts/ladle-common.ps1 Assert-ProgramId checks all three).
#[cfg(not(feature = "rehearsal"))]
declare_id!("85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj");

// `rehearsal` (devnet shutdown rehearsal only): a separate program id, taken
// from LADLE_REHEARSAL_PROGRAM_ID at build time (the build fails without it),
// and a 10-minute notice (consts::WIND_DOWN_NOTICE_SECS). It cannot be the
// production id (compile-time check below), and Anchor's entrypoint refuses
// to run a program whose declared id is not the address it runs at, so a
// rehearsal build can never run at the mainnet address.
#[cfg(feature = "rehearsal")]
declare_id!(anchor_lang::solana_program::pubkey::Pubkey::from_str_const(env!("LADLE_REHEARSAL_PROGRAM_ID")));

#[cfg(feature = "rehearsal")]
const _: () = {
    let a = ID_CONST.to_bytes();
    let b = consts::PRODUCTION_PROGRAM_ID.to_bytes();
    let mut i = 0;
    let mut same = true;
    while i < 32 {
        if a[i] != b[i] {
            same = false;
        }
        i += 1;
    }
    assert!(!same, "a rehearsal build must not use the production program id");
};

#[program]
pub mod ladle {
    use super::*;

    // The four instructions that bring something new in (an integration, a
    // market, a round, a stake) do not exist in the wind-down build: it
    // answers them with Anchor's InstructionFallbackNotFound (the handlers of
    // the last three also refuse with WindingDown, for a build that would
    // still route them). Leaving them out keeps the wind-down build smaller than the
    // normal one, so the upgrade to it fits the program's data account.

    /// Create an integration record for `host` with an immutable fee.
    #[cfg(any(not(feature = "wind-down"), feature = "idl-build"))]
    pub fn create_integration(ctx: Context<CreateIntegration>, host_fee_bps: u16) -> Result<()> {
        instructions::create_integration::handle_create_integration(ctx, host_fee_bps)
    }

    /// Launch a token + market. Mints the whole supply into the vault, then
    /// drops the mint authority.
    #[cfg(any(not(feature = "wind-down"), feature = "idl-build"))]
    pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
        instructions::create_market::handle_create_market(ctx, params)
    }

    /// Open the next window of a market (permissionless).
    #[cfg(any(not(feature = "wind-down"), feature = "idl-build"))]
    pub fn open_window(ctx: Context<OpenWindow>) -> Result<()> {
        instructions::open_window::handle_open_window(ctx)
    }

    /// Stake `amount` of quote into the open window.
    #[cfg(any(not(feature = "wind-down"), feature = "idl-build"))]
    pub fn enter(ctx: Context<Enter>, amount: u64) -> Result<()> {
        instructions::enter::handle_enter(ctx, amount)
    }

    /// Close entries once `close_slot` is reached (permissionless).
    pub fn seal(ctx: Context<Seal>) -> Result<()> {
        instructions::seal::handle_seal(ctx)
    }

    /// Request ORAO randomness for a sealed window (permissionless); `salt`
    /// makes the requested seed unknown until the request lands.
    pub fn request_vrf(ctx: Context<RequestVrf>, salt: [u8; 32]) -> Result<()> {
        instructions::request_vrf::handle_request_vrf(ctx, salt)
    }

    /// Copy the fulfilled randomness into the window (permissionless).
    pub fn fulfill(ctx: Context<Fulfill>) -> Result<()> {
        instructions::fulfill::handle_fulfill(ctx)
    }

    /// Compute rolls for entries [from, to); the last page executes the curve
    /// buy and pays the fees (permissionless).
    pub fn tally_page<'info>(
        ctx: Context<'info, TallyPage<'info>>,
        from: u32,
        to: u32,
    ) -> Result<()> {
        instructions::tally_page::handle_tally_page(ctx, from, to)
    }

    /// Compute shares for entries [from, to) (permissionless).
    pub fn settle_page<'info>(
        ctx: Context<'info, SettlePage<'info>>,
        from: u32,
        to: u32,
    ) -> Result<()> {
        instructions::settle_page::handle_settle_page(ctx, from, to)
    }

    /// Switch a sealed window whose randomness never arrived to refunds
    /// (permissionless, only after the VRF timeout).
    pub fn refund_window(ctx: Context<RefundWindow>) -> Result<()> {
        instructions::refund_window::handle_refund_window(ctx)
    }

    /// Return one entry's full stake (permissionless).
    pub fn refund_entry(ctx: Context<RefundEntry>) -> Result<()> {
        instructions::refund_entry::handle_refund_entry(ctx)
    }

    /// Sell the unclaimed part of an entry's share straight back to the
    /// curve; fails (`SlippageExceeded`) when it would pay less than
    /// `min_quote_out`.
    pub fn sell_back(ctx: Context<SellBack>, amount: u64, min_quote_out: u64) -> Result<()> {
        instructions::sell_back::handle_sell_back(ctx, amount, min_quote_out)
    }

    /// Sell tokens held in a wallet to the curve (none can reach a wallet
    /// since v25; kept for any taken out by an earlier build); fails
    /// (`SlippageExceeded`) when it would pay less than `min_quote_out`.
    pub fn sell(ctx: Context<Sell>, amount: u64, min_quote_out: u64) -> Result<()> {
        instructions::sell::handle_sell(ctx, amount, min_quote_out)
    }

    /// Return a finished entry's rent to its owner (permissionless; works
    /// after its window is closed).
    pub fn close_entry(ctx: Context<CloseEntry>) -> Result<()> {
        instructions::close_entry::handle_close_entry(ctx)
    }

    /// Return a finished window's rent (window + escrow) to whoever opened it
    /// (permissionless: a Settled window right away, its entries keep their
    /// shares; a Refunding window once every stake is refunded).
    pub fn close_window(ctx: Context<CloseWindow>) -> Result<()> {
        instructions::close_window::handle_close_window(ctx)
    }

    // --- shutdown: in the wind-down build only (and in the IDL) ---

    /// Start a market's notice (permissionless, once): 7 days before
    /// `force_exit` and `close_market` may run.
    #[cfg(any(feature = "wind-down", feature = "idl-build"))]
    pub fn start_wind_down(ctx: Context<StartWindDown>) -> Result<()> {
        instructions::wind_down::handle_start_wind_down(ctx)
    }

    /// After the notice: pay an entry out to its owner as SOL (its unsold
    /// share sold to the curve, or its unrefunded stake) and close it, rent
    /// to the owner (permissionless; wSOL markets, i.e. every market).
    #[cfg(any(feature = "wind-down", feature = "idl-build"))]
    pub fn force_exit(ctx: Context<ForceExit>) -> Result<()> {
        instructions::wind_down::handle_force_exit(ctx)
    }

    /// After the notice, once no round is left and no LADLE is out: close
    /// the market and its vaults, rents to its creator (permissionless).
    #[cfg(any(feature = "wind-down", feature = "idl-build"))]
    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        instructions::wind_down::handle_close_market(ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn program_id_is_valid_base58_key() {
        let k = Pubkey::from_str("85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj").unwrap();
        assert_eq!(k, consts::PRODUCTION_PROGRAM_ID);
        if cfg!(feature = "rehearsal") {
            assert_ne!(k, crate::ID);
        } else {
            assert_eq!(k, crate::ID);
        }
        // the treasury is the build's LADLE_TREASURY, the devnet key without it
        let expected = option_env!("LADLE_TREASURY").unwrap_or("A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat");
        let t = Pubkey::from_str(expected).unwrap();
        assert_eq!(t, consts::PLATFORM_TREASURY);
        assert_eq!(consts::DEVNET_PLATFORM_TREASURY, "A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat");
        assert_ne!(k, t);
    }

    #[test]
    fn the_shutdown_notice_is_seven_days_outside_a_rehearsal() {
        let expected = if cfg!(feature = "rehearsal") { 10 * 60 } else { 7 * 24 * 60 * 60 };
        assert_eq!(consts::WIND_DOWN_NOTICE_SECS, expected);
        // the rehearsal's short notice cannot reach the production program id (lib.rs const check)
        assert!(cfg!(feature = "rehearsal") || crate::ID == consts::PRODUCTION_PROGRAM_ID);
        assert_eq!(consts::NATIVE_MINT.to_string(), "So11111111111111111111111111111111111111112");
    }
}
