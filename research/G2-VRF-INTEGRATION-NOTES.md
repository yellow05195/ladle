# G2 — VRF integration notes for PULLED (recommended provider: ORAO VRF, classic flow)

Written 2026-10-23. Everything below was taken from the ORAO SDK source / IDL (github.com/orao-network/solana-vrf, docs.rs/orao-solana-vrf 0.7.0) and from live mainnet/devnet RPC reads done the same day (see `research/data/`). Where a fact was not verifiable from source it is marked **VERIFY**.

Switchboard On-Demand randomness is **not** an option any more: Switchboard announced on 2026-09-19 that "all implementations are deprecated effective immediately" with support ending 2026-09-25, and the on-chain program's latest mainnet activity (2026-10-15) consists only of `RandomnessClose` / `RandomnessCloseLut` rent-reclaim instructions (see `research/data/sb-recent-activity.json`). Details in `G2.md`.

---

## 1. Crate, versions, feature flags

```toml
# programs/pulled/Cargo.toml
[dependencies]
anchor-lang = { version = "0.32.1", features = ["init-if-needed"] }   # ORAO workspace pins 0.32.1
orao-solana-vrf = { version = "0.7.0", default-features = false, features = ["cpi"] }
```

- Crate name: `orao-solana-vrf` (docs.rs shows 0.7.0, published 2026-09-13). `default = ["sdk"]` pulls `anchor-client`, `tokio`, `ed25519-dalek` etc. — **must** disable default features and enable `cpi` for an on-chain program (docs.rs: "requires `cpi` feature to be enabled and `sdk` feature to be disabled").
- Features in the crate: `sdk = ["anchor-client", "ed25519-dalek", "no-entrypoint", "solana-rpc-client", "solana-rpc-client-api", "thiserror", "tokio"]`, `cpi = ["no-entrypoint"]`.
- The on-chain IDL (`js/src/types/orao_vrf.json`) reports program version `0.6.1`.
- The on-chain program source is **not** published (repo tree has only `rust/sdk`, examples, `callback/`, `js/`). Handler bodies in the SDK are stubs. Behaviour below is inferred from the IDL, the error enum, the SDK builders and mainnet history.
- Workspace deps for the off-chain side (keeper): `anchor-client 0.32.1`, `solana-rpc-client 2.3`, `ed25519-dalek 1.0.1`, `rand 0.8`. JS: `@orao-network/solana-vrf` (npm).

## 2. Program ids and fixed accounts

