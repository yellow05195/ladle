use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
use anchor_spl::token_interface::spl_token_2022::extension::{
    BaseStateWithExtensions, ExtensionType, StateWithExtensions,
};
use anchor_spl::token_interface::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_interface::spl_token_2022::state::Mint as MintState;
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
    /// >= MIN_VRF_TIMEOUT_SLOTS and > window_slots.
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
/// * State: none. `token_mint` is a fresh keypair signer.
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

    /// Quote mint (SPL Token or Token-2022). Checked in the handler for
    /// freeze authority / transfer fee / transfer hook / permanent delegate.
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

/// Accept classic SPL Token mints and Token-2022 mints; reject anything that
/// could make `escrow balance != sum(stakes)` or freeze user funds.
pub fn check_quote_mint(info: &AccountInfo) -> Result<()> {
    let owner = *info.owner;
    let is_classic = owner == anchor_spl::token::ID;
    let is_2022 = owner == anchor_spl::token_2022::ID;
    require!(is_classic || is_2022, LadleError::QuoteMintUnknownProgram);

    let data = info.try_borrow_data()?;
    let state = StateWithExtensions::<MintState>::unpack(&data)?;
    require!(
        state.base.freeze_authority.is_none(),
        LadleError::QuoteMintHasFreezeAuthority
    );
    if is_2022 {
        for ext in state.get_extension_types()? {
            match ext {
                ExtensionType::TransferFeeConfig => {
                    return err!(LadleError::QuoteMintHasTransferFee)
                }
                ExtensionType::TransferHook => return err!(LadleError::QuoteMintHasTransferHook),
                ExtensionType::PermanentDelegate => {
                    return err!(LadleError::QuoteMintHasPermanentDelegate)
                }
                _ => {}
            }
        }
    }
    Ok(())
}

pub fn handle_create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    // --- bounds ---
    require!(
        (MIN_WINDOW_SLOTS..=MAX_WINDOW_SLOTS).contains(&params.window_slots),
        LadleError::WindowSlotsOutOfRange
    );
    require!(
        params.vrf_timeout_slots >= MIN_VRF_TIMEOUT_SLOTS
            && params.vrf_timeout_slots > params.window_slots,
        LadleError::VrfTimeoutOutOfRange
    );
    require!(
        (MIN_MAX_ENTRY_BPS..=MAX_MAX_ENTRY_BPS).contains(&params.max_entry_bps),
        LadleError::MaxEntryBpsOutOfRange
    );
    require!(params.max_entry_amount > 0, LadleError::MaxEntryAmountZero);
    require!(
        params.name.len() <= MAX_NAME_LEN
            && params.symbol.len() <= MAX_SYMBOL_LEN
            && params.uri.len() <= MAX_URI_LEN,
        LadleError::MetadataTooLong
    );

    // --- quote mint ---
    check_quote_mint(&ctx.accounts.quote_mint.to_account_info())?;

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
