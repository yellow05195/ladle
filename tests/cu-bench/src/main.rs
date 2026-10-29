//! Compute-unit benchmark and end-to-end settlement check of the SBF build of
//! the Ladle program, on LiteSVM (mainnet feature set, the SPL programs that
//! ship with LiteSVM).
//!
//!   cargo run --release -- [path/to/ladle.so] [index|owner] [sizes] [tally,settle page]
//!
//! * `index`: Entry PDA = ["entry", window, index] (the layout before v21).
//! * `owner`: Entry PDA = ["entry", window, owner] (v21: concurrent entering).
//! * `sizes`: comma-separated entry counts (default 1,2,50,100,500,2048).
//! * `tally,settle page`: entries per page (default 48,48; the keeper uses
//!   20,28, the largest pages that fit a legacy transaction).
//!
//! What it does for every size N, through the real instructions of the given
//! `.so` (only the Market account, the two mints and the token accounts are
//! written directly; ORAO is a stand-in program, `mock-orao/`, loaded at
//! ORAO's id: `request_vrf` runs its CPI for real, and the bench writes the
//! fulfilled layout ORAO's nodes would leave):
//! open_window, N x enter, seal, [request_vrf, fulfill], tally_page / settle_page in pages
//! (48 / 48 by default), open_window of the next round and close_window of
//! this one (rent back to the opener while every entry is still open), then
//! sell_back (whole, or in two halves) and close_entry for every entry
//! against the closed window. It checks: sum(shares) == tokens_out, the fee
//! split to the lamport (curve + platform + bounty + host == total), escrow
//! empty after the tally, the window + escrow rent back to the opener, each
//! entry's rent back to its owner, every token and quote unit accounted for
//! after the exits (the curve back at its first token reserve), and that
//! these are refused: a sell_back while later settle pages are pending, a
//! sell_back against another market's vault or by someone else,
//! close_entry paying anyone but the owner or with tokens left, a
//! sell_back after close_entry, an enter into the closed window. There is
//! no `claim` since v25 (LADLE never leaves the vault to a wallet). The second wallet's Entry address is pre-funded by a third party
//! before it enters (entering must still work), and with `owner` seeds a
//! second enter from the first wallet must fail with AlreadyEntered. It also
//! replays 50 enters built from the same snapshot of the window (50 wallets
//! clicking in the same slot) and counts how many land, and runs a refunded
//! window (ORAO request left pending past the timeout): no claim, no early
//! close, every stake back in full, close_window only after the last
//! refund, close_entry after the window is gone.
//!
//! Regression checks of the 2026-10-28 review (the review's proofs of
//! concept showed the first two stopping the previous build):
//! * `escrow_squat`: a stranger creates the escrow ATA of the next windows
//!   (one with quote tokens in it) and pre-funds a window address before
//!   `open_window`: the windows still open, run and close, and the stranger's
//!   tokens end in the quote vault;
//! * `vrf_salt`: a stranger requests the public seal seed at ORAO first, then
//!   the salted seed of one in-flight request: that request fails, the next
//!   salt draws the round; a second request, a fulfilment from the stranger's
//!   account and a bot finishing the round for the bounty are refused or
//!   earn nothing;
//! * `min_entry`: a stake below MIN_ENTRY_AMOUNT is refused.
//!
//! Regression checks of the second review (2026-10-28, `review2`):
//! * a ninth window behind eight that cannot settle is refused
//!   (`TooManyWindowsPending`) and opens once the queue moves;
//! * a `request_vrf` that ORAO charges more than the cap fails
//!   (`VrfRequestTooCostly`) and changes nothing; at the normal fee it lands;
//! * the market's last round, finished and still active, closes (its rent
//!   back to the opener), the market then has no active window, and the next
//!   `open_window` needs no previous window;
//! * `refund_flow`: a refund into a token account of the owner that is not
//!   their associated account is refused (`RecipientNotOwner`).
//!
//! Third review (`slippage`): two players quote their sell back from the
//! same curve; the first lands, the second, bound by its quote
//! (`min_quote_out`), fails with `SlippageExceeded`, and lands without the
//! bound for less; the same for `sell` from a wallet.
//!
//! Final review (`host_account`): on a market with an integration, a round
//! whose host has no quote account settles anyway, the host fee kept in its
//! buy; with the account the host is paid; any other account is refused
//! (`HostAccountMismatch`).
//!
//! `cargo run --release -- <normal .so> wind-down <wind-down .so>` runs the
//! shutdown checks instead (`wind_down_*`): rounds played on the normal
//! build, then the program replaced by the wind-down build (as an upgrade
//! does), its 7-day notice, and the drain: `force_exit` pays each entry's
//! exact share value (or stake) to its owner as SOL, refuses before the
//! notice ends, on the normal build, to pay anyone else, and a second time;
//! after the drain `close_market` closes the market and no program account,
//! stake, share or lamport of a player is left, although players forgot dust
//! in every way they can.
//!
//! Final review (2026-10-29), in the same run:
//! * a player who hands their wSOL account to someone else for good
//!   (classic SPL Token `SetAuthority(AccountOwner)`) loses the normal
//!   refund into it (`RecipientNotOwner`) but is still paid out as SOL, and
//!   the drain still reaches `close_market` (findings 1 and 2: with any other
//!   quote mint the payout went to that account, so one player could block
//!   the program close; `create_market` now refuses every quote mint but
//!   wSOL, `QuoteMintNotWsol`, and passes that check with wSOL);
//! * an entry left open with nothing in it when someone sends `close_market`
//!   (finding 3) still closes afterwards with `close_entry`, its rent to its
//!   owner, with the market gone;
//! * a market of another quote mint (only an earlier build could make one,
//!   written here) gets no forced payout and cannot close
//!   (`QuoteMintNotWsol`);
//! * a shutdown called off (normal build back, a round opens) needs a new,
//!   full notice.
//!
//! The Market accounts are written at 626 bytes with `counts_windows` set
//! (what `create_market` of v25 makes). The normal-path suites quote them in
//! an arbitrary classic mint, which `create_market` no longer accepts (wSOL
//! only since the final review): every instruction after creation moves the
//! quote the same way whatever the mint, and the shutdown suites,
//! `host_account` and `wind_down_quote_rule` use wSOL. `refund_flow` uses one written at
//! 562 bytes, the size before `Market.reserved`: a market made by an
//! earlier build still runs.
//!
//! The platform treasury is `LADLE_TREASURY` (the devnet key when unset): it
//! must be the key the `.so` was built with, or the final tally page fails
//! with PlatformAccountMismatch, so a run also checks a build's treasury.
//!
//! The account lists are those of the current program (v25: no claim,
//! sell_back and sell with `min_quote_out`); an older `.so` needs the
//! harness of its own commit.
//!
//! The ORAO-less single-entry path (v21) is exercised when the program seals
//! a one-entry window straight to Drawn.

use std::{path::PathBuf, str::FromStr, time::Instant};

use litesvm::LiteSVM;
use solana_account::Account;
use solana_clock::Clock;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_sha256_hasher::{hash, hashv};
use solana_signer::Signer;
use solana_transaction::Transaction;

const LADLE: &str = "85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj";
const TOKEN: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM: &str = "11111111111111111111111111111111";
const ORAO: &str = "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y";
/// Treasury of a build without LADLE_TREASURY (programs/ladle/src/consts.rs).
const DEVNET_TREASURY: &str = "A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat";
const COMPUTE_BUDGET: &str = "ComputeBudget111111111111111111111111111111";
const NATIVE_MINT: &str = "So11111111111111111111111111111111111111112";
/// programs/ladle/src/consts.rs WIND_DOWN_NOTICE_SECS (the normal, non-rehearsal build).
const NOTICE_SECS: i64 = 7 * 24 * 60 * 60;

const TOKEN_SUPPLY: u64 = 1_000_000_000 * 1_000_000;
/// programs/ladle/src/consts.rs MIN_ENTRY_AMOUNT (0.1 SOL).
const MIN_ENTRY: u64 = 100_000_000;
const MAX_PAGE: usize = 48;
const SOL: u64 = 1_000_000_000;

fn addr(s: &str) -> Address {
    Address::from_str(s).unwrap()
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Scheme {
    Index,
    Owner,
}

struct Ids {
    ladle: Address,
    token: Address,
    ata: Address,
    system: Address,
    orao: Address,
    treasury: Address,
    cb: Address,
}

impl Ids {
    fn new() -> Self {
        Ids {
            ladle: addr(LADLE),
            token: addr(TOKEN),
            ata: addr(ATA),
            system: addr(SYSTEM),
            orao: addr(ORAO),
            treasury: addr(&std::env::var("LADLE_TREASURY").unwrap_or_else(|_| DEVNET_TREASURY.to_string())),
            cb: addr(COMPUTE_BUDGET),
        }
    }
}

fn disc(prefix: &str, name: &str) -> [u8; 8] {
    let h = hash(format!("{prefix}:{name}").as_bytes()).to_bytes();
    h[..8].try_into().unwrap()
}

fn pda(seeds: &[&[u8]], program: &Address) -> (Address, u8) {
    Address::find_program_address(seeds, program)
}

fn ata_of(ids: &Ids, owner: &Address, mint: &Address) -> Address {
    pda(&[owner.as_ref(), ids.token.as_ref(), mint.as_ref()], &ids.ata).0
}

fn pack_mint(decimals: u8, supply: u64) -> Vec<u8> {
    let mut d = vec![0u8; 82];
    // mint_authority: None, supply, decimals, is_initialized, freeze_authority: None
    d[36..44].copy_from_slice(&supply.to_le_bytes());
    d[44] = decimals;
    d[45] = 1;
    d
}

fn pack_token(mint: &Address, owner: &Address, amount: u64) -> Vec<u8> {
    let mut d = vec![0u8; 165];
    d[0..32].copy_from_slice(mint.as_ref());
    d[32..64].copy_from_slice(owner.as_ref());
    d[64..72].copy_from_slice(&amount.to_le_bytes());
    d[108] = 1; // Initialized
    d
}

/// A token account written directly; on the wSOL mint a native account
/// (is_native = its rent reserve, lamports = rent + amount), as the token
/// program keeps them.
fn put_token(svm: &mut LiteSVM, token_program: Address, a: Address, mint: &Address, owner: &Address, amount: u64) {
    let mut data = pack_token(mint, owner, amount);
    let rent = svm.minimum_balance_for_rent_exemption(165);
    let mut lamports = rent;
    if *mint == addr(NATIVE_MINT) {
        data[109..113].copy_from_slice(&1u32.to_le_bytes());
        data[113..121].copy_from_slice(&rent.to_le_bytes());
        lamports += amount;
    }
    svm.set_account(a, Account { lamports, data, owner: token_program, executable: false, rent_epoch: 0 }).unwrap();
}

fn token_amount(svm: &LiteSVM, a: &Address) -> u64 {
    let acc = svm.get_account(a).expect("token account");
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

fn put(svm: &mut LiteSVM, a: Address, owner: Address, data: Vec<u8>) {
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(a, Account { lamports, data, owner, executable: false, rent_epoch: 0 }).unwrap();
}

fn u64_at(d: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(d[o..o + 8].try_into().unwrap())
}
fn u32_at(d: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(d[o..o + 4].try_into().unwrap())
}

/// `Curve::sell` of programs/ladle/src/law.rs: quote out for `dy` tokens.
fn curve_sell(x: u64, y: u64, dy: u64) -> u64 {
    if dy == 0 {
        return 0;
    }
    let k = x as u128 * y as u128;
    let ny = y as u128 + dy as u128;
    let nx = k.div_ceil(ny);
    (x as u128 - nx) as u64
}

// Window field offsets (state.rs layout, 443 bytes).
const W_STATE: usize = 48;
const W_CLOSE_SLOT: usize = 57;
const W_TOTAL: usize = 73;
const W_ENTRY_COUNT: usize = 81;
const W_VRF_SEED: usize = 117;
const W_VRF_REQUESTED: usize = 149;
const W_VRF_REQUESTED_SLOT: usize = 150;
const W_VRF_REQUEST: usize = 158;
const W_TOKENS_OUT: usize = 310;
const W_FEE_PLATFORM: usize = 318;
const W_FEE_HOST: usize = 326;
const W_TO_CURVE: usize = 334;
const W_ESCROW: usize = 342;
const W_REFUNDED_ENTRIES: usize = 407;
const W_VRF_PAYER: usize = 411;
// Entry field offsets (151 bytes).
const ENTRY_LEN: usize = 151;
const E_INDEX: usize = 72;
const E_AMOUNT: usize = 76;
const E_SHARE: usize = 92;
const E_CLAIMED: usize = 100;
const E_REFUNDED: usize = 108;
const E_MARKET: usize = 110;
const E_WINDOW_INDEX: usize = 142;
const E_SETTLED: usize = 150;
// Market field offsets (before the strings).
const M_CURVE_X: usize = 168;
const M_CURVE_Y: usize = 176;
const M_WINDOW_COUNT: usize = 218;
const M_NEXT_SETTLE: usize = 226;
const M_HAS_ACTIVE: usize = 234;
/// ORAO network state: `config.request_fee` (disc, authority, treasury, fee).
const NS_REQUEST_FEE: usize = 72;

/// Offset of `notice_start` (then `live_windows`, `counts_windows`): after
/// the three borsh strings, which start at 308.
fn m_notice(d: &[u8]) -> usize {
    let mut o = 308;
    for _ in 0..3 {
        o += 4 + u32_at(d, o) as usize;
    }
    o
}

#[allow(clippy::too_many_arguments)]
fn market_data(
    creator: &Address,
    token_mint: &Address,
    quote_mint: &Address,
    quote_program: &Address,
    quote_vault: &Address,
    token_vault: &Address,
    bump: u8,
    counted: bool,
) -> Vec<u8> {
    let mut d = Vec::with_capacity(626);
    d.extend_from_slice(&disc("account", "Market"));
    d.extend_from_slice(creator.as_ref());
    d.extend_from_slice(token_mint.as_ref());
    d.extend_from_slice(quote_mint.as_ref());
    d.extend_from_slice(quote_program.as_ref());
    d.extend_from_slice(&[0u8; 32]); // integration: none
    d.extend_from_slice(&(30 * SOL).to_le_bytes()); // curve.x
    d.extend_from_slice(&TOKEN_SUPPLY.to_le_bytes()); // curve.y
    d.extend_from_slice(&92u64.to_le_bytes()); // window_slots
    d.extend_from_slice(&900u64.to_le_bytes()); // vrf_timeout_slots
    d.extend_from_slice(&(5 * SOL).to_le_bytes()); // max_entry_amount
    d.extend_from_slice(&2000u16.to_le_bytes()); // max_entry_bps (20 %)
    d.extend_from_slice(&(5 * SOL).to_le_bytes()); // entry_floor_amount (5)
    d.extend_from_slice(&0u64.to_le_bytes()); // window_count
    d.extend_from_slice(&0u64.to_le_bytes()); // next_settle_index
    d.push(0); // has_active_window
    d.extend_from_slice(&0u64.to_le_bytes()); // active_window
    d.extend_from_slice(quote_vault.as_ref());
    d.extend_from_slice(token_vault.as_ref());
    d.push(bump);
    for s in ["Bench", "BNCH", ""] {
        d.extend_from_slice(&(s.len() as u32).to_le_bytes());
        d.extend_from_slice(s.as_bytes());
    }
    if counted {
        // v25: notice_start 0, live_windows 0, counts_windows, then the reserve
        d.extend_from_slice(&0i64.to_le_bytes());
        d.extend_from_slice(&0u64.to_le_bytes());
        d.push(1);
        d.resize(626, 0);
    } else {
        // the 562-byte layout of the builds before `reserved`
        d.resize(562, 0);
    }
    d
}

fn ix(ids: &Ids, name: &str, accounts: Vec<AccountMeta>, args: &[u8]) -> Instruction {
    let mut data = disc("global", name).to_vec();
    data.extend_from_slice(args);
    Instruction { program_id: ids.ladle, accounts, data }
}

fn w(a: Address) -> AccountMeta {
    AccountMeta::new(a, false)
}
fn r(a: Address) -> AccountMeta {
    AccountMeta::new_readonly(a, false)
}
fn ws(a: Address) -> AccountMeta {
    AccountMeta::new(a, true)
}
fn rs(a: Address) -> AccountMeta {
    AccountMeta::new_readonly(a, true)
}

fn cu_limit(ids: &Ids, units: u32) -> Instruction {
    let mut data = vec![2u8];
    data.extend_from_slice(&units.to_le_bytes());
    Instruction { program_id: ids.cb, accounts: vec![], data }
}

/// Per top-level Ladle instruction: compute units consumed (from the logs).
struct Sent {
    ladle_cu: Vec<u64>,
    tx_cu: u64,
}

fn send(svm: &mut LiteSVM, ids: &Ids, payer: &Keypair, extra: &[&Keypair], ixs: Vec<Instruction>) -> Result<Sent, String> {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = Transaction::new_signed_with_payer(&ixs, Some(&payer.pubkey()), &signers, svm.latest_blockhash());
    match svm.send_transaction(tx) {
        Ok(meta) => {
            let tag = format!("Program {} consumed ", ids.ladle);
            let mut depth = 0usize;
            let mut ladle_cu = Vec::new();
            for l in &meta.logs {
                if l.contains(" invoke [") {
                    depth += 1;
                } else if l.ends_with(" success") || l.contains(" failed") {
                    depth = depth.saturating_sub(1);
                }
                if depth == 1 {
                    if let Some(rest) = l.strip_prefix(&tag) {
                        let n: u64 = rest.split(' ').next().unwrap().parse().unwrap();
                        ladle_cu.push(n);
                    }
                }
            }
            Ok(Sent { ladle_cu, tx_cu: meta.compute_units_consumed })
        }
        Err(e) => Err(format!("{:?}\n{}", e.err, e.meta.logs.join("\n"))),
    }
}

struct Stats {
    name: String,
    samples: Vec<u64>,
}

impl Stats {
    fn new(name: &str) -> Self {
        Stats { name: name.to_string(), samples: vec![] }
    }
    fn push(&mut self, v: u64) {
        self.samples.push(v);
    }
    fn line(&self) -> String {
        if self.samples.is_empty() {
            return format!("{:<34} -", self.name);
        }
        let mut s = self.samples.clone();
        s.sort_unstable();
        let med = s[s.len() / 2];
        format!("{:<34} n={:<5} min={:<8} median={:<8} max={}", self.name, s.len(), s[0], med, s[s.len() - 1])
    }
}

struct Env {
    svm: LiteSVM,
    ids: Ids,
    payer: Keypair,
    qmint: Address,
    tmint: Address,
    market: Address,
    qvault: Address,
    tvault: Address,
    platform_ata: Address,
    keeper_ata: Address,
    /// ORAO's network state (owner = the ORAO stand-in) and the treasury it names.
    network_state: Address,
    orao_treasury: Address,
    /// A second market on the same quote mint, with tokens and quote in its
    /// vaults: entries of the first market must not reach them.
    other: OtherMarket,
}

struct OtherMarket {
    market: Address,
    qvault: Address,
    tvault: Address,
}

/// The ORAO stand-in (mock-orao/, built by `pnpm bench:cu`).
fn mock_orao_so() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("mock-orao/target/deploy/mock_orao.so")
}

fn setup(so: &PathBuf) -> Env {
    setup_with(so, true, false)
}

/// `counted`: the market in the v25 layout (626 bytes, `counts_windows`),
/// else the 562-byte layout of earlier builds. `native`: quoted in wSOL.
fn setup_with(so: &PathBuf, counted: bool, native: bool) -> Env {
    let ids = Ids::new();
    let mut svm = LiteSVM::new().with_transaction_history(0);
    svm.add_program_from_file(ids.ladle, so).expect("load ladle.so");
    let mock = mock_orao_so();
    svm.add_program_from_file(ids.orao, &mock).unwrap_or_else(|e| {
        panic!("load {} ({e:?}): build it with `cargo build-sbf --tools-version v1.57 --arch v3` in tests/cu-bench/mock-orao (pnpm bench:cu does)", mock.display())
    });
    // ORAO's network state: disc, authority, treasury, then the config ORAO keeps
    let network_state = pda(&[b"orao-vrf-network-configuration"], &ids.orao).0;
    let orao_treasury = Address::new_unique();
    let mut ns = disc("account", "NetworkState").to_vec();
    ns.extend_from_slice(Address::new_unique().as_ref());
    ns.extend_from_slice(orao_treasury.as_ref());
    ns.resize(8 + 32 + 32 + 8 + 4 + 32 * 4, 0);
    put(&mut svm, network_state, ids.orao, ns);
    svm.airdrop(&orao_treasury, SOL).unwrap();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100_000 * SOL).unwrap();
    let qmint = if native { addr(NATIVE_MINT) } else { Address::new_unique() };
    let tmint = Address::new_unique();
    put(&mut svm, qmint, ids.token, pack_mint(9, 0));
    put(&mut svm, tmint, ids.token, pack_mint(6, TOKEN_SUPPLY));
    let (market, mbump) = pda(&[b"market", tmint.as_ref()], &ids.ladle);
    let qvault = ata_of(&ids, &market, &qmint);
    let tvault = ata_of(&ids, &market, &tmint);
    put_token(&mut svm, ids.token, qvault, &qmint, &market, 0);
    put(&mut svm, tvault, ids.token, pack_token(&tmint, &market, TOKEN_SUPPLY));
    let platform_ata = ata_of(&ids, &ids.treasury, &qmint);
    put_token(&mut svm, ids.token, platform_ata, &qmint, &ids.treasury, 0);
    let keeper_ata = ata_of(&ids, &payer.pubkey(), &qmint);
    put_token(&mut svm, ids.token, keeper_ata, &qmint, &payer.pubkey(), 0);
    let md = market_data(&payer.pubkey(), &tmint, &qmint, &ids.token, &qvault, &tvault, mbump, counted);
    put(&mut svm, market, ids.ladle, md);
    let other = {
        let tmint = Address::new_unique();
        put(&mut svm, tmint, ids.token, pack_mint(6, TOKEN_SUPPLY));
        let (market, bump) = pda(&[b"market", tmint.as_ref()], &ids.ladle);
        let qvault = ata_of(&ids, &market, &qmint);
        let tvault = ata_of(&ids, &market, &tmint);
        put_token(&mut svm, ids.token, qvault, &qmint, &market, 1_000 * SOL);
        put(&mut svm, tvault, ids.token, pack_token(&tmint, &market, TOKEN_SUPPLY));
        let mut md = market_data(&payer.pubkey(), &tmint, &qmint, &ids.token, &qvault, &tvault, bump, false);
        // next_settle_index far ahead, so only the market binding can refuse
        let o = 8 + 32 * 5 + 16 + 8 + 8 + 8 + 2 + 8 + 8;
        md[o..o + 8].copy_from_slice(&1_000u64.to_le_bytes());
        put(&mut svm, market, ids.ladle, md);
        OtherMarket { market, qvault, tvault }
    };
    Env { svm, ids, payer, qmint, tmint, market, qvault, tvault, platform_ata, keeper_ata, network_state, orao_treasury, other }
}

