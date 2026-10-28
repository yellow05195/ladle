//! Host tests of a whole window through the paged tally / finalize / settle
//! arithmetic, for crowd sizes 1, 2, 50, 100, 500 and 2048 (the hard cap).
//!
//! The loops below are the instruction handlers' loops with the account
//! plumbing removed: the same `check_page` cursor rule, `law::entry_roll`,
//! `split_fees` + `payout` + one `Curve::buy`, and the carried-quota
//! `share_step_carry` of `settle_page`, cross-checked against the two-division
//! `share_step`. The SBF build is exercised end to end by tests/cu-bench.

use anchor_lang::prelude::Pubkey;

use crate::consts::{INITIAL_VIRTUAL_X, INITIAL_VIRTUAL_Y, MAX_ENTRIES_PER_WINDOW, MAX_PAGE};
use crate::instructions::tally_page::payout;
use crate::law::{self, Curve, U256};
use crate::state::check_page;

struct E {
    owner: Pubkey,
    amount: u64,
    roll: u64,
    share: u64,
}

/// xorshift, deterministic per test.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
}

struct Outcome {
    tokens_out: u64,
    sum_shares: u128,
    tally_pages: u32,
    settle_pages: u32,
}

fn run_window(n: usize, seed: [u8; 64], host_fee_bps: u16, rng: &mut Rng) -> Outcome {
    assert!(n as u32 <= MAX_ENTRIES_PER_WINDOW);
    let mut entries: Vec<E> = (0..n)
        .map(|_| E {
            owner: Pubkey::new_unique(),
            // 0.001 .. 5 SOL-equivalent, 9 decimals
            amount: 1_000_000 + rng.next() % 5_000_000_000,
            roll: 0,
            share: 0,
        })
        .collect();
    let total: u64 = entries.iter().map(|e| e.amount).sum();
    let count = n as u32;

    // --- tally, pages of MAX_PAGE, strict cursor; a replay is a no-op
    let mut cursor = 0u32;
    let mut roll_sum: u128 = 0;
    let mut tally_pages = 0;
    while cursor < count {
        let to = (cursor + MAX_PAGE).min(count);
        assert!(check_page(cursor, cursor, to, count).unwrap());
        for i in cursor..to {
            let e = &mut entries[i as usize];
            e.roll = law::entry_roll(&seed, &e.owner, i);
            roll_sum += e.amount as u128 * e.roll as u128;
        }
        let from = cursor;
        cursor = to;
        tally_pages += 1;
        // replaying the page just processed is a no-op success
        assert!(!check_page(cursor, from, to, count).unwrap());
    }
    // past the end / skipping is refused
    assert!(check_page(cursor, cursor, cursor + 1, count).is_err());

    // --- finalize: fee split, payout identity, the single curve buy
    let fees = law::split_fees(total, host_fee_bps).unwrap();
    let p = payout(&fees);
    assert_eq!(
        fees.to_curve as u128 + p.platform_net as u128 + p.bounty as u128 + fees.host as u128,
        total as u128
    );
    assert_eq!(fees.platform, ((total as u128) * 100 / 10_000) as u64);
    let curve = Curve { x: INITIAL_VIRTUAL_X, y: INITIAL_VIRTUAL_Y };
    let (tokens_out, after) = curve.buy(fees.to_curve).unwrap();
    assert_eq!(after.x, INITIAL_VIRTUAL_X + fees.to_curve);

    // --- settle, pages of MAX_PAGE, carried quota (= settle_page)
    let s = law::weight_sum(total);
    let mut cum = U256::zero();
    let mut cursor = 0u32;
    let mut settle_pages = 0;
    while cursor < count {
        let to = (cursor + MAX_PAGE).min(count);
        assert!(check_page(cursor, cursor, to, count).unwrap());
        let mut prev = law::quota(tokens_out, s, cum).unwrap();
        for i in cursor..to {
            let e = &mut entries[i as usize];
            let w = law::entry_weight(e.amount, total, e.roll, roll_sum).unwrap();
            let (share, next, q) = law::share_step_carry(tokens_out, s, cum, prev, w).unwrap();
            // the two-division reference step gives the same share
            let (ref_share, ref_next) = law::share_step(tokens_out, s, cum, w).unwrap();
            assert_eq!((share, next), (ref_share, ref_next));
            e.share = share;
            cum = next;
            prev = q;
        }
        cursor = to;
        settle_pages += 1;
    }
    assert_eq!(cum, s, "cum_weight must end at the weight sum");
    let sum_shares: u128 = entries.iter().map(|e| e.share as u128).sum();

    // each share within one unit of its exact value tokens * w / S
    for e in &entries {
        let w = law::entry_weight(e.amount, total, e.roll, roll_sum).unwrap();
        let exact_floor = (U256::from(tokens_out) * w / s).as_u64();
        assert!(e.share == exact_floor || e.share == exact_floor + 1);
    }
    if n == 1 {
        assert_eq!(entries[0].share, tokens_out);
    }
    Outcome { tokens_out, sum_shares, tally_pages, settle_pages }
}

fn seed_from(rng: &mut Rng) -> [u8; 64] {
    core::array::from_fn(|_| rng.next() as u8)
}

#[test]
fn crowd_sizes_conserve_the_buy_and_split_fees_exactly() {
    let mut rng = Rng(0x5eed_1ad1e);
    for &n in &[1usize, 2, 50, 100, 500, 2048] {
        for host in [0u16, 300] {
            let seed = seed_from(&mut rng);
            let o = run_window(n, seed, host, &mut rng);
            assert_eq!(o.sum_shares, o.tokens_out as u128, "n={n}");
            let pages = (n as u32).div_ceil(MAX_PAGE);
            assert_eq!((o.tally_pages, o.settle_pages), (pages, pages), "n={n}");
        }
    }
}

#[test]
fn a_lone_entry_takes_the_whole_buy_with_or_without_a_seed() {
    let mut rng = Rng(42);
    // zero seed: the path a one-entry window takes (no ORAO request)
    let o = run_window(1, [0u8; 64], 0, &mut rng);
    assert_eq!(o.sum_shares, o.tokens_out as u128);
    for _ in 0..200 {
        let seed = seed_from(&mut rng);
        let o = run_window(1, seed, 300, &mut rng);
        assert_eq!(o.sum_shares, o.tokens_out as u128);
    }
}

#[test]
fn carried_quota_matches_reference_on_extreme_amounts() {
    // A whale and dust in the same window, largest totals the cap allows.
    let total_parts = [u64::MAX / 4096, 1, 7, u64::MAX / 8192, 3];
    let total: u64 = total_parts.iter().sum();
    let rolls = [0u64, 10_000, 1, 9_999, 5_000];
    let roll_sum: u128 = total_parts.iter().zip(rolls).map(|(a, r)| *a as u128 * r as u128).sum();
    let s = law::weight_sum(total);
    let tokens = u64::MAX / 3;
    let mut cum = U256::zero();
    let mut prev = law::quota(tokens, s, cum).unwrap();
    let mut sum = 0u128;
    for (a, r) in total_parts.iter().zip(rolls) {
        let w = law::entry_weight(*a, total, r, roll_sum).unwrap();
        let (sh, next, q) = law::share_step_carry(tokens, s, cum, prev, w).unwrap();
        let (rsh, rnext) = law::share_step(tokens, s, cum, w).unwrap();
        assert_eq!((sh, next), (rsh, rnext));
        sum += sh as u128;
        cum = next;
        prev = q;
    }
    assert_eq!(sum, tokens as u128);
}
