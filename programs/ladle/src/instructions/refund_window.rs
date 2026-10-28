use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::WindowRefunding;
use crate::state::{Market, Window, WindowState};
use crate::vrf;

/// `refund_window()`
///
/// * Who: anyone.
/// * State: window `Sealed`, `clock.slot > start + vrf_timeout_slots` where
///   `start` is `vrf_requested_slot` if a request exists and `sealed_slot`
///   otherwise, and the window is next in settlement order. If randomness was
///   requested, `vrf_request` must be that account and it must exist with
///   the Pending tag: a fulfilled account fails with `MustFulfill` (call
///   `fulfill` instead: the draw cannot be dodged once it exists) and a
///   missing/empty account fails with `VrfRequestMissing` (it was created
///   together with the request, so empty means closed after the fact).
/// * Effect: state -> `Refunding`; `market.next_settle_index += 1` (a
///   refunded window never touches the curve).
/// * Never: possible while the randomness could still arrive before the
///   timeout, or once the window is `Drawn`.
#[derive(Accounts)]
pub struct RefundWindow<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        has_one = market,
        seeds = [WINDOW_SEED, market.key().as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Account<'info, Window>,

    /// CHECK: required when `window.vrf_requested`; must equal
    /// `window.vrf_request`; parsed in vrf.rs.
    pub vrf_request: Option<UncheckedAccount<'info>>,
}

pub fn handle_refund_window(ctx: Context<RefundWindow>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let window = &mut ctx.accounts.window;

    require!(window.state == WindowState::Sealed, LadleError::WrongWindowState);
    let slot = Clock::get()?.slot;
    let deadline = window
        .refund_deadline(market.vrf_timeout_slots)
        .ok_or(LadleError::Overflow)?;
    require!(slot > deadline, LadleError::VrfTimeoutNotReached);
    require!(window.index == market.next_settle_index, LadleError::SettleOutOfOrder);

    if window.vrf_requested {
        let req = ctx
            .accounts
            .vrf_request
            .as_ref()
            .ok_or(LadleError::VrfRequestMismatch)?;
        require!(req.key() == window.vrf_request, LadleError::VrfRequestMismatch);
        let seed: [u8; 32] = window.vrf_seed;
        // The request account was created in the same transaction that set
        // `vrf_requested`; only an existing, still-pending request may be
        // refunded. Missing means it was closed after the fact (see vrf.rs).
        match vrf::read_state(&req.to_account_info(), &seed)? {
            vrf::VrfRequestState::Pending => {}
            vrf::VrfRequestState::Fulfilled(_) => return err!(LadleError::MustFulfill),
            vrf::VrfRequestState::Missing => return err!(LadleError::VrfRequestMissing),
        }
    }

    window.state = WindowState::Refunding;
    market.next_settle_index = market
        .next_settle_index
        .checked_add(1)
        .ok_or(LadleError::Overflow)?;

    emit!(WindowRefunding {
        window: window.key(),
        index: window.index,
        slot,
    });
    Ok(())
}