impl Env {
    /// `send` with this environment's SVM (a method, so the instructions can
    /// be built from `self` in the same call).
    fn tx(&mut self, signer: &Keypair, ixs: Vec<Instruction>) -> Result<Sent, String> {
        send(&mut self.svm, &self.ids, signer, &[], ixs)
    }
}

fn lamports(svm: &LiteSVM, a: &Address) -> u64 {
    svm.get_account(a).map(|x| x.lamports).unwrap_or(0)
}

/// Send and expect a failure whose logs contain `needle`.
fn expect_fail(svm: &mut LiteSVM, ids: &Ids, payer: &Keypair, ixs: Vec<Instruction>, needle: &str, what: &str) -> Result<(), String> {
    match send(svm, ids, payer, &[], ixs) {
        Ok(_) => Err(format!("{what}: accepted")),
        Err(log) if log.contains(needle) => Ok(()),
        Err(log) => Err(format!("{what}: failed without {needle}:\n{log}")),
    }
}

fn amount_args(amount: u64, min_quote_out: u64) -> Vec<u8> {
    let mut a = amount.to_le_bytes().to_vec();
    a.extend_from_slice(&min_quote_out.to_le_bytes());
    a
}

fn sell_back_ix(env: &Env, owner: &Address, entry: &Address, owner_quote: &Address, amount: u64) -> Instruction {
    sell_back_min_ix(env, owner, entry, owner_quote, amount, 0)
}

fn sell_back_min_ix(env: &Env, owner: &Address, entry: &Address, owner_quote: &Address, amount: u64, min_quote_out: u64) -> Instruction {
    let ids = &env.ids;
    ix(
        ids,
        "sell_back",
        vec![rs(*owner), w(env.market), w(*entry), r(env.qmint), w(env.qvault), w(*owner_quote), r(ids.token)],
        &amount_args(amount, min_quote_out),
    )
}

/// `sell(amount, min_quote_out)` of LADLE held in `seller_token`.
fn sell_ix(env: &Env, seller: &Address, seller_token: &Address, seller_quote: &Address, amount: u64, min_quote_out: u64) -> Instruction {
    let ids = &env.ids;
    ix(
        ids,
        "sell",
        vec![
            rs(*seller), w(env.market), r(env.tmint), w(*seller_token), w(env.tvault), r(env.qmint), w(env.qvault), w(*seller_quote),
            r(ids.token), r(ids.token),
        ],
        &amount_args(amount, min_quote_out),
    )
}

fn start_wind_down_ix(env: &Env) -> Instruction {
    ix(&env.ids, "start_wind_down", vec![w(env.market)], &[])
}

/// The PDA ["unwrap", entry] force_exit pays a wSOL payout through.
fn unwrap_addr(env: &Env, entry: &Address) -> Address {
    pda(&[b"unwrap", entry.as_ref()], &env.ids.ladle).0
}

/// `force_exit()` sent by `payer`: `window` (and its escrow) for a stake to
/// refund, `payout` the unwrap PDA (wSOL) or the owner's quote ATA.
fn force_exit_ix(env: &Env, payer: &Address, entry: &Address, owner: &Address, window: Option<Address>, payout: &Address) -> Instruction {
    let ids = &env.ids;
    let (wm, em) = match window {
        Some(win) => (w(win), w(ata_of(ids, &win, &env.qmint))),
        None => (r(ids.ladle), r(ids.ladle)),
    };
    ix(
        ids,
        "force_exit",
        vec![ws(*payer), w(env.market), w(*entry), w(*owner), wm, em, r(env.qmint), w(env.qvault), w(*payout), r(ids.token), r(ids.system)],
        &[],
    )
}

/// `close_market()`, everything to `creator` (as SOL: wSOL markets only).
fn close_market_ix(env: &Env, creator: &Address) -> Instruction {
    let ids = &env.ids;
    ix(
        ids,
        "close_market",
        vec![w(env.market), w(*creator), w(env.tmint), w(env.tvault), r(env.qmint), w(env.qvault), r(ids.token), r(ids.token)],
        &[],
    )
}

/// Classic SPL Token `SetAuthority(AccountOwner)`: `owner` hands the token
/// account to `new_owner` for good. Classic SPL Token allows it on any
/// account, an associated one included (only Token-2022 makes associated
/// accounts immutable-owner): its address then belongs to a foreign owner.
fn hand_over_ix(env: &Env, account: &Address, owner: &Address, new_owner: &Address) -> Instruction {
    let mut data = vec![6u8, 2, 1];
    data.extend_from_slice(new_owner.as_ref());
    Instruction { program_id: env.ids.token, accounts: vec![w(*account), rs(*owner)], data }
}