| Item | Mainnet | Devnet |
|---|---|---|
| ORAO VRF program (classic) | `VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y` | same id |
| ORAO Callback VRF program (not used here) | `VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU` | same id |
| Network state PDA `[b"orao-vrf-network-configuration"]` | `5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK` | `5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK` (same seeds, same program id) |
| `network_state.config.treasury` (read 2026-10-23) | `9ZTHWWZDpB36UFe1vszf2KEpt83vwi27jDqtHQ7NSXyR` | `9ZTHWWZDpB36UFe1vszf2KEpt83vwi27jDqtHQ7NSXyR` |
| `network_state.config.request_fee` | **500,000 lamports (0.0005 SOL)** | 300,000 lamports |
| `fulfillment_authorities` | 3: `9ZTHWWZDpB36UFe1vszf2KEpt83vwi27jDqtHQ7NSXyR`, `2VYNr8yMma4KkJLFNiipUxQYbg1fsyao2H6YQfZ1H2Xi`, `A9iZdgYabRLeAFEwss72eQr8wWQfZ6hLRmDLtWyxKvKj` | 4 (the 3 above + `HSCqQaDHGNc2kdPD2NTUKi3S953WZEJCnbrF4RHoxGjz`) |
| quorum = `majority(n) = n*2/3 + 1` | 3 of 3 (**all** nodes must answer) | 3 of 4 |
| `token_fee_config` | `None` (SPL-token fee path disabled) | `None` |
| `num_received` (lifetime requests) | 125,192 | 266,693 |
| Program upgrade authority | `9ZTHWWZDpB36UFe1vszf2KEpt83vwi27jDqtHQ7NSXyR` (same key as config authority / treasury / fulfiller #1) | `2V28D3jzn7XEuKSqVVzDyXB3YMg8mfWE9QVvvkNvxEWw` |

Raw decodes: `research/data/orao-network-state-mainnet.json`, `research/data/program-meta.json`.

**Do not hardcode the treasury or the fee.** Pass `treasury` as an account and constrain it to `network_state.config.treasury` (the ORAO program itself fails with `UnknownTreasuryGiven` (6009) otherwise). Read `request_fee` from `network_state` when computing how much the vault must hold.

Seeds / constants exported by the crate:

```rust
pub const CONFIG_ACCOUNT_SEED: &[u8] = b"orao-vrf-network-configuration";
pub const RANDOMNESS_ACCOUNT_SEED: &[u8] = b"orao-vrf-randomness-request";
pub const MAX_FULFILLMENT_AUTHORITIES_COUNT: usize = 10;
pub fn network_state_account_address(vrf_id: &Pubkey) -> Pubkey;
pub fn randomness_account_address(vrf_id: &Pubkey, seed: &[u8; 32]) -> Pubkey;
pub const fn majority(total: usize) -> usize { total * 2 / 3 + 1 }
pub const fn quorum(count: usize, total: usize) -> bool { count >= majority(total) }
pub fn xor_array<const N: usize>(l: &mut [u8; N], r: &[u8; N]);
```

Anchor discriminators (sha256 of `account:Name` / `global:name`, first 8 bytes), useful for test fixtures and log parsing:

| Name | bytes | hex |
|---|---|---|
| `account:RandomnessV2` | `[139,239,184,215,227,86,191,226]` | `8befb8d7e356bfe2` |
| `account:Randomness` (legacy V1) | `[188,96,216,248,93,94,49,112]` | `bc60d8f85d5e3170` |
| `account:NetworkState` | `[212,237,148,56,97,245,51,169]` | `d4ed943861f533a9` |
| `global:request_v2` | `[38,151,209,6,195,102,28,217]` | `2697d106c3661cd9` |
| `global:fulfill_v2` | `[164,227,237,84,112,111,147,196]` | `a4e3ed54706f93c4` |

## 3. Instructions of the ORAO program (from the IDL)

### `request_v2(seed: [u8; 32])` — the only one PULLED calls (via CPI)

| # | account | writable | signer | notes |
|---|---|---|---|---|
| 0 | `payer` | yes | yes | pays `request_fee` (to treasury) + rent of the randomness account |
| 1 | `network_state` | yes | no | PDA `[CONFIG_ACCOUNT_SEED]`, program = ORAO |
| 2 | `treasury` | yes | no | must equal `network_state.config.treasury` |
| 3 | `request` | yes | no | PDA `[RANDOMNESS_ACCOUNT_SEED, &seed]`, program = ORAO; `init`, `space = 8 + RandomnessV2::PENDING_SIZE` |
| 4 | `system_program` | no | no | |

Optional remaining accounts (`token_payer`, `token_program`) only when paying in ORAO SPL token — disabled on mainnet (`token_fee_config = None`).

Errors you can hit: `ZeroSeed` (6000) "Randomness seed cannot be zero", `SeedAlreadyInUse` (6001) "Another account is using the provided seed, so randomness can be predicted" (the PDA already exists -> a seed can be used **once, ever**), `InsufficientFunds` (6002), `UnknownTreasuryGiven` (6009).

### `fulfill_v2()` — called by ORAO nodes, never by PULLED

| # | account | writable | signer |
|---|---|---|---|
| 0 | `payer` | yes | yes (the fulfilling node) |
| 1 | `instruction_acc` | no | no (`Sysvar1nstructions1111111111111111111111111`) |
| 2 | `network_state` | yes | no |
| 3 | `request` | yes | no (PDA `[RANDOMNESS_ACCOUNT_SEED, request.seed()]`) |
| 4 | `client` | yes | no (`constraint = *request.client() == client.key()`) |
| 5 | `system_program` | no | no |

The transaction must contain an **Ed25519 sig-verify instruction immediately before** `fulfill_v2`: `ed25519_instruction::new_ed25519_instruction(&fulfill_authority_keypair, &seed)` — i.e. the message signed is exactly the 32-byte seed, signer is one of `fulfillment_authorities`. The program checks the sysvar (`MissingEd25519SigVerifyInstruction` 6007, `InvalidFulfillMessage` 6006 "Signature does not match the seed", `UnauthorizedFulfillmentAuthority` 6005, `RandomnessVerificationFailed` 6003), appends a `RandomnessResponse { pubkey, randomness: [u8;64] }` (the 64-byte Ed25519 signature) and, once `quorum(responses.len(), fulfillment_authorities.len())`, XORs the responses into the final `randomness: [u8; 64]` (`RandomnessCombinationFailed` 6008), converting the account to `RequestAccount::Fulfilled` (orao.network/solana-vrf: "ORAO VRF Program checks signatures and XORs the randomness given by authoritative nodes"). **VERIFY (closed source):** whether realloc to `FULFILLED_SIZE` + rent refund to `client` happens at that point — the presence of `client (mut)` + `system_program` in `fulfill_v2` and the Callback-VRF README ("extra rent from a pending request is returned ... on fulfillment") strongly suggest it. The `client` recorded in `PendingRequest.client` is the `payer` of `request_v2` **VERIFY** (no other candidate account exists in the ix).

Events emitted (Anchor events, useful for the keeper's WS listener): `Request { seed, client, paid_with_spl }`, `Response { seed, authority, randomness }` (one per node), `Fulfill { seed, randomness }`.

## 4. Randomness account layout (`orao_solana_vrf::state`)

```rust
#[account] pub struct RandomnessV2 { pub request: RequestAccount }

pub enum RequestAccount {                 // borsh enum tag: 1 byte
    Pending(PendingRequest),              // tag 0
    Fulfilled(FulfilledRequest),          // tag 1
}
pub struct PendingRequest {
    pub client: Pubkey,                   // 32
    pub seed: [u8; 32],                   // 32
    pub responses: Vec<RandomnessResponse>, // 4 + n * 96
}
pub struct RandomnessResponse { pub pubkey: Pubkey, pub randomness: [u8; 64] } // 96
pub struct FulfilledRequest {
    pub client: Pubkey,                   // 32
    pub seed: [u8; 32],                   // 32
    pub randomness: [u8; 64],             // 64  <- the value you consume
}
impl RandomnessV2 {
    pub const PENDING_SIZE: usize   = 1 + 32 + 32 + 4 + 96 * majority(10) /* 7 */ = 741;
    pub const FULFILLED_SIZE: usize = 1 + 32 + 32 + 64 = 129;
    pub const fn fulfilled(&self) -> Option<&FulfilledRequest>;
    pub const fn seed(&self) -> &[u8; 32];
    pub const fn client(&self) -> &Pubkey;
}

// Version-agnostic wrapper — this is what you deserialize in the consumer program:
pub enum RandomnessAccountData { V1(Randomness), V2(RandomnessV2) }
impl RandomnessAccountData {
    pub const fn seed(&self) -> &[u8; 32];
    pub const fn client(&self) -> Option<&Pubkey>;        // None for V1
    pub fn responses(&self) -> Option<&[RandomnessResponse]>; // None for fulfilled V2
    pub const fn fulfilled_randomness(&self) -> Option<&[u8; 64]>; // None while pending
    pub const fn version(&self) -> RandomnessAccountVersion;
}
impl AccountDeserialize for RandomnessAccountData { /* matches 8-byte discriminator: Randomness::DISCRIMINATOR -> V1, RandomnessV2::DISCRIMINATOR -> V2 */ }
```

Byte layout of a **fulfilled V2** account (137 bytes): `8befb8d7e356bfe2` | `01` | client(32) | seed(32) | randomness(64).
Byte layout of a **pending V2** account right after request (749 bytes): `8befb8d7e356bfe2` | `00` | client(32) | seed(32) | `00000000` (empty vec) | zero padding.

Rent (mainnet, 2026-10-23, `getMinimumBalanceForRentExemption`): 749 bytes -> **4,455,160 lamports**; 137 bytes -> 1,346,200 lamports (`research/data/rent-and-sizes.json`).

How to read it from an `AccountInfo` (pattern from ORAO's own CPI example `rust/examples/cpi/programs/russian-roulette/src/misc.rs`, hardened):

```rust
use anchor_lang::prelude::*;
use orao_solana_vrf::state::RandomnessAccountData;
use orao_solana_vrf::{RANDOMNESS_ACCOUNT_SEED, ID as ORAO_VRF_ID};

pub fn read_fulfilled(acc: &AccountInfo, expected_seed: &[u8; 32]) -> Result<Option<[u8; 64]>> {
    // 1. the account must be the PDA for OUR seed under the ORAO program and owned by it
    let (expected, _) = Pubkey::find_program_address(&[RANDOMNESS_ACCOUNT_SEED, expected_seed], &ORAO_VRF_ID);
    require_keys_eq!(*acc.key, expected, PulledError::WrongRandomnessAccount);
    require_keys_eq!(*acc.owner, ORAO_VRF_ID, PulledError::WrongRandomnessOwner);
    if acc.data_is_empty() { return Ok(None); } // request never landed / account closed
    let data = RandomnessAccountData::try_deserialize(&mut &acc.data.borrow()[..])?;
    require!(data.seed() == expected_seed, PulledError::WrongRandomnessSeed);
    Ok(data.fulfilled_randomness().copied())
}
```

Consume the 64 bytes as a seed, never raw: e.g. `let r = u64::from_le_bytes(randomness[0..8].try_into().unwrap())` (ORAO example), or better hash the whole 64 bytes together with a domain tag before taking modulo (`winner_index = u128 % n` to keep modulo bias negligible).

## 5. CPI call from the Anchor program

```rust
use anchor_lang::prelude::*;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;
use orao_solana_vrf::{CONFIG_ACCOUNT_SEED, RANDOMNESS_ACCOUNT_SEED};

#[derive(Accounts)]
pub struct SealAndRequest<'info> {
    /// anyone (keeper); only pays the tx fee
    pub caller: Signer<'info>,

    #[account(mut, seeds = [b"window", window.id.to_le_bytes().as_ref()], bump = window.bump)]
    pub window: Account<'info, Window>,

    /// vault PDA that holds entry lamports; pays ORAO fee + rent via CPI signer seeds
    #[account(mut, seeds = [b"vault", window.key().as_ref()], bump = window.vault_bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: ORAO randomness PDA, created by the CPI. Seed is derived on-chain, see §6.
    #[account(mut, seeds = [RANDOMNESS_ACCOUNT_SEED, &window.vrf_seed_preview()?], bump,
              seeds::program = orao_solana_vrf::ID)]
    pub random: AccountInfo<'info>,

    /// CHECK: constrained against config at runtime
    #[account(mut, constraint = treasury.key() == config.config.treasury @ PulledError::BadTreasury)]
    pub treasury: AccountInfo<'info>,

    #[account(mut, seeds = [CONFIG_ACCOUNT_SEED], bump, seeds::program = orao_solana_vrf::ID)]
    pub config: Account<'info, NetworkState>,

    pub vrf: Program<'info, OraoVrf>,
    pub system_program: Program<'info, System>,
}

pub fn seal_and_request(ctx: Context<SealAndRequest>) -> Result<()> {
    let clock = Clock::get()?;
    let w = &mut ctx.accounts.window;
    require!(w.state == WindowState::Open, PulledError::BadState);
    require!(clock.slot > w.close_slot, PulledError::WindowStillOpen);   // strictly AFTER close
    let seed = w.derive_vrf_seed();                                       // §6 — deterministic, fixed at seal
    require!(seed != [0u8; 32], PulledError::ZeroSeed);

    let fee = ctx.accounts.config.config.request_fee;
    let rent = Rent::get()?.minimum_balance(8 + orao_solana_vrf::state::RandomnessV2::PENDING_SIZE);
    require!(ctx.accounts.vault.lamports() >= fee + rent + w.reserved_for_refunds(), PulledError::VaultTooLow);

    let window_key = w.key();
    let signer: &[&[u8]] = &[b"vault", window_key.as_ref(), &[w.vault_bump]];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.vrf.to_account_info(),
        orao_solana_vrf::cpi::accounts::RequestV2 {
            payer: ctx.accounts.vault.to_account_info(),       // PDA pays: keeper has no stake in the request
            network_state: ctx.accounts.config.to_account_info(),
            treasury: ctx.accounts.treasury.to_account_info(),
            request: ctx.accounts.random.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
        &[signer],
    );
    orao_solana_vrf::cpi::request_v2(cpi, seed)?;

    w.vrf_seed = seed;
    w.vrf_request = ctx.accounts.random.key();
    w.requested_at_slot = clock.slot;
    w.state = WindowState::Sealed;
    Ok(())
}
```

Notes:
- `payer` must be a signer: a PDA works through `CpiContext::new_with_signer` (Anchor example uses the player wallet instead). The rent refund on fulfillment (if present, **VERIFY**) then flows back to the same PDA (`client`).
- Compute: the `request_v2` CPI is cheap (one `init` + two transfers); budget ~30k CU for the CPI plus your own logic. Transaction size: ~7 accounts + 32-byte seed, far below 1232 bytes.
- The request is **idempotent-safe**: a second `seal_and_request` on the same window fails at `SeedAlreadyInUse` (the PDA exists) and at our `state == Open` check.

## 6. Seed derivation (binding the request so nobody can pick, abort or predict)

```rust
impl Window {
    pub fn derive_vrf_seed(&self) -> [u8; 32] {
        // all inputs are frozen when the window closes; none is chosen at seal time by the caller
        anchor_lang::solana_program::hash::hashv(&[
            b"pulled:vrf:v1",
            self.key().as_ref(),                 // window PDA (unique per window)
            &self.close_slot.to_le_bytes(),
            &self.entries_count.to_le_bytes(),
            &self.entries_commitment,            // running sha256 over (entry_pubkey, lamports, slot) updated on every `enter`
        ]).to_bytes()
    }
}
```

Why these inputs:
- **Uniqueness**: the window PDA makes the seed unique -> `SeedAlreadyInUse` can never collide across windows; ORAO explicitly treats seed reuse as a predictability bug.
- **No choice for the keeper**: the seed is a pure function of on-chain state; `seal_and_request` takes no seed argument, so grinding seeds or picking among several randomness accounts is impossible.
- **Unpredictable to ORAO before close**: `entries_commitment` is only fixed when the last entry lands. ORAO's output is `XOR_i Ed25519_sign(sk_i, seed)` — deterministic given the seed and the 3 node keys (RFC 8032 signatures are deterministic). With a PDA-only seed, the operator could compute the outcome of a window *before it even opened* and enter it; with the commitment in the seed it can only compute the outcome after the last entry, i.e. after the window is already sealed from the participants' point of view (entries after `close_slot` are rejected).
- Participants influence `entries_commitment` but cannot evaluate the signatures without the node private keys, so grinding entries buys nothing unless they collude with **all three** ORAO nodes (quorum = 3 of 3 on mainnet).

## 7. Settle and refund paths (the free-option killers)

```rust
// anyone may call; no authority
pub fn settle(ctx: Context<Settle>) -> Result<()> {
    let w = &mut ctx.accounts.window;
    require!(w.state == WindowState::Sealed, PulledError::BadState);
    require_keys_eq!(ctx.accounts.random.key(), w.vrf_request);
    let r = read_fulfilled(&ctx.accounts.random, &w.vrf_seed)?.ok_or(PulledError::NotFulfilledYet)?;
    let h = hashv(&[b"pulled:draw:v1", &r, w.key().as_ref()]).to_bytes();
    let idx = (u128::from_le_bytes(h[0..16].try_into().unwrap()) % w.entries_count as u128) as u32;
    w.winner_index = idx; w.state = WindowState::Settled;
    Ok(())
}

// anyone may call; no authority; ONLY opens on timeout AND only while unfulfilled
pub fn refund_window(ctx: Context<RefundWindow>) -> Result<()> {
    let clock = Clock::get()?;
    let w = &mut ctx.accounts.window;
    require!(w.state == WindowState::Sealed, PulledError::BadState);
    require!(clock.slot > w.requested_at_slot + w.vrf_timeout_slots, PulledError::TimeoutNotReached);
    require_keys_eq!(ctx.accounts.random.key(), w.vrf_request);
    require!(read_fulfilled(&ctx.accounts.random, &w.vrf_seed)?.is_none(), PulledError::AlreadyFulfilledUseSettle);
    w.state = WindowState::Refunding;  // then `refund_entry(i)` per entry, or batch; each returns exactly entry.lamports
    Ok(())
}
```

Invariants that make the four bias tests pass:
1. Request happens strictly after `close_slot`; entries after `close_slot` are rejected -> no participant action can depend on the value.
2. Seed is derived, not supplied -> keeper/creator cannot choose it.
3. Only ORAO nodes can produce the value and they write it directly on-chain in `fulfill_v2`; PULLED never submits a value -> no PULLED actor sees the value before it is public.
4. `settle` is permissionless and `refund_window` requires `fulfilled_randomness().is_none()` -> once the value is on-chain, refund is impossible; before it is on-chain nobody knows it, so an early refund race carries no information.
5. Refund is pure accounting (`entry.lamports` back to `entry.owner`, vault closes to 0 after the ORAO rent refund) -> nobody profits from forcing a refund except by denying the game.

The only party with an abort option is ORAO itself (withhold fulfillment after computing the value). That is the residual trust assumption of a proof-of-authority VRF; it is bounded by the timeout/refund path (they can void rounds, not pick winners) and is observable (unfulfilled requests are public).

## 8. Keeper (off-chain) duties

1. Watch windows with `state == Open && slot > close_slot`; send `seal_and_request`.
2. Wait for fulfillment: subscribe to ORAO `Fulfill` events / `accountSubscribe` on `w.vrf_request`; the SDK's `wait_fulfilled` does exactly this ("it will use WS subscription to wait for the `events::Fulfill` event"). Measured mainnet latency is in `G2.md` (median/p90/p99 from `research/data/orao-pairs.csv`).
3. Send `settle` as soon as `fulfilled_randomness().is_some()`.
4. If `slot > requested_at_slot + vrf_timeout_slots` and still pending: send `refund_window` then `refund_entry` for each entry.
5. The keeper never holds randomness-related keys; losing the keeper only delays settle/refund — anyone else can call both.

## 9. Local testing without ORAO nodes

The ORAO program is closed source, so there is nothing to build locally. Two workable set-ups:

**A. `solana-test-validator` with cloned mainnet accounts** (on a machine with the Solana CLI):
```
solana-test-validator --url https://api.mainnet-beta.solana.com \
  --clone VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y \
  --clone 91JpgS1vZUPczygkLgNQQL7tzAWUvc7M7HHVEzi8LoPV   # its programdata account \
  --clone 5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK   # network state (fee, treasury, authorities)
```
`request_v2` then works for real (fee goes to the cloned treasury key) and **nobody fulfills** -> ideal for the timeout/refund test (`warp` the clock past `requested_at_slot + vrf_timeout_slots`, call `refund_window` with a random wallet, assert every entry got exactly its lamports back and the vault is empty).

**B. LiteSVM / Bankrun (`set_account`) for the fulfilled path**: after the request, overwrite the randomness PDA with a *fulfilled* V2 image (owner = ORAO program id, 137 bytes):
```
8befb8d7e356bfe2 | 01 | client(32) | seed(32) | randomness(64, chosen by the test)
```
Then call `settle` and assert the winner equals the value computed off-chain from the same 64 bytes. Also assert `refund_window` now fails with `AlreadyFulfilledUseSettle`. For the "fulfill arrives late" test, keep the account pending (tag `00`, empty vec) until after the timeout, call `refund_window`, then write the fulfilled image and assert `settle` fails with `BadState`.

**C. Devnet end-to-end**: ORAO fulfils on devnet (4 nodes, 3 needed, fee 0.0003 SOL). Use it for one real latency smoke test before mainnet.

## 10. Alternative kept in reserve: ORAO Callback VRF (`VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU`)

Fulfilment CPIs back into the client program (no keeper needed for `settle`), but: registration requires the **program upgrade authority** to sign `Register`, a funded Client PDA pays fees, callbacks have a slot deadline after which "the randomness request will be fulfilled, but the callback will be ignored", the callback "should never fail", and the VRF caps CU at 1.4M. It does not change the trust model (same 3 nodes). Consider it only if keeper liveness becomes the bottleneck; the classic flow above is simpler to reason about for the bias tests.
