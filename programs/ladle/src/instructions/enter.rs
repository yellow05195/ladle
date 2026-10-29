use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::Entered;
use crate::instructions::create_pda_account;
use crate::state::{cap_allows, Entry, Market, Window, WindowState};

/// `enter(amount)`
///
/// * Who: the entrant (signer; also the transfer authority of `owner_quote`
///   and payer of the Entry rent).
/// * State: window `Open` and `clock.slot < close_slot`, fewer than
///   MAX_ENTRIES_PER_WINDOW entries,
///   `MIN_ENTRY_AMOUNT <= amount <= max_entry_amount`, and
///   the cap rule: with `new_total = total + amount`,
///   `amount * 10000 <= max_entry_bps * new_total` OR
///   `new_total <= entry_floor_amount`.
/// * One entry per wallet per window: the Entry PDA is
///   ["entry", window, owner], so a second `enter` from the same wallet fails
///   with `AlreadyEntered` (which also keeps the per-entry cap per wallet).
/// * Crowds: the PDA does not depend on the entry's index, so any number of
///   wallets can build their transaction from the same view of the window
///   and all of them land; the index is assigned here, in arrival order
///   (`index = entry_count`), and the paged tally/settle walk entries in that
///   order.
/// * Order: `total_amount` and `entry_count` are updated before the transfer
///   CPI, so several entries in the same slot see each other's totals.
/// * Never: can be undone. There is no cancel; the stake leaves escrow only
///   via settlement (fees + curve) or, if the VRF times out, a full refund.
///   Refused by the wind-down build (`WindingDown`).
#[derive(Accounts)]
pub struct Enter<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

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

    /// The Entry PDA ["entry", window, owner], created in the handler; when it
    /// already belongs to this program the wallet has entered this window
    /// (`AlreadyEntered`).
    /// CHECK: address fixed by the seeds; created and written in the handler.
    #[account(
        mut,
        seeds = [ENTRY_SEED, window.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub entry: UncheckedAccount<'info>,

    #[account(address = market.quote_mint)]
    pub quote_mint: InterfaceAccount<'info, Mint>,

    /// Source of the stake; `owner` must be its owner or delegate (the token
    /// program enforces it).
    #[account(mut, token::mint = quote_mint, token::token_program = quote_token_program)]
    pub owner_quote: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_enter(ctx: Context<Enter>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let window = &mut ctx.accounts.window;
    let entry_info = ctx.accounts.entry.to_account_info();

    require!(!WIND_DOWN, LadleError::WindingDown);
    require!(window.state == WindowState::Open, LadleError::WrongWindowState);
    let slot = Clock::get()?.slot;
    require!(slot < window.close_slot, LadleError::WindowClosed);
    require!(*entry_info.owner != crate::ID, LadleError::AlreadyEntered);
    require!(window.entry_count < MAX_ENTRIES_PER_WINDOW, LadleError::WindowFull);
    require!(amount >= MIN_ENTRY_AMOUNT, LadleError::EntryTooSmall);
    require!(amount <= market.max_entry_amount, LadleError::EntryTooLarge);

    let new_total = window
        .total_amount
        .checked_add(amount)
        .ok_or(LadleError::Overflow)?;
    require!(
        cap_allows(amount, new_total, market.max_entry_bps, market.entry_floor_amount),
        LadleError::EntryAboveCap
    );

    // --- state first, CPI last ---
    let index = window.entry_count;
    let owner = ctx.accounts.owner.key();
    let window_key = window.key();
    let window_index = window.index;
    window.total_amount = new_total;
    // entry_count < MAX_ENTRIES_PER_WINDOW (2048): +1 cannot overflow u32.
    window.entry_count = index + 1;
    window.entries_commitment =
        Window::fold_entry_commitment(&window.entries_commitment, &owner, amount, index);

    let bump = ctx.bumps.entry;
    create_pda_account(
        &ctx.accounts.owner.to_account_info(),
        &entry_info,
        8 + Entry::INIT_SPACE,
        &[ENTRY_SEED, window_key.as_ref(), owner.as_ref(), &[bump]],
        &crate::ID,
    )?;
    Entry {
        window: window_key,
        owner,
        index,
        amount,
        roll: 0,
        share: 0,
        claimed: 0,
        refunded: false,
        bump,
        // window has_one market: the market the stake and the share belong to
        market: market.key(),
        window_index,
        settled: false,
    }
    .try_serialize(&mut &mut entry_info.try_borrow_mut_data()?[..])?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.quote_token_program.key(),
            TransferChecked {
                from: ctx.accounts.owner_quote.to_account_info(),
                mint: ctx.accounts.quote_mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.quote_mint.decimals,
    )?;

    emit!(Entered {
        window: window_key,
        index,
        owner,
        amount,
        total_after: new_total,
        slot,
    });
    Ok(())
}