/// `create_market` by `creator` with a fresh launched-token mint `token_mint`
/// (signer) and `quote_mint`. LiteSVM ships no Metaplex program, so even a
/// valid call fails at the metadata CPI ("Unsupported program id"), after
/// the quote check and the supply's `MintTo`.
fn create_market_ix(env: &Env, creator: &Address, token_mint: &Address, quote_mint: &Address) -> Instruction {
    let ids = &env.ids;
    let mpl = addr("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    let (market, _) = pda(&[b"market", token_mint.as_ref()], &ids.ladle);
    let metadata = pda(&[b"metadata", mpl.as_ref(), token_mint.as_ref()], &mpl).0;
    let mut args = Vec::new();
    for v in [560u64, 900, 5 * SOL] {
        args.extend_from_slice(&v.to_le_bytes());
    }
    args.extend_from_slice(&2000u16.to_le_bytes());
    args.extend_from_slice(&(SOL / 2).to_le_bytes());
    for t in ["Ladle", "LADLE", "https://useladle.fun/token.json"] {
        args.extend_from_slice(&(t.len() as u32).to_le_bytes());
        args.extend_from_slice(t.as_bytes());
    }
    ix(
        ids,
        "create_market",
        vec![
            ws(*creator), ws(*token_mint), r(*quote_mint), w(market), w(ata_of(ids, &market, token_mint)), w(ata_of(ids, &market, quote_mint)),
            r(ids.ladle), w(ids.treasury), w(metadata), r(mpl), r(ids.token), r(ids.token), r(ids.ata), r(ids.system),
        ],
        &args,
    )
}

fn close_entry_ix(env: &Env, entry: &Address, owner: &Address) -> Instruction {
    ix(&env.ids, "close_entry", vec![w(*entry), w(*owner)], &[])
}

fn close_window_ix(env: &Env, window: &Address, opener: &Address) -> Instruction {
    let ids = &env.ids;
    let escrow = ata_of(ids, window, &env.qmint);
    ix(
        ids,
        "close_window",
        vec![w(env.market), w(*window), w(*opener), r(env.qmint), w(escrow), w(env.qvault), r(ids.token)],
        &[],
    )
}

fn window_addr(env: &Env, index: u64) -> Address {
    pda(&[b"window", env.market.as_ref(), &index.to_le_bytes()], &env.ids.ladle).0
}

fn entry_addr(env: &Env, scheme: Scheme, window: &Address, index: u32, owner: &Address) -> Address {
    match scheme {
        Scheme::Index => pda(&[b"entry", window.as_ref(), &index.to_le_bytes()], &env.ids.ladle).0,
        Scheme::Owner => pda(&[b"entry", window.as_ref(), owner.as_ref()], &env.ids.ladle).0,
    }
}

fn open_window_ix(env: &Env, index: u64, prev: Option<Address>) -> Instruction {
    let window = window_addr(env, index);
    let escrow = ata_of(&env.ids, &window, &env.qmint);
    let ids = &env.ids;
    ix(
        ids,
        "open_window",
        vec![
            ws(env.payer.pubkey()),
            w(env.market),
            r(prev.unwrap_or(ids.ladle)),
            w(window),
            r(env.qmint),
            w(escrow),
            r(ids.token),
            r(ids.ata),
            r(ids.system),
        ],
        &[],
    )
}

/// The seed request_vrf asks ORAO for: sha256("ladle:vrf:req" || seal seed || salt).
fn request_seed(seal_seed: &[u8; 32], salt: &[u8; 32]) -> [u8; 32] {
    hashv(&[b"ladle:vrf:req", seal_seed, salt]).to_bytes()
}

fn orao_request_addr(env: &Env, seed: &[u8; 32]) -> Address {
    pda(&[b"orao-vrf-randomness-request", seed], &env.ids.orao).0
}

/// Ladle `request_vrf(salt)`, paid by `payer`, for the request PDA of the
/// salted seal seed the window holds now.
fn request_vrf_ix(env: &Env, payer: &Address, window: &Address, seal_seed: &[u8; 32], salt: &[u8; 32]) -> Instruction {
    let ids = &env.ids;
    let req = orao_request_addr(env, &request_seed(seal_seed, salt));
    ix(
        ids,
        "request_vrf",
        vec![ws(*payer), w(*window), w(env.network_state), w(env.orao_treasury), w(req), r(ids.orao), r(ids.system)],
        salt,
    )
}

/// ORAO `request_v2(seed)` sent straight to ORAO, outside Ladle (what any
/// stranger can do with a seed they can compute).
fn orao_direct_request_ix(env: &Env, payer: &Address, seed: &[u8; 32]) -> Instruction {
    let mut data = disc("global", "request_v2").to_vec();
    data.extend_from_slice(seed);
    Instruction {
        program_id: env.ids.orao,
        accounts: vec![ws(*payer), w(env.network_state), w(env.orao_treasury), w(orao_request_addr(env, seed)), r(env.ids.system)],
        data,
    }
}

/// What ORAO's nodes leave once they answered: the fulfilled layout.
fn orao_fulfil(env: &mut Env, seed: &[u8; 32], client: &Address, tag: &[u8]) {
    let req = orao_request_addr(env, seed);
    let mut rd = disc("account", "RandomnessV2").to_vec();
    rd.push(1);
    rd.extend_from_slice(client.as_ref());
    rd.extend_from_slice(seed);
    rd.extend_from_slice(&hashv(&[b"orao-1", tag]).to_bytes());
    rd.extend_from_slice(&hashv(&[b"orao-2", tag]).to_bytes());
    put(&mut env.svm, req, env.ids.orao, rd);
}

fn enter_ix(env: &Env, window: &Address, entry: &Address, owner: &Address, owner_quote: &Address, amount: u64) -> Instruction {
    let ids = &env.ids;
    let escrow = ata_of(ids, window, &env.qmint);
    ix(
        ids,
        "enter",
        vec![ws(*owner), r(env.market), w(*window), w(*entry), r(env.qmint), w(*owner_quote), w(escrow), r(ids.token), r(ids.system)],
        &amount.to_le_bytes(),
    )
}

fn page_args(from: u32, to: u32) -> Vec<u8> {
    let mut a = from.to_le_bytes().to_vec();
    a.extend_from_slice(&to.to_le_bytes());
    a
}

struct Player {
    kp: Keypair,
    quote: Address,
    entry: Address,
    amount: u64,
}

fn amount_for(i: usize) -> u64 {
    // 0.1 .. 0.34 (9-decimal quote, from MIN_ENTRY), deterministic spread
    MIN_ENTRY + ((i as u64 * 7919) % 241) * 1_000_000
}

fn new_player(env: &mut Env, amount: u64) -> (Keypair, Address) {
    let kp = Keypair::new();
    env.svm.airdrop(&kp.pubkey(), SOL).unwrap();
    let quote = ata_of(&env.ids, &kp.pubkey(), &env.qmint);
    let (token, qmint) = (env.ids.token, env.qmint);
    put_token(&mut env.svm, token, quote, &qmint, &kp.pubkey(), amount);
    (kp, quote)
}

fn run(so: &PathBuf, scheme: Scheme, n: usize, pages: (usize, usize), stats: &mut Vec<Stats>, page_cu: &mut Vec<(usize, bool, u64)>) -> Result<(), String> {
    let t0 = Instant::now();
    let mut env = setup(so);
    let get = |stats: &mut Vec<Stats>, name: &str| -> usize {
        if let Some(i) = stats.iter().position(|s| s.name == name) {
            i
        } else {
            stats.push(Stats::new(name));
            stats.len() - 1
        }
    };

    // open_window #0
    let payer = env.payer.insecure_clone();
    let ow = open_window_ix(&env, 0, None);
    let s = env.tx(&payer, vec![ow])?;
    let i = get(stats, "open_window (first)");
    stats[i].push(s.ladle_cu[0]);
    let window = window_addr(&env, 0);
    let escrow = ata_of(&env.ids, &window, &env.qmint);

    // N enters
    let mut players: Vec<Player> = Vec::with_capacity(n);
    for k in 0..n {
        let amount = amount_for(k);
        let (kp, quote) = new_player(&mut env, amount);
        let entry = entry_addr(&env, scheme, &window, k as u32, &kp.pubkey());
        // griefing attempt: someone sends lamports to the wallet's future Entry
        // address first; entering must still work (top up, allocate, assign)
        if k == 1 {
            // (at least the rent minimum of an empty account: the runtime refuses less)
            let min = env.svm.minimum_balance_for_rent_exemption(0);
            env.svm.airdrop(&entry, min).unwrap();
        }
        let e = enter_ix(&env, &window, &entry, &kp.pubkey(), &quote, amount);
        let s = env.tx(&kp, vec![e]).map_err(|e| format!("enter {k}: {e}"))?;
        let i = get(stats, "enter");
        stats[i].push(s.ladle_cu[0]);
        if k == 1 {
            let acc = env.svm.get_account(&entry).unwrap();
            let rent = env.svm.minimum_balance_for_rent_exemption(acc.data.len());
            if acc.owner != env.ids.ladle || acc.data.len() != ENTRY_LEN || acc.lamports != rent {
                return Err(format!("pre-funded entry: owner {} len {} lamports {} (rent {rent})", acc.owner, acc.data.len(), acc.lamports));
            }
        }
        players.push(Player { kp, quote, entry, amount });
    }
    let total: u64 = players.iter().map(|p| p.amount).sum();

    // a second enter from the same wallet
    if scheme == Scheme::Owner && n > 0 {
        let p = &players[0];
        let e = enter_ix(&env, &window, &p.entry, &p.kp.pubkey(), &p.quote, 1);
        let again = send(&mut env.svm, &env.ids, &p.kp.insecure_clone(), &[], vec![e]);
        match again {
            Ok(_) => return Err("second enter by the same owner was accepted".into()),
            Err(log) => {
                if !log.contains("AlreadyEntered") {
                    return Err(format!("second enter failed without AlreadyEntered:\n{log}"));
                }
            }
        }
    }

    // seal
    let wd = env.svm.get_account(&window).unwrap().data;
    let close_slot = u64_at(&wd, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close_slot);
    let seal = ix(&env.ids, "seal", vec![w(env.market), w(window)], &[]);
    let s = env.tx(&payer, vec![seal])?;
    let i = get(stats, "seal");
    stats[i].push(s.ladle_cu[0]);

    let mut wd = env.svm.get_account(&window).unwrap().data;
    let state = wd[W_STATE];
    let mut used_vrf = false;
    if state == 1 {
        // Sealed: request_vrf through the ORAO stand-in, ORAO answers, fulfill.
        used_vrf = true;
        let seal_seed: [u8; 32] = wd[W_VRF_SEED..W_VRF_SEED + 32].try_into().unwrap();
        let salt = hashv(&[b"bench-salt", &(n as u64).to_le_bytes()]).to_bytes();
        let rq = request_vrf_ix(&env, &payer.pubkey(), &window, &seal_seed, &salt);
        let s = env.tx(&payer, vec![rq]).map_err(|e| format!("request_vrf: {e}"))?;
        let i = get(stats, "request_vrf");
        stats[i].push(s.ladle_cu[0]);
        wd = env.svm.get_account(&window).unwrap().data;
        let seed = request_seed(&seal_seed, &salt);
        let req = orao_request_addr(&env, &seed);
        if wd[W_VRF_REQUESTED] != 1
            || wd[W_VRF_SEED..W_VRF_SEED + 32] != seed
            || wd[W_VRF_REQUEST..W_VRF_REQUEST + 32] != *req.as_ref()
            || wd[W_VRF_PAYER..W_VRF_PAYER + 32] != *payer.pubkey().as_ref()
        {
            return Err("request_vrf did not record the salted seed, its request and its payer".into());
        }
        orao_fulfil(&mut env, &seed, &payer.pubkey(), &(n as u64).to_le_bytes());
        let f = ix(&env.ids, "fulfill", vec![w(window), r(req)], &[]);
        let s = env.tx(&payer, vec![f])?;
        let i = get(stats, "fulfill");
        stats[i].push(s.ladle_cu[0]);
    } else if state != 2 {
        return Err(format!("unexpected state after seal: {state}"));
    }
    if n == 1 && scheme == Scheme::Owner && used_vrf {
        return Err("a one-entry window still asked for randomness".into());
    }

    // tally pages
    let entries: Vec<Address> = players.iter().map(|p| p.entry).collect();
    let mut from = 0usize;
    while from < n {
        let to = (from + pages.0).min(n);
        let mut metas = vec![
            ws(payer.pubkey()),
            w(env.market),
            w(window),
            r(env.qmint),
            w(escrow),
            w(env.qvault),
            w(env.platform_ata),
            w(env.keeper_ata),
            r(env.ids.ladle),
            r(env.ids.ladle),
            r(env.ids.token),
        ];
        metas.extend(entries[from..to].iter().map(|e| w(*e)));
        let t = ix(&env.ids, "tally_page", metas, &page_args(from as u32, to as u32));
        let s = env.tx(&payer, vec![cu_limit(&env.ids, 1_400_000), t])
            .map_err(|e| format!("tally [{from},{to}): {e}"))?;
        let final_page = to == n;
        let name = if final_page { "tally_page (final page)" } else { "tally_page" };
        let i = get(stats, name);
        stats[i].push(s.ladle_cu[0]);
        page_cu.push((to - from, final_page, s.ladle_cu[0]));
        let _ = s.tx_cu;
        from = to;
    }

    // settle pages
    let mut from = 0usize;
    while from < n {
        let to = (from + pages.1).min(n);
        let mut metas = vec![w(env.market), w(window)];
        metas.extend(entries[from..to].iter().map(|e| w(*e)));
        let t = ix(&env.ids, "settle_page", metas, &page_args(from as u32, to as u32));
        let s = env.tx(&payer, vec![cu_limit(&env.ids, 1_400_000), t])
            .map_err(|e| format!("settle [{from},{to}): {e}"))?;
        let i = get(stats, "settle_page");
        stats[i].push(s.ladle_cu[0]);
        page_cu.push((to - from + 10_000, to == n, s.ladle_cu[0]));
        if from == 0 && to < n {
            // entry 0's share is written and final, but later pages are pending:
            // no sell_back before the whole window is Settled
            let p = &players[0];
            if env.svm.get_account(&p.entry).unwrap().data[E_SETTLED] != 1 {
                return Err("settled flag not set by settle_page".into());
            }
            let kp = p.kp.insecure_clone();
            let sb = sell_back_ix(&env, &kp.pubkey(), &p.entry, &p.quote, u64::MAX);
            expect_fail(&mut env.svm, &env.ids, &kp, vec![sb], "WrongWindowState", "sell_back before the last settle page")?;
        }
        from = to;
    }

    // --- invariants
    let wd = env.svm.get_account(&window).unwrap().data;
    if wd[W_STATE] != 4 {
        return Err(format!("window not Settled: {}", wd[W_STATE]));
    }
    if u64_at(&wd, W_TOTAL) != total || u32_at(&wd, W_ENTRY_COUNT) as usize != n {
        return Err("total / entry_count mismatch".into());
    }
    let tokens_out = u64_at(&wd, W_TOKENS_OUT);
    let fee_platform = u64_at(&wd, W_FEE_PLATFORM);
    let fee_host = u64_at(&wd, W_FEE_HOST);
    let to_curve = u64_at(&wd, W_TO_CURVE);
    let bounty = fee_platform / 10;
    if to_curve + fee_platform + fee_host != total || fee_platform != total / 100 || fee_host != 0 {
        return Err("fee split".into());
    }
    if token_amount(&env.svm, &escrow) != 0
        || token_amount(&env.svm, &env.qvault) != to_curve
        || token_amount(&env.svm, &env.platform_ata) != fee_platform - bounty
        || token_amount(&env.svm, &env.keeper_ata) != bounty
    {
        return Err("escrow payout".into());
    }
    let mut sum_shares: u128 = 0;
    for (k, p) in players.iter().enumerate() {
        let ed = env.svm.get_account(&p.entry).unwrap().data;
        if u32_at(&ed, E_INDEX) as usize != k
            || u64_at(&ed, E_AMOUNT) != p.amount
            || ed[E_MARKET..E_MARKET + 32] != *env.market.as_ref()
            || u64_at(&ed, E_WINDOW_INDEX) != 0
            || ed[E_SETTLED] != 1
        {
            return Err(format!("entry {k} fields"));
        }
        sum_shares += u64_at(&ed, E_SHARE) as u128;
    }
    if sum_shares != tokens_out as u128 {
        return Err(format!("sum(shares) {sum_shares} != tokens_out {tokens_out}"));
    }
    if n == 1 {
        let ed = env.svm.get_account(&players[0].entry).unwrap().data;
        if u64_at(&ed, E_SHARE) != tokens_out {
            return Err("lone entry did not get the whole buy".into());
        }
    }

    // --- the round's rent comes back right away: open the next round (this one
    // stops being the active window), then close this one while every entry
    // is still open
    let ow = open_window_ix(&env, 1, Some(window));
    let s = env.tx(&payer, vec![ow])?;
    let i = get(stats, "open_window (with prev)");
    stats[i].push(s.ladle_cu[0]);
    let rent_back = lamports(&env.svm, &window) + lamports(&env.svm, &escrow);
    let opener_before = lamports(&env.svm, &payer.pubkey());
    let built = close_window_ix(&env, &window, &payer.pubkey());
    let s = env.tx(&payer, vec![built])?;
    let i = get(stats, "close_window");
    stats[i].push(s.ladle_cu[0]);
    if lamports(&env.svm, &window) != 0 || lamports(&env.svm, &escrow) != 0 {
        return Err("window not closed".into());
    }
    // the opener paid one signature (5,000 lamports) and got both rents back
    let got = lamports(&env.svm, &payer.pubkey()) as i128 - opener_before as i128;
    if got != rent_back as i128 - 5_000 {
        return Err(format!("close_window returned {got} lamports to the opener, expected {rent_back} - 5000"));
    }

    // nothing can enter a closed window (its address is never created again)
    let (late, late_quote) = new_player(&mut env, SOL);
    let late_entry = entry_addr(&env, scheme, &window, n as u32, &late.pubkey());
    let e = enter_ix(&env, &window, &late_entry, &late.pubkey(), &late_quote, SOL / 100);
    expect_fail(&mut env.svm, &env.ids, &late, vec![e], "AccountNotInitialized", "enter into the closed window")?;

    // --- exits against the closed window: the even entries sell back their
    // whole share, the odd ones in two halves (the second bound by its
    // quote), then every entry closes (rent to its owner)
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), SOL).unwrap();
    let stranger_quote = ata_of(&env.ids, &stranger.pubkey(), &env.qmint);
    let (token, qmint) = (env.ids.token, env.qmint);
    put_token(&mut env.svm, token, stranger_quote, &qmint, &stranger.pubkey(), 0);
    let entry_rent = env.svm.minimum_balance_for_rent_exemption(ENTRY_LEN);
    for (k, p) in players.iter().enumerate() {
        let share = u64_at(&env.svm.get_account(&p.entry).unwrap().data, E_SHARE);
        let kp = p.kp.insecure_clone();
        if k == 0 && share > 0 {
            // nobody else can sell the share, and it cannot reach another market's vault
            let sb = sell_back_ix(&env, &stranger.pubkey(), &p.entry, &stranger_quote, u64::MAX);
            expect_fail(&mut env.svm, &env.ids, &stranger, vec![sb], "ConstraintHasOne", "sell_back by a stranger")?;
            let sb = ix(
                &env.ids,
                "sell_back",
                vec![rs(kp.pubkey()), w(env.other.market), w(p.entry), r(env.qmint), w(env.other.qvault), w(p.quote), r(env.ids.token)],
                &amount_args(u64::MAX, 0),
            );
            expect_fail(&mut env.svm, &env.ids, &kp, vec![sb], "ConstraintHasOne", "sell_back into another market's vault")?;
            let ce = close_entry_ix(&env, &p.entry, &kp.pubkey());
            expect_fail(&mut env.svm, &env.ids, &payer, vec![ce], "EntryNotClosable", "close_entry with tokens left")?;
        }
        if share > 0 && k % 2 == 0 {
            let sb = sell_back_ix(&env, &kp.pubkey(), &p.entry, &p.quote, u64::MAX);
            let s = env.tx(&kp, vec![sb]).map_err(|e| format!("sell_back {k}: {e}"))?;
            let i = get(stats, "sell_back");
            stats[i].push(s.ladle_cu[0]);
        } else if share > 0 {
            let half = share / 2;
            if half > 0 {
                let sb = sell_back_ix(&env, &kp.pubkey(), &p.entry, &p.quote, half);
                env.tx(&kp, vec![sb]).map_err(|e| format!("sell_back half {k}: {e}"))?;
            }
            let md = env.svm.get_account(&env.market).unwrap().data;
            let quote = curve_sell(u64_at(&md, M_CURVE_X), u64_at(&md, M_CURVE_Y), share - half);
            let sb = sell_back_min_ix(&env, &kp.pubkey(), &p.entry, &p.quote, u64::MAX, quote);
            let s = env.tx(&kp, vec![sb]).map_err(|e| format!("sell_back rest {k}: {e}"))?;
            let i = get(stats, "sell_back");
            stats[i].push(s.ladle_cu[0]);
            if u64_at(&env.svm.get_account(&p.entry).unwrap().data, E_CLAIMED) != share {
                return Err(format!("sell_back {k}: claimed != share"));
            }
            // nothing left: a further sale fails
            env.svm.expire_blockhash();
            let again = sell_back_ix(&env, &kp.pubkey(), &p.entry, &p.quote, u64::MAX);
            expect_fail(&mut env.svm, &env.ids, &kp, vec![again], "NothingToClaim", "a sale with nothing left")?;
        }
        if k == 0 {
            let ce = close_entry_ix(&env, &p.entry, &stranger.pubkey());
            expect_fail(&mut env.svm, &env.ids, &payer, vec![ce], "ConstraintHasOne", "close_entry paying a stranger")?;
        }
        // anyone may send it (here the keeper); the rent goes to the owner
        let owner_before = lamports(&env.svm, &kp.pubkey());
        let built = close_entry_ix(&env, &p.entry, &kp.pubkey());
        let s = env.tx(&payer, vec![built])
            .map_err(|e| format!("close_entry {k}: {e}"))?;
        let i = get(stats, "close_entry");
        stats[i].push(s.ladle_cu[0]);
        if lamports(&env.svm, &kp.pubkey()) != owner_before + entry_rent || lamports(&env.svm, &p.entry) != 0 {
            return Err(format!("close_entry {k}: rent not returned to the owner"));
        }
        if k == 1 && share > 0 {
            env.svm.expire_blockhash();
            let sb = sell_back_ix(&env, &kp.pubkey(), &p.entry, &p.quote, u64::MAX);
            expect_fail(&mut env.svm, &env.ids, &kp, vec![sb], "AccountNotInitialized", "sell_back after close_entry")?;
        }
    }

    // every unit accounted for: every share went back to the curve (the vault
    // holds the whole supply, the curve its first token reserve); the quote
    // paid for the sales left the quote vault; the other market was never touched
    let mut quote_paid: u64 = 0;
    for p in &players {
        quote_paid += token_amount(&env.svm, &p.quote);
    }
    let md = env.svm.get_account(&env.market).unwrap().data;
    if token_amount(&env.svm, &env.tvault) != TOKEN_SUPPLY
        || u64_at(&md, M_CURVE_Y) != TOKEN_SUPPLY
        || token_amount(&env.svm, &env.qvault) + quote_paid != to_curve
        || token_amount(&env.svm, &env.other.tvault) != TOKEN_SUPPLY
        || token_amount(&env.svm, &env.other.qvault) != 1_000 * SOL
    {
        return Err(format!(
            "exit accounting: token vault {} curve y {} quote paid {quote_paid} quote vault {} to_curve {to_curve}",
            token_amount(&env.svm, &env.tvault),
            u64_at(&md, M_CURVE_Y),
            token_amount(&env.svm, &env.qvault)
        ));
    }

    println!(
        "N={n:<5} OK  vrf={} sum(shares)=tokens_out={tokens_out} total={total} to_curve={to_curve} platform={fee_platform} bounty={bounty}  ({:.1}s)",
        if used_vrf { "yes" } else { "no " },
        t0.elapsed().as_secs_f64()
    );
    Ok(())
}

