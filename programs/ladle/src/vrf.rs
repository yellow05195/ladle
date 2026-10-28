//! ORAO VRF integration. Every ORAO-specific byte lives in this file behind
//! two functions: [`request`] (CPI `request_v2`) and [`read_fulfilled`]
//! (parse a randomness account).
//!
//! Why hand-rolled: the `orao-solana-vrf` crate (0.7.0, the latest as of
//! 2026-10) pins `anchor-lang ^0.32`, which cannot coexist with the
//! `anchor-lang 1.2` this program uses (different `AccountInfo`/`Pubkey`
//! types). The instruction and account layouts below are copied from the
//! crate's source (`src/lib.rs`, `src/state/randomness_v2.rs`,
//! `src/state/randomness.rs`, `src/state/network_state.rs`) and the Anchor
//! discriminators are verified by unit tests.
//!
//! Program id (same on devnet and mainnet): VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y
//!
//! `request_v2(seed: [u8; 32])` accounts, in order:
//!   0. payer          (signer, writable)  pays the ORAO fee + request rent
//!   1. network_state  (writable)          PDA ["orao-vrf-network-configuration"]
//!   2. treasury       (writable)          `network_state.config.treasury`
//!   3. request        (writable)          PDA ["orao-vrf-randomness-request", seed]
//!   4. system_program
//!
//! Randomness account (`RandomnessV2`), borsh:
//!   [0..8]   discriminator sha256("account:RandomnessV2")[..8]
//!   [8]      enum tag: 0 = Pending, 1 = Fulfilled
//!   Pending:   client[32] seed[32] responses: Vec<{pubkey[32], randomness[64]}>
//!   Fulfilled: client[32] seed[32] randomness[64]
//!
//! Legacy `Randomness` (v1) account, borsh (ORAO may still serve some):
//!   [0..8]   sha256("account:Randomness")[..8]
//!   seed[32] randomness[64] responses: Vec<...>; fulfilled iff randomness != 0.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;

use crate::errors::LadleError;

pub const ORAO_VRF_ID: Pubkey = pubkey!("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
pub const NETWORK_STATE_SEED: &[u8] = b"orao-vrf-network-configuration";
pub const RANDOMNESS_SEED: &[u8] = b"orao-vrf-randomness-request";

/// sha256("global:request_v2")[..8]
const REQUEST_V2_DISCRIMINATOR: [u8; 8] = [38, 151, 209, 6, 195, 102, 28, 217];
/// sha256("account:RandomnessV2")[..8]
const RANDOMNESS_V2_DISCRIMINATOR: [u8; 8] = [139, 239, 184, 215, 227, 86, 191, 226];
/// sha256("account:Randomness")[..8]
const RANDOMNESS_V1_DISCRIMINATOR: [u8; 8] = [188, 96, 216, 248, 93, 94, 49, 112];
/// sha256("account:NetworkState")[..8]
const NETWORK_STATE_DISCRIMINATOR: [u8; 8] = [212, 237, 148, 56, 97, 245, 51, 169];

/// NetworkState layout: disc[8] authority[32] treasury[32] request_fee[8] ...
const NETWORK_STATE_TREASURY_OFFSET: usize = 8 + 32;

const V2_TAG_PENDING: u8 = 0;
const V2_TAG_FULFILLED: u8 = 1;

/// Accounts needed by the `request_v2` CPI.
pub struct RequestAccounts<'a, 'info> {
    pub payer: &'a AccountInfo<'info>,
    pub network_state: &'a AccountInfo<'info>,
    pub treasury: &'a AccountInfo<'info>,
    pub request: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
    pub vrf_program: &'a AccountInfo<'info>,
}

/// Read the treasury pubkey from the ORAO network state account, checking
/// ownership and discriminator. (ORAO re-checks all of this inside the CPI;
/// the check here only produces a clearer error.)
pub fn read_treasury(network_state: &AccountInfo) -> Result<Pubkey> {
    require!(*network_state.owner == ORAO_VRF_ID, LadleError::VrfBadNetworkState);
    let data = network_state.try_borrow_data()?;
    require!(
        data.len() >= NETWORK_STATE_TREASURY_OFFSET + 32
            && data[..8] == NETWORK_STATE_DISCRIMINATOR,
        LadleError::VrfBadNetworkState
    );
    let mut key = [0u8; 32];
    key.copy_from_slice(&data[NETWORK_STATE_TREASURY_OFFSET..NETWORK_STATE_TREASURY_OFFSET + 32]);
    Ok(Pubkey::new_from_array(key))
}

/// CPI into ORAO `request_v2` with `seed`. The payer pays the ORAO fee.
///
/// The request PDA itself is validated by the ORAO program (its `seeds`
/// constraint), so the CPI fails if `request` is not the PDA for `seed`.
pub fn request(accs: RequestAccounts, seed: [u8; 32]) -> Result<()> {
    require!(accs.vrf_program.key() == ORAO_VRF_ID, LadleError::VrfBadOwner);
    let treasury = read_treasury(accs.network_state)?;
    require!(accs.treasury.key() == treasury, LadleError::VrfBadTreasury);

    let mut data = Vec::with_capacity(8 + 32);
    data.extend_from_slice(&REQUEST_V2_DISCRIMINATOR);
    data.extend_from_slice(&seed);

    let ix = Instruction {
        program_id: ORAO_VRF_ID,
        accounts: vec![
            AccountMeta::new(accs.payer.key(), true),
            AccountMeta::new(accs.network_state.key(), false),
            AccountMeta::new(accs.treasury.key(), false),
            AccountMeta::new(accs.request.key(), false),
            AccountMeta::new_readonly(accs.system_program.key(), false),
        ],
        data,
    };
    invoke(
        &ix,
        &[
            accs.payer.clone(),
            accs.network_state.clone(),
            accs.treasury.clone(),
            accs.request.clone(),
            accs.system_program.clone(),
        ],
    )
    .map_err(Into::into)
}

/// State of an ORAO request account as seen by this program.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VrfRequestState {
    /// The account does not exist (no data, no lamports).
    Missing,
    /// The request exists and no quorum of responses has landed yet.
    Pending,
    /// The 64 bytes of randomness.
    Fulfilled([u8; 64]),
}

