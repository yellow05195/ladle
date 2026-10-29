//! Mock of ORAO VRF `request_v2` for tests/cu-bench (see Cargo.toml).
//!
//! `request_v2(seed: [u8; 32])`, accounts as in programs/ladle/src/vrf.rs:
//!   0. payer (signer, writable)  1. network_state  2. treasury (writable)
//!   3. request (writable, PDA ["orao-vrf-randomness-request", seed])
//!   4. system_program
//! Errors as ORAO's: 6000 ZeroSeed, 6001 SeedAlreadyInUse, 6009
//! UnknownTreasuryGiven; 2006 (Anchor ConstraintSeeds) for a wrong request
//! address.

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, program::invoke,
    program::invoke_signed, program_error::ProgramError, pubkey::Pubkey, rent::Rent, sysvar::Sysvar,
};
use solana_system_interface::instruction as system_instruction;

entrypoint!(process);

/// sha256("global:request_v2")[..8]
const REQUEST_V2: [u8; 8] = [38, 151, 209, 6, 195, 102, 28, 217];
/// sha256("account:RandomnessV2")[..8]
const RANDOMNESS_V2: [u8; 8] = [139, 239, 184, 215, 227, 86, 191, 226];
/// ORAO's pending request account size.
const PENDING_SIZE: usize = 8 + 741;
/// ORAO's request fee, unless the network state names another
/// (`config.request_fee`, the u64 after disc[8] authority[32] treasury[32],
/// as ORAO's; zero there means this default).
const FEE: u64 = 500_000;

fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() != 40 || data[..8] != REQUEST_V2 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let seed: [u8; 32] = data[8..40].try_into().unwrap();
    let [payer, network_state, treasury, request, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if seed == [0u8; 32] {
        return Err(ProgramError::Custom(6000));
    }
    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    // the treasury named in the network state (disc[8] authority[32] treasury[32] request_fee[8])
    let fee = {
        let ns = network_state.try_borrow_data()?;
        if network_state.owner != program_id || ns.len() < 80 || ns[40..72] != treasury.key.to_bytes() {
            return Err(ProgramError::Custom(6009));
        }
        let f = u64::from_le_bytes(ns[72..80].try_into().unwrap());
        if f == 0 { FEE } else { f }
    };
    let (pda, bump) = Pubkey::find_program_address(&[b"orao-vrf-randomness-request", &seed], program_id);
    if pda != *request.key {
        return Err(ProgramError::Custom(2006));
    }
    if request.owner == program_id || !request.data_is_empty() {
        return Err(ProgramError::Custom(6001));
    }
    invoke(
        &system_instruction::transfer(payer.key, treasury.key, fee),
        &[payer.clone(), treasury.clone(), system_program.clone()],
    )?;
    let lamports = Rent::get()?.minimum_balance(PENDING_SIZE);
    invoke_signed(
        &system_instruction::create_account(payer.key, request.key, lamports, PENDING_SIZE as u64, program_id),
        &[payer.clone(), request.clone(), system_program.clone()],
        &[&[b"orao-vrf-randomness-request", &seed, &[bump]]],
    )?;
    // Pending: client = payer, seed, no responses yet
    let mut d = request.try_borrow_mut_data()?;
    d[..8].copy_from_slice(&RANDOMNESS_V2);
    d[8] = 0;
    d[9..41].copy_from_slice(payer.key.as_ref());
    d[41..73].copy_from_slice(&seed);
    d[73..77].copy_from_slice(&0u32.to_le_bytes());
    Ok(())
}