/// 50 wallets build their `enter` from the same snapshot of the window
/// (same slot), then all transactions land one after the other.
fn crowd(so: &PathBuf, scheme: Scheme, wallets: usize) -> Result<usize, String> {
    let mut env = setup(so);
    let payer = env.payer.insecure_clone();
    let ow = open_window_ix(&env, 0, None);
    env.tx(&payer, vec![ow])?;
    let window = window_addr(&env, 0);
    let snapshot_count = u32_at(&env.svm.get_account(&window).unwrap().data, W_ENTRY_COUNT);
    let mut txs = Vec::new();
    for k in 0..wallets {
        let amount = amount_for(k);
        let (kp, quote) = new_player(&mut env, amount);
        // what a client computes from the window it just read
        let entry = entry_addr(&env, scheme, &window, snapshot_count, &kp.pubkey());
        let e = enter_ix(&env, &window, &entry, &kp.pubkey(), &quote, amount);
        txs.push(Transaction::new_signed_with_payer(&[e], Some(&kp.pubkey()), &[&kp], env.svm.latest_blockhash()));
    }
    let mut ok = 0;
    for tx in txs {
        if env.svm.send_transaction(tx).is_ok() {
            ok += 1;
        }
    }
    Ok(ok)
}

/// A window whose randomness never arrives: three entries, seal, an ORAO
/// request left pending past the timeout, refund_window, then the refund
/// path end to end (compute units of refund_window / refund_entry recorded).
fn refund_flow(so: &PathBuf, scheme: Scheme, stats: &mut Vec<Stats>) -> Result<(), String> {
    // a market in the layout of the builds before `reserved`: still runs
    let mut env = setup_with(so, false, false);
    let payer = env.payer.insecure_clone();
    let built = open_window_ix(&env, 0, None);
    env.tx(&payer, vec![built])?;
    let window = window_addr(&env, 0);
    let escrow = ata_of(&env.ids, &window, &env.qmint);
    let mut players: Vec<Player> = Vec::new();
    for k in 0..3 {
        let amount = amount_for(k);
        let (kp, quote) = new_player(&mut env, amount);
        let entry = entry_addr(&env, scheme, &window, k as u32, &kp.pubkey());
        let e = enter_ix(&env, &window, &entry, &kp.pubkey(), &quote, amount);
        env.tx(&kp, vec![e]).map_err(|e| format!("refund flow enter {k}: {e}"))?;
        players.push(Player { kp, quote, entry, amount });
    }
    let close_slot = u64_at(&env.svm.get_account(&window).unwrap().data, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close_slot);
    env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(window)], &[])])?;
    let mut wd = env.svm.get_account(&window).unwrap().data;
    if wd[W_STATE] != 1 {
        return Err(format!("refund flow: not Sealed after seal: {}", wd[W_STATE]));
    }
    // request_vrf through the ORAO stand-in: its account stays pending (ORAO never answers)
    let seal_seed: [u8; 32] = wd[W_VRF_SEED..W_VRF_SEED + 32].try_into().unwrap();
    let salt = [0x5Au8; 32];
    let requested = close_slot + 1;
    env.svm.warp_to_slot(requested);
    env.tx(&payer, vec![request_vrf_ix(&env, &payer.pubkey(), &window, &seal_seed, &salt)])?;
    let req = orao_request_addr(&env, &request_seed(&seal_seed, &salt));
    wd = env.svm.get_account(&window).unwrap().data;
    if u64_at(&wd, W_VRF_REQUESTED_SLOT) != requested || wd[W_VRF_REQUEST..W_VRF_REQUEST + 32] != *req.as_ref() {
        return Err("refund flow: request not recorded".into());
    }

    // the timeout (900 slots in this market) counts from the request
    env.svm.warp_to_slot(requested + 900 + 1);
    let rw = ix(&env.ids, "refund_window", vec![w(env.market), w(window), r(req)], &[]);
    let s = env.tx(&payer, vec![rw])?;
    let i = stats.iter().position(|s| s.name == "refund_window").unwrap_or_else(|| {
        stats.push(Stats::new("refund_window"));
        stats.len() - 1
    });
    stats[i].push(s.ladle_cu[0]);
    if env.svm.get_account(&window).unwrap().data[W_STATE] != 5 {
        return Err("refund flow: not Refunding".into());
    }

    // nothing settled: no sell_back, no close before the refund, no
    // close_window while a stake is in the escrow
    let p0 = &players[0];
    let kp0 = p0.kp.insecure_clone();
    let built = sell_back_ix(&env, &kp0.pubkey(), &p0.entry, &p0.quote, 1);
    expect_fail(&mut env.svm, &env.ids, &kp0, vec![built], "WrongWindowState", "sell_back in a refunded window")?;
    let built = close_entry_ix(&env, &p0.entry, &kp0.pubkey());
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "EntryNotClosable", "close_entry before the refund")?;
    let built = close_window_ix(&env, &window, &payer.pubkey());
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "EntriesStillOpen", "close_window before any refund")?;

    let refund_ix = |env: &Env, p: &Player| {
        ix(
            &env.ids,
            "refund_entry",
            vec![r(env.market), w(window), w(p.entry), r(env.qmint), w(escrow), w(p.quote), r(env.ids.token)],
            &[],
        )
    };
    // a stranger refunds into a token account the owner owns but never looks at (not their ATA): refused
    let hidden = Address::new_unique();
    put(&mut env.svm, hidden, env.ids.token, pack_token(&env.qmint, &kp0.pubkey(), 0));
    let built = ix(
        &env.ids,
        "refund_entry",
        vec![r(env.market), w(window), w(p0.entry), r(env.qmint), w(escrow), w(hidden), r(env.ids.token)],
        &[],
    );
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "RecipientNotOwner", "refund into a token account that is not the owner's ATA")?;
    for (k, p) in players.iter().enumerate() {
        // permissionless: the keeper sends it, the stake goes to the owner's account
        let built = refund_ix(&env, p);
        let s = env.tx(&payer, vec![built]).map_err(|e| format!("refund_entry {k}: {e}"))?;
        let i = stats.iter().position(|s| s.name == "refund_entry").unwrap_or_else(|| {
            stats.push(Stats::new("refund_entry"));
            stats.len() - 1
        });
        stats[i].push(s.ladle_cu[0]);
        if token_amount(&env.svm, &p.quote) != p.amount {
            return Err(format!("refund_entry {k}: stake not returned in full"));
        }
        if u32_at(&env.svm.get_account(&window).unwrap().data, W_REFUNDED_ENTRIES) as usize != k + 1 {
            return Err(format!("refund_entry {k}: refunded_entries"));
        }
        if k == 0 {
            // a second refund of the same entry (a different payer: a new transaction)
            let other = Keypair::new();
            env.svm.airdrop(&other.pubkey(), SOL).unwrap();
            let built = refund_ix(&env, p);
            expect_fail(&mut env.svm, &env.ids, &other, vec![built], "AlreadyRefunded", "second refund")?;
        }
        if k + 1 < players.len() {
            let built = close_window_ix(&env, &window, &payer.pubkey());
            expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "EntriesStillOpen", "close_window with a stake left")
                .map_err(|e| format!("after {} refunds: {e}", k + 1))?;
        }
    }
    if token_amount(&env.svm, &escrow) != 0 {
        return Err("refund flow: escrow not empty".into());
    }

    // every stake is back: the window closes (once it is no longer the active
    // one), its entries close afterwards
    let built = open_window_ix(&env, 1, Some(window));
    env.tx(&payer, vec![built])?;
    let built = close_window_ix(&env, &window, &payer.pubkey());
    env.tx(&payer, vec![built])
        .map_err(|e| format!("close_window after the refunds: {e}"))?;
    if lamports(&env.svm, &window) != 0 || lamports(&env.svm, &escrow) != 0 {
        return Err("refund flow: window not closed".into());
    }
    let entry_rent = env.svm.minimum_balance_for_rent_exemption(ENTRY_LEN);
    for (k, p) in players.iter().enumerate() {
        let before = lamports(&env.svm, &p.kp.pubkey());
        let built = close_entry_ix(&env, &p.entry, &p.kp.pubkey());
        env.tx(&payer, vec![built])
            .map_err(|e| format!("refund flow close_entry {k}: {e}"))?;
        if lamports(&env.svm, &p.kp.pubkey()) != before + entry_rent {
            return Err(format!("refund flow close_entry {k}: rent not returned to the owner"));
        }
    }
    println!("refund: 3 stakes back in full, close_window refused until the last refund, entries closed after the window");
    Ok(())
}

/// The ATA program's CreateIdempotent for `wallet`'s quote account, paid by `funder`.
fn create_ata_ix(env: &Env, funder: &Address, wallet: &Address) -> Instruction {
    let ids = &env.ids;
    Instruction {
        program_id: ids.ata,
        accounts: vec![ws(*funder), w(ata_of(ids, wallet, &env.qmint)), r(*wallet), r(env.qmint), r(ids.system), r(ids.token)],
        data: vec![1],
    }
}

