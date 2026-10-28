use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::{WindowDrawn, WindowSealed};
use crate::state::{Market, Window, WindowState};

/// `seal()`
///
/// * Who: anyone.
/// * State: window `Open` and `clock.slot >= close_slot`.
/// * Effect, by entry count:
///   - 0 entries -> `Settled` directly and the market's settlement cursor
///     advances; this requires the window to be the next in settlement order
///     (`index == market.next_settle_index`), otherwise retry once the
///     previous window has finalized or refunded.
///   - 1 entry -> `Drawn` directly, with an all-zero `seed` and no ORAO
///     request. A lone entry's weight is the whole weight sum
///     (`w = a * (a * (ROLL_MAX + r) - a * r) = ROLL_MAX * a^2 = S`), so its
///     share is the whole curve buy whatever its roll: there is nothing to
///     draw, and nothing to refund either (no randomness to wait for).
///   - 2 or more -> `Sealed` and the ORAO seed is fixed as
///     sha256("ladle:vrf:v1" || window || close_slot || entry_count ||
///     entries_commitment) (randomness can now be requested).
/// * Never: moves funds or touches the curve.
#[derive(Accounts)]
pub struct Seal<'info> {
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
}

pub fn handle_seal(ctx: Context<Seal>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let window = &mut ctx.accounts.window;

    require!(window.state == WindowState::Open, LadleError::WrongWindowState);
    let slot = Clock::get()?.slot;
    require!(slot >= window.close_slot, LadleError::WindowNotClosed);

    let empty = window.entry_count == 0;
    if empty {
        require!(window.index == market.next_settle_index, LadleError::SettleOutOfOrder);
        window.state = WindowState::Settled;
        market.next_settle_index = market
            .next_settle_index
            .checked_add(1)
            .ok_or(LadleError::Overflow)?;
    } else if window.entry_count == 1 {
        // No draw needed (see above): `seed` stays all zero, `vrf_seed` too.
        window.state = WindowState::Drawn;
    } else {
        // Fix the ORAO seed now: every input is final once entries are closed
        // and none of them is chosen by whoever calls seal/request_vrf.
        let seed = Window::derive_vrf_seed(
            &window.key(),
            window.close_slot,
            window.entry_count,
            &window.entries_commitment,
        );
        require!(seed != [0u8; 32], LadleError::VrfSeedZero);
        window.vrf_seed = seed;
        window.state = WindowState::Sealed;
    }
    window.sealed_slot = slot;

    emit!(WindowSealed {
        window: window.key(),
        index: window.index,
        total_amount: window.total_amount,
        entry_count: window.entry_count,
        sealed_slot: slot,
        empty,
        vrf_seed: window.vrf_seed,
    });
    if window.state == WindowState::Drawn {
        emit!(WindowDrawn {
            window: window.key(),
            seed: window.seed,
        });
    }
    Ok(())
}
