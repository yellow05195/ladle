use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::consts::*;
use crate::errors::LadleError;
use crate::events::WindowTallied;
use crate::instructions::load_entry;
use crate::law::{self, BPS, KEEPER_BOUNTY_BPS_OF_PLATFORM_FEE};
use crate::state::{check_page, Integration, Market, Window, WindowState};

/// `tally_page(from, to)`
///
/// * Who: anyone. The keeper bounty goes to `keeper_quote_account`: any
///   quote account for a window that never asked ORAO (one entry), and only
///   the quote ATA of `window.vrf_payer` (who paid ORAO) for one that did;
///   with any other account that bounty goes to the platform treasury, so
///   racing the keeper to the final page earns nothing.
/// * State: window `Drawn`. Pages are strictly ordered by `tally_cursor`:
///   `from == tally_cursor` processes, `to <= tally_cursor` is a no-op
///   replay, anything else fails. `to - from <= MAX_PAGE`.
/// * Remaining accounts: the Entry PDAs for indices [from, to), in order,
///   writable.
/// * Effect per entry: `roll = entry_roll(seed, owner, index)`;
///   `roll_sum += amount * roll`.
/// * Finalize (when the cursor reaches `entry_count`): requires
///   `window.index == market.next_settle_index`; splits the total into
///   platform fee / host fee / to_curve, executes ONE curve buy with
///   `to_curve`, freezes `tokens_out`, `roll_sum` and the fees in the
///   window, moves the escrow out (curve -> quote_vault, platform fee minus
///   bounty -> treasury ATA, bounty -> `keeper_quote_account` as above, host
///   fee -> host ATA), state -> `Tallied`.
/// * The finalization accounts are always required (pass them on every
///   page); `integration` / `host_quote_account` may be the program id when
///   the market has no integration.
/// * Host fee: paid to the host's associated token account; when that
///   account does not exist (the host closed it, or never made one) the
///   round's host fee stays in its buy (`to_curve`, the players' tokens).
///   Final review (2026-10-29): before, a missing host account failed the
///   final page, and since rounds settle in order a host could hold every
///   later round of its market (a `Drawn` round has no refund path), or
///   make a keeper re-create the account for it again and again and keep
///   the rent each time; nobody has to pay for that account any more.
/// * Never: executes the curve more than once per window, or for anything
///   but the window total net of fees.
#[derive(Accounts)]
pub struct TallyPage<'info> {
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
        has_one = escrow,
        seeds = [WINDOW_SEED, market.key().as_ref(), &window.index.to_le_bytes()],
        bump = window.bump,
    )]
    pub window: Box<Account<'info, Window>>,

    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = market.quote_vault)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Associated token account of PLATFORM_TREASURY for the quote mint
    /// (anyone can create it with the ATA program; address checked here).
    #[account(mut, token::mint = quote_mint, token::token_program = quote_token_program)]
    pub platform_quote_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Receives the bounty (see above); the platform treasury gets it when
    /// this is not the request payer's ATA for a window that asked ORAO.
    #[account(mut, token::mint = quote_mint, token::token_program = quote_token_program)]
    pub keeper_quote_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Required (and must equal `market.integration`) when the market has one.
    pub integration: Option<Box<Account<'info, Integration>>>,

    /// CHECK: the host's associated token account for the quote mint
    /// (address checked in `finalize`); required when the market has an
    /// integration. It may not exist: that round's host fee then stays in
    /// the buy. Written only by the token program's transfer.
    #[account(mut)]
    pub host_quote_account: Option<UncheckedAccount<'info>>,

    #[account(address = market.quote_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_tally_page<'info>(
    ctx: Context<'info, TallyPage<'info>>,
    from: u32,
    to: u32,
) -> Result<()> {
    let window_key = ctx.accounts.window.key();
    {
        let window = &mut ctx.accounts.window;
        require!(window.state == WindowState::Drawn, LadleError::WrongWindowState);
        if !check_page(window.tally_cursor, from, to, window.entry_count)? {
            return Ok(());
        }
        // from < to checked by check_page; both <= entry_count <= 2048.
        let n = (to - from) as usize;
        require!(ctx.remaining_accounts.len() == n, LadleError::PageAccountsMismatch);

        for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
            // i < n so from + i <= to <= 2048: no overflow.
            let index = from + i as u32;
            let mut entry = load_entry(acc, &window_key, index)?;
            let roll = law::entry_roll(&window.seed, &entry.owner, index);
            entry.roll = roll;
            // amount <= u64::MAX, roll <= ROLL_MAX (10_000): product < 2^78.
            let add = (entry.amount as u128) * (roll as u128);
            window.roll_sum = window.roll_sum.checked_add(add).ok_or(LadleError::Overflow)?;
            entry.exit(&crate::ID)?;
        }
        window.tally_cursor = to;
        if window.tally_cursor != window.entry_count {
            return Ok(());
        }
    }
    finalize(ctx.accounts)
}