/// SPL Token Transfer.
fn token_transfer_ix(env: &Env, from: &Address, to: &Address, owner: &Address, amount: u64) -> Instruction {
    let mut data = vec![3u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction { program_id: env.ids.token, accounts: vec![w(*from), w(*to), rs(*owner)], data }
}

/// Review 2026-10-28, escrow squat: the address of every future window and
/// of its escrow ATA is public. A stranger creates the escrows of windows 0
/// and 1 before they open (window 1's with quote tokens in it) and sends
/// lamports to window 1's address. Before the fix `open_window` failed
/// forever (IllegalOwner) and the market could never open a round again.
/// Also: a stake below MIN_ENTRY_AMOUNT is refused.
fn escrow_squat(so: &PathBuf) -> Result<(), String> {
    let mut env = setup(so);
    let payer = env.payer.insecure_clone();
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), SOL).unwrap();
    let w0 = window_addr(&env, 0);
    let w1 = window_addr(&env, 1);
    let (e0, e1) = (ata_of(&env.ids, &w0, &env.qmint), ata_of(&env.ids, &w1, &env.qmint));
    let stranger_quote = ata_of(&env.ids, &stranger.pubkey(), &env.qmint);
    put(&mut env.svm, stranger_quote, env.ids.token, pack_token(&env.qmint, &stranger.pubkey(), SOL));
    let donation = 7_777_777u64;
    env.tx(&stranger, vec![
        create_ata_ix(&env, &stranger.pubkey(), &w0),
        create_ata_ix(&env, &stranger.pubkey(), &w1),
        token_transfer_ix(&env, &stranger_quote, &e1, &stranger.pubkey(), donation),
    ])
    .map_err(|e| format!("squat: {e}"))?;
    let min = env.svm.minimum_balance_for_rent_exemption(0);
    env.svm.airdrop(&w1, min).unwrap();

    // window 0 opens on the squatted escrow
    env.tx(&payer, vec![open_window_ix(&env, 0, None)]).map_err(|e| format!("open_window 0 on a squatted escrow: {e}"))?;
    if env.svm.get_account(&w0).unwrap().data[W_ESCROW..W_ESCROW + 32] != *e0.as_ref() {
        return Err("window 0 does not record its escrow".into());
    }

    // one entry; below the minimum stake first
    let (kp, quote) = new_player(&mut env, SOL);
    let entry = entry_addr(&env, Scheme::Owner, &w0, 0, &kp.pubkey());
    let small = enter_ix(&env, &w0, &entry, &kp.pubkey(), &quote, MIN_ENTRY - 1);
    expect_fail(&mut env.svm, &env.ids, &kp, vec![small], "EntryTooSmall", "a stake below MIN_ENTRY_AMOUNT")?;
    let e = enter_ix(&env, &w0, &entry, &kp.pubkey(), &quote, MIN_ENTRY);
    env.tx(&kp, vec![e]).map_err(|e| format!("enter MIN_ENTRY: {e}"))?;

    // seal (one entry: Drawn), tally + settle, then window 1 opens on its funded, squatted escrow
    let close_slot = u64_at(&env.svm.get_account(&w0).unwrap().data, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close_slot);
    let mut metas = vec![
        ws(payer.pubkey()), w(env.market), w(w0), r(env.qmint), w(e0), w(env.qvault), w(env.platform_ata), w(env.keeper_ata),
        r(env.ids.ladle), r(env.ids.ladle), r(env.ids.token),
    ];
    metas.push(w(entry));
    let tally = ix(&env.ids, "tally_page", metas, &page_args(0, 1));
    let settle = ix(&env.ids, "settle_page", vec![w(env.market), w(w0), w(entry)], &page_args(0, 1));
    env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(w0)], &[]), tally, settle])
        .map_err(|e| format!("seal + tally + settle of window 0: {e}"))?;
    let vault_before = token_amount(&env.svm, &env.qvault);
    env.tx(&payer, vec![open_window_ix(&env, 1, Some(w0))])
        .map_err(|e| format!("open_window 1 on a squatted, funded escrow and a pre-funded address: {e}"))?;
    let w1d = env.svm.get_account(&w1).unwrap().data;
    if w1d[W_STATE] != 0 || w1d[W_ESCROW..W_ESCROW + 32] != *e1.as_ref() {
        return Err("window 1 is not open on its escrow".into());
    }

    // window 1 ends empty; once window 2 is open it closes: the stranger's
    // tokens go to the quote vault, both rents (its account, the stranger's
    // escrow) to the opener
    let close1 = u64_at(&w1d, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close1);
    env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(w1)], &[]), open_window_ix(&env, 2, Some(w1))])
        .map_err(|e| format!("seal 1 + open 2: {e}"))?;
    let rent_back = lamports(&env.svm, &w1) + lamports(&env.svm, &e1);
    let opener_before = lamports(&env.svm, &payer.pubkey());
    env.tx(&payer, vec![close_window_ix(&env, &w1, &payer.pubkey())]).map_err(|e| format!("close_window 1: {e}"))?;
    if token_amount(&env.svm, &env.qvault) != vault_before + donation {
        return Err(format!("the stranger's {donation} were not swept into the quote vault"));
    }
    if lamports(&env.svm, &w1) != 0 || lamports(&env.svm, &e1) != 0 || lamports(&env.svm, &payer.pubkey()) != opener_before + rent_back - 5_000 {
        return Err("window 1 rent not back to the opener".into());
    }
    println!("escrow squat: windows open on escrows a stranger created (one funded), its tokens swept to the vault; a stake below the minimum refused");
    Ok(())
}

/// Review 2026-10-28, ORAO pre-request: the seal seed is public from the
/// close slot on, and ORAO takes each seed once, from anyone. Before the fix
/// a stranger asking ORAO for it first made every request_vrf of the window
/// fail, so every round with 2+ entries ended in a refund. Now request_vrf
/// salts it; a stranger who copies the salt of a request in flight only
/// makes that one attempt fail. Also: the keeper bounty of a drawn window
/// goes to the request payer, not to a bot that sends the final page.
fn vrf_salt(so: &PathBuf, stats: &mut Vec<Stats>) -> Result<(), String> {
    let mut env = setup(so);
    let payer = env.payer.insecure_clone();
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), 10 * SOL).unwrap();
    env.tx(&payer, vec![open_window_ix(&env, 0, None)])?;
    let window = window_addr(&env, 0);
    let escrow = ata_of(&env.ids, &window, &env.qmint);
    let mut entries = Vec::new();
    for k in 0..3 {
        let amount = amount_for(k);
        let (kp, quote) = new_player(&mut env, amount);
        let entry = entry_addr(&env, Scheme::Owner, &window, k as u32, &kp.pubkey());
        env.tx(&kp, vec![enter_ix(&env, &window, &entry, &kp.pubkey(), &quote, amount)])?;
        entries.push(entry);
    }
    let close_slot = u64_at(&env.svm.get_account(&window).unwrap().data, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close_slot);
    env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(window)], &[])])?;
    let seal_seed: [u8; 32] = env.svm.get_account(&window).unwrap().data[W_VRF_SEED..W_VRF_SEED + 32].try_into().unwrap();

    // the stranger asks ORAO for the public seal seed, and for the salted seed of the salt it saw in flight
    let seen = [0xA1u8; 32];
    env.tx(&stranger, vec![
        orao_direct_request_ix(&env, &stranger.pubkey(), &seal_seed),
        orao_direct_request_ix(&env, &stranger.pubkey(), &request_seed(&seal_seed, &seen)),
    ])
    .map_err(|e| format!("stranger's ORAO requests: {e}"))?;
    // the request it copied fails (ORAO SeedAlreadyInUse = 6001 = 0x1771) and changes nothing
    let copied = request_vrf_ix(&env, &payer.pubkey(), &window, &seal_seed, &seen);
    expect_fail(&mut env.svm, &env.ids, &payer, vec![copied], "0x1771", "request_vrf with a salt someone used first")?;
    if env.svm.get_account(&window).unwrap().data[W_VRF_REQUESTED] != 0 {
        return Err("a failed request left a mark".into());
    }
    // the next salt draws the round
    let salt = [0xB2u8; 32];
    let s = env.tx(&payer, vec![request_vrf_ix(&env, &payer.pubkey(), &window, &seal_seed, &salt)])
        .map_err(|e| format!("request_vrf with a fresh salt: {e}"))?;
    let i = stats.iter().position(|s| s.name == "request_vrf").unwrap_or_else(|| {
        stats.push(Stats::new("request_vrf"));
        stats.len() - 1
    });
    stats[i].push(s.ladle_cu[0]);
    let seed = request_seed(&seal_seed, &salt);
    let wd = env.svm.get_account(&window).unwrap().data;
    if wd[W_VRF_SEED..W_VRF_SEED + 32] != seed || wd[W_VRF_PAYER..W_VRF_PAYER + 32] != *payer.pubkey().as_ref() {
        return Err("request_vrf did not record the salted seed and its payer".into());
    }
    // one request per window
    let again = request_vrf_ix(&env, &stranger.pubkey(), &window, &seal_seed, &[0xC3u8; 32]);
    expect_fail(&mut env.svm, &env.ids, &stranger, vec![again], "VrfAlreadyRequested", "a second request_vrf")?;
    // ORAO answers both; only the window's own request can draw it
    orao_fulfil(&mut env, &seal_seed, &stranger.pubkey(), b"stranger");
    let theirs = ix(&env.ids, "fulfill", vec![w(window), r(orao_request_addr(&env, &seal_seed))], &[]);
    expect_fail(&mut env.svm, &env.ids, &stranger, vec![theirs], "VrfRequestMismatch", "fulfill from the stranger's ORAO account")?;
    orao_fulfil(&mut env, &seed, &payer.pubkey(), b"window");
    env.tx(&payer, vec![ix(&env.ids, "fulfill", vec![w(window), r(orao_request_addr(&env, &seed))], &[])])
        .map_err(|e| format!("fulfill: {e}"))?;

    // a bot sends the final page with its own quote account: the round settles, the bounty goes to the treasury
    let bot_quote = ata_of(&env.ids, &stranger.pubkey(), &env.qmint);
    put(&mut env.svm, bot_quote, env.ids.token, pack_token(&env.qmint, &stranger.pubkey(), 0));
    let mut metas = vec![
        ws(stranger.pubkey()), w(env.market), w(window), r(env.qmint), w(escrow), w(env.qvault), w(env.platform_ata), w(bot_quote),
        r(env.ids.ladle), r(env.ids.ladle), r(env.ids.token),
    ];
    metas.extend(entries.iter().map(|e| w(*e)));
    let tally = ix(&env.ids, "tally_page", metas, &page_args(0, 3));
    env.tx(&stranger, vec![cu_limit(&env.ids, 1_400_000), tally]).map_err(|e| format!("bot's final page: {e}"))?;
    let wd = env.svm.get_account(&window).unwrap().data;
    let fee_platform = u64_at(&wd, W_FEE_PLATFORM);
    if wd[W_STATE] != 3 || fee_platform == 0 {
        return Err("window not tallied by the bot's page".into());
    }
    if token_amount(&env.svm, &bot_quote) != 0 || token_amount(&env.svm, &env.platform_ata) != fee_platform || token_amount(&env.svm, &escrow) != 0 {
        return Err(format!(
            "bounty: bot {} platform {} (fee {fee_platform})",
            token_amount(&env.svm, &bot_quote),
            token_amount(&env.svm, &env.platform_ata)
        ));
    }
    let mut metas = vec![w(env.market), w(window)];
    metas.extend(entries.iter().map(|e| w(*e)));
    env.tx(&payer, vec![ix(&env.ids, "settle_page", metas, &page_args(0, 3))])?;
    if env.svm.get_account(&window).unwrap().data[W_STATE] != 4 {
        return Err("window not settled".into());
    }
    println!("vrf salt: the public seal seed and a copied salt used up at ORAO first, the round still drawn; a bot's final page earns no bounty");
    Ok(())
}

/// One `tally_page` + `settle_page` of a one-entry window (Drawn at seal), keeper bounty to the payer's ATA.
fn settle_lone_ixs(env: &Env, window: &Address, entry: &Address) -> Vec<Instruction> {
    let escrow = ata_of(&env.ids, window, &env.qmint);
    let tally = ix(
        &env.ids,
        "tally_page",
        vec![
            ws(env.payer.pubkey()), w(env.market), w(*window), r(env.qmint), w(escrow), w(env.qvault), w(env.platform_ata), w(env.keeper_ata),
            r(env.ids.ladle), r(env.ids.ladle), r(env.ids.token), w(*entry),
        ],
        &page_args(0, 1),
    );
    let settle = ix(&env.ids, "settle_page", vec![w(env.market), w(*window), w(*entry)], &page_args(0, 1));
    vec![cu_limit(&env.ids, 1_400_000), tally, settle]
}

/// Second review (2026-10-28): the in-flight cap, the ORAO cost cap, and the
/// last round of a market closing.
fn review2(so: &PathBuf, stats: &mut Vec<Stats>) -> Result<(), String> {
    // --- (1) one round that cannot settle must not let the next ones pile up stakes
    let mut env = setup(so);
    let payer = env.payer.insecure_clone();
    let mut lone: Vec<(Address, Address)> = Vec::new();
    for i in 0..8u64 {
        let prev = if i == 0 { None } else { Some(window_addr(&env, i - 1)) };
        env.tx(&payer, vec![open_window_ix(&env, i, prev)]).map_err(|e| format!("open_window {i}: {e}"))?;
        let win = window_addr(&env, i);
        let (kp, quote) = new_player(&mut env, MIN_ENTRY);
        let entry = entry_addr(&env, Scheme::Owner, &win, 0, &kp.pubkey());
        env.tx(&kp, vec![enter_ix(&env, &win, &entry, &kp.pubkey(), &quote, MIN_ENTRY)]).map_err(|e| format!("enter {i}: {e}"))?;
        let close = u64_at(&env.svm.get_account(&win).unwrap().data, W_CLOSE_SLOT);
        env.svm.warp_to_slot(close);
        // one entry: Drawn at seal, and left there (its final page never sent)
        env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(win)], &[])]).map_err(|e| format!("seal {i}: {e}"))?;
        lone.push((win, entry));
    }
    let md = env.svm.get_account(&env.market).unwrap().data;
    if u64_at(&md, M_WINDOW_COUNT) != 8 || u64_at(&md, M_NEXT_SETTLE) != 0 {
        return Err(format!("in flight: window_count {} next_settle_index {}", u64_at(&md, M_WINDOW_COUNT), u64_at(&md, M_NEXT_SETTLE)));
    }
    let ninth = open_window_ix(&env, 8, Some(window_addr(&env, 7)));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![ninth], "TooManyWindowsPending", "a ninth window behind eight pending ones")?;
    // the first round settles: the queue moves and the ninth opens
    let (w0, e0) = lone[0];
    env.tx(&payer, settle_lone_ixs(&env, &w0, &e0)).map_err(|e| format!("settle window 0: {e}"))?;
    env.tx(&payer, vec![cu_limit(&env.ids, 200_000), open_window_ix(&env, 8, Some(window_addr(&env, 7)))])
        .map_err(|e| format!("open_window 8 once the queue moved: {e}"))?;

    // --- (2) ORAO charging more than the cap: the request fails and leaves no mark
    let mut env = setup(so);
    let payer = env.payer.insecure_clone();
    env.tx(&payer, vec![open_window_ix(&env, 0, None)])?;
    let window = window_addr(&env, 0);
    for k in 0..2 {
        let amount = amount_for(k);
        let (kp, quote) = new_player(&mut env, amount);
        let entry = entry_addr(&env, Scheme::Owner, &window, k as u32, &kp.pubkey());
        env.tx(&kp, vec![enter_ix(&env, &window, &entry, &kp.pubkey(), &quote, amount)])?;
    }
    let close_slot = u64_at(&env.svm.get_account(&window).unwrap().data, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close_slot);
    env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(window)], &[])])?;
    let seal_seed: [u8; 32] = env.svm.get_account(&window).unwrap().data[W_VRF_SEED..W_VRF_SEED + 32].try_into().unwrap();
    let set_fee = |env: &mut Env, fee: u64| {
        let mut acc = env.svm.get_account(&env.network_state).unwrap();
        acc.data[NS_REQUEST_FEE..NS_REQUEST_FEE + 8].copy_from_slice(&fee.to_le_bytes());
        env.svm.set_account(env.network_state, acc).unwrap();
    };
    set_fee(&mut env, 10 * MIN_ENTRY); // 1 SOL: ORAO raised its fee, or a changed ORAO takes more
    let before = lamports(&env.svm, &payer.pubkey());
    let costly = request_vrf_ix(&env, &payer.pubkey(), &window, &seal_seed, &[0x11u8; 32]);
    expect_fail(&mut env.svm, &env.ids, &payer, vec![costly], "VrfRequestTooCostly", "a request ORAO charges 1 SOL for")?;
    if env.svm.get_account(&window).unwrap().data[W_VRF_REQUESTED] != 0 || lamports(&env.svm, &payer.pubkey()) + 10_000 < before {
        return Err("a refused costly request left a mark or took the payer's SOL".into());
    }
    set_fee(&mut env, 0); // back to the normal 0.0005 SOL
    let s = env.tx(&payer, vec![request_vrf_ix(&env, &payer.pubkey(), &window, &seal_seed, &[0x22u8; 32])])
        .map_err(|e| format!("request_vrf at the normal fee: {e}"))?;
    let i = stats.iter().position(|s| s.name == "request_vrf").unwrap_or_else(|| {
        stats.push(Stats::new("request_vrf"));
        stats.len() - 1
    });
    stats[i].push(s.ladle_cu[0]);

    // --- (3) the last round of a market: finished and still active, it closes
    let mut env = setup(so);
    let payer = env.payer.insecure_clone();
    env.tx(&payer, vec![open_window_ix(&env, 0, None)])?;
    let w0 = window_addr(&env, 0);
    let (kp, quote) = new_player(&mut env, MIN_ENTRY);
    let e0 = entry_addr(&env, Scheme::Owner, &w0, 0, &kp.pubkey());
    env.tx(&kp, vec![enter_ix(&env, &w0, &e0, &kp.pubkey(), &quote, MIN_ENTRY)])?;
    // an active window still open cannot close
    let early = close_window_ix(&env, &w0, &payer.pubkey());
    expect_fail(&mut env.svm, &env.ids, &payer, vec![early], "WrongWindowState", "close_window of the open active window")?;
    let close_slot = u64_at(&env.svm.get_account(&w0).unwrap().data, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close_slot);
    let mut ixs = vec![ix(&env.ids, "seal", vec![w(env.market), w(w0)], &[])];
    ixs.extend(settle_lone_ixs(&env, &w0, &e0));
    env.tx(&payer, ixs).map_err(|e| format!("seal + settle of the last round: {e}"))?;
    // drained: no next round opens; the last one closes anyway
    let escrow = ata_of(&env.ids, &w0, &env.qmint);
    let rent_back = lamports(&env.svm, &w0) + lamports(&env.svm, &escrow);
    let opener_before = lamports(&env.svm, &payer.pubkey());
    env.tx(&payer, vec![close_window_ix(&env, &w0, &payer.pubkey())]).map_err(|e| format!("close_window of the finished active window: {e}"))?;
    if lamports(&env.svm, &w0) != 0 || lamports(&env.svm, &payer.pubkey()) != opener_before + rent_back - 5_000 {
        return Err("the last round's rent did not come back to the opener".into());
    }
    if env.svm.get_account(&env.market).unwrap().data[M_HAS_ACTIVE] != 0 {
        return Err("the market still has an active window after closing it".into());
    }
    // the scoop can still be sold back from the Entry alone
    env.tx(&kp, vec![sell_back_ix(&env, &kp.pubkey(), &e0, &quote, u64::MAX)])
        .map_err(|e| format!("sell_back after the last round closed: {e}"))?;
    // the market can start again, with no previous window to show
    env.tx(&payer, vec![open_window_ix(&env, 1, None)]).map_err(|e| format!("open_window with no active window: {e}"))?;
    if env.svm.get_account(&window_addr(&env, 1)).unwrap().data[W_STATE] != 0 {
        return Err("window 1 is not open".into());
    }
    println!("review 2: a ninth round behind eight stuck ones refused, then opened; a 1 SOL ORAO request refused; the last round closed with its rent back, then a new one opened");
    Ok(())
}

