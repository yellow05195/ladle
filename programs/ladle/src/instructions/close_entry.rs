use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::EntryClosed;
use crate::state::Entry;

/// `close_entry()`
///
/// * Who: anyone. The rent always goes back to `entry.owner`, never to the
///   caller, so a keeper can sweep closed-out entries for their owners.
/// * State, read from the Entry alone (its window may already be closed):
///   `settled` with the whole share claimed or sold back (`claimed == share`,
///   which includes a zero share), or `refunded`.
/// * Effect: closes the Entry (rent -> owner). Nothing a later instruction
///   needs is lost: `settled` means the share is final (settle_page never
///   revisits an index) and `claimed == share` means nothing is left of it;
///   `refunded` means the stake is back; `Entered`, `EntrySettled`,
///   `SoldBack`/`EntryRefunded` events carry the full record. The
///   address cannot come back: only `enter` creates it, on an Open window.
/// * Never: closes an entry that still has tokens to sell or a stake to
///   refund (the wind-down build's `force_exit` pays those out first);
///   pays anyone but the owner.
#[derive(Accounts)]
pub struct CloseEntry<'info> {
    #[account(
        mut,
        has_one = owner,
        close = owner,
        seeds = [ENTRY_SEED, entry.window.as_ref(), entry.owner.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Box<Account<'info, Entry>>,

    /// CHECK: must equal `entry.owner` (has_one above); only receives lamports.
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
}

pub fn handle_close_entry(ctx: Context<CloseEntry>) -> Result<()> {
    let entry = &ctx.accounts.entry;
    // A settled entry was never refunded and a refunded one never settled
    // (Refunding comes from Sealed, settlement from Tallied).
    let closable = entry.refunded || (entry.settled && entry.claimed == entry.share);
    require!(closable, LadleError::EntryNotClosable);

    emit!(EntryClosed {
        window: entry.window,
        index: entry.index,
        owner: entry.owner,
    });
    Ok(())
}
