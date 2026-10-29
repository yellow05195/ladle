use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::Sold;
use crate::state::Market;

/// `sell(amount, min_quote_out)`
///
/// * Who: anyone holding the token in a wallet (signer = transfer authority
///   of `seller_token_account`).
/// * State: none (the market exists).
/// * Effect: moves `amount` tokens into the market's token vault, then pays
///   `curve.sell(amount)` quote from the quote vault to `seller_quote`.
///   Zero fee. Fails with `SlippageExceeded` when that is less than
///   `min_quote_out`. Since v25 no instruction moves LADLE out of the vault
///   to a wallet (`claim` is gone), so this only serves LADLE taken out by
///   an earlier build (devnet); it stays in the wind-down build so such
///   holders can sell during the shutdown notice.
/// * Never: blocked by any authority or flag.
#[derive(Accounts)]
pub struct Sell<'info> {
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(address = market.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, token::mint = token_mint, token::token_program = token_program)]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = market.token_vault)]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(address = market.quote_mint)]
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = market.quote_vault)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = quote_mint, token::token_program = quote_token_program)]
    pub seller_quote: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_sell(ctx: Context<Sell>, amount: u64, min_quote_out: u64) -> Result<()> {
    require!(amount > 0, LadleError::ZeroAmount);
    let market = &mut ctx.accounts.market;

    let (quote_out, new_curve) = market.curve.sell(amount)?;
    require!(quote_out >= min_quote_out, LadleError::SlippageExceeded);
    // Every token in a wallet was sold by the curve (supply only left the
    // vault through the `claim` of builds before v25), so the vault covers
    // this. Defensive check.
    require!(
        quote_out <= ctx.accounts.quote_vault.amount,
        LadleError::InsufficientQuoteLiquidity
    );
    market.curve = new_curve;

    // tokens in (seller signs)
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.seller_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        amount,
        TOKEN_DECIMALS,
    )?;

    // quote out (market signs)
    if quote_out > 0 {
        let seeds = market.signer_seeds();
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.quote_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.quote_vault.to_account_info(),
                    mint: ctx.accounts.quote_mint.to_account_info(),
                    to: ctx.accounts.seller_quote.to_account_info(),
                    authority: market.to_account_info(),
                },
                &[&seeds],
            ),
            quote_out,
            ctx.accounts.quote_mint.decimals,
        )?;
    }

    emit!(Sold {
        market: market.key(),
        seller: ctx.accounts.seller.key(),
        amount_tokens: amount,
        quote_out,
    });
    Ok(())
}