/// The tally + settle of a window whose entries are `entries` (one page each).
fn finish_ixs(env: &Env, window: &Address, entries: &[Address]) -> Vec<Instruction> {
    let escrow = ata_of(&env.ids, window, &env.qmint);
    let n = entries.len() as u32;
    let mut metas = vec![
        ws(env.payer.pubkey()), w(env.market), w(*window), r(env.qmint), w(escrow), w(env.qvault), w(env.platform_ata), w(env.keeper_ata),
        r(env.ids.ladle), r(env.ids.ladle), r(env.ids.token),
    ];
    metas.extend(entries.iter().map(|e| w(*e)));
    let tally = ix(&env.ids, "tally_page", metas, &page_args(0, n));
    let mut metas = vec![w(env.market), w(*window)];
    metas.extend(entries.iter().map(|e| w(*e)));
    let settle = ix(&env.ids, "settle_page", metas, &page_args(0, n));
    vec![cu_limit(&env.ids, 1_400_000), tally, settle]
}

/// `finish_ixs` on a market with an integration: `integration` and the host
/// account given (the host's ATA, existing or not, or anything else).
fn finish_host_ixs(env: &Env, window: &Address, entries: &[Address], integration: &Address, host_account: &Address) -> Vec<Instruction> {
    let mut ixs = finish_ixs(env, window, entries);
    ixs[1].accounts[8] = r(*integration);
    ixs[1].accounts[9] = w(*host_account);
    ixs
}

/// Final review: a host cannot hold its market's rounds by closing its quote
/// account (rounds settle in order, a Drawn round has no refund path, and
/// re-creating the account for the host let it keep the rent each time).
/// Without the account the round settles and its host fee stays in the buy;
/// with it the host is paid; any other account is refused.
fn host_account(so: &PathBuf) -> Result<(), String> {
    let mut env = setup_with(so, true, true);
    let payer = payer_of(&env);
    let host = Address::new_unique();
    let (integration, ibump) = pda(&[b"integration", host.as_ref()], &env.ids.ladle);
    let mut idata = disc("account", "Integration").to_vec();
    idata.extend_from_slice(host.as_ref());
    idata.extend_from_slice(&150u16.to_le_bytes());
    idata.push(ibump);
    let ladle = env.ids.ladle;
    put(&mut env.svm, integration, ladle, idata);
    // the market's integration field (after creator, token_mint, quote_mint, quote_program)
    let mut m = env.svm.get_account(&env.market).unwrap();
    m.data[8 + 32 * 4..8 + 32 * 5].copy_from_slice(integration.as_ref());
    env.svm.set_account(env.market, m).unwrap();
    let host_ata = ata_of(&env.ids, &host, &env.qmint);
    let window_fees = |env: &Env, window: &Address| {
        let d = env.svm.get_account(window).unwrap().data;
        (u64_at(&d, W_TOTAL), u64_at(&d, W_TO_CURVE), u64_at(&d, W_FEE_PLATFORM), u64_at(&d, W_FEE_HOST))
    };

    // round 0: the host has no account
    let (w0, p0) = open_and_enter(&mut env, 0, None, &[MIN_ENTRY, 2 * MIN_ENTRY])?;
    seal_and_draw(&mut env, &w0, 0x60, true)?;
    let e0: Vec<Address> = p0.iter().map(|x| x.entry).collect();
    let stranger_account = Address::new_unique();
    let (token, qmint) = (env.ids.token, env.qmint);
    put_token(&mut env.svm, token, stranger_account, &qmint, &host, 0);
    let wrong = finish_host_ixs(&env, &w0, &e0, &integration, &stranger_account);
    expect_fail(&mut env.svm, &env.ids, &payer, wrong, "HostAccountMismatch", "a host fee into an account that is not the host's ATA")?;
    env.tx(&payer, finish_host_ixs(&env, &w0, &e0, &integration, &host_ata)).map_err(|e| format!("final page without the host's account: {e}"))?;
    let (total, to_curve, platform, fee_host) = window_fees(&env, &w0);
    if fee_host != 0 || to_curve + platform != total || lamports(&env.svm, &host_ata) != 0 {
        return Err(format!("round without the host's account: total {total}, to_curve {to_curve}, platform {platform}, host {fee_host}"));
    }

    // round 1: the host made its account: it is paid
    let (w1, p1) = open_and_enter(&mut env, 1, Some(w0), &[MIN_ENTRY, 2 * MIN_ENTRY])?;
    seal_and_draw(&mut env, &w1, 0x61, true)?;
    put_token(&mut env.svm, token, host_ata, &qmint, &host, 0);
    let e1: Vec<Address> = p1.iter().map(|x| x.entry).collect();
    env.tx(&payer, finish_host_ixs(&env, &w1, &e1, &integration, &host_ata)).map_err(|e| format!("final page with the host's account: {e}"))?;
    let (total, to_curve, platform, fee_host) = window_fees(&env, &w1);
    if fee_host == 0 || token_amount(&env.svm, &host_ata) != fee_host || to_curve + platform + fee_host != total {
        return Err(format!("round with the host's account: total {total}, to_curve {to_curve}, platform {platform}, host {fee_host}, paid {}", token_amount(&env.svm, &host_ata)));
    }
    println!("host account: a round whose host has no account settled with the host fee kept in its buy; with the account the host got {fee_host}; another account was refused");
    Ok(())
}

/// Open window `index` and enter one player per amount; returns the window and the players.
fn open_and_enter(env: &mut Env, index: u64, prev: Option<Address>, amounts: &[u64]) -> Result<(Address, Vec<Player>), String> {
    let payer = env.payer.insecure_clone();
    env.tx(&payer, vec![open_window_ix(env, index, prev)]).map_err(|e| format!("open_window {index}: {e}"))?;
    let window = window_addr(env, index);
    let mut players = Vec::new();
    for (k, &amount) in amounts.iter().enumerate() {
        let (kp, quote) = new_player(env, amount);
        let entry = entry_addr(env, Scheme::Owner, &window, k as u32, &kp.pubkey());
        env.tx(&kp, vec![enter_ix(env, &window, &entry, &kp.pubkey(), &quote, amount)]).map_err(|e| format!("enter {index}/{k}: {e}"))?;
        players.push(Player { kp, quote, entry, amount });
    }
    Ok((window, players))
}

/// Seal the window at its close slot; with 2+ entries request randomness (salt
/// `salt`) and, when `answer`, let ORAO answer and fulfill. Returns the ORAO request.
fn seal_and_draw(env: &mut Env, window: &Address, salt: u8, answer: bool) -> Result<Option<Address>, String> {
    let payer = env.payer.insecure_clone();
    let close_slot = u64_at(&env.svm.get_account(window).unwrap().data, W_CLOSE_SLOT);
    if env.svm.get_sysvar::<Clock>().slot < close_slot {
        env.svm.warp_to_slot(close_slot);
    }
    env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(*window)], &[])]).map_err(|e| format!("seal: {e}"))?;
    let wd = env.svm.get_account(window).unwrap().data;
    if wd[W_STATE] != 1 {
        return Ok(None);
    }
    let seal_seed: [u8; 32] = wd[W_VRF_SEED..W_VRF_SEED + 32].try_into().unwrap();
    let salt = [salt; 32];
    env.tx(&payer, vec![request_vrf_ix(env, &payer.pubkey(), window, &seal_seed, &salt)]).map_err(|e| format!("request_vrf: {e}"))?;
    let seed = request_seed(&seal_seed, &salt);
    let req = orao_request_addr(env, &seed);
    if answer {
        orao_fulfil(env, &seed, &payer.pubkey(), &[salt[0]]);
        env.tx(&payer, vec![ix(&env.ids, "fulfill", vec![w(*window), r(req)], &[])]).map_err(|e| format!("fulfill: {e}"))?;
    }
    Ok(Some(req))
}

fn set_time(env: &mut Env, unix: i64) {
    let mut c: Clock = env.svm.get_sysvar();
    c.unix_timestamp = unix;
    env.svm.set_sysvar(&c);
}

fn now(env: &Env) -> i64 {
    env.svm.get_sysvar::<Clock>().unix_timestamp
}

/// Replace the program, as an upgrade does (visible from the next slot).
fn swap_program(env: &mut Env, so: &PathBuf) -> Result<(), String> {
    env.svm.add_program_from_file(env.ids.ladle, so).map_err(|e| format!("load {}: {e:?}", so.display()))?;
    let slot = env.svm.get_sysvar::<Clock>().slot;
    env.svm.warp_to_slot(slot + 1);
    env.svm.expire_blockhash();
    Ok(())
}

fn notice_start(env: &Env) -> i64 {
    let md = env.svm.get_account(&env.market).unwrap().data;
    let o = m_notice(&md);
    i64::from_le_bytes(md[o..o + 8].try_into().unwrap())
}

fn live_windows(env: &Env) -> u64 {
    let md = env.svm.get_account(&env.market).unwrap().data;
    u64_at(&md, m_notice(&md) + 8)
}

/// Unsold share of an entry (`share - claimed`).
fn unsold(env: &Env, entry: &Address) -> u64 {
    let ed = env.svm.get_account(entry).unwrap().data;
    u64_at(&ed, E_SHARE) - u64_at(&ed, E_CLAIMED)
}

/// What `force_exit` of `entry` must pay right now for its unsold share:
/// `Curve::sell(unsold)` on the market's current curve.
fn share_value(env: &Env, entry: &Address) -> u64 {
    let md = env.svm.get_account(&env.market).unwrap().data;
    curve_sell(u64_at(&md, M_CURVE_X), u64_at(&md, M_CURVE_Y), unsold(env, entry))
}

fn payer_of(env: &Env) -> Keypair {
    env.payer.insecure_clone()
}

/// What `claim` of a build before v25 did: `amount` of the entry's share
/// moved from the token vault to the owner's LADLE ATA (`claimed += amount`).
fn emulate_old_claim(env: &mut Env, entry: &Address, owner: &Address, amount: u64) {
    let mut acc = env.svm.get_account(entry).unwrap();
    let claimed = u64_at(&acc.data, E_CLAIMED) + amount;
    acc.data[E_CLAIMED..E_CLAIMED + 8].copy_from_slice(&claimed.to_le_bytes());
    env.svm.set_account(*entry, acc).unwrap();
    let mut v = env.svm.get_account(&env.tvault).unwrap();
    let left = u64_at(&v.data, 64) - amount;
    v.data[64..72].copy_from_slice(&left.to_le_bytes());
    env.svm.set_account(env.tvault, v).unwrap();
    let wallet = ata_of(&env.ids, owner, &env.tmint);
    put(&mut env.svm, wallet, env.ids.token, pack_token(&env.tmint, owner, amount));
}

/// A stranger with SOL.
fn stranger(env: &mut Env) -> Keypair {
    let s = Keypair::new();
    env.svm.airdrop(&s.pubkey(), 10 * SOL).unwrap();
    s
}

/// Third review: a sale bound by its quote fails when a sale ahead of it in
/// the same slot moved the curve; without the bound it lands for less. The
/// same for `sell` from a wallet (LADLE taken out by a pre-v25 `claim`,
/// written here directly).
fn slippage(so: &PathBuf) -> Result<(), String> {
    let mut env = setup(so);
    let (window, players) = open_and_enter(&mut env, 0, None, &[3 * MIN_ENTRY, 3 * MIN_ENTRY])?;
    seal_and_draw(&mut env, &window, 0x31, true)?;
    let payer = env.payer.insecure_clone();
    let entries: Vec<Address> = players.iter().map(|p| p.entry).collect();
    env.tx(&payer, finish_ixs(&env, &window, &entries)).map_err(|e| format!("slippage settle: {e}"))?;
    // both quote from the same curve (what each one's page showed)
    let (a, b) = (&players[0], &players[1]);
    let qa = share_value(&env, &a.entry);
    let qb = share_value(&env, &b.entry);
    env.tx(&a.kp.insecure_clone(), vec![sell_back_min_ix(&env, &a.kp.pubkey(), &a.entry, &a.quote, u64::MAX, qa)])
        .map_err(|e| format!("first sale at its quote: {e}"))?;
    if token_amount(&env.svm, &a.quote) != qa {
        return Err(format!("first sale paid {} for a quote of {qa}", token_amount(&env.svm, &a.quote)));
    }
    let kb = b.kp.insecure_clone();
    let bound = sell_back_min_ix(&env, &kb.pubkey(), &b.entry, &b.quote, u64::MAX, qb);
    expect_fail(&mut env.svm, &env.ids, &kb, vec![bound], "SlippageExceeded", "a sale bound by a quote the curve no longer gives")?;
    let now_b = share_value(&env, &b.entry);
    if now_b >= qb {
        return Err("the first sale did not lower the second one's price".into());
    }
    env.tx(&kb, vec![sell_back_min_ix(&env, &kb.pubkey(), &b.entry, &b.quote, u64::MAX, now_b)])
        .map_err(|e| format!("second sale at the new price: {e}"))?;

    // `sell` from a wallet: LADLE a pre-v25 claim took out of the vault (written here)
    let mut env = setup(so);
    let (window, players) = open_and_enter(&mut env, 0, None, &[MIN_ENTRY])?;
    seal_and_draw(&mut env, &window, 0x32, true)?;
    let entries: Vec<Address> = players.iter().map(|p| p.entry).collect();
    let payer = payer_of(&env);
    env.tx(&payer, finish_ixs(&env, &window, &entries)).map_err(|e| format!("slippage settle 2: {e}"))?;
    let p = &players[0];
    let held = unsold(&env, &p.entry);
    emulate_old_claim(&mut env, &p.entry, &p.kp.pubkey(), held);
    let wallet = ata_of(&env.ids, &p.kp.pubkey(), &env.tmint);
    let md = env.svm.get_account(&env.market).unwrap().data;
    let q = curve_sell(u64_at(&md, M_CURVE_X), u64_at(&md, M_CURVE_Y), held);
    let kp = p.kp.insecure_clone();
    let too_high = sell_ix(&env, &kp.pubkey(), &wallet, &p.quote, held, q + 1);
    expect_fail(&mut env.svm, &env.ids, &kp, vec![too_high], "SlippageExceeded", "a wallet sale bound above its price")?;
    env.tx(&kp, vec![sell_ix(&env, &kp.pubkey(), &wallet, &p.quote, held, q)]).map_err(|e| format!("wallet sale at its quote: {e}"))?;
    if token_amount(&env.svm, &p.quote) != q || token_amount(&env.svm, &wallet) != 0 {
        return Err("wallet sale accounting".into());
    }
    println!("slippage: a sale bound by its quote refused after a sale ahead of it, then landed at the new price; the same for a wallet sale");
    Ok(())
}

