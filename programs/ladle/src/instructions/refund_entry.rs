use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::EntryRefunded;
use crate::state::{Entry, Market, Window, WindowState};

/// `refund_entry()`
///
/// * Who: anyone (the owner does not need to sign). The recipient must be
///   the owner's associated token account for the quote mint, owned by
///   `entry.owner`: the account the site, wallets and the keeper look at.
///   (Before the second review any token account the owner owned was
///   accepted, and anyone can create one for a wallet without its
///   signature: a stranger could refund into an account the player never
///   sees.)
/// * State: window `Refunding`, entry not yet refunded.
/// * Effect: transfers the FULL `entry.amount` from escrow to the recipient
///   (no fee is ever taken on a refunded window); `refunded = true`;
///   `window.refunded_entries += 1` (close_window waits for every refund).
/// * Never: blocked by anything other than the window not being in
///   `Refunding`. No pause, no authority.
#[derive(Accounts)]
pub struct RefundEntry<'info> {
    #[account(
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        has_one = market,
        has_one = escrow,
        seeds = [WINDOW_SEED, market.key().as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Account<'info, Window>,

    #[account(
        mut,
        has_one = window,
        seeds = [ENTRY_SEED, window.key().as_ref(), entry.owner.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Account<'info, Entry>,

    #[account(address = market.quote_mint)]
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = quote_mint,
        token::token_program = quote_token_program,
        constraint = recipient.owner == entry.owner @ LadleError::RecipientNotOwner,
        constraint = recipient.key() == get_associated_token_address_with_program_id(
            &entry.owner,
            &quote_mint.key(),
            &quote_token_program.key(),
        ) @ LadleError::RecipientNotOwner,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,

    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_refund_entry(ctx: Context<RefundEntry>) -> Result<()> {
    let window = &mut ctx.accounts.window;
    let entry = &mut ctx.accounts.entry;

    require!(window.state == WindowState::Refunding, LadleError::WrongWindowState);
    require!(!entry.refunded, LadleError::AlreadyRefunded);

    entry.refunded = true;
    // once per entry (the flag above), so <= entry_count <= 2048; stay checked.
    window.refunded_entries = window.refunded_entries.checked_add(1).ok_or(LadleError::Overflow)?;
    let amount = entry.amount;

    let market_key = ctx.accounts.market.key();
    let index_bytes = window.index.to_le_bytes();
    let bump = [window.bump];
    let signer_seeds: &[&[u8]] = &[WINDOW_SEED, market_key.as_ref(), &index_bytes, &bump];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.quote_token_program.key(),
            TransferChecked {
                from: ctx.accounts.escrow.to_account_info(),
                mint: ctx.accounts.quote_mint.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
                authority: window.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
        ctx.accounts.quote_mint.decimals,
    )?;

    emit!(EntryRefunded {
        window: window.key(),
        index: entry.index,
        owner: entry.owner,
        amount,
    });
    Ok(())
}
