use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
use anchor_spl::token_interface::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_interface::{self, Mint, MintTo, SetAuthority, TokenAccount, TokenInterface};

use crate::consts::*;
use crate::errors::LadleError;
use crate::law::Curve;
use crate::metadata::{METADATA_SEED, MPL_TOKEN_METADATA_ID};
use crate::state::{Integration, Market};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateMarketParams {
    /// Window length in slots, in [MIN_WINDOW_SLOTS, MAX_WINDOW_SLOTS].
    pub window_slots: u64,
    /// Slots after sealing before refunds open if the VRF never fulfils;
    /// in [MIN_VRF_TIMEOUT_SLOTS, MAX_VRF_TIMEOUT_SLOTS] and > window_slots.
    pub vrf_timeout_slots: u64,
    /// Absolute cap of one entry (quote base units), > 0.
    pub max_entry_amount: u64,
    /// Relative cap: an entry may be at most this share of the window total
    /// (after including itself), in [500, 10000].
    pub max_entry_bps: u16,
    /// Windows whose total is <= this skip the relative cap (so the first
    /// entries of a window are not blocked by the bps rule).
    pub entry_floor_amount: u64,
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

/// `create_market(params)`
///
/// * Who: the creator (signer); pays rents + MARKET_CREATION_FEE_LAMPORTS.
/// * State: none. `token_mint` is a fresh keypair signer. Refused by the
///   wind-down build (`WindingDown`).
/// * Never: after this instruction the mint authority is `None`, the freeze
///   authority is `None`, and every parameter except the curve reserves and
///   the window counters is frozen. No instruction can edit them.
#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The launched token. Classic SPL Token program, 6 decimals, no freeze
    /// authority. Mint authority is the market PDA only until the supply is
    /// minted inside this same instruction.
    #[account(
        init,
        payer = creator,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = market,
        mint::token_program = token_program,
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,

    /// Quote mint: wrapped SOL only (checked in the handler,
    /// `check_quote_mint`).
    #[account(mint::token_program = quote_token_program)]
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, token_mint.key().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = token_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program,
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = market,
        associated_token::token_program = quote_token_program,
    )]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    /// Optional integration (host fee). Pass the program id for none.
    pub integration: Option<Account<'info, Integration>>,

    /// CHECK: pinned to the hard-coded treasury key; receives lamports only.
    #[account(mut, address = PLATFORM_TREASURY)]
    pub platform_treasury: UncheckedAccount<'info>,

    /// CHECK: the Metaplex metadata PDA of `token_mint` (seeds checked here),
    /// created by the Token Metadata program in this instruction, immutable.
    #[account(
        mut,
        seeds = [METADATA_SEED, MPL_TOKEN_METADATA_ID.as_ref(), token_mint.key().as_ref()],
        bump,
        seeds::program = MPL_TOKEN_METADATA_ID,
    )]
    pub token_metadata: UncheckedAccount<'info>,

    /// CHECK: pinned to the Metaplex Token Metadata program id.
    #[account(address = MPL_TOKEN_METADATA_ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Accept wrapped SOL (`NATIVE_MINT`, the classic SPL Token native mint) and
/// nothing else.
///
/// Token-2022 was refused as a whole by the second review (2026-10-28): its
/// extensions give third parties powers the program is built to exclude
/// (`Pausable` stops every transfer like a freeze authority; `MemoTransfer`
/// and `CpiGuard` on a recipient make the final page fail at will; the
/// others each need their own analysis). Its native mint has another
/// address, so it stays refused.
///
/// Any other classic mint is refused since the final review (2026-10-29):
/// the shutdown must be able to pay out every entry, whatever its owner
/// did, or one entry holds the program close (and the operator's ~1.97 SOL
/// of program rent) hostage. SOL paid to the owner's wallet is the only
/// payout nobody can block: with another quote mint `force_exit` would have
/// to pay into the owner's token account, which a player can hand to
/// someone else for good (classic SPL Token `SetAuthority(AccountOwner)`:
/// its associated address then belongs to a foreign owner forever) or
/// leave missing, so that whoever drains pays its rent (a griefer could
/// farm that per wallet). Every planned market is quoted in wSOL; the stake
/// minimum, the curve's 30-unit virtual reserve and the fees are all sized
/// for it.
pub fn check_quote_mint(mint: &Pubkey) -> Result<()> {
    require!(*mint == NATIVE_MINT, LadleError::QuoteMintNotWsol);
    Ok(())
}