/// Classify an ORAO request account.
///
/// ASSUMPTION TO VERIFY ON DEVNET (research/G2-VRF-INTEGRATION-NOTES.md, §3):
/// "ORAO `fulfill_v2` reallocs the request account and keeps it; it does not
/// close it." `request_vrf` creates the account in the same transaction that
/// sets `window.vrf_requested`, so for a requested window `Missing` can only
/// mean the account was closed afterwards. `refund_window` therefore treats
/// `Missing` as an error (`VrfRequestMissing`): if the request payer could
/// ever close a fulfilled account through ORAO, an empty account would be a
/// free option to dodge a draw they already saw.
///
/// * `Err` – wrong owner, unknown layout, or a seed that is not `expected_seed`.
pub fn read_state(account: &AccountInfo, expected_seed: &[u8; 32]) -> Result<VrfRequestState> {
    let data = account.try_borrow_data()?;
    classify(&data, account.lamports(), account.owner, expected_seed)
}

/// Pure core of [`read_state`], split out for tests.
pub fn classify(
    data: &[u8],
    lamports: u64,
    owner: &Pubkey,
    expected_seed: &[u8; 32],
) -> Result<VrfRequestState> {
    if data.is_empty() && lamports == 0 {
        return Ok(VrfRequestState::Missing);
    }
    require!(*owner == ORAO_VRF_ID, LadleError::VrfBadOwner);
    Ok(match parse_randomness(data, expected_seed)? {
        Some(r) => VrfRequestState::Fulfilled(r),
        None => VrfRequestState::Pending,
    })
}

/// Parse an ORAO randomness account for `fulfill`.
///
/// * `Ok(Some(r))` – fulfilled with 64 bytes of randomness for `expected_seed`.
/// * `Ok(None)` – not fulfilled yet: the request is pending, or the account
///   does not exist (see [`read_state`] for the distinction).
/// * `Err` – wrong owner, unknown layout, or a seed that is not `expected_seed`.
pub fn read_fulfilled(account: &AccountInfo, expected_seed: &[u8; 32]) -> Result<Option<[u8; 64]>> {
    Ok(match read_state(account, expected_seed)? {
        VrfRequestState::Fulfilled(r) => Some(r),
        VrfRequestState::Pending | VrfRequestState::Missing => None,
    })
}

