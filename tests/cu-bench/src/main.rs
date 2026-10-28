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
//! written directly, and the ORAO request account is written as ORAO's
//! fulfilled layout because the ORAO program is not loaded):
//! open_window, N x enter, seal, [fulfill], tally_page / settle_page in pages
//! (48 / 48 by default), sell_back, claim, close_entry for every entry, open_window of the
//! next round, close_window. It checks: sum(shares) == tokens_out, the fee
//! split to the lamport (curve + platform + bounty + host == total), escrow
//! empty after the tally, vault balances, and that every entry and the
//! window close. The second wallet's Entry address is pre-funded by a third
//! party before it enters (entering must still work), and with `owner` seeds a
//! second enter from the first wallet must fail with AlreadyEntered. It also
//! replays 50 enters built from the same snapshot of
//! the window (50 wallets clicking in the same slot) and counts how many land.
//!
//! The ORAO-less single-entry path (v21) is exercised when the program seals
//! a one-entry window straight to Drawn.

use std::{path::PathBuf, str::FromStr, time::Instant};

use litesvm::LiteSVM;
use solana_account::Account;
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
const TREASURY: &str = "A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat";
const COMPUTE_BUDGET: &str = "ComputeBudget111111111111111111111111111111";

const TOKEN_SUPPLY: u64 = 1_000_000_000 * 1_000_000;
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
            treasury: addr(TREASURY),
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

// Window field offsets (state.rs layout, 411 bytes).
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
const W_CLOSED_ENTRIES: usize = 407;
// Entry field offsets (110 bytes).
const E_INDEX: usize = 72;
const E_AMOUNT: usize = 76;
const E_SHARE: usize = 92;

#[allow(clippy::too_many_arguments)]
fn market_data(
    creator: &Address,
    token_mint: &Address,
    quote_mint: &Address,
    quote_program: &Address,
    quote_vault: &Address,
    token_vault: &Address,
    bump: u8,
) -> Vec<u8> {
    let mut d = Vec::with_capacity(562);
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
    d.resize(562, 0);
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
}

fn setup(so: &PathBuf) -> Env {
    let ids = Ids::new();
    let mut svm = LiteSVM::new().with_transaction_history(0);
    svm.add_program_from_file(ids.ladle, so).expect("load ladle.so");
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100_000 * SOL).unwrap();
    let qmint = Address::new_unique();
    let tmint = Address::new_unique();
    put(&mut svm, qmint, ids.token, pack_mint(9, 0));
    put(&mut svm, tmint, ids.token, pack_mint(6, TOKEN_SUPPLY));
    let (market, mbump) = pda(&[b"market", tmint.as_ref()], &ids.ladle);
    let qvault = ata_of(&ids, &market, &qmint);
    let tvault = ata_of(&ids, &market, &tmint);
    put(&mut svm, qvault, ids.token, pack_token(&qmint, &market, 0));
    put(&mut svm, tvault, ids.token, pack_token(&tmint, &market, TOKEN_SUPPLY));
    let platform_ata = ata_of(&ids, &ids.treasury, &qmint);
    put(&mut svm, platform_ata, ids.token, pack_token(&qmint, &ids.treasury, 0));
    let keeper_ata = ata_of(&ids, &payer.pubkey(), &qmint);
    put(&mut svm, keeper_ata, ids.token, pack_token(&qmint, &payer.pubkey(), 0));
    let md = market_data(&payer.pubkey(), &tmint, &qmint, &ids.token, &qvault, &tvault, mbump);
    put(&mut svm, market, ids.ladle, md);
    Env { svm, ids, payer, qmint, tmint, market, qvault, tvault, platform_ata, keeper_ata }
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
    // 0.01 .. 0.25 (9-decimal quote), deterministic spread
    10_000_000 + ((i as u64 * 7919) % 241) * 1_000_000
}

