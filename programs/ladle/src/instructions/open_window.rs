use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::WindowOpened;
use crate::state::{Market, Window, WindowState};

/// `open_window()`
///
/// * Who: anyone (payer pays the Window + escrow rent).
/// * State: the market has no active window, or its active window is no
///   longer `Open` (Sealed or later: the previous window can settle while
///   the next one runs). `prev_window` must be that active window when one
///   exists; pass the program id otherwise.
/// * Never: changes any market parameter; the window length is
///   `market.window_slots`, fixed at creation.
#[derive(Accounts)]
pub struct OpenWindow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// The market's current active window (required when
    /// `market.has_active_window`).
    pub prev_window: Option<Account<'info, Window>>,

    #[account(
        init,
        payer = payer,
        space = 8 + Window::INIT_SPACE,
        seeds = [WINDOW_SEED, market.key().as_ref(), &market.window_count.to_le_bytes()],
        bump,
    )]
    pub window: Account<'info, Window>,

    #[account(address = market.quote_mint)]
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = window,
        associated_token::token_program = quote_token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_window(ctx: Context<OpenWindow>) -> Result<()> {
    let market = &mut ctx.accounts.market;

    if market.has_active_window {
        let prev = ctx
            .accounts
            .prev_window
            .as_ref()
            .ok_or(LadleError::WrongPreviousWindow)?;
        require!(prev.market == market.key(), LadleError::WrongPreviousWindow);
        require!(prev.index == market.active_window, LadleError::WrongPreviousWindow);
        require!(prev.state != WindowState::Open, LadleError::WindowStillOpen);
    }

    // Only the slot is read from the clock, and only for timing.
    let slot = Clock::get()?.slot;
    let index = market.window_count;
    let close_slot = slot
        .checked_add(market.window_slots)
        .ok_or(LadleError::Overflow)?;

    let window = &mut ctx.accounts.window;
    window.market = market.key();
    window.index = index;
    window.state = WindowState::Open;
    window.open_slot = slot;
    window.close_slot = close_slot;
    window.sealed_slot = 0;
    window.total_amount = 0;
    window.entry_count = 0;
    window.entries_commitment = [0u8; 32];
    window.vrf_seed = [0u8; 32];
    window.vrf_requested = false;
    window.vrf_requested_slot = 0;
    window.vrf_request = Pubkey::default();
    window.seed = [0u8; 64];
    window.roll_sum = 0;
    window.tally_cursor = 0;
    window.settle_cursor = 0;
    window.cum_weight = [0u8; 32];
    window.tokens_out = 0;
    window.fee_platform = 0;
    window.fee_host = 0;
    window.to_curve = 0;
    window.escrow = ctx.accounts.escrow.key();
    window.bump = ctx.bumps.window;
    window.opener = ctx.accounts.payer.key();
    window.closed_entries = 0;

    // window_count is a u64 counter incremented once per window: cannot
    // realistically overflow, but stay checked.
    market.window_count = index.checked_add(1).ok_or(LadleError::Overflow)?;
    market.has_active_window = true;
    market.active_window = index;

    emit!(WindowOpened {
        market: market.key(),
        window: window.key(),
        index,
        open_slot: slot,
        close_slot,
    });
    Ok(())
}
