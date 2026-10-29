//! Shutdown (the `wind-down` build only; `lib.rs` dispatches these three
//! instructions under `#[cfg(feature = "wind-down")]`, the normal build
//! does not have them).
//!
//! Why: closing the program (`solana program close`) gives its upgrade
//! authority the program rent back (~2.01 SOL) but strands every account the
//! program owns, so it may only happen once no player has money, a share or
//! even an entry's rent left in it. Players forget dust; the shutdown must
//! not depend on them. So:
//!
//! 1. The operator upgrades to the wind-down build: `create_market`,
//!    `open_window` and `enter` refuse (`WindingDown`), nothing new comes in.
//!    Rounds in flight finish as usual (seal, draw, settle, or refund after
//!    the VRF timeout, at most ~32 min).
//! 2. `start_wind_down(market)` starts the market's notice (anyone; the
//!    keeper's drain and scripts/mainnet-shutdown.ps1 send it right after
//!    the upgrade). For `WIND_DOWN_NOTICE_SECS` (7 days) players exit by
//!    themselves: `sell_back`, `refund_entry`, `close_entry` work as always.
//! 3. After the notice, `force_exit(entry)` (anyone; the keeper's drain sends
//!    it for every entry left) pays what is left in an entry to its owner and
//!    closes it, the entry's rent to the owner too: its unsold share sold
//!    to the curve, or the stake of a refunded round. The payout reaches the
//!    owner's wallet as SOL (unwrapped through a token account opened and
//!    closed inside the instruction), so the owner needs no token account,
//!    has nothing to do and cannot block it: every market is quoted in wSOL
//!    (`create_market` refuses any other quote mint since the final review;
//!    a market of another quote mint, which only an earlier build could
//!    make, gets `QuoteMintNotWsol` here).
//! 4. Every window closes (`close_window`, rents to their openers), then
//!    `close_market` burns the unsold LADLE and closes the vaults and the
//!    market, rents to the market's creator.
//!
//! Invariants (tests/cu-bench `wind-down`):
//! * Nothing here can pay anyone but the entry's owner (`has_one = owner`,
//!   the payout account is fixed by the entry: the PDA ["unwrap", entry],
//!   closed into the entry, which closes to the owner) or, for rents, whoever paid them
//!   (`window.opener`, `market.creator`). The caller of `force_exit` puts up
//!   the unwrap account's rent for the length of the instruction and gets
//!   exactly that back.
//! * `force_exit` pays exactly what `sell_back` of the whole unsold share
//!   would at that moment, or exactly the stake (`refund_entry`), and only
//!   once: the entry is closed in the same instruction.
//! * Nothing runs before the notice is over (`NoticeNotOver`), and the notice
//!   is cleared by any round opening under a normal build (`open_window`),
//!   so a shutdown that was called off needs a new, full notice.
//! * `close_market` needs no round account left (`live_windows == 0`: every
//!   stake refunded or settled, every opener's rent back) and no LADLE out
//!   (`curve.y == INITIAL_VIRTUAL_Y`: every share sold back, none in a
//!   wallet). It does not count entries: entries left after it hold only
//!   their owner's rent (every round closed means every stake refunded or
//!   settled; no LADLE out means every share sold back) and close with
//!   `close_entry`, which needs no market. The keeper's `--shutdown` closes
//!   them program-wide, whoever closed the market (final review).

use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token_interface::{
    self, Burn, CloseAccount, InitializeAccount3, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::{ForcedExit, MarketClosed, WindDownStarted};
use crate::instructions::create_pda_account;
use crate::state::{Entry, Market, Window, WindowState};

/// Size of an SPL Token account.
const TOKEN_ACCOUNT_LEN: usize = 165;

/// Has this market's notice run its full length?
fn require_notice_over(market: &Market) -> Result<()> {
    require!(market.notice_start > 0, LadleError::NoticeNotOver);
    let end = market
        .notice_start
        .checked_add(WIND_DOWN_NOTICE_SECS)
        .ok_or(LadleError::Overflow)?;
    require!(Clock::get()?.unix_timestamp >= end, LadleError::NoticeNotOver);
    Ok(())
}

/// `start_wind_down()`
///
/// * Who: anyone (exists only in the wind-down build).
/// * State: no notice running for this market (`notice_start == 0`).
/// * Effect: `notice_start = clock.unix_timestamp`; `force_exit` and
///   `close_market` may run `WIND_DOWN_NOTICE_SECS` later.
#[derive(Accounts)]
pub struct StartWindDown<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}