/// Pure parser, split out for tests.
pub fn parse_randomness(data: &[u8], expected_seed: &[u8; 32]) -> Result<Option<[u8; 64]>> {
    require!(data.len() >= 8, LadleError::VrfBadAccountData);
    let disc = &data[..8];
    if disc == RANDOMNESS_V2_DISCRIMINATOR {
        // tag at 8, client at 9..41, seed at 41..73
        require!(data.len() >= 73, LadleError::VrfBadAccountData);
        let tag = data[8];
        let seed = &data[41..73];
        require!(seed == expected_seed, LadleError::VrfSeedMismatch);
        match tag {
            V2_TAG_PENDING => Ok(None),
            V2_TAG_FULFILLED => {
                require!(data.len() >= 73 + 64, LadleError::VrfBadAccountData);
                let mut r = [0u8; 64];
                r.copy_from_slice(&data[73..73 + 64]);
                // ORAO never stores an all-zero fulfilled randomness, but
                // treat it as pending to be safe: zero would make every roll 0.
                Ok(if r.iter().all(|b| *b == 0) { None } else { Some(r) })
            }
            _ => Err(LadleError::VrfBadAccountData.into()),
        }
    } else if disc == RANDOMNESS_V1_DISCRIMINATOR {
        // seed at 8..40, randomness at 40..104
        require!(data.len() >= 104, LadleError::VrfBadAccountData);
        let seed = &data[8..40];
        require!(seed == expected_seed, LadleError::VrfSeedMismatch);
        let mut r = [0u8; 64];
        r.copy_from_slice(&data[40..104]);
        Ok(if r.iter().all(|b| *b == 0) { None } else { Some(r) })
    } else {
        Err(LadleError::VrfBadAccountData.into())
    }
}

/// Off-chain helper for SDK/keeper authors and tests: the ORAO request PDA.
pub fn randomness_account_address(seed: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[RANDOMNESS_SEED, seed], &ORAO_VRF_ID).0
}

