use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::WindowClosed;
use crate::state::{Market, Window, WindowState};

/// `close_window()`
///
/// * Who: anyone. The rent of the Window and of its escrow always goes back
///   to `window.opener` (whoever paid for `open_window`), never to the caller.
/// * State: window `Settled` (its entries may still be open: `force_exit`,
///   `sell_back` and `close_entry` read only the Entry and the Market), or
///   `Refunding` with every stake refunded (`refunded_entries ==
///   entry_count`: `refund_entry` pays from the escrow, signed by the
///   window). The market's active window too, in those states: the market
///   then has no active window (`has_active_window = false`), and the next
///   `open_window` needs no `prev_window` (it only reads one to check that
///   the active window is past `Open`, which a finished one is). Before
///   the second review the active window could never be closed, so the last
///   round of a market kept its rent (Window + escrow, ~0.006 SOL) for good.
/// * Effect: `market.live_windows -= 1` (counted markets; `close_market`
///   waits for 0). Any quote left in the escrow (only possible if someone sent
///   tokens to it directly: the stakes left at finalize or by refund) is
///   swept into the market's quote vault, then the escrow and the Window are
///   closed.
/// * Never: closes a Refunding window with a stake still in the escrow, or
///   pays anyone but the opener. A closed window's PDA is never created
///   again (`open_window` only creates index `window_count`, which only
///   grows), so no entry can be added to it.
#[derive(Accounts)]
pub struct CloseWindow<'info> {
    /// Writable: closing the active window clears `has_active_window`.
    #[account(
        mut,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        has_one = market,
        has_one = escrow,
        has_one = opener,
        close = opener,
        seeds = [WINDOW_SEED, market.key().as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Box<Account<'info, Window>>,

    /// CHECK: must equal `window.opener` (has_one above); only receives lamports.
    #[account(mut)]
    pub opener: UncheckedAccount<'info>,

    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = market.quote_vault)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_window(ctx: Context<CloseWindow>) -> Result<()> {
    let window = &ctx.accounts.window;

    match window.state {
        WindowState::Settled => {}
        WindowState::Refunding => require!(
            window.refunded_entries == window.entry_count,
            LadleError::EntriesStillOpen
        ),
        _ => return err!(LadleError::WrongWindowState),
    }
    // A finished active window: the market no longer has one (see above).
    let market = &mut ctx.accounts.market;
    if market.has_active_window && market.active_window == window.index {
        market.has_active_window = false;
    }
    // every window of a counted market was counted by its open_window
    if market.counts_windows {
        market.live_windows = market.live_windows.checked_sub(1).ok_or(LadleError::Overflow)?;
    }

    let market_key = market.key();
    let index_bytes = window.index.to_le_bytes();
    let bump = [window.bump];
    let signer_seeds: &[&[u8]] = &[WINDOW_SEED, market_key.as_ref(), &index_bytes, &bump];
    let program = ctx.accounts.quote_token_program.key();

    let dust = ctx.accounts.escrow.amount;
    if dust > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                program,
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.quote_mint.to_account_info(),
                    to: ctx.accounts.quote_vault.to_account_info(),
                    authority: window.to_account_info(),
                },
                &[signer_seeds],
            ),
            dust,
            ctx.accounts.quote_mint.decimals,
        )?;
    }

    token_interface::close_account(CpiContext::new_with_signer(
        program,
        CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.opener.to_account_info(),
            authority: window.to_account_info(),
        },
        &[signer_seeds],
    ))?;

    emit!(WindowClosed {
        window: window.key(),
        index: window.index,
        opener: window.opener,
        dust_swept: dust,
    });
    Ok(())
}
