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
/// * State: window `Settled` or `Refunding`, every entry closed
///   (`closed_entries == entry_count`, immediately true for an empty window),
///   and the window is not the market's active window (`open_window` reads
///   the active window as `prev_window`).
/// * Effect: any quote left in the escrow (only possible if someone sent
///   tokens to it directly: the stakes left at finalize or by refund) is
///   swept into the market's quote vault, then the escrow and the Window are
///   closed.
/// * Never: closes a window with an entry still open, or pays anyone but the
///   opener.
#[derive(Accounts)]
pub struct CloseWindow<'info> {
    #[account(
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
    let market = &ctx.accounts.market;
    let window = &ctx.accounts.window;

    require!(
        matches!(window.state, WindowState::Settled | WindowState::Refunding),
        LadleError::WrongWindowState
    );
    require!(window.closed_entries == window.entry_count, LadleError::EntriesStillOpen);
    require!(
        !(market.has_active_window && market.active_window == window.index),
        LadleError::WindowIsActive
    );

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