/// Off-chain helper: the ORAO network state PDA.
pub fn network_state_address() -> Pubkey {
    Pubkey::find_program_address(&[NETWORK_STATE_SEED], &ORAO_VRF_ID).0
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_sha256_hasher::hashv;
    use std::str::FromStr;

    fn disc(s: &str) -> [u8; 8] {
        let h = hashv(&[s.as_bytes()]).to_bytes();
        h[..8].try_into().unwrap()
    }

    #[test]
    fn discriminators_match_anchor_convention() {
        assert_eq!(REQUEST_V2_DISCRIMINATOR, disc("global:request_v2"));
        assert_eq!(RANDOMNESS_V2_DISCRIMINATOR, disc("account:RandomnessV2"));
        assert_eq!(RANDOMNESS_V1_DISCRIMINATOR, disc("account:Randomness"));
        assert_eq!(NETWORK_STATE_DISCRIMINATOR, disc("account:NetworkState"));
    }

    #[test]
    fn program_id_parses() {
        assert_eq!(
            Pubkey::from_str("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y").unwrap(),
            ORAO_VRF_ID
        );
    }

    #[test]
    fn parse_v2_pending_and_fulfilled() {
        let seed = [7u8; 32];
        let client = [1u8; 32];
        // pending
        let mut pending = Vec::new();
        pending.extend_from_slice(&RANDOMNESS_V2_DISCRIMINATOR);
        pending.push(V2_TAG_PENDING);
        pending.extend_from_slice(&client);
        pending.extend_from_slice(&seed);
        pending.extend_from_slice(&0u32.to_le_bytes()); // empty responses vec
        assert_eq!(parse_randomness(&pending, &seed).unwrap(), None);
        // fulfilled
        let rnd: [u8; 64] = core::array::from_fn(|i| (i as u8).wrapping_mul(3).wrapping_add(1));
        let mut done = Vec::new();
        done.extend_from_slice(&RANDOMNESS_V2_DISCRIMINATOR);
        done.push(V2_TAG_FULFILLED);
        done.extend_from_slice(&client);
        done.extend_from_slice(&seed);
        done.extend_from_slice(&rnd);
        assert_eq!(parse_randomness(&done, &seed).unwrap(), Some(rnd));
        // wrong seed is an error, not None
        assert!(parse_randomness(&done, &[8u8; 32]).is_err());
        // bad tag
        done[8] = 2;
        assert!(parse_randomness(&done, &seed).is_err());
    }

    #[test]
    fn parse_v1() {
        let seed = [9u8; 32];
        let mut v1 = Vec::new();
        v1.extend_from_slice(&RANDOMNESS_V1_DISCRIMINATOR);
        v1.extend_from_slice(&seed);
        v1.extend_from_slice(&[0u8; 64]);
        v1.extend_from_slice(&0u32.to_le_bytes());
        assert_eq!(parse_randomness(&v1, &seed).unwrap(), None);
        v1[40] = 0xAB;
        let r = parse_randomness(&v1, &seed).unwrap().unwrap();
        assert_eq!(r[0], 0xAB);
        assert!(parse_randomness(&[0u8; 8], &seed).is_err());
    }

    fn fulfilled_v2(seed: &[u8; 32], rnd: &[u8; 64]) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(&RANDOMNESS_V2_DISCRIMINATOR);
        v.push(V2_TAG_FULFILLED);
        v.extend_from_slice(&[1u8; 32]);
        v.extend_from_slice(seed);
        v.extend_from_slice(rnd);
        v
    }

    fn pending_v2(seed: &[u8; 32]) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(&RANDOMNESS_V2_DISCRIMINATOR);
        v.push(V2_TAG_PENDING);
        v.extend_from_slice(&[1u8; 32]);
        v.extend_from_slice(seed);
        v.extend_from_slice(&0u32.to_le_bytes());
        v.resize(8 + 741, 0); // PENDING_SIZE padding, as ORAO allocates it
        v
    }

    #[test]
    fn classify_missing_pending_fulfilled() {
        let seed = [3u8; 32];
        let rnd = [0xCDu8; 64];
        let system = Pubkey::default();
        // Missing: no data and no lamports, whoever the owner is.
        assert_eq!(classify(&[], 0, &system, &seed).unwrap(), VrfRequestState::Missing);
        // An empty but funded account is not "missing": wrong owner is an error.
        assert!(classify(&[], 1_000, &system, &seed).is_err());
        // Pending
        assert_eq!(
            classify(&pending_v2(&seed), 4_455_160, &ORAO_VRF_ID, &seed).unwrap(),
            VrfRequestState::Pending
        );
        // Fulfilled
        assert_eq!(
            classify(&fulfilled_v2(&seed, &rnd), 1_346_200, &ORAO_VRF_ID, &seed).unwrap(),
            VrfRequestState::Fulfilled(rnd)
        );
        // Wrong owner on real-looking data is an error, never Pending.
        assert!(classify(&fulfilled_v2(&seed, &rnd), 1, &system, &seed).is_err());
    }

    #[test]
    fn read_state_and_read_fulfilled_through_account_info() {
        let seed = [4u8; 32];
        let rnd = [0x5Au8; 64];
        let key = Pubkey::new_unique();

        // Missing
        let mut lamports = 0u64;
        let mut data: Vec<u8> = Vec::new();
        let owner = Pubkey::default();
        let acc = AccountInfo::new(&key, false, false, &mut lamports, &mut data, &owner, false);
        assert_eq!(read_state(&acc, &seed).unwrap(), VrfRequestState::Missing);
        assert_eq!(read_fulfilled(&acc, &seed).unwrap(), None);

        // Pending
        let mut lamports = 4_455_160u64;
        let mut data = pending_v2(&seed);
        let acc = AccountInfo::new(&key, false, true, &mut lamports, &mut data, &ORAO_VRF_ID, false);
        assert_eq!(read_state(&acc, &seed).unwrap(), VrfRequestState::Pending);
        assert_eq!(read_fulfilled(&acc, &seed).unwrap(), None);

        // Fulfilled
        let mut lamports = 1_346_200u64;
        let mut data = fulfilled_v2(&seed, &rnd);
        let acc = AccountInfo::new(&key, false, true, &mut lamports, &mut data, &ORAO_VRF_ID, false);
        assert_eq!(read_state(&acc, &seed).unwrap(), VrfRequestState::Fulfilled(rnd));
        assert_eq!(read_fulfilled(&acc, &seed).unwrap(), Some(rnd));
        // seed mismatch is an error on both paths
        assert!(read_state(&acc, &[9u8; 32]).is_err());
        assert!(read_fulfilled(&acc, &[9u8; 32]).is_err());
    }

    #[test]
    fn pda_helpers_are_derivable() {
        let ns = network_state_address();
        assert_ne!(ns, Pubkey::default());
        let r = randomness_account_address(&[1u8; 32]);
        assert_ne!(r, ns);
    }
}
