//! The draw law and the settlement arithmetic.
//!
//! This module is the on-chain twin of `/sdk/src/law.ts`. The two must agree
//! bit for bit: the browser "recompute" button re-derives every roll and every
//! share of a window from public data with the TypeScript version and compares.
//!
//! Law (gate G3, /research/G3.md):
//!   A    = sum(a_j)                    total stake of the window
//!   W    = sum(a_j * r_j)              stake-weighted roll sum
//!   w_i  = a_i * (A*(ROLL_MAX + r_i) - W)     >= 0 always
//!   S    = sum(w_i) = ROLL_MAX * A^2
//!   share_i = tokens * w_i / S   (cumulative quota rounding, see `share_step`)
//!
//! which is the pro-rata share times a multiplier 1 + (r_i - W/A)/ROLL_MAX in
//! [0, 2], linear in the entry's own roll, hence with expectation exactly 1 for
//! every entry whatever its stake. The sum of shares is exactly `tokens`.
//!
//! All arithmetic is checked or provably non-overflowing (U256 where needed).

use anchor_lang::prelude::*;
// anchor-lang 1.x no longer re-exports `solana_program::hash`; the sha256
// hasher lives in its own crate (syscall on SBF, sha2 on the host).
use solana_sha256_hasher::hashv;

// `construct_uint!` must expand where `Result` is `core::result::Result`;
// the anchor prelude aliases `Result<T>` and would break the macro.
#[allow(clippy::manual_div_ceil)] // lint fires inside the macro expansion
mod u256 {
    uint::construct_uint! {
        /// 256-bit unsigned integer used for the weight arithmetic.
        pub struct U256(4);
    }
}
pub use u256::U256;

/// Rolls are integers in [0, ROLL_MAX].
pub const ROLL_MAX: u64 = 10_000;
/// Bits of the hash used as the uniform source.
pub const ROLL_BITS: u32 = 21;
/// Basis points denominator.
pub const BPS: u64 = 10_000;

/// Platform fee in basis points, taken on the window total BEFORE the curve
/// buy. Hard-coded, immutable: no instruction can change it.
pub const PLATFORM_FEE_BPS: u64 = 100;
/// Share of the platform fee paid to whoever finalizes the window (keeper bounty).
pub const KEEPER_BOUNTY_BPS_OF_PLATFORM_FEE: u64 = 1_000; // 10 % of the platform fee
/// Maximum host (integrator) fee an integration can set at creation. Immutable afterwards.
pub const MAX_HOST_FEE_BPS: u64 = 300;

/// r = floor((ROLL_MAX+1) * (n / 2^21)^3) with n = top 21 bits of the first 8
/// bytes (little-endian u64) of the hash. Exact: n^3 < 2^63, so
/// n^3 * (ROLL_MAX+1) < 2^77 fits in u128 and `>> 63` gives a value in [0, ROLL_MAX].
pub fn roll_from_hash(hash: &[u8; 32]) -> u64 {
    let v = u64::from_le_bytes(hash[0..8].try_into().expect("8 bytes"));
    let n = (v >> (64 - ROLL_BITS)) as u128;
    let cube = n * n * n;
    let r = ((cube * (ROLL_MAX as u128 + 1)) >> 63) as u64;
    r.min(ROLL_MAX)
}

/// sha256(seed || owner || index_le_u32)
pub fn entry_hash(seed: &[u8], owner: &Pubkey, index: u32) -> [u8; 32] {
    hashv(&[seed, owner.as_ref(), &index.to_le_bytes()]).to_bytes()
}

/// Roll of one entry. Recomputable by anyone from public data.
pub fn entry_roll(seed: &[u8], owner: &Pubkey, index: u32) -> u64 {
    roll_from_hash(&entry_hash(seed, owner, index))
}

