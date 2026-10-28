use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::EntryClosed;
use crate::state::{Entry, Window, WindowState};

/// `close_entry()`
///
/// * Who: anyone. The rent always goes back to `entry.owner`, never to the
///   caller, so a keeper can sweep closed-out entries for their owners.
/// * State: window `Settled` with the whole share claimed or sold back
///   (`claimed == share`, which includes a zero share), or window
///   `Refunding` with the stake refunded.
/// * Effect: closes the Entry (rent -> owner), `window.closed_entries += 1`.
///   Nothing a later instruction needs is lost: `Entered`, `EntrySettled`,
///   `Claimed`/`SoldBack`/`EntryRefunded` events carry the full record.
/// * Never: closes an entry that still has tokens to claim or a stake to
///   refund; pays anyone but the owner.
#[derive(Accounts)]
pub struct CloseEntry<'info> {
    #[account(
        mut,
        seeds = [WINDOW_SEED, window.market.as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Box<Account<'info, Window>>,

    #[account(
        mut,
        has_one = window,
        has_one = owner,
        close = owner,
        seeds = [ENTRY_SEED, window.key().as_ref(), entry.owner.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Box<Account<'info, Entry>>,

    /// CHECK: must equal `entry.owner` (has_one above); only receives lamports.
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
}

pub fn handle_close_entry(ctx: Context<CloseEntry>) -> Result<()> {
    let window = &mut ctx.accounts.window;
    let entry = &ctx.accounts.entry;
    let closable = match window.state {
        WindowState::Settled => entry.claimed == entry.share,
        WindowState::Refunding => entry.refunded,
        _ => false,
    };
    require!(closable, LadleError::EntryNotClosable);

    // closed_entries <= entry_count <= 2048: cannot overflow, stay checked.
    window.closed_entries = window.closed_entries.checked_add(1).ok_or(LadleError::Overflow)?;

    emit!(EntryClosed {
        window: window.key(),
        index: entry.index,
        owner: entry.owner,
    });
    Ok(())
}
