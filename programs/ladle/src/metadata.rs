//! Metaplex Token Metadata for the launched token, written once in
//! `create_market` and immutable (`is_mutable = false`): wallets and
//! explorers show the token's name, symbol and image, and nobody (the
//! program included) can change them afterwards.
//!
//! Hand-rolled CPI to `CreateMetadataAccountV3` (instruction 33), like the
//! ORAO CPI in `vrf.rs`, so the program does not pull a crate pinned to
//! another Anchor version. Accounts, in order:
//!   0. metadata         (writable)          PDA ["metadata", MPL, mint] of MPL
//!   1. mint
//!   2. mint_authority   (signer)            the market PDA
//!   3. payer            (signer, writable)  the market creator
//!   4. update_authority                     the market PDA (moot: immutable)
//!   5. system_program

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

/// Metaplex Token Metadata program (same id on mainnet and devnet).
pub const MPL_TOKEN_METADATA_ID: Pubkey = pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
pub const METADATA_SEED: &[u8] = b"metadata";
const CREATE_METADATA_ACCOUNT_V3: u8 = 33;

fn push_str(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u32).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

/// Borsh body of `CreateMetadataAccountV3 { data: DataV2, is_mutable, collection_details }`.
pub fn create_metadata_v3_data(name: &str, symbol: &str, uri: &str) -> Vec<u8> {
    let mut d = Vec::with_capacity(1 + 12 + name.len() + symbol.len() + uri.len() + 8);
    d.push(CREATE_METADATA_ACCOUNT_V3);
    push_str(&mut d, name);
    push_str(&mut d, symbol);
    push_str(&mut d, uri);
    d.extend_from_slice(&0u16.to_le_bytes()); // seller_fee_basis_points
    d.push(0); // creators: None
    d.push(0); // collection: None
    d.push(0); // uses: None
    d.push(0); // is_mutable: false
    d.push(0); // collection_details: None
    d
}

#[allow(clippy::too_many_arguments)]
pub fn create_metadata<'info>(
    metadata: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    metadata_program: &AccountInfo<'info>,
    signer_seeds: &[&[u8]],
    name: &str,
    symbol: &str,
    uri: &str,
) -> Result<()> {
    let ix = Instruction {
        program_id: MPL_TOKEN_METADATA_ID,
        accounts: vec![
            AccountMeta::new(metadata.key(), false),
            AccountMeta::new_readonly(mint.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(authority.key(), false),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data: create_metadata_v3_data(name, symbol, uri),
    };
    invoke_signed(
        &ix,
        &[
            metadata.clone(),
            mint.clone(),
            authority.clone(),
            payer.clone(),
            authority.clone(),
            system_program.clone(),
            metadata_program.clone(),
        ],
        &[signer_seeds],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_v3_layout() {
        let d = create_metadata_v3_data("Ladle", "LADLE", "https://x");
        assert_eq!(d[0], 33);
        assert_eq!(&d[1..5], &5u32.to_le_bytes());
        assert_eq!(&d[5..10], b"Ladle");
        // name(4+5) symbol(4+5) uri(4+9) fee(2) 3 options, is_mutable, collection_details
        assert_eq!(d.len(), 1 + 9 + 9 + 13 + 2 + 3 + 1 + 1);
        assert_eq!(&d[d.len() - 2..], &[0, 0]);
    }
}