/// w_i = a_i * (A*(ROLL_MAX + r_i) - W).
/// `roll_sum` (W) is at most A*ROLL_MAX <= A*(ROLL_MAX + r_i), so the
/// subtraction never underflows for a well-formed window.
pub fn entry_weight(amount: u64, total: u64, roll: u64, roll_sum: u128) -> Result<U256> {
    require!(roll <= ROLL_MAX, LawError::RollOutOfRange);
    let a = U256::from(total) * U256::from(ROLL_MAX + roll);
    let w = U256::from(roll_sum);
    require!(a >= w, LawError::WeightUnderflow);
    Ok((a - w) * U256::from(amount))
}

/// S = ROLL_MAX * A^2
pub fn weight_sum(total: u64) -> U256 {
    U256::from(ROLL_MAX) * U256::from(total) * U256::from(total)
}

/// One step of cumulative quota rounding.
/// share = floor(tokens * (cum_before + w) / S) - floor(tokens * cum_before / S).
/// Telescopes to exactly `tokens` over all entries; each share is within one
/// base unit of its exact value; computable one entry at a time.
pub fn share_step(tokens: u64, weight_sum: U256, cum_before: U256, w: U256) -> Result<(u64, U256)> {
    require!(!weight_sum.is_zero(), LawError::ZeroWeight);
    let cum_after = cum_before.checked_add(w).ok_or(LawError::Overflow)?;
    require!(cum_after <= weight_sum, LawError::WeightOverrun);
    let t = U256::from(tokens);
    let prev = t * cum_before / weight_sum;
    let cur = t * cum_after / weight_sum;
    let share = (cur - prev).as_u64();
    Ok((share, cum_after))
}

/// floor(tokens * cum / weight_sum): the cumulative quota after the weights
/// summed in `cum`. `cum <= weight_sum` keeps it within `tokens`.
pub fn quota(tokens: u64, weight_sum: U256, cum: U256) -> Result<u64> {
    require!(!weight_sum.is_zero(), LawError::ZeroWeight);
    require!(cum <= weight_sum, LawError::WeightOverrun);
    Ok((U256::from(tokens) * cum / weight_sum).as_u64())
}

/// [`share_step`] with the previous quota carried in: `prev_quota` must be
/// `quota(tokens, weight_sum, cum_before)`. Returns (share, cum_after,
/// quota_after). Same result as `share_step` with one U256 division per
/// entry instead of two (settle_page carries the quota through a page).
pub fn share_step_carry(
    tokens: u64,
    weight_sum: U256,
    cum_before: U256,
    prev_quota: u64,
    w: U256,
) -> Result<(u64, U256, u64)> {
    let cum_after = cum_before.checked_add(w).ok_or(LawError::Overflow)?;
    let cur = quota(tokens, weight_sum, cum_after)?;
    // cum_after >= cum_before, so cur >= prev_quota.
    let share = cur.checked_sub(prev_quota).ok_or(LawError::Overflow)?;
    Ok((share, cum_after, cur))
}

/// Fee split on the window total, before the curve buy. platform + host + to_curve == total.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeSplit {
    pub platform: u64,
    pub host: u64,
    pub to_curve: u64,
}

pub fn split_fees(total: u64, host_fee_bps: u16) -> Result<FeeSplit> {
    require!(host_fee_bps as u64 <= MAX_HOST_FEE_BPS, LawError::HostFeeTooHigh);
    let platform = ((total as u128) * (PLATFORM_FEE_BPS as u128) / (BPS as u128)) as u64;
    let host = ((total as u128) * (host_fee_bps as u128) / (BPS as u128)) as u64;
    let to_curve = total
        .checked_sub(platform)
        .and_then(|x| x.checked_sub(host))
        .ok_or(LawError::Overflow)?;
    Ok(FeeSplit { platform, host, to_curve })
}

/// Constant-product curve with virtual reserves. Rounding always favours the pool.
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct Curve {
    /// virtual quote reserve
    pub x: u64,
    /// virtual token reserve
    pub y: u64,
}

fn ceil_div(a: u128, b: u128) -> u128 {
    a.div_ceil(b)
}