/// Shutdown on a wSOL market (the mainnet case), with every kind of forgotten
/// money: rounds played on the normal build, the program replaced by the
/// wind-down build, the notice, the drain, the market closed.
fn wind_down_native(normal: &PathBuf, wd: &PathBuf, stats: &mut Vec<Stats>) -> Result<(), String> {
    let mut env = setup_with(normal, true, true);
    let payer = env.payer.insecure_clone();
    let entry_rent = env.svm.minimum_balance_for_rent_exemption(ENTRY_LEN);
    set_time(&mut env, 1_800_000_000);

    // round 0, settled: P0 sells everything and never closes its entry (it is
    // still open when someone closes the market); P1 sells half and forgets the
    // rest; P2 forgets everything (and, as a pre-v25 player, holds some LADLE in
    // a wallet, taken out by the old claim)
    let (w0, p) = open_and_enter(&mut env, 0, None, &[2 * MIN_ENTRY, 3 * MIN_ENTRY, 5 * MIN_ENTRY])?;
    seal_and_draw(&mut env, &w0, 0x40, true)?;
    let e0: Vec<Address> = p.iter().map(|x| x.entry).collect();
    env.tx(&payer, finish_ixs(&env, &w0, &e0)).map_err(|e| format!("round 0: {e}"))?;
    let (p0, p1, p2) = (&p[0], &p[1], &p[2]);
    env.tx(&p0.kp.insecure_clone(), vec![sell_back_ix(&env, &p0.kp.pubkey(), &p0.entry, &p0.quote, u64::MAX)])?;
    let half = unsold(&env, &p1.entry) / 2;
    env.tx(&p1.kp.insecure_clone(), vec![sell_back_ix(&env, &p1.kp.pubkey(), &p1.entry, &p1.quote, half)])?;
    let in_wallet = unsold(&env, &p2.entry) / 10;
    emulate_old_claim(&mut env, &p2.entry, &p2.kp.pubkey(), in_wallet);

    // round 1: two stakes, ORAO never answers (refunded later); round 2: one
    // entry, still open when the game stops
    let (w1, r1s) = open_and_enter(&mut env, 1, Some(w0), &[MIN_ENTRY, 4 * MIN_ENTRY])?;
    let req1 = seal_and_draw(&mut env, &w1, 0x41, false)?.ok_or("round 1 did not ask ORAO")?;
    let (w2, l) = open_and_enter(&mut env, 2, Some(w1), &[2 * MIN_ENTRY])?;
    if live_windows(&env) != 3 {
        return Err(format!("live_windows {} after three open_window", live_windows(&env)));
    }

    // the normal build has no shutdown instruction
    let fx = force_exit_ix(&env, &payer.pubkey(), &p2.entry, &p2.kp.pubkey(), None, &unwrap_addr(&env, &p2.entry));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "InstructionFallbackNotFound", "force_exit on the normal build")?;
    let built = start_wind_down_ix(&env);
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "InstructionFallbackNotFound", "start_wind_down on the normal build")?;
    let built = close_market_ix(&env, &payer.pubkey());
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "InstructionFallbackNotFound", "close_market on the normal build")?;

    // --- the operator upgrades to the wind-down build
    swap_program(&mut env, wd)?;
    let built = open_window_ix(&env, 3, Some(w2));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "InstructionFallbackNotFound", "open_window on the wind-down build")?;
    let (late, late_quote) = new_player(&mut env, MIN_ENTRY);
    let late_entry = entry_addr(&env, Scheme::Owner, &w2, 1, &late.pubkey());
    let e = enter_ix(&env, &w2, &late_entry, &late.pubkey(), &late_quote, MIN_ENTRY);
    expect_fail(&mut env.svm, &env.ids, &late, vec![e], "InstructionFallbackNotFound", "enter on the wind-down build")?;
    let fx = force_exit_ix(&env, &payer.pubkey(), &p2.entry, &p2.kp.pubkey(), None, &unwrap_addr(&env, &p2.entry));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "NoticeNotOver", "force_exit before any notice")?;

    // the notice starts (anyone may send it), once
    let s = env.tx(&payer, vec![start_wind_down_ix(&env)]).map_err(|e| format!("start_wind_down: {e}"))?;
    stats.push(Stats { name: "start_wind_down".into(), samples: vec![s.ladle_cu[0]] });
    let started = notice_start(&env);
    if started != now(&env) {
        return Err(format!("notice_start {started} != clock {}", now(&env)));
    }
    env.svm.expire_blockhash();
    let built = start_wind_down_ix(&env);
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "NoticeAlreadyStarted", "a second start_wind_down")?;

    // --- during the notice: rounds in flight finish (in order: round 1 refunds
    // after its VRF timeout, then round 2 settles), players exit by themselves
    let deadline = u64_at(&env.svm.get_account(&w1).unwrap().data, W_VRF_REQUESTED_SLOT) + 900;
    env.svm.warp_to_slot(deadline + 1);
    env.tx(&payer, vec![ix(&env.ids, "refund_window", vec![w(env.market), w(w1), r(req1)], &[])]).map_err(|e| format!("refund_window: {e}"))?;
    seal_and_draw(&mut env, &w2, 0x42, true)?; // one entry: Drawn at seal
    env.tx(&payer, finish_ixs(&env, &w2, &[l[0].entry])).map_err(|e| format!("round 2 during the notice: {e}"))?;
    let escrow1 = ata_of(&env.ids, &w1, &env.qmint);
    let (r0, r1) = (&r1s[0], &r1s[1]);
    env.tx(&payer, vec![ix(
        &env.ids,
        "refund_entry",
        vec![r(env.market), w(w1), w(r0.entry), r(env.qmint), w(escrow1), w(r0.quote), r(env.ids.token)],
        &[],
    )])
    .map_err(|e| format!("refund_entry during the notice: {e}"))?;
    // P2 sells its wallet LADLE during the notice (the market must have no LADLE out to close)
    let p2_wallet = ata_of(&env.ids, &p2.kp.pubkey(), &env.tmint);
    env.tx(&p2.kp.insecure_clone(), vec![sell_ix(&env, &p2.kp.pubkey(), &p2_wallet, &p2.quote, in_wallet, 0)])
        .map_err(|e| format!("wallet sale during the notice: {e}"))?;
    // one second before the end: still refused
    set_time(&mut env, started + NOTICE_SECS - 1);
    let fx = force_exit_ix(&env, &payer.pubkey(), &p2.entry, &p2.kp.pubkey(), None, &unwrap_addr(&env, &p2.entry));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "NoticeNotOver", "force_exit one second before the notice ends")?;
    let built = close_market_ix(&env, &payer.pubkey());
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "NoticeNotOver", "close_market during the notice")?;

    // --- the notice is over: the drain
    set_time(&mut env, started + NOTICE_SECS);
    env.svm.expire_blockhash();
    let built = close_market_ix(&env, &payer.pubkey());
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "MarketNotDrained", "close_market with rounds and shares left")?;
    // final review: P1 and R1 hand their wSOL accounts to someone else for good
    // (their associated addresses now belong to a foreign owner). The normal
    // refund into R1's is gone by R1's own doing; the forced exits below still
    // pay both of them, as SOL to their wallets.
    let taker = stranger(&mut env);
    for pl in [p1, &r1s[1]] {
        let kp = pl.kp.insecure_clone();
        env.tx(&kp, vec![hand_over_ix(&env, &pl.quote, &kp.pubkey(), &taker.pubkey())]).map_err(|e| format!("SetAuthority on a player's wSOL account: {e}"))?;
        if env.svm.get_account(&pl.quote).unwrap().data[32..64] != *taker.pubkey().as_ref() {
            return Err("SetAuthority did not hand the account over".into());
        }
    }
    let refund_r1 = ix(
        &env.ids,
        "refund_entry",
        vec![r(env.market), w(w1), w(r1s[1].entry), r(env.qmint), w(escrow1), w(r1s[1].quote), r(env.ids.token)],
        &[],
    );
    expect_fail(&mut env.svm, &env.ids, &payer, vec![refund_r1], "RecipientNotOwner", "refund_entry into an account its owner gave away")?;
    let thief = stranger(&mut env);
    // nobody else can be paid: another owner, another payout address
    let fx = force_exit_ix(&env, &payer.pubkey(), &p1.entry, &thief.pubkey(), None, &unwrap_addr(&env, &p1.entry));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "ConstraintHasOne", "force_exit paying a stranger")?;
    let fx = force_exit_ix(&env, &payer.pubkey(), &p1.entry, &p1.kp.pubkey(), None, &unwrap_addr(&env, &p2.entry));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "RecipientNotOwner", "force_exit through another entry's unwrap address")?;
    let thief_quote = ata_of(&env.ids, &thief.pubkey(), &env.qmint);
    let (token, qmint) = (env.ids.token, env.qmint);
    put_token(&mut env.svm, token, thief_quote, &qmint, &thief.pubkey(), 0);
    let fx = force_exit_ix(&env, &payer.pubkey(), &p1.entry, &p1.kp.pubkey(), None, &thief_quote);
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "RecipientNotOwner", "force_exit into a stranger's wSOL account")?;
    // a stranger sends lamports to P1's unwrap address first (it must still work; they go to P1)
    let gift = env.svm.minimum_balance_for_rent_exemption(0);
    env.svm.airdrop(&unwrap_addr(&env, &p1.entry), gift).unwrap();

    // each forced exit pays exactly the share's value now (or the stake), as SOL, to the owner
    let mut forced_paid: u64 = 0;
    let cases: Vec<(&str, &Player, Option<Address>, u64)> = vec![
        ("P1, half its share unsold, its wSOL account given away", p1, None, gift),
        ("P2, its whole share unsold", p2, None, 0),
        ("L0, its round finished during the notice", &l[0], None, 0),
        ("R1, a stake never refunded, its wSOL account given away", r1, Some(w1), 0),
        ("R0, refunded, only its rent left", r0, None, 0),
    ];
    for (what, pl, window, extra) in cases {
        let owner = pl.kp.pubkey();
        let refunded = env.svm.get_account(&pl.entry).unwrap().data[E_REFUNDED] == 1;
        let expected = if window.is_some() { pl.amount } else if refunded { 0 } else { share_value(&env, &pl.entry) };
        if window.is_some() {
            // without its window the stake cannot be found
            let fx = force_exit_ix(&env, &payer.pubkey(), &pl.entry, &owner, None, &unwrap_addr(&env, &pl.entry));
            expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "WrongWindowState", "force_exit of a stake without its window")?;
        }
        let (owner_before, payer_before) = (lamports(&env.svm, &owner), lamports(&env.svm, &payer.pubkey()));
        let curve_before = env.svm.get_account(&env.market).unwrap().data[M_CURVE_X..M_CURVE_Y + 8].to_vec();
        let fx = force_exit_ix(&env, &payer.pubkey(), &pl.entry, &owner, window, &unwrap_addr(&env, &pl.entry));
        let s = env.tx(&payer, vec![fx]).map_err(|e| format!("force_exit {what}: {e}"))?;
        let i = stats.iter().position(|s| s.name == "force_exit").unwrap_or_else(|| {
            stats.push(Stats::new("force_exit"));
            stats.len() - 1
        });
        stats[i].push(s.ladle_cu[0]);
        let got = lamports(&env.svm, &owner) - owner_before;
        if got != expected + entry_rent + extra {
            return Err(format!("force_exit {what}: owner got {got}, expected {expected} + rent {entry_rent} + {extra}"));
        }
        // the payer is out only its transaction fee: the unwrap account's rent came back
        if lamports(&env.svm, &payer.pubkey()) != payer_before - 5_000 {
            return Err(format!("force_exit {what}: payer changed by {}", lamports(&env.svm, &payer.pubkey()) as i128 - payer_before as i128));
        }
        if lamports(&env.svm, &pl.entry) != 0 || lamports(&env.svm, &unwrap_addr(&env, &pl.entry)) != 0 {
            return Err(format!("force_exit {what}: entry or unwrap account left"));
        }
        let curve_after = env.svm.get_account(&env.market).unwrap().data[M_CURVE_X..M_CURVE_Y + 8].to_vec();
        if (window.is_some() || expected == 0) != (curve_before == curve_after) {
            return Err(format!("force_exit {what}: the curve moved for a refund, or did not for a sale"));
        }
        forced_paid += expected;
        // never twice
        env.svm.expire_blockhash();
        let again = force_exit_ix(&env, &payer.pubkey(), &pl.entry, &owner, window, &unwrap_addr(&env, &pl.entry));
        expect_fail(&mut env.svm, &env.ids, &payer, vec![again], "AccountNotInitialized", "a second force_exit")?;
    }
    if u32_at(&env.svm.get_account(&w1).unwrap().data, W_REFUNDED_ENTRIES) != 2 {
        return Err("the forced refund was not counted in refunded_entries".into());
    }

    // the rounds close (rents to the opener), then the market (rents to its creator)
    for win in [w0, w1, w2] {
        env.tx(&payer, vec![close_window_ix(&env, &win, &payer.pubkey())]).map_err(|e| format!("close_window after the drain: {e}"))?;
    }
    if live_windows(&env) != 0 {
        return Err(format!("live_windows {} after closing every round", live_windows(&env)));
    }
    let md = env.svm.get_account(&env.market).unwrap().data;
    if u64_at(&md, M_CURVE_Y) != TOKEN_SUPPLY {
        return Err("LADLE still out after the drain".into());
    }
    let quote_left = token_amount(&env.svm, &env.qvault);
    if quote_left != u64_at(&md, M_CURVE_X) - 30 * SOL {
        return Err(format!("quote vault {quote_left} != the curve's rounding {}", u64_at(&md, M_CURVE_X) - 30 * SOL));
    }
    let rents = lamports(&env.svm, &env.market) + lamports(&env.svm, &env.tvault) + lamports(&env.svm, &env.qvault);
    let creator_before = lamports(&env.svm, &payer.pubkey());
    let s = env.tx(&payer, vec![close_market_ix(&env, &payer.pubkey())]).map_err(|e| format!("close_market: {e}"))?;
    stats.push(Stats { name: "close_market".into(), samples: vec![s.ladle_cu[0]] });
    if lamports(&env.svm, &payer.pubkey()) != creator_before + rents - 5_000 {
        return Err("close_market: the rents and the quote left did not all reach the creator".into());
    }
    if u64_at(&env.svm.get_account(&env.tmint).unwrap().data, 36) != 0 {
        return Err("the unsold LADLE was not burned".into());
    }
    // final review, finding 3: close_market does not count entries, so P0's
    // entry (sold out, never closed) outlives the market: it holds only P0's
    // rent, and close_entry returns it with the market gone (the keeper's
    // --shutdown sweeps such entries program-wide)
    if lamports(&env.svm, &p0.entry) != entry_rent {
        return Err("P0's empty entry should still be open after close_market".into());
    }
    let p0_before = lamports(&env.svm, &p0.kp.pubkey());
    env.tx(&payer, vec![close_entry_ix(&env, &p0.entry, &p0.kp.pubkey())]).map_err(|e| format!("close_entry after close_market: {e}"))?;
    if lamports(&env.svm, &p0.kp.pubkey()) != p0_before + entry_rent || lamports(&env.svm, &p0.entry) != 0 {
        return Err("close_entry after close_market: the rent did not reach P0".into());
    }

    // nothing of anyone's is left in the program: no account it owns, no escrow
    let mut left: Vec<Address> = vec![env.market, env.qvault, env.tvault];
    for win in [w0, w1, w2] {
        left.push(win);
        left.push(ata_of(&env.ids, &win, &env.qmint));
    }
    for pl in p.iter().chain(r1s.iter()).chain(l.iter()) {
        left.push(pl.entry);
        left.push(unwrap_addr(&env, &pl.entry));
    }
    if let Some(a) = left.iter().find(|a| lamports(&env.svm, a) != 0) {
        return Err(format!("{a} still holds lamports after the shutdown"));
    }
    // every stake is accounted for: paid to the players (sales, refunds, forced
    // exits), the platform fee and keeper bounty, the curve's rounding (to the creator)
    let staked: u64 = p.iter().chain(r1s.iter()).chain(l.iter()).map(|x| x.amount).sum();
    let in_atas: u64 = p.iter().chain(r1s.iter()).chain(l.iter()).map(|x| token_amount(&env.svm, &x.quote)).sum();
    let fees = token_amount(&env.svm, &env.platform_ata) + token_amount(&env.svm, &env.keeper_ata);
    if in_atas + forced_paid + fees + quote_left != staked {
        return Err(format!("stakes {staked} != players {in_atas} + forced {forced_paid} + fees {fees} + rounding {quote_left}"));
    }
    if token_amount(&env.svm, &p2_wallet) != 0 {
        return Err("LADLE left in a wallet".into());
    }
    println!(
        "wind-down (wSOL): refused on the normal build and before the notice ends; 5 forced exits paid each owner the exact share value, stake or rent as SOL (never anyone else, never twice), two of them to players who had given their wSOL account away; 3 rounds and the market closed; an empty entry left behind closed after the market; nothing left in the program ({quote_left} lamports of curve rounding to the creator)"
    );
    Ok(())
}

