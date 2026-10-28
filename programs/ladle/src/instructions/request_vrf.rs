use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::VrfRequested;
use crate::state::{Window, WindowState};
use crate::vrf;

/// `request_vrf()`
///
/// * Who: anyone; the payer pays the ORAO request fee and the request
///   account rent.
/// * State: window `Sealed` (never `Open`: entries must be closed before any
///   randomness is asked for) and not yet requested.
/// * Seed: `window.vrf_seed`, fixed at `seal` from the window key, its
///   close slot, its entry count and the entries commitment: unique per
///   window, recomputable by anyone, chosen by nobody.
/// * Never: reads any chain entropy. The randomness comes only from ORAO.
///   The only clock read is the slot, recorded as `vrf_requested_slot` for
///   the refund timeout.
#[derive(Accounts)]
pub struct RequestVrf<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [WINDOW_SEED, window.market.as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Account<'info, Window>,

    /// CHECK: ORAO network state PDA; owner + discriminator checked in vrf.rs
    /// and by the ORAO program itself.
    #[account(mut)]
    pub network_state: UncheckedAccount<'info>,

    /// CHECK: must equal `network_state.config.treasury` (checked in vrf.rs).
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: ORAO randomness request PDA for seed = window.vrf_seed; validated by
    /// the ORAO program's seeds constraint during the CPI.
    #[account(mut)]
    pub vrf_request: UncheckedAccount<'info>,

    /// CHECK: pinned to the ORAO VRF program id.
    #[account(address = vrf::ORAO_VRF_ID)]
    pub vrf_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_request_vrf(ctx: Context<RequestVrf>) -> Result<()> {
    let window = &mut ctx.accounts.window;
    require!(window.state == WindowState::Sealed, LadleError::WrongWindowState);
    require!(!window.vrf_requested, LadleError::VrfAlreadyRequested);

    let seed: [u8; 32] = window.vrf_seed;
    let slot = Clock::get()?.slot;

    vrf::request(
        vrf::RequestAccounts {
            payer: &ctx.accounts.payer.to_account_info(),
            network_state: &ctx.accounts.network_state.to_account_info(),
            treasury: &ctx.accounts.treasury.to_account_info(),
            request: &ctx.accounts.vrf_request.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
            vrf_program: &ctx.accounts.vrf_program.to_account_info(),
        },
        seed,
    )?;

    window.vrf_requested = true;
    window.vrf_requested_slot = slot;
    window.vrf_request = ctx.accounts.vrf_request.key();

    emit!(VrfRequested {
        window: window.key(),
        request: window.vrf_request,
        seed,
    });
    Ok(())
}