impl Curve {
    /// Buy with `dx` quote. Returns tokens out and the new curve.
    pub fn buy(self, dx: u64) -> Result<(u64, Curve)> {
        if dx == 0 {
            return Ok((0, self));
        }
        let k = (self.x as u128) * (self.y as u128);
        let new_x = self.x.checked_add(dx).ok_or(LawError::Overflow)?;
        let new_y = ceil_div(k, new_x as u128);
        require!(new_y <= self.y as u128, LawError::Overflow);
        let out = self.y - new_y as u64;
        Ok((out, Curve { x: new_x, y: new_y as u64 }))
    }

    /// Sell `dy` tokens. Returns quote out and the new curve.
    pub fn sell(self, dy: u64) -> Result<(u64, Curve)> {
        if dy == 0 {
            return Ok((0, self));
        }
        let k = (self.x as u128) * (self.y as u128);
        let new_y = self.y.checked_add(dy).ok_or(LawError::Overflow)?;
        let new_x = ceil_div(k, new_y as u128);
        require!(new_x <= self.x as u128, LawError::Overflow);
        let out = self.x - new_x as u64;
        // new_x <= self.x (checked above) so the cast is lossless.
        Ok((out, Curve { x: new_x as u64, y: new_y }))
    }
}

/// Serialize a U256 to 32 little-endian bytes for account storage.
pub fn u256_to_bytes(v: U256) -> [u8; 32] {
    // uint 0.10: `to_little_endian` returns the byte array.
    v.to_little_endian()
}

pub fn u256_from_bytes(b: &[u8; 32]) -> U256 {
    U256::from_little_endian(b)
}

#[error_code]
pub enum LawError {
    /// roll out of range
    RollOutOfRange,
    /// weight underflow: roll_sum exceeds total * (ROLL_MAX + roll)
    WeightUnderflow,
    /// zero total weight
    ZeroWeight,
    /// cumulative weight exceeds weight sum
    WeightOverrun,
    /// arithmetic overflow
    Overflow,
    /// host fee above the hard maximum
    HostFeeTooHigh,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roll_bounds() {
        assert_eq!(roll_from_hash(&[0u8; 32]), 0);
        assert_eq!(roll_from_hash(&[0xffu8; 32]), ROLL_MAX);
    }

    #[test]
    fn shares_sum_exactly() {
        let amounts = [1u64, 7, 1_000_000, 3, 999_999_999];
        let rolls = [0u64, 10_000, 1234, 5000, 9999];
        let total: u64 = amounts.iter().sum();
        let roll_sum: u128 = amounts.iter().zip(rolls).map(|(a, r)| *a as u128 * r as u128).sum();
        let s = weight_sum(total);
        let tokens = 123_456_789_012u64;
        let mut cum = U256::zero();
        let mut sum = 0u64;
        let mut wsum = U256::zero();
        for (a, r) in amounts.iter().zip(rolls) {
            let w = entry_weight(*a, total, r, roll_sum).unwrap();
            wsum += w;
            let (sh, c) = share_step(tokens, s, cum, w).unwrap();
            cum = c;
            sum += sh;
        }
        assert_eq!(wsum, s);
        assert_eq!(cum, s);
        assert_eq!(sum, tokens);
    }

    #[test]
    fn single_player_gets_everything() {
        let total = 5_000u64;
        let roll = 42u64;
        let roll_sum = total as u128 * roll as u128;
        let w = entry_weight(total, total, roll, roll_sum).unwrap();
        assert_eq!(w, weight_sum(total));
        let (sh, _) = share_step(777, weight_sum(total), U256::zero(), w).unwrap();
        assert_eq!(sh, 777);
    }

    #[test]
    fn fees_add_up() {
        let f = split_fees(1_000_003, 250).unwrap();
        assert_eq!(f.platform + f.host + f.to_curve, 1_000_003);
    }

    #[test]
    fn curve_round_trip_never_profits_trader() {
        let c = Curve { x: 30_000_000_000, y: 1_073_000_000_000_000 };
        let (out, c2) = c.buy(1_000_000_000).unwrap();
        let (back, _) = c2.sell(out).unwrap();
        assert!(back <= 1_000_000_000);
    }
}
