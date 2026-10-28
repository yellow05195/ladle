use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::WindowDrawn;
use crate::state::{Window, WindowState};
use crate::vrf;

/// `fulfill()`
///
/// * Who: anyone.
/// * State: window `Sealed` with a randomness request; the ORAO randomness
///   account (owner = ORAO program, seed = `window.vrf_seed`, key =
///   `window.vrf_request` as validated by ORAO at request time) must be
///   fulfilled.
/// * Effect: copies the 64 bytes into `window.seed`, state -> `Drawn`.
/// * Never: can be skipped or aborted once the randomness exists: as long as
///   the account is fulfilled, `refund_window` refuses (MustFulfill) and this
///   is the only way forward.
#[derive(Accounts)]
pub struct Fulfill<'info> {
    #[account(
        mut,
        seeds = [WINDOW_SEED, window.market.as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Account<'info, Window>,

    /// CHECK: pinned to the request recorded at `request_vrf`; owner, layout
    /// and seed are validated in vrf.rs.
    #[account(address = window.vrf_request @ LadleError::VrfRequestMismatch)]
    pub vrf_request: UncheckedAccount<'info>,
}

pub fn handle_fulfill(ctx: Context<Fulfill>) -> Result<()> {
    let window = &mut ctx.accounts.window;
    require!(window.state == WindowState::Sealed, LadleError::WrongWindowState);
    require!(window.vrf_requested, LadleError::VrfNotRequested);

    let seed: [u8; 32] = window.vrf_seed;
    let randomness = vrf::read_fulfilled(&ctx.accounts.vrf_request.to_account_info(), &seed)?
        .ok_or(LadleError::VrfNotFulfilled)?;

    window.seed = randomness;
    window.state = WindowState::Drawn;

    emit!(WindowDrawn {
        window: window.key(),
        seed: randomness,
    });
    Ok(())
}
