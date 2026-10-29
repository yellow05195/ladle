use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::SoldBack;
use crate::state::{Entry, Market};

/// `sell_back(amount, min_quote_out)`
///
/// * Who: the entry owner (signer).
/// * State: the entry's window `Settled` (`Entry::window_settled`: read from
///   the Entry and the Market, so it works before and after `close_window`),
///   `share - claimed > 0`.
/// * Effect: sells `min(amount, share - claimed)` of the still-unclaimed
///   share to the curve without moving the tokens (they stay in the vault):
///   `claimed += sold`, curve updated, quote paid from the quote vault to
///   `owner_quote`. Zero fee. Fails with `SlippageExceeded` when
///   `quote_out < min_quote_out`: sales that land before this one in the
///   same slot (other players selling back) lower the price, and the seller
///   signs the least they accept (the site: its quote minus a tolerance).
/// * Never: blocked by any authority or flag.
#[derive(Accounts)]
pub struct SellBack<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        has_one = market,
        has_one = owner,
        seeds = [ENTRY_SEED, entry.window.as_ref(), entry.owner.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Account<'info, Entry>,

    #[account(address = market.quote_mint)]
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = market.quote_vault)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = quote_mint, token::token_program = quote_token_program)]
    pub owner_quote: InterfaceAccount<'info, TokenAccount>,

    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_sell_back(ctx: Context<SellBack>, amount: u64, min_quote_out: u64) -> Result<()> {
    let entry = &mut ctx.accounts.entry;
    let market = &mut ctx.accounts.market;
    require!(entry.window_settled(market.next_settle_index), LadleError::WrongWindowState);

    let unclaimed = entry.share.checked_sub(entry.claimed).ok_or(LadleError::Overflow)?;
    let sold = amount.min(unclaimed);
    require!(sold > 0, LadleError::NothingToClaim);

    let (quote_out, new_curve) = market.curve.sell(sold)?;
    require!(quote_out >= min_quote_out, LadleError::SlippageExceeded);
    // Solvency: tokens sold back are part of the curve's outstanding supply,
    // so the virtual reserve never drops below the initial one and the real
    // vault always covers `quote_out`. Kept as a defensive check.
    require!(
        quote_out <= ctx.accounts.quote_vault.amount,
        LadleError::InsufficientQuoteLiquidity
    );
    market.curve = new_curve;
    // sold <= unclaimed = share - claimed, so claimed + sold <= share.
    entry.claimed += sold;

    if quote_out > 0 {
        let seeds = market.signer_seeds();
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.quote_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.quote_vault.to_account_info(),
                    mint: ctx.accounts.quote_mint.to_account_info(),
                    to: ctx.accounts.owner_quote.to_account_info(),
                    authority: market.to_account_info(),
                },
                &[&seeds],
            ),
            quote_out,
            ctx.accounts.quote_mint.decimals,
        )?;
    }

    emit!(SoldBack {
        window: entry.window,
        index: entry.index,
        owner: entry.owner,
        amount_tokens: sold,
        quote_out,
    });
    Ok(())
}
