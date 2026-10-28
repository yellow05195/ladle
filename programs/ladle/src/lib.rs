//! Ladle — everyone pays into a window counted in slots; after it closes one
//! external random seed (ORAO VRF) decides how the window's single
//! bonding-curve buy is split among the entries; every entry can then sell
//! back to the curve.
//!
//! The program has no admin, no pause, no upgradeable parameters: every fee,
//! bound and timeout is a `pub const` in `consts.rs`/`law.rs` or an immutable
//! field written once at creation.

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

// PLACEHOLDER program id: replace with the deploy keypair before deploying
// (also in Anchor.toml).
declare_id!("85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj");

#[program]
pub mod ladle {
    use super::*;

    /// Create an integration record for `host` with an immutable fee.
    pub fn create_integration(ctx: Context<CreateIntegration>, host_fee_bps: u16) -> Result<()> {
        instructions::create_integration::handle_create_integration(ctx, host_fee_bps)
    }

    /// Launch a token + market. Mints the whole supply into the vault, then
    /// drops the mint authority.
    pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
        instructions::create_market::handle_create_market(ctx, params)
    }

    /// Open the next window of a market (permissionless).
    pub fn open_window(ctx: Context<OpenWindow>) -> Result<()> {
        instructions::open_window::handle_open_window(ctx)
    }

    /// Stake `amount` of quote into the open window.
    pub fn enter(ctx: Context<Enter>, amount: u64) -> Result<()> {
        instructions::enter::handle_enter(ctx, amount)
    }

    /// Close entries once `close_slot` is reached (permissionless).
    pub fn seal(ctx: Context<Seal>) -> Result<()> {
        instructions::seal::handle_seal(ctx)
    }

    /// Request ORAO randomness for a sealed window (permissionless).
    pub fn request_vrf(ctx: Context<RequestVrf>) -> Result<()> {
        instructions::request_vrf::handle_request_vrf(ctx)
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

    /// Withdraw the unclaimed part of an entry's share.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }

    /// Sell the unclaimed part of an entry's share straight back to the curve.
    pub fn sell_back(ctx: Context<SellBack>, amount: u64) -> Result<()> {
        instructions::sell_back::handle_sell_back(ctx, amount)
    }

    /// Sell tokens held in a wallet to the curve.
    pub fn sell(ctx: Context<Sell>, amount: u64) -> Result<()> {
        instructions::sell::handle_sell(ctx, amount)
    }

    /// Return a finished entry's rent to its owner (permissionless).
    pub fn close_entry(ctx: Context<CloseEntry>) -> Result<()> {
        instructions::close_entry::handle_close_entry(ctx)
    }

    /// Return a finished window's rent (window + escrow) to whoever opened it
    /// (permissionless, once every entry is closed).
    pub fn close_window(ctx: Context<CloseWindow>) -> Result<()> {
        instructions::close_window::handle_close_window(ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn program_id_is_valid_base58_key() {
        let k = Pubkey::from_str("85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj").unwrap();
        assert_eq!(k, crate::ID);
        let t = Pubkey::from_str("A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat").unwrap();
        assert_eq!(t, consts::PLATFORM_TREASURY);
        assert_ne!(k, t);
    }
}