pub fn handle_start_wind_down(ctx: Context<StartWindDown>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.notice_start == 0, LadleError::NoticeAlreadyStarted);
    let now = Clock::get()?.unix_timestamp;
    // 0 means "no notice": a clock at or before 1970 cannot start one
    require!(now > 0, LadleError::Overflow);
    let exit_after = now.checked_add(WIND_DOWN_NOTICE_SECS).ok_or(LadleError::Overflow)?;
    market.notice_start = now;
    emit!(WindDownStarted {
        market: market.key(),
        notice_start: now,
        exit_after,
    });
    Ok(())
}

/// `force_exit()`
///
/// * Who: anyone (exists only in the wind-down build). `payer` puts up the
///   rent of the unwrap account (wSOL markets) and gets it back in the same
///   instruction.
/// * State: the market's notice is over, and the entry is one of:
///   - settled, its window `Settled` (`Entry::window_settled`): the unsold
///     share (`share - claimed`) is sold to the curve exactly as `sell_back`
///     would sell it now, and the quote paid to the owner;
///   - neither settled nor refunded, its window `Refunding` (pass the window
///     and its escrow): the full stake is paid to the owner, counted in
///     `window.refunded_entries` as `refund_entry` would;
///   - refunded, or settled with nothing left: nothing to pay.
///   An entry whose round is still in progress fails (`WrongWindowState`):
///   finish the round first (seal, draw, settle, or `refund_window`).
/// * Payout: `payout` is the empty PDA ["unwrap", entry]; the instruction
///   opens a wSOL account there, moves the payout into it, and closes it
///   into the entry, whose lamports all go to the owner when it closes: the
///   payout arrives as SOL in the owner's wallet, whatever the owner did
///   with their token accounts. A market not quoted in wSOL (only an earlier
///   build could make one) fails with `QuoteMintNotWsol`.
/// * Effect: the entry is closed, its rent, the payout and any lamports a
///   stranger had sent to the unwrap address go to `entry.owner`.
/// * Never: pays anyone but `entry.owner`; runs twice for an entry (it is
///   closed); runs before the notice is over; depends on an account the
///   owner (or anyone) can take away or leave missing.
#[derive(Accounts)]
pub struct ForceExit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        has_one = market,
        has_one = owner,
        close = owner,
        seeds = [ENTRY_SEED, entry.window.as_ref(), entry.owner.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Box<Account<'info, Entry>>,

    /// CHECK: must equal `entry.owner` (has_one above); only receives lamports.
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    /// The entry's window when its stake is still to refund; the program id
    /// otherwise.
    #[account(mut)]
    pub window: Option<Box<Account<'info, Window>>>,

    /// `window.escrow`, with `window`; the program id otherwise.
    #[account(mut)]
    pub escrow: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = market.quote_vault)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: the PDA ["unwrap", entry], empty (or holding only lamports a
    /// stranger sent). Checked in the handler.
    #[account(mut)]
    pub payout: UncheckedAccount<'info>,

    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_force_exit(ctx: Context<ForceExit>) -> Result<()> {
    require_notice_over(&ctx.accounts.market)?;
    // the payout is SOL to the owner's wallet (`quote_mint` is `market.quote_mint`)
    require!(ctx.accounts.quote_mint.key() == NATIVE_MINT, LadleError::QuoteMintNotWsol);

    let market_key = ctx.accounts.market.key();
    let entry_key = ctx.accounts.entry.key();
    let owner = ctx.accounts.entry.owner;

    // --- what is left in the entry (state first, transfers last) ---
    let mut tokens_sold = 0u64;
    let mut paid = 0u64;
    let mut from_escrow = false;
    if ctx.accounts.entry.refunded {
        // the stake is back already: only the rent is left
    } else if ctx.accounts.entry.settled {
        let market = &mut ctx.accounts.market;
        let entry = &mut ctx.accounts.entry;
        require!(entry.window_settled(market.next_settle_index), LadleError::WrongWindowState);
        // claimed <= share always (sell_back caps at share)
        let unsold = entry.share.checked_sub(entry.claimed).ok_or(LadleError::Overflow)?;
        if unsold > 0 {
            let (quote_out, new_curve) = market.curve.sell(unsold)?;
            // as in sell_back: the vault always covers it; defensive
            require!(
                quote_out <= ctx.accounts.quote_vault.amount,
                LadleError::InsufficientQuoteLiquidity
            );
            market.curve = new_curve;
            tokens_sold = unsold;
            paid = quote_out;
        }
        entry.claimed = entry.share;
    } else {
        // a stake still in its round's escrow: only a Refunding round pays it back
        let entry = &mut ctx.accounts.entry;
        let window = ctx.accounts.window.as_mut().ok_or(LadleError::WrongWindowState)?;
        require!(
            window.key() == entry.window && window.market == market_key,
            LadleError::WrongWindowState
        );
        require!(window.state == WindowState::Refunding, LadleError::WrongWindowState);
        let escrow = ctx.accounts.escrow.as_ref().ok_or(LadleError::WrongWindowState)?;
        require!(escrow.key() == window.escrow, LadleError::WrongWindowState);
        entry.refunded = true;
        // once per entry (the flag above, and the entry closes here)
        window.refunded_entries = window.refunded_entries.checked_add(1).ok_or(LadleError::Overflow)?;
        paid = entry.amount;
        from_escrow = true;
    }

    if paid > 0 {
        let program = ctx.accounts.quote_token_program.key();
        let quote_mint = &ctx.accounts.quote_mint;
        let market_seeds = ctx.accounts.market.signer_seeds();
        let payout = ctx.accounts.payout.to_account_info();

        // the source and its signer: the market's vault, or the round's escrow
        let (source, source_authority) = if from_escrow {
            (
                ctx.accounts.escrow.as_ref().ok_or(LadleError::WrongWindowState)?.to_account_info(),
                ctx.accounts.window.as_ref().ok_or(LadleError::WrongWindowState)?.to_account_info(),
            )
        } else {
            (ctx.accounts.quote_vault.to_account_info(), ctx.accounts.market.to_account_info())
        };
        let window_index_bytes = ctx.accounts.window.as_ref().map(|w| w.index.to_le_bytes()).unwrap_or_default();
        let window_bump = [ctx.accounts.window.as_ref().map(|w| w.bump).unwrap_or_default()];
        let window_seeds: [&[u8]; 4] = [WINDOW_SEED, market_key.as_ref(), &window_index_bytes, &window_bump];
        let source_seeds: &[&[u8]] = if from_escrow { &window_seeds } else { &market_seeds };

        // SOL to the wallet: a wSOL account at ["unwrap", entry], filled, closed into the entry
        let (expected, bump) = Pubkey::find_program_address(&[UNWRAP_SEED, entry_key.as_ref()], &crate::ID);
        require!(payout.key() == expected, LadleError::RecipientNotOwner);
        let bump = [bump];
        let unwrap_seeds: &[&[u8]] = &[UNWRAP_SEED, entry_key.as_ref(), &bump];
        let payer = ctx.accounts.payer.to_account_info();
        let put_in = create_pda_account(&payer, &payout, TOKEN_ACCOUNT_LEN, unwrap_seeds, &program)?;
        token_interface::initialize_account3(CpiContext::new(
            program,
            InitializeAccount3 {
                account: payout.clone(),
                mint: quote_mint.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
        ))?;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                program,
                TransferChecked {
                    from: source,
                    mint: quote_mint.to_account_info(),
                    to: payout.clone(),
                    authority: source_authority,
                },
                &[source_seeds],
            ),
            paid,
            quote_mint.decimals,
        )?;
        let entry_info = ctx.accounts.entry.to_account_info();
        token_interface::close_account(CpiContext::new_with_signer(
            program,
            CloseAccount {
                account: payout,
                destination: entry_info.clone(),
                authority: ctx.accounts.market.to_account_info(),
            },
            &[&market_seeds],
        ))?;
        // the payer's rent back; the rest (entry rent, payout, any stranger's
        // lamports at the unwrap address) goes to the owner when the entry closes
        if put_in > 0 {
            let mut from = entry_info.try_borrow_mut_lamports()?;
            **from = from.checked_sub(put_in).ok_or(LadleError::Overflow)?;
            let mut to = payer.try_borrow_mut_lamports()?;
            **to = to.checked_add(put_in).ok_or(LadleError::Overflow)?;
        }
    }

    let entry = &ctx.accounts.entry;
    emit!(ForcedExit {
        window: entry.window,
        index: entry.index,
        owner,
        tokens_sold,
        paid,
        refunded: from_escrow,
    });
    Ok(())
}