/// How the platform fee of a `FeeSplit` is divided between the treasury and
/// the keeper. `platform_net + bounty == fees.platform`, so
/// `to_curve + platform_net + bounty + host == total` at the lamport.
pub struct Payout {
    pub bounty: u64,
    pub platform_net: u64,
}

pub fn payout(fees: &law::FeeSplit) -> Payout {
    // platform <= u64::MAX and bps <= 10_000: the product fits in u128 and
    // the quotient is <= platform (ratio <= 1).
    let bounty = ((fees.platform as u128) * (KEEPER_BOUNTY_BPS_OF_PLATFORM_FEE as u128)
        / (BPS as u128)) as u64;
    // bounty <= platform, so no underflow.
    let platform_net = fees.platform - bounty;
    Payout { bounty, platform_net }
}

/// `(to the keeper account, to the treasury)`: the bounty joins the
/// platform's part when it may not go to the given keeper account. The two
/// always add up to the platform fee.
pub fn route_bounty(bounty: u64, platform_net: u64, to_keeper: bool) -> (u64, u64) {
    if to_keeper {
        (bounty, platform_net)
    } else {
        // platform_net + bounty == the platform fee <= total: no overflow
        (0, platform_net + bounty)
    }
}

/// Last page: fee split, the single curve buy, escrow payout.
fn finalize<'info>(accs: &mut TallyPage<'info>) -> Result<()> {
    let market_key = accs.market.key();
    let window_key = accs.window.key();
    let quote_mint_key = accs.quote_mint.key();
    let quote_program_key = accs.quote_token_program.key();
    let decimals = accs.quote_mint.decimals;

    // --- strict settlement order ---
    require!(
        accs.window.index == accs.market.next_settle_index,
        LadleError::SettleOutOfOrder
    );

    // --- platform treasury ATA ---
    let expected_platform_ata = get_associated_token_address_with_program_id(
        &PLATFORM_TREASURY,
        &quote_mint_key,
        &quote_program_key,
    );
    require!(
        accs.platform_quote_account.key() == expected_platform_ata,
        LadleError::PlatformAccountMismatch
    );

    // --- host fee (0 without integration, or when the host has no account: it stays in the buy) ---
    let host_fee_bps: u16 = if accs.market.integration == Pubkey::default() {
        0
    } else {
        let integration = accs
            .integration
            .as_ref()
            .ok_or(LadleError::IntegrationMismatch)?;
        require!(
            integration.key() == accs.market.integration,
            LadleError::IntegrationMismatch
        );
        let host_acc = accs
            .host_quote_account
            .as_ref()
            .ok_or(LadleError::HostAccountMismatch)?;
        let expected_host_ata = get_associated_token_address_with_program_id(
            &integration.host,
            &quote_mint_key,
            &quote_program_key,
        );
        require!(host_acc.key() == expected_host_ata, LadleError::HostAccountMismatch);
        // the address is the ATA program's PDA: only it can create an account there,
        // as a token account of this mint (or nothing: closed, or never made)
        if host_acc.data_is_empty() {
            0
        } else {
            integration.host_fee_bps
        }
    };

    let total = accs.window.total_amount;
    let fees = law::split_fees(total, host_fee_bps)?;
    let Payout { bounty, platform_net } = payout(&fees);

    // --- the bounty pays whoever paid ORAO, not whoever sends this page ---
    let to_keeper = !accs.window.vrf_requested
        || accs.keeper_quote_account.key()
            == get_associated_token_address_with_program_id(
                &accs.window.vrf_payer,
                &quote_mint_key,
                &quote_program_key,
            );
    let (keeper_bounty, platform_paid) = route_bounty(bounty, platform_net, to_keeper);

    // --- the single curve buy ---
    let (tokens_out, new_curve) = accs.market.curve.buy(fees.to_curve)?;
    accs.market.curve = new_curve;

    {
        let window = &mut accs.window;
        window.tokens_out = tokens_out;
        window.to_curve = fees.to_curve;
        window.fee_platform = fees.platform;
        window.fee_host = fees.host;
        window.cum_weight = [0u8; 32];
        window.state = WindowState::Tallied;
    }

    // --- escrow payout: to_curve + (platform_paid + keeper_bounty) + host == total ---
    let index_bytes = accs.window.index.to_le_bytes();
    let bump = [accs.window.bump];
    let signer_seeds: &[&[u8]] = &[WINDOW_SEED, market_key.as_ref(), &index_bytes, &bump];

    let escrow = accs.escrow.to_account_info();
    let mint = accs.quote_mint.to_account_info();
    let authority = accs.window.to_account_info();

    let pay = |to: AccountInfo<'info>, amount: u64| -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                quote_program_key,
                TransferChecked {
                    from: escrow.clone(),
                    mint: mint.clone(),
                    to,
                    authority: authority.clone(),
                },
                &[signer_seeds],
            ),
            amount,
            decimals,
        )
    };

    pay(accs.quote_vault.to_account_info(), fees.to_curve)?;
    pay(accs.platform_quote_account.to_account_info(), platform_paid)?;
    pay(accs.keeper_quote_account.to_account_info(), keeper_bounty)?;
    if fees.host > 0 {
        let host_acc = accs
            .host_quote_account
            .as_ref()
            .ok_or(LadleError::HostAccountMismatch)?;
        pay(host_acc.to_account_info(), fees.host)?;
    }

    emit!(WindowTallied {
        window: window_key,
        index: accs.window.index,
        total,
        roll_sum: accs.window.roll_sum,
        tokens_out,
        to_curve: fees.to_curve,
        fee_platform: fees.platform,
        fee_host: fees.host,
        keeper_bounty,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payout_identity_holds_at_the_lamport() {
        let totals = [0u64, 1, 7, 99, 100, 10_000, 1_000_003, 123_456_789_012, u64::MAX];
        let host_bps = [0u16, 1, 150, 299, 300];
        for &total in &totals {
            for &bps in &host_bps {
                let fees = law::split_fees(total, bps).unwrap();
                let p = payout(&fees);
                let sum = (fees.to_curve as u128)
                    + (p.platform_net as u128)
                    + (p.bounty as u128)
                    + (fees.host as u128);
                assert_eq!(sum, total as u128, "total={total} bps={bps}");
                assert!(p.bounty <= fees.platform);
            }
        }
    }

    #[test]
    fn a_redirected_bounty_goes_to_the_treasury_in_full() {
        let fees = law::split_fees(123_456_789, 0).unwrap();
        let p = payout(&fees);
        assert_eq!(route_bounty(p.bounty, p.platform_net, true), (p.bounty, p.platform_net));
        let (k, t) = route_bounty(p.bounty, p.platform_net, false);
        assert_eq!((k, t), (0, fees.platform));
        assert_eq!(fees.to_curve + k + t + fees.host, 123_456_789);
    }

    #[test]
    fn bounty_is_ten_percent_of_platform_fee() {
        let fees = law::split_fees(1_000_000, 0).unwrap();
        assert_eq!(fees.platform, 10_000);
        let p = payout(&fees);
        assert_eq!(p.bounty, 1_000);
        assert_eq!(p.platform_net, 9_000);
    }
}
