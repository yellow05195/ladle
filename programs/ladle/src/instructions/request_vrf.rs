use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::VrfRequested;
use crate::state::{Window, WindowState};
use crate::vrf;

/// `request_vrf(salt)`
///
/// * Who: anyone; the payer pays the ORAO request fee and the request
///   account rent, and is recorded as `vrf_payer`: the keeper bounty of this
///   window goes to its quote ATA (`tally_page`). The CPI hands ORAO the
///   payer's signature; whatever ORAO takes is checked afterwards against
///   `MAX_VRF_REQUEST_COST_LAMPORTS` (`VrfRequestTooCostly`), so a raised
///   ORAO fee or a changed ORAO program cannot take the payer's balance.
/// * State: window `Sealed` (never `Open`: entries must be closed before any
///   randomness is asked for) and not yet requested.
/// * Seed: `sha256("ladle:vrf:req" || seal seed || salt)`
///   (`Window::derive_request_seed`), where the seal seed was fixed at
///   `seal` from the window key, its close slot, its entry count and the
///   entries commitment. It replaces `window.vrf_seed`; the salt is in the
///   `VrfRequested` event, so anyone can recompute it. The salt exists
///   because the seal seed is public: requested at ORAO first by anyone, it
///   could never be drawn (see `derive_request_seed`). A request whose
///   salted seed was taken meanwhile fails; retry with another salt.
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

    /// CHECK: ORAO randomness request PDA for the salted seed; validated by
    /// the ORAO program's seeds constraint during the CPI.
    #[account(mut)]
    pub vrf_request: UncheckedAccount<'info>,

    /// CHECK: pinned to the ORAO VRF program id.
    #[account(address = vrf::ORAO_VRF_ID)]
    pub vrf_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_request_vrf(ctx: Context<RequestVrf>, salt: [u8; 32]) -> Result<()> {
    let window = &mut ctx.accounts.window;
    require!(window.state == WindowState::Sealed, LadleError::WrongWindowState);
    require!(!window.vrf_requested, LadleError::VrfAlreadyRequested);

    let seed = Window::derive_request_seed(&window.vrf_seed, &salt);
    // ORAO refuses a zero seed
    require!(seed != [0u8; 32], LadleError::VrfSeedZero);
    let slot = Clock::get()?.slot;

    let before = ctx.accounts.payer.lamports();
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
    // the runtime updates the payer's lamports after the CPI
    let spent = before.saturating_sub(ctx.accounts.payer.lamports());
    require!(spent <= MAX_VRF_REQUEST_COST_LAMPORTS, LadleError::VrfRequestTooCostly);

    window.vrf_seed = seed;
    window.vrf_requested = true;
    window.vrf_requested_slot = slot;
    window.vrf_request = ctx.accounts.vrf_request.key();
    window.vrf_payer = ctx.accounts.payer.key();

    emit!(VrfRequested {
        window: window.key(),
        request: window.vrf_request,
        seed,
        salt,
        payer: window.vrf_payer,
    });
    Ok(())
}