/// Final review (2026-10-29): wSOL is the only quote mint. `create_market`
/// refuses any other (`QuoteMintNotWsol`) and passes that check with wSOL; a
/// market of another quote mint, which only an earlier build could make
/// (written here), gets no forced payout and cannot close, while its players
/// still sell back by themselves. Also: a shutdown called off (normal build
/// back, a round opens) needs a new, full notice.
fn wind_down_quote_rule(normal: &PathBuf, wd: &PathBuf) -> Result<(), String> {
    // --- create_market: wSOL only
    let mut env = setup_with(normal, true, true);
    let payer = payer_of(&env);
    let classic = Address::new_unique();
    let token = env.ids.token;
    put(&mut env.svm, classic, token, pack_mint(9, 0));
    let mint_kp = Keypair::new();
    let built = create_market_ix(&env, &payer.pubkey(), &mint_kp.pubkey(), &classic);
    match send(&mut env.svm, &env.ids, &payer, &[&mint_kp], vec![built]) {
        Ok(_) => return Err("create_market accepted a quote mint other than wSOL".into()),
        Err(log) if log.contains("QuoteMintNotWsol") => {}
        Err(log) => return Err(format!("create_market with another quote mint failed without QuoteMintNotWsol:\n{log}")),
    }
    let mint_kp = Keypair::new();
    let qmint = env.qmint;
    let built = create_market_ix(&env, &payer.pubkey(), &mint_kp.pubkey(), &qmint);
    match send(&mut env.svm, &env.ids, &payer, &[&mint_kp], vec![built]) {
        // LiteSVM has no Metaplex program: the metadata CPI fails ("Unsupported
        // program id"), after the quote check and after the supply was minted
        Ok(_) => {}
        Err(log) if log.contains("QuoteMintNotWsol") => return Err(format!("create_market refused wSOL:\n{log}")),
        Err(log) if !log.contains("Unsupported program id") => return Err(format!("create_market with wSOL stopped before the metadata CPI:\n{log}")),
        Err(_) => {}
    }

    // --- a market of another quote mint (an earlier build could make one): no forced payout, no close
    let mut env = setup_with(normal, true, false);
    let payer = payer_of(&env);
    set_time(&mut env, 1_800_000_000);
    let (w0, q) = open_and_enter(&mut env, 0, None, &[MIN_ENTRY, 2 * MIN_ENTRY])?;
    seal_and_draw(&mut env, &w0, 0x50, true)?;
    let e0: Vec<Address> = q.iter().map(|x| x.entry).collect();
    env.tx(&payer, finish_ixs(&env, &w0, &e0)).map_err(|e| format!("round 0 (other quote mint): {e}"))?;
    swap_program(&mut env, wd)?;
    env.tx(&payer, vec![start_wind_down_ix(&env)]).map_err(|e| format!("start_wind_down (other quote mint): {e}"))?;
    let started = notice_start(&env);
    set_time(&mut env, started + NOTICE_SECS);
    let a = &q[0];
    let fx = force_exit_ix(&env, &payer.pubkey(), &a.entry, &a.kp.pubkey(), None, &unwrap_addr(&env, &a.entry));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "QuoteMintNotWsol", "force_exit on a market of another quote mint")?;
    let built = close_market_ix(&env, &payer.pubkey());
    expect_fail(&mut env.svm, &env.ids, &payer, vec![built], "QuoteMintNotWsol", "close_market of a market of another quote mint")?;
    let ka = a.kp.insecure_clone();
    env.tx(&ka, vec![sell_back_ix(&env, &ka.pubkey(), &a.entry, &a.quote, u64::MAX)]).map_err(|e| format!("sell_back on that market: {e}"))?;

    // --- a shutdown called off needs a new, full notice (wSOL market)
    let mut env = setup_with(normal, true, true);
    let payer = payer_of(&env);
    let entry_rent = env.svm.minimum_balance_for_rent_exemption(ENTRY_LEN);
    set_time(&mut env, 1_800_000_000);
    let (w0, q) = open_and_enter(&mut env, 0, None, &[MIN_ENTRY, 2 * MIN_ENTRY])?;
    seal_and_draw(&mut env, &w0, 0x51, true)?;
    let e0: Vec<Address> = q.iter().map(|x| x.entry).collect();
    env.tx(&payer, finish_ixs(&env, &w0, &e0)).map_err(|e| format!("round 0: {e}"))?;
    swap_program(&mut env, wd)?;
    env.tx(&payer, vec![start_wind_down_ix(&env)]).map_err(|e| format!("start_wind_down: {e}"))?;
    let first = notice_start(&env);
    swap_program(&mut env, normal)?;
    env.tx(&payer, vec![open_window_ix(&env, 1, Some(w0))]).map_err(|e| format!("open_window after the shutdown was called off: {e}"))?;
    if notice_start(&env) != 0 {
        return Err("a round opened but the old notice still counts".into());
    }
    let w1 = window_addr(&env, 1);
    let close1 = u64_at(&env.svm.get_account(&w1).unwrap().data, W_CLOSE_SLOT);
    env.svm.warp_to_slot(close1);
    env.tx(&payer, vec![ix(&env.ids, "seal", vec![w(env.market), w(w1)], &[])]).map_err(|e| format!("seal empty round 1: {e}"))?;
    // the game stops again, long after the first notice would have ended: a new, full notice
    swap_program(&mut env, wd)?;
    set_time(&mut env, first + 30 * NOTICE_SECS);
    let (a, b) = (&q[0], &q[1]);
    let fx = force_exit_ix(&env, &payer.pubkey(), &a.entry, &a.kp.pubkey(), None, &unwrap_addr(&env, &a.entry));
    expect_fail(&mut env.svm, &env.ids, &payer, vec![fx], "NoticeNotOver", "force_exit on the old notice of a called-off shutdown")?;
    env.tx(&payer, vec![start_wind_down_ix(&env)]).map_err(|e| format!("start_wind_down again: {e}"))?;
    let started = notice_start(&env);
    set_time(&mut env, started + NOTICE_SECS);
    for pl in [a, b] {
        let expected = share_value(&env, &pl.entry);
        let before = lamports(&env.svm, &pl.kp.pubkey());
        let fx = force_exit_ix(&env, &payer.pubkey(), &pl.entry, &pl.kp.pubkey(), None, &unwrap_addr(&env, &pl.entry));
        env.tx(&payer, vec![fx]).map_err(|e| format!("force_exit after the new notice: {e}"))?;
        if lamports(&env.svm, &pl.kp.pubkey()) != before + expected + entry_rent {
            return Err("force_exit after the new notice: wrong payout or rent".into());
        }
    }
    for win in [w0, w1] {
        env.tx(&payer, vec![close_window_ix(&env, &win, &payer.pubkey())]).map_err(|e| format!("close_window: {e}"))?;
    }
    let quote_left = token_amount(&env.svm, &env.qvault);
    let rents = lamports(&env.svm, &env.market) + lamports(&env.svm, &env.tvault) + lamports(&env.svm, &env.qvault);
    let creator_before = lamports(&env.svm, &payer.pubkey());
    env.tx(&payer, vec![close_market_ix(&env, &payer.pubkey())]).map_err(|e| format!("close_market: {e}"))?;
    if lamports(&env.svm, &payer.pubkey()) != creator_before + rents - 5_000 || lamports(&env.svm, &env.market) != 0 {
        return Err("close_market: the rents and the quote left did not all reach the creator".into());
    }
    println!(
        "wind-down (quote rule): create_market refused another quote mint and passed the check with wSOL; a market of another quote mint got no forced payout and could not close (its players still sold back); a called-off shutdown needed a new, full notice ({quote_left} lamports of rounding to the creator as SOL)"
    );
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let so = PathBuf::from(args.get(1).cloned().unwrap_or_else(|| "../../target/deploy/ladle.so".into()));
    if args.get(2).map(|s| s.as_str()) == Some("wind-down") {
        // <normal .so> wind-down <wind-down .so>
        let wd = PathBuf::from(args.get(3).cloned().unwrap_or_else(|| "../../target/wind-down/ladle.so".into()));
        let (n_len, wd_len) = (
            std::fs::metadata(&so).map(|m| m.len()).unwrap_or(0),
            std::fs::metadata(&wd).map(|m| m.len()).unwrap_or(0),
        );
        println!("normal {} ({n_len} bytes), wind-down {} ({wd_len} bytes)", so.display(), wd.display());
        let mut failed = false;
        // the upgrade to the wind-down build must fit the program's data account
        // (deployed with --max-len = the normal .so's size)
        if wd_len == 0 || wd_len > n_len {
            println!("wind-down FAIL the wind-down build ({wd_len} B) does not fit the normal build's data account ({n_len} B)");
            failed = true;
        }
        let mut stats: Vec<Stats> = Vec::new();
        if let Err(e) = wind_down_native(&so, &wd, &mut stats) {
            println!("wind-down (wSOL) FAIL {e}");
            failed = true;
        }
        if let Err(e) = wind_down_quote_rule(&so, &wd) {
            println!("wind-down (quote rule) FAIL {e}");
            failed = true;
        }
        println!("
compute units (wind-down build):");
        for s in &stats {
            println!("  {}", s.line());
        }
        if failed {
            std::process::exit(1);
        }
        return;
    }
    let scheme = match args.get(2).map(|s| s.as_str()).unwrap_or("owner") {
        "index" => Scheme::Index,
        _ => Scheme::Owner,
    };
    let sizes: Vec<usize> = args
        .get(3)
        .map(|s| s.split(',').map(|x| x.parse().unwrap()).collect())
        .unwrap_or_else(|| vec![1, 2, 50, 100, 500, 2048]);
    // entries per tally / settle page (default 48 / 48, the program maximum)
    let pages: (usize, usize) = args
        .get(4)
        .map(|s| {
            let v: Vec<usize> = s.split(',').map(|x| x.parse().unwrap()).collect();
            (v[0], v[1])
        })
        .unwrap_or((MAX_PAGE, MAX_PAGE));
    assert!(pages.0 >= 1 && pages.0 <= MAX_PAGE && pages.1 >= 1 && pages.1 <= MAX_PAGE);
    let len = std::fs::metadata(&so).map(|m| m.len()).unwrap_or(0);
    println!("program {} ({} bytes), entry seeds: {:?}, pages tally/settle {:?}", so.display(), len, scheme, pages);

    let mut stats: Vec<Stats> = Vec::new();
    let mut page_cu: Vec<(usize, bool, u64)> = Vec::new();
    let mut failed = false;
    for &n in &sizes {
        if let Err(e) = run(&so, scheme, n, pages, &mut stats, &mut page_cu) {
            println!("N={n:<5} FAIL {e}");
            failed = true;
        }
    }
    if let Err(e) = refund_flow(&so, scheme, &mut stats) {
        println!("refund FAIL {e}");
        failed = true;
    }
    if let Err(e) = escrow_squat(&so) {
        println!("escrow squat FAIL {e}");
        failed = true;
    }
    if let Err(e) = vrf_salt(&so, &mut stats) {
        println!("vrf salt FAIL {e}");
        failed = true;
    }
    if let Err(e) = review2(&so, &mut stats) {
        println!("review 2 FAIL {e}");
        failed = true;
    }
    if let Err(e) = slippage(&so) {
        println!("slippage FAIL {e}");
        failed = true;
    }
    if let Err(e) = host_account(&so) {
        println!("host account FAIL {e}");
        failed = true;
    }

    println!("\ncompute units per instruction (Ladle program only, CPIs included):");
    for s in &stats {
        println!("  {}", s.line());
    }

    // per-page cost by size
    let mut tally: Vec<(usize, u64)> = page_cu.iter().filter(|(k, f, _)| *k < 10_000 && !*f).map(|(k, _, c)| (*k, *c)).collect();
    let mut tally_final: Vec<(usize, u64)> = page_cu.iter().filter(|(k, f, _)| *k < 10_000 && *f).map(|(k, _, c)| (*k, *c)).collect();
    let mut settle: Vec<(usize, u64)> = page_cu.iter().filter(|(k, _, _)| *k >= 10_000).map(|(k, _, c)| (*k - 10_000, *c)).collect();
    for v in [&mut tally, &mut tally_final, &mut settle] {
        v.sort_unstable();
        v.dedup_by_key(|(k, _)| *k);
    }
    println!("\npage cost by page size (entries -> CU):");
    println!("  tally_page        {:?}", tally);
    println!("  tally_page final  {:?}", tally_final);
    println!("  settle_page       {:?}", settle);

    match crowd(&so, scheme, 50) {
        Ok(k) => println!("\ncrowd: 50 enters built from the same window snapshot -> {k}/50 landed"),
        Err(e) => println!("\ncrowd: error {e}"),
    }
    if failed {
        std::process::exit(1);
    }
}
