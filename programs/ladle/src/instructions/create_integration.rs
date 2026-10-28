use anchor_lang::prelude::*;

use crate::consts::*;
use crate::errors::LadleError;
use crate::law::MAX_HOST_FEE_BPS;
use crate::state::Integration;

/// `create_integration(host_fee_bps)`
///
/// * Who: the host (signer, pays rent).
/// * State: none (one Integration per host key).
/// * Never: changes afterwards. The fee is immutable; there is no instruction
///   that touches an Integration once created. Fails if `host_fee_bps >
///   MAX_HOST_FEE_BPS` (300).
#[derive(Accounts)]
pub struct CreateIntegration<'info> {
    #[account(mut)]
    pub host: Signer<'info>,
    #[account(
        init,
        payer = host,
        space = 8 + Integration::INIT_SPACE,
        seeds = [INTEGRATION_SEED, host.key().as_ref()],
        bump,
    )]
    pub integration: Account<'info, Integration>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_integration(ctx: Context<CreateIntegration>, host_fee_bps: u16) -> Result<()> {
    require!(host_fee_bps as u64 <= MAX_HOST_FEE_BPS, LadleError::HostFeeTooHigh);
    let integration = &mut ctx.accounts.integration;
    integration.host = ctx.accounts.host.key();
    integration.host_fee_bps = host_fee_bps;
    integration.bump = ctx.bumps.integration;
    Ok(())
}