/// The bounds `create_market` enforces on its parameters (pure, for tests).
pub fn check_params(params: &CreateMarketParams) -> Result<()> {
    require!(
        (MIN_WINDOW_SLOTS..=MAX_WINDOW_SLOTS).contains(&params.window_slots),
        LadleError::WindowSlotsOutOfRange
    );
    require!(
        params.vrf_timeout_slots >= MIN_VRF_TIMEOUT_SLOTS
            && params.vrf_timeout_slots <= MAX_VRF_TIMEOUT_SLOTS
            && params.vrf_timeout_slots > params.window_slots,
        LadleError::VrfTimeoutOutOfRange
    );
    require!(
        (MIN_MAX_ENTRY_BPS..=MAX_MAX_ENTRY_BPS).contains(&params.max_entry_bps),
        LadleError::MaxEntryBpsOutOfRange
    );
    // below the minimum stake nobody could ever enter
    require!(params.max_entry_amount >= MIN_ENTRY_AMOUNT, LadleError::MaxEntryAmountTooSmall);
    require!(
        params.name.len() <= MAX_NAME_LEN
            && params.symbol.len() <= MAX_SYMBOL_LEN
            && params.uri.len() <= MAX_URI_LEN,
        LadleError::MetadataTooLong
    );
    Ok(())
}