fn new_player(env: &mut Env, amount: u64) -> (Keypair, Address) {
    let kp = Keypair::new();
    env.svm.airdrop(&kp.pubkey(), SOL).unwrap();
    let quote = ata_of(&env.ids, &kp.pubkey(), &env.qmint);
    put(&mut env.svm, quote, env.ids.token, pack_token(&env.qmint, &kp.pubkey(), amount));
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
    let s = send(&mut env.svm, &env.ids, &payer, &[], vec![ow])?;
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
        let s = send(&mut env.svm, &env.ids, &kp, &[], vec![e]).map_err(|e| format!("enter {k}: {e}"))?;
        let i = get(stats, "enter");
        stats[i].push(s.ladle_cu[0]);
        if k == 1 {
            let acc = env.svm.get_account(&entry).unwrap();
            let rent = env.svm.minimum_balance_for_rent_exemption(acc.data.len());
            if acc.owner != env.ids.ladle || acc.data.len() != 110 || acc.lamports != rent {
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
    let s = send(&mut env.svm, &env.ids, &payer, &[], vec![seal])?;
    let i = get(stats, "seal");
    stats[i].push(s.ladle_cu[0]);

    let mut wd = env.svm.get_account(&window).unwrap().data;
    let state = wd[W_STATE];
    let mut used_vrf = false;
    if state == 1 {
        // Sealed: emulate ORAO (request account in its fulfilled layout) and fulfill.
        used_vrf = true;
        let vrf_seed: [u8; 32] = wd[W_VRF_SEED..W_VRF_SEED + 32].try_into().unwrap();
        let (req, _) = pda(&[b"orao-vrf-randomness-request", &vrf_seed], &env.ids.orao);
        wd[W_VRF_REQUESTED] = 1;
        wd[W_VRF_REQUESTED_SLOT..W_VRF_REQUESTED_SLOT + 8].copy_from_slice(&(close_slot + 1).to_le_bytes());
        wd[W_VRF_REQUEST..W_VRF_REQUEST + 32].copy_from_slice(req.as_ref());
        let mut wa = env.svm.get_account(&window).unwrap();
        wa.data = wd;
        env.svm.set_account(window, wa).unwrap();
        let mut rd = disc("account", "RandomnessV2").to_vec();
        rd.push(1);
        rd.extend_from_slice(payer.pubkey().as_ref());
        rd.extend_from_slice(&vrf_seed);
        let r1 = hashv(&[b"bench-randomness-1", &(n as u64).to_le_bytes()]).to_bytes();
        let r2 = hashv(&[b"bench-randomness-2", &(n as u64).to_le_bytes()]).to_bytes();
        rd.extend_from_slice(&r1);
        rd.extend_from_slice(&r2);
        put(&mut env.svm, req, env.ids.orao, rd);
        let f = ix(&env.ids, "fulfill", vec![w(window), r(req)], &[]);
        let s = send(&mut env.svm, &env.ids, &payer, &[], vec![f])?;
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
        let s = send(&mut env.svm, &env.ids, &payer, &[], vec![cu_limit(&env.ids, 1_400_000), t])
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
        let s = send(&mut env.svm, &env.ids, &payer, &[], vec![cu_limit(&env.ids, 1_400_000), t])
            .map_err(|e| format!("settle [{from},{to}): {e}"))?;
        let i = get(stats, "settle_page");
        stats[i].push(s.ladle_cu[0]);
        page_cu.push((to - from + 10_000, to == n, s.ladle_cu[0]));
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
        if u32_at(&ed, E_INDEX) as usize != k || u64_at(&ed, E_AMOUNT) != p.amount {
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

    // --- exits: sell_back the first, claim the second, then claim/close the rest
    for (k, p) in players.iter().enumerate() {
        let share = u64_at(&env.svm.get_account(&p.entry).unwrap().data, E_SHARE);
        let kp = p.kp.insecure_clone();
        if share > 0 && (k == 0 || k % 2 == 0) {
            let sb = ix(
                &env.ids,
                "sell_back",
                vec![rs(kp.pubkey()), w(env.market), r(window), w(p.entry), r(env.qmint), w(env.qvault), w(p.quote), r(env.ids.token)],
                &u64::MAX.to_le_bytes(),
            );
            let s = send(&mut env.svm, &env.ids, &kp, &[], vec![sb]).map_err(|e| format!("sell_back {k}: {e}"))?;
            let i = get(stats, "sell_back");
            stats[i].push(s.ladle_cu[0]);
        } else if share > 0 {
            let tok = ata_of(&env.ids, &kp.pubkey(), &env.tmint);
            put(&mut env.svm, tok, env.ids.token, pack_token(&env.tmint, &kp.pubkey(), 0));
            let c = ix(
                &env.ids,
                "claim",
                vec![rs(kp.pubkey()), r(env.market), r(window), w(p.entry), r(env.tmint), w(env.tvault), w(tok), r(env.ids.token)],
                &[],
            );
            let s = send(&mut env.svm, &env.ids, &kp, &[], vec![c]).map_err(|e| format!("claim {k}: {e}"))?;
            let i = get(stats, "claim");
            stats[i].push(s.ladle_cu[0]);
        }
        let ce = ix(&env.ids, "close_entry", vec![w(window), w(p.entry), w(kp.pubkey())], &[]);
        let s = send(&mut env.svm, &env.ids, &payer, &[], vec![ce]).map_err(|e| format!("close_entry {k}: {e}"))?;
        let i = get(stats, "close_entry");
        stats[i].push(s.ladle_cu[0]);
    }
    let wd = env.svm.get_account(&window).unwrap().data;
    if u32_at(&wd, W_CLOSED_ENTRIES) as usize != n {
        return Err("closed_entries".into());
    }

    // next round, then close this one
    let ow = open_window_ix(&env, 1, Some(window));
    let s = send(&mut env.svm, &env.ids, &payer, &[], vec![ow])?;
    let i = get(stats, "open_window (with prev)");
    stats[i].push(s.ladle_cu[0]);
    let cw = ix(
        &env.ids,
        "close_window",
        vec![r(env.market), w(window), w(payer.pubkey()), r(env.qmint), w(escrow), w(env.qvault), r(env.ids.token)],
        &[],
    );
    let s = send(&mut env.svm, &env.ids, &payer, &[], vec![cw])?;
    let i = get(stats, "close_window");
    stats[i].push(s.ladle_cu[0]);
    if env.svm.get_account(&window).map(|a| a.lamports).unwrap_or(0) != 0 {
        return Err("window not closed".into());
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
    send(&mut env.svm, &env.ids, &payer, &[], vec![ow])?;
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let so = PathBuf::from(args.get(1).cloned().unwrap_or_else(|| "../../target/deploy/ladle.so".into()));
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