/// `close_market()`
///
/// * Who: anyone (exists only in the wind-down build). Everything goes to
///   `market.creator`, who paid the rents.
/// * State: the notice is over; the market counted its windows from its
///   creation (`counts_windows`, v25+) and none is left (`live_windows ==
///   0`); no LADLE is out (`curve.y == INITIAL_VIRTUAL_Y`: every share sold
///   back, none in a wallet). Otherwise `MarketNotDrained`.
/// * Effect: burns the LADLE in the token vault (the unsold supply) and
///   closes it; closes the wSOL quote vault into the creator: what is left
///   in it (the curve's rounding, which always favours the pool, and
///   anything sent to the vault from outside) arrives as SOL with its rent;
///   closes the market. The mint (classic SPL Token mints cannot be closed)
///   and the immutable Metaplex metadata stay. A market not quoted in wSOL
///   (only an earlier build could make one) fails with `QuoteMintNotWsol`.
/// * Entries are not counted: any left hold only their owner's rent (see
///   the module docs) and close with `close_entry`, market or not.
#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(
        mut,
        has_one = creator,
        close = creator,
        seeds = [MARKET_SEED, market.token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    /// CHECK: must equal `market.creator` (has_one above); only receives lamports.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    #[account(mut, address = market.token_mint)]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = market.token_vault)]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = market.quote_vault)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_market(ctx: Context<CloseMarket>) -> Result<()> {
    let market = &ctx.accounts.market;
    require_notice_over(market)?;
    require!(ctx.accounts.quote_mint.key() == NATIVE_MINT, LadleError::QuoteMintNotWsol);
    require!(
        market.counts_windows
            && market.live_windows == 0
            && !market.has_active_window
            && market.curve.y == INITIAL_VIRTUAL_Y,
        LadleError::MarketNotDrained
    );
    let seeds = market.signer_seeds();
    let creator = ctx.accounts.creator.to_account_info();
    let market_info = market.to_account_info();

    // LADLE: the unsold supply, burned (the mint authority is gone: nothing can mint it back)
    let tokens_burned = ctx.accounts.token_vault.amount;
    let token_program = ctx.accounts.token_program.key();
    if tokens_burned > 0 {
        token_interface::burn(
            CpiContext::new_with_signer(
                token_program,
                Burn {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    from: ctx.accounts.token_vault.to_account_info(),
                    authority: market_info.clone(),
                },
                &[&seeds],
            ),
            tokens_burned,
        )?;
    }
    token_interface::close_account(CpiContext::new_with_signer(
        token_program,
        CloseAccount {
            account: ctx.accounts.token_vault.to_account_info(),
            destination: creator.clone(),
            authority: market_info.clone(),
        },
        &[&seeds],
    ))?;

    // quote: a wSOL vault closes with its balance, the SOL goes to the creator with the rent
    let quote_left = ctx.accounts.quote_vault.amount;
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.quote_token_program.key(),
        CloseAccount {
            account: ctx.accounts.quote_vault.to_account_info(),
            destination: creator,
            authority: market_info,
        },
        &[&seeds],
    ))?;

    emit!(MarketClosed {
        market: market.key(),
        creator: market.creator,
        tokens_burned,
        quote_left,
    });
    Ok(())
}