pub fn handle_create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    require!(!WIND_DOWN, LadleError::WindingDown);
    // --- bounds ---
    check_params(&params)?;

    // --- quote mint: wSOL only (its account is the classic SPL Token
    // program's, which `mint::token_program` ties to `quote_token_program`) ---
    check_quote_mint(&ctx.accounts.quote_mint.key())?;

    // --- market record ---
    let integration_key = match &ctx.accounts.integration {
        Some(i) => i.key(),
        None => Pubkey::default(),
    };
    let token_mint_key = ctx.accounts.token_mint.key();
    let bump = ctx.bumps.market;
    {
        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.token_mint = token_mint_key;
        market.quote_mint = ctx.accounts.quote_mint.key();
        market.quote_program = ctx.accounts.quote_token_program.key();
        market.integration = integration_key;
        market.curve = Curve { x: INITIAL_VIRTUAL_X, y: INITIAL_VIRTUAL_Y };
        market.window_slots = params.window_slots;
        market.vrf_timeout_slots = params.vrf_timeout_slots;
        market.max_entry_amount = params.max_entry_amount;
        market.max_entry_bps = params.max_entry_bps;
        market.entry_floor_amount = params.entry_floor_amount;
        market.window_count = 0;
        market.next_settle_index = 0;
        market.has_active_window = false;
        market.active_window = 0;
        market.quote_vault = ctx.accounts.quote_vault.key();
        market.token_vault = ctx.accounts.token_vault.key();
        market.bump = bump;
        market.name = params.name;
        market.symbol = params.symbol;
        market.uri = params.uri;
        market.notice_start = 0;
        market.live_windows = 0;
        // every window of this market will be counted (close_market needs it)
        market.counts_windows = true;
        market.reserved = [0u8; 47];
    }

    // --- mint the whole supply, then drop the mint authority ---
    let signer_seeds: &[&[u8]] = &[MARKET_SEED, token_mint_key.as_ref(), &[bump]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            &[signer_seeds],
        ),
        TOKEN_SUPPLY,
    )?;
    // name / symbol / image for wallets and explorers, written once, immutable
    // (needs the mint authority, so it runs before the authority is dropped)
    {
        let m = &ctx.accounts.market;
        crate::metadata::create_metadata(
            &ctx.accounts.token_metadata.to_account_info(),
            &ctx.accounts.token_mint.to_account_info(),
            &m.to_account_info(),
            &ctx.accounts.creator.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.token_metadata_program.to_account_info(),
            signer_seeds,
            &m.name,
            &m.symbol,
            &m.uri,
        )?;
    }
    token_interface::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            SetAuthority {
                current_authority: ctx.accounts.market.to_account_info(),
                account_or_mint: ctx.accounts.token_mint.to_account_info(),
            },
            &[signer_seeds],
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    // --- creation fee ---
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.platform_treasury.to_account_info(),
            },
        ),
        MARKET_CREATION_FEE_LAMPORTS,
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> CreateMarketParams {
        CreateMarketParams {
            window_slots: 560,
            vrf_timeout_slots: 900,
            max_entry_amount: 5_000_000_000,
            max_entry_bps: 2_000,
            entry_floor_amount: 500_000_000,
            name: "Ladle".into(),
            symbol: "LADLE".into(),
            uri: "https://useladle.fun/token.json".into(),
        }
    }

    #[test]
    fn max_entry_must_allow_the_minimum_stake() {
        assert!(check_params(&params()).is_ok());
        let mut p = params();
        p.max_entry_amount = MIN_ENTRY_AMOUNT;
        assert!(check_params(&p).is_ok());
        p.max_entry_amount = MIN_ENTRY_AMOUNT - 1;
        assert_eq!(
            check_params(&p).unwrap_err(),
            error!(LadleError::MaxEntryAmountTooSmall)
        );
        p.max_entry_amount = 0;
        assert!(check_params(&p).is_err());
    }

    #[test]
    fn vrf_timeout_is_bounded_both_ways() {
        // review 2026-10-28: with no upper bound, refund_deadline overflowed
        // (u64::MAX) or never came, and refunds never opened
        let mut p = params();
        p.vrf_timeout_slots = MAX_VRF_TIMEOUT_SLOTS;
        assert!(check_params(&p).is_ok());
        p.vrf_timeout_slots = MAX_VRF_TIMEOUT_SLOTS + 1;
        assert_eq!(check_params(&p).unwrap_err(), error!(LadleError::VrfTimeoutOutOfRange));
        p.vrf_timeout_slots = u64::MAX;
        assert_eq!(check_params(&p).unwrap_err(), error!(LadleError::VrfTimeoutOutOfRange));
        p.vrf_timeout_slots = MIN_VRF_TIMEOUT_SLOTS - 1;
        p.window_slots = MIN_WINDOW_SLOTS;
        assert_eq!(check_params(&p).unwrap_err(), error!(LadleError::VrfTimeoutOutOfRange));
        // the longest round still has a timeout that fits
        assert!(MAX_WINDOW_SLOTS < MAX_VRF_TIMEOUT_SLOTS);
    }

    #[test]
    fn only_wrapped_sol_quotes() {
        // final review 2026-10-29: a market quoted in any other classic mint
        // let a player make their own entry unpayable at the shutdown (their
        // ATA handed to another owner), or farm the drain's ATA rents
        assert!(check_quote_mint(&NATIVE_MINT).is_ok());
        // Token-2022's native mint (second review: Token-2022 stays refused)
        let token_2022_native = Pubkey::from_str_const("9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP");
        for other in [token_2022_native, Pubkey::new_unique(), anchor_spl::token::ID, Pubkey::default()] {
            assert_eq!(check_quote_mint(&other).unwrap_err(), error!(LadleError::QuoteMintNotWsol));
        }
    }

    #[test]
    fn wind_down_is_off_in_the_normal_build() {
        assert_eq!(WIND_DOWN, cfg!(feature = "wind-down"));
    }

    #[test]
    fn other_bounds_still_hold() {
        let mut p = params();
        p.window_slots = MAX_WINDOW_SLOTS + 1;
        assert!(check_params(&p).is_err());
        let mut p = params();
        p.vrf_timeout_slots = p.window_slots;
        assert!(check_params(&p).is_err());
        let mut p = params();
        p.max_entry_bps = MIN_MAX_ENTRY_BPS - 1;
        assert!(check_params(&p).is_err());
        let mut p = params();
        p.symbol = "X".repeat(MAX_SYMBOL_LEN + 1);
        assert!(check_params(&p).is_err());
    }
}
