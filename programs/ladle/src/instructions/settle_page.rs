use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::{EntrySettled, WindowSettled};
use crate::instructions::load_entry;
use crate::law;
use crate::state::{check_page, Market, Window, WindowState};

/// `settle_page(from, to)`
///
/// * Who: anyone.
/// * State: window `Tallied`. Same cursor rule as `tally_page`, on
///   `settle_cursor`. Remaining accounts: Entry PDAs [from, to), writable.
/// * Effect per entry: `w = entry_weight(amount, total, roll, roll_sum)`,
///   `(share, cum) = share_step(tokens_out, weight_sum(total), cum, w)`.
///   Reads only the frozen `total_amount`, `roll_sum`, `tokens_out`.
/// * End: requires `cum == weight_sum(total)` (so the shares sum exactly to
///   `tokens_out`), state -> `Settled`, `market.next_settle_index += 1`.
/// * Never: moves funds or touches the curve.
#[derive(Accounts)]
pub struct SettlePage<'info> {
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

pub fn handle_settle_page<'info>(
    ctx: Context<'info, SettlePage<'info>>,
    from: u32,
    to: u32,
) -> Result<()> {
    let window = &mut ctx.accounts.window;
    let market = &mut ctx.accounts.market;
    let window_key = window.key();

    require!(window.state == WindowState::Tallied, LadleError::WrongWindowState);
    if !check_page(window.settle_cursor, from, to, window.entry_count)? {
        return Ok(());
    }
    let n = (to - from) as usize;
    require!(ctx.remaining_accounts.len() == n, LadleError::PageAccountsMismatch);

    let total = window.total_amount;
    let roll_sum = window.roll_sum;
    let tokens_out = window.tokens_out;
    let weight_sum = law::weight_sum(total);
    let mut cum = law::u256_from_bytes(&window.cum_weight);
    // floor(tokens_out * cum / S), carried from entry to entry (one U256
    // division per entry; identical to law::share_step).
    let mut prev_quota = law::quota(tokens_out, weight_sum, cum)?;

    for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
        // i < n so from + i <= to <= 2048: no overflow.
        let index = from + i as u32;
        let mut entry = load_entry(acc, &window_key, index)?;
        let w = law::entry_weight(entry.amount, total, entry.roll, roll_sum)?;
        let (share, next, q) = law::share_step_carry(tokens_out, weight_sum, cum, prev_quota, w)?;
        cum = next;
        prev_quota = q;
        entry.share = share;
        entry.exit(&crate::ID)?;
        emit!(EntrySettled {
            window: window_key,
            index,
            roll: entry.roll,
            share,
        });
    }

    window.cum_weight = law::u256_to_bytes(cum);
    window.settle_cursor = to;

    if window.settle_cursor == window.entry_count {
        require!(cum == weight_sum, LadleError::WeightSumMismatch);
        require!(window.index == market.next_settle_index, LadleError::SettleOutOfOrder);
        window.state = WindowState::Settled;
        market.next_settle_index = market
            .next_settle_index
            .checked_add(1)
            .ok_or(LadleError::Overflow)?;
        emit!(WindowSettled {
            window: window_key,
            index: window.index,
            tokens_out,
            total,
        });
    }
    Ok(())
}
