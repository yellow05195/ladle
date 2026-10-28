use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TransferChecked};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::Claimed;
use crate::state::{Entry, Market, Window, WindowState};

/// `claim()`
///
/// * Who: the entry owner (signer).
/// * State: window `Settled`, `share - claimed > 0`.
/// * Effect: transfers `share - claimed` tokens from the market's token
///   vault to `owner_token_account`; `claimed = share`.
/// * Never: blocked by any authority or flag; the only signer is the owner.
#[derive(Accounts)]
pub struct Claim<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        has_one = market,
        seeds = [WINDOW_SEED, market.key().as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Account<'info, Window>,

    #[account(
        mut,
        has_one = window,
        has_one = owner,
        seeds = [ENTRY_SEED, window.key().as_ref(), entry.owner.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Account<'info, Entry>,

    #[account(address = market.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = market.token_vault)]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = token_mint, token::token_program = token_program)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let window = &ctx.accounts.window;
    let entry = &mut ctx.accounts.entry;
    require!(window.state == WindowState::Settled, LadleError::WrongWindowState);

    // claimed <= share always (both paths that raise `claimed` cap at share).
    let amount = entry.share.checked_sub(entry.claimed).ok_or(LadleError::Overflow)?;
    require!(amount > 0, LadleError::NothingToClaim);
    entry.claimed = entry.share;

    let market = &ctx.accounts.market;
    let seeds = market.signer_seeds();
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.token_vault.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: market.to_account_info(),
            },
            &[&seeds],
        ),
        amount,
        TOKEN_DECIMALS,
    )?;

    emit!(Claimed {
        window: window.key(),
        index: entry.index,
        owner: entry.owner,
        amount,
    });
    Ok(())
}
