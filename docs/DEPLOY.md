# Deploying Ladle

Program id (both clusters): `85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj`
(keypair `target/deploy/ladle-keypair.json`, keep a backup of it outside the repo).

## Toolchain on this Windows machine

The Solana CLI is installed but not on `PATH`; prepend it in each shell:

```
$env:PATH="$env:USERPROFILE\.local\share\solana\solana-release\bin;$env:PATH"
```

* Build: see **Build** below (`cargo build-sbf --tools-version v1.57 --arch v3`, with the cluster's
  `LADLE_TREASURY`) -> `target/deploy/ladle.so`
  (`anchor build` tries to install a pinned Solana release with admin rights; not needed).
  The release profile (root `Cargo.toml`) optimises for size (`opt-level = "z"`, one codegen unit,
  overflow checks kept): the `.so` size is the deploy rent. The `lto = "fat"` line has no effect:
  the crate is also built as an rlib (`crate-type = ["cdylib", "lib"]`, cargo-build-sbf warns), and a
  cdylib-only build with LTO fails to link with platform-tools v1.57 (measured 2026-10-28).
* Host tests: `cargo test` (26, incl. whole windows of 1, 2, 50, 100, 500 and 2048 entries through
  the paged tally/settle arithmetic), `cargo clippy --lib`.
* Compute units and an end-to-end run of the built `.so` (LiteSVM, mainnet feature set):
  `pnpm bench:cu` (= `cargo run --release --manifest-path tests/cu-bench/Cargo.toml -- target/deploy/ladle.so owner 1,2,50,100,500,2048 20,28`;
  its own workspace, first build ~5 min; the account lists are the current program's, an older `.so`
  needs the harness of its commit). For every size it runs open_window, N enters, seal,
  fulfill (ORAO's fulfilled account written directly), tally/settle pages, open_window of the next
  round and close_window of this one while every entry is still open, then sell_back (whole, or in
  two halves bound by their quote) and close_entry for every entry against the closed window, and
  checks sum(shares) == tokens_out, the fee split at the lamport, the rents returned, every token and
  quote unit after the exits, and the refusals (a sale before the last settle page, another market's
  vault, a stranger, a sale with nothing left, close_entry with tokens left or paying anyone but the
  owner, enter into a closed window). It also replays 50 enters built from one snapshot of the
  window, runs a refunded window end to end, and the slippage bound (`min_quote_out`). Then
  `pnpm bench:wind-down` builds the wind-down `.so` into `target/wind-down/` and runs the shutdown
  suite (rounds on the normal build, the program swapped for the wind-down build, the notice, every
  forced exit checked to the lamport, the market closed, nothing left).
  It pays the treasury in `LADLE_TREASURY` (the devnet key when unset): run it with the same value as
  the build, a different key fails the final tally page (`PlatformAccountMismatch`).
* IDL: `cargo test __anchor_private_print_idl --features idl-build -- --show-output --quiet --test-threads=1 > idl-raw.txt`
  with `ANCHOR_IDL_BUILD_PROGRAM_PATH=<programs/ladle>` and `ANCHOR_IDL_BUILD_SKIP_LINT=TRUE`, then
  `pnpm idl:assemble idl-raw.txt target/idl/ladle.json`.
* Offline gates: `pnpm test:all` (forbidden words, 10,000-window property test, authority check on
  source + IDL, IDL/SDK consistency, SDK codec and transaction sizes, indexer, chat).
* A local validator does not start here (`solana-test-validator` needs the Windows symlink privilege:
  Developer Mode or an elevated shell). Devnet is the integration cluster.

## Build

The platform treasury is compiled in: `PLATFORM_TREASURY` (`programs/ladle/src/consts.rs`) is the
`LADLE_TREASURY` environment variable of the build (base58), the devnet deployer
`A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat` when it is unset. It is decoded at compile time: a
malformed key (or the all-zero key) fails the build, and cargo rebuilds when the variable changes.

```
$env:PATH="$env:USERPROFILE\.local\share\solana\solana-release\bin;$env:PATH"
cd programs/ladle

# devnet (default treasury)
Remove-Item Env:LADLE_TREASURY -ErrorAction SilentlyContinue
cargo build-sbf --tools-version v1.57 --arch v3

# mainnet-beta: the owner's treasury (public key only; a multisig vault PDA works too)
$env:LADLE_TREASURY="<mainnet treasury pubkey>"
cargo build-sbf --tools-version v1.57 --arch v3
```

Check a build before deploying it: `$env:LADLE_TREASURY="<same key>"; pnpm bench:cu` from the
repository root runs every instruction of that `.so` and pays its treasury (a mismatch fails at the
final tally page). The clients take the same key as configuration, not code: `resolveTreasury(cluster,
process.env.LADLE_TREASURY)` from `@pulled/sdk` (it refuses to fall back to the devnet key on
mainnet-beta) passed as `new PulledClient({ connection, programId, treasury })`, and
`createMarketIx({ ..., platformTreasury })`. A client with another key cannot misdirect anything:
`create_market` and the final `tally_page` check the treasury on chain and fail.

**SBPF version.** `--arch v3` is cargo-build-sbf 4.4's default, written out so a later default cannot
change the deployed bytecode silently; the `.so` has ELF `e_flags = 3`. Both clusters accept v3
(`solana feature status -um` / `-ud`, read 2026-10-28, mainnet epoch 1070):

| feature | mainnet-beta | devnet |
|---|---|---|
| SIMD-0166 deploy + execute SBPFv1 (`JE86Wk…`) | active since epoch 809 | active since epoch 902 |
| SIMD-0173/0174 deploy + execute SBPFv2 (`F6UVKh…`) | active since epoch 825 | active since epoch 918 |
| SIMD-0178/0189/0377 deploy + execute SBPFv3 (`5cC3fo…`) | active since epoch 993 | active since epoch 1069 |
| SIMD-0500 disable deploying v0-v2 (`B8JJXC…`) | inactive | inactive |

No other arch is needed; v3 stays deployable once SIMD-0500 retires v0-v2.

**Round length** is `window_slots`, set per market at creation and immutable, within
`[MIN_WINDOW_SLOTS, MAX_WINDOW_SLOTS]` = [25, 600] (`consts.rs`); `vrf_timeout_slots` must be
>= 150 and > `window_slots`. Nothing else in the program depends on it. Slots are counted, not
seconds: `getRecentPerformanceSamples` on 2026-10-28 gave 211.6 ms per slot on mainnet-beta and
239.9 ms on devnet, so 300 slots is ~63 s on mainnet (~72 s on devnet) and a 2-minute round is
~560 slots, inside the cap but close to it (600 slots = ~127 s today, less if slots get faster).

## What deploying costs

Rent is what the cluster asks for the bytes (`solana rent <bytes>`, 2026-10-27, identical on devnet
and mainnet-beta: 5,080 lamports per byte including the 128-byte account overhead). The program
data account holds the `.so` plus a 45-byte header; `solana program deploy` first writes the `.so`
into a buffer account of the same size. The deploy instruction then moves the buffer's lamports to
the payer and pays the program data rent out of them in the same instruction
(`solana-bpf-loader-program` 4.3.2, `DeployWithMaxDataLen`): the buffer is paid once and becomes
the program data rent, so the deployer never holds both (the scripts asked for both until the
2026-10-28 review). `--max-len` defaults to the `.so` length (no headroom paid); an upgrade with a
larger `.so` extends the account and pays only the difference.

| | v21 | v22 | v23 (first review) | v24 (second review) | v25 (now: shutdown, third and final reviews) |
|---|---|---|---|---|---|
| `target/deploy/ladle.so` | 397,832 B | 393,128 B | 396,240 B | 395,456 B | **387,040 B** (-2.1 % on v24) |
| program data rent (kept while deployed) | 2.02186540 SOL | 1.99796908 SOL | 2.01377804 SOL | 2.00979532 SOL | **1.96704204 SOL** |
| program account (36 B) | 0.00083312 SOL | 0.00083312 SOL | 0.00083312 SOL | 0.00083312 SOL | 0.00083312 SOL |
| buffer during the writes (becomes the program data rent) | 2.02182476 SOL | 1.99792844 SOL | 2.01373740 SOL | 2.00975468 SOL | 1.96700140 SOL |
| write transactions (~1 KB each, 5,000 lamports) | ~394 tx, ~0.0020 SOL | ~389 tx, ~0.0019 SOL | ~392 tx, ~0.0020 SOL | ~396 tx, ~0.0020 SOL | ~388 tx, ~0.0019 SOL |
| **cost of the deploy = the most the deployer holds out** | **~2.025 SOL** | **~2.001 SOL** | **~2.017 SOL** | **~2.013 SOL** | **~1.970 SOL** |

(`solana rent 387085` and `387077` = the `.so` plus the 45-byte program data / 37-byte buffer
headers, identical on devnet and mainnet-beta on 2026-10-29.) The program stays upgradeable, and
its rent comes back when the owner stops the game: `scripts/mainnet-shutdown.ps1` deploys the
wind-down build (341,864 B, which fits the normal build's data account), each market's 7-day notice
runs, then the keeper's `--shutdown` pays every entry left out to its owner (`force_exit`) and
closes every round and market, and `solana program close <program id>` returns 1.96787516 SOL
(**Shutdown** below). What players forget does not keep it locked.

v24 -> v25 (-8,416 B) is the shutdown and the third and final reviews. The final review
(2026-10-29, -816 B) makes wSOL the only quote mint `create_market` accepts (`QuoteMintNotWsol`)
and drops the token-account payout of `force_exit` and the `creator_quote` account of
`close_market`: a player could hand their own token account to someone else for good and make
their entry unpayable, or have the drain pay one account rent per wallet; and a round whose
integration host has no quote account settles anyway, the host fee kept in its buy (a host
could stop its market's settlement queue by closing that account). The third review's
part: `claim` is gone (LADLE never leaves
the vault to a wallet, so every player's value stays where `force_exit` reaches it; -7.6 KB on its
own), `sell_back` and `sell` take a `min_quote_out` (SlippageExceeded), `Window` gained 64
reserved bytes (507 B), `Market` carved `notice_start`, `live_windows` and `counts_windows` out
of its reserve (still 626 B), and the three shutdown instructions exist only in the wind-down build
(`#[cfg(feature = "wind-down")]`), which in turn leaves out `create_integration`,
`create_market`, `open_window` and `enter`.

v23 -> v24 (-784 B) is the second review: Token-2022 quote mints refused as a whole (the extension
parsing went, which more than pays for the rest), `open_window` refuses a ninth round waiting to
settle (`MAX_WINDOWS_IN_FLIGHT`), `request_vrf` caps what ORAO may take from its payer (0.01 SOL),
`create_market` bounds the VRF timeout (9,000 slots), `refund_entry` pays only the owner's
associated token account, `close_window` closes a finished active window (the last round's rent),
`Market` gained 64 reserved bytes (626 B: room for a field a later upgrade adds; a 562-byte market
of the build before still reads), and the `wind-down` feature (a separate build, see **Before
mainnet**; it compiles away in the normal one).

v22 -> v23 (+3,112 B) is the 2026-10-28 review: `open_window` accepts an escrow someone created
first (`init_if_needed`), `request_vrf` salts the seal seed, the Window records who paid ORAO
(+32 B per Window, 443 B) and the bounty follows it, and `enter` refuses stakes below
`MIN_ENTRY_AMOUNT` (0.1 SOL). Safety over bytes: the program stays upgradeable and its rent is
recoverable, so no fix was trimmed for size.

v21 -> v22 (-4,704 B) is the rent lock-up fix below: `claim`, `sell_back` and `close_entry` lost
their Window account and its checks. Trims tried and dropped: anchor-spl without default features
does not compile (Anchor's `mint::` init code calls the `token_2022_extensions` helpers); the
default panic handler already logs through syscalls only (a no-op one would save a few hundred
bytes and lose the panic location); unused code is already dropped by the linker; every instruction
is called by the SDK, the keeper or a product path (`create_integration`: host fees; `sell`: tokens
held in a wallet). (`claim` was removed in v25: see above.)

Where the 137,544 bytes of v20 -> v21 went: `opt-level = "z"` instead of the default 3 (-124,888 B; "s" gave
-87,960 B), the v21 program changes themselves (-1,384 B), `require!` instead of `require_eq!`/`require_keys_eq!` (which format both values into
the error log, -5,608 B), Anchor's `no-log-ix-name` feature (the "Instruction: X" log line, -1,304 B;
explorers name instructions from the IDL), and no `#[msg]` strings on the errors (-4,360 B; the
logs still carry `Error Code: <Name>`, the sentences live in `sdk/src/errors.ts`
`PULLED_ERROR_MESSAGES`). What remains is mostly Anchor's per-instruction account validation.
Publishing the IDL on chain (`anchor idl init`) is optional and not needed by the SDK, which is
written against the Rust layouts.

Market creation (once per token): 0.05 SOL creation fee to the treasury + 0.01197356 SOL of rents
(market 626 B 0.00383032 SOL and its two vault accounts 0.00297688 SOL, back to the creator by
`close_market` at a shutdown; mint 0.0010668 SOL and Metaplex metadata 679 B 0.00409956 SOL, never:
neither can be closed) + Metaplex's 0.01 SOL metadata creation fee,
kept by Metaplex (seen on devnet 2026-10-28: a new metadata account holds its rent plus 10,000,000
lamports), 0.07207356 SOL with the transaction fee (`Get-MarketCostLamports` in `scripts/ladle-common.ps1`, the same sum in
`keeper/src/ops/create-market.ts`).

**What the scripts ask for** (`Get-DeployCostLamports` in `scripts/ladle-common.ps1`). The deploy
holds out at most program data + program account + the writes (`solana rent` on the 387,040-byte
`.so`: 1.96704204 + 0.00083312 SOL, plus ~398 write transactions priced at 20,000 micro-lamports
per unit, an upper bound: 0.003582 SOL); the market (0.07207356), the two fee accounts (0.00297688)
and the keeper float (0.5) are paid after it, so the deployer needs all of it + 0.01 SOL of margin:
**2.5565076 SOL on mainnet** (~2.5550 on devnet for a first deploy, writes at 1,000). About 0.01 SOL is left on
the deployer at the end (`solana transfer <wallet> ALL`). An interrupted deploy's buffer already
holds its share: a rerun asks only for the rest.

## Compute units (measured)

`tests/cu-bench` on the built `.so`, LiteSVM 0.18.1 with the mainnet feature set; CPIs included;
maximum over windows of 1 to 2048 entries. v20 = opt-level 3 on the same harness; v22 measured
2026-10-28 (pages 20/28 and 48/48).

| instruction | v20 | v21 | v22 (now) |
|---|---|---|---|
| `enter` | 38,255 | 47,705 | 59,895 (median 31,465: the Entry PDA's bump search costs 1,500 per extra try, so the maximum depends on the wallet) |
| `open_window` | 48,642 | 61,466 | 58,466 |
| `seal` | 10,044 | 17,157 | 17,157 |
| `fulfill` | 6,006 | 9,604 | 9,604 |
| `tally_page`, 20 entries / final page of 20 | 78,115 / 87,073 | 111,557 / 123,974 | 120,302 / 141,719 |
| `tally_page`, 48 entries | 163,571 | 229,409 | 250,278 |
| `settle_page`, 28 entries | 329,219 | 317,558 | 329,708 |
| `settle_page`, 48 entries | 556,093 | 528,738 | 549,556 |
| `sell_back` / `claim` | 18,750 / 15,207 | 29,901 / 24,818 | 25,548 / 20,463 |
| `close_entry` / `close_window` | 8,068 / 12,297 | 13,470 / 21,052 | 6,765 / 21,048 |
| `refund_window` / `refund_entry` | - | - | 17,136 / 29,159 |

v22: the pages read and write a 151-byte Entry instead of 110 (~430 units more per entry);
`claim`, `sell_back` and `close_entry` no longer load the Window.

v23 (2026-10-28, pages 20/28, `pnpm bench:cu`): `open_window` 49,245-61,441, and 89,745 when a
stranger pre-funded the window's address and created its escrow first (the keeper now asks
100,000); `seal` 17,328; `request_vrf` 21,708-24,708 against a stand-in for ORAO
(`tests/cu-bench/mock-orao`: ORAO's own work is not in the figure); `fulfill` 9,769; `tally_page`
20 entries / final page of 20: 120,388 / 134,447; `settle_page` 28 entries 310,030; `enter`
31,551-54,060; `sell_back` / `claim` 25,550 / 20,582; `close_entry` / `close_window` 6,765 / 21,170;
`refund_window` / `refund_entry` 17,307 / 29,330.

The size profile costs ~25-55 % more compute units per instruction; `settle_page` still got cheaper
because it now carries `floor(tokens_out * cum / S)` from one entry to the next (one 256-bit division
per entry instead of two, identical shares: `tests_pages.rs` checks both against each other). The
heaviest possible page (48 entries) uses 39 % of the 1.4M ceiling. `request_vrf` is measured
against a stand-in for ORAO only; with ORAO's real `request_v2` it runs under the default 200,000
units per instruction.

What the keeper requests (`sdk/src/budget.ts`, a `SetComputeUnitLimit` instruction in every page
transaction): `tally_page` 60,000 + 5,500 x entries (170,000 for 20), `settle_page`
60,000 + 12,000 x entries (396,000 for 28), and the sum of the parts for the combined transactions
below. Without it a `settle_page` above 16 entries exceeds the default 200,000 units and fails.

## A crowd in one round

* **Entering**: the Entry PDA is `["entry", window, owner]` (one entry per wallet per round; a second
  `enter` from the same wallet fails with `AlreadyEntered`). The index is assigned by the program
  in arrival order. Before v21 it was `["entry", window, index]`: every wallet built its transaction
  for `index = entry_count` as it last read it, so of 50 wallets clicking in the same slot one landed
  and 49 failed and had to be rebuilt, again and again (measured: 1/50 then 50/50 after). All enters
  of a round still write the Window and its escrow, so the leader runs them one after the other
  inside a slot; at ~48k units each, the 12M units a block allows per written account fit ~250
  enters per slot, ~23,000 per 92-slot round, far above the 2048-entry cap.
* **Settling**: `tally_page` / `settle_page` take the Entry accounts as remaining accounts, 32 bytes
  each in a 1232-byte transaction. The keeper sends 20 per `tally_page` and 28 per `settle_page`
  (the largest that fit a legacy transaction with a host integration and a compute-unit limit;
  `sdk/test/codec.test.ts` serialises the worst case and checks that one more does not fit). It finds
  the Entry addresses with `getProgramAccounts` filtered on the window, sorted by index; the program
  checks each entry's index and PDA, so a page can neither skip nor repeat one. Before v21 the
  keeper asked for pages of 48, which do not fit a transaction (1,888 bytes of addresses alone) and
  whose `settle_page` exceeded the default compute budget: no round above ~16 entries could settle.

## Per round: what the keeper pays

Mainnet, no priority fee: 5,000 lamports per transaction; ORAO 500,000 lamports fee + 1,346,200
lamports of request rent ORAO keeps (devnet fee 300,000); 3,108,960 more lamports of request rent are
locked until fulfilment and then refunded. Rents that come back are not counted: Window (507 B
since the third review) + escrow = 4,714,240 lamports from `open_window` to `close_window`, which a
Settled window passes as soon as the next window is open (v22: it no longer waits for every player
to sell back); each Entry (151 B, 1,417,320 lamports) is the player's, returned by `close_entry` in
their last sell-back transaction (or by `force_exit` at a shutdown).

| entries | before: transactions | before: lamports | after: transactions | after: lamports |
|---|---|---|---|---|
| 0 | open, seal, close_window (3) | 15,000 | seal + open next + close_window (1) | **5,000** |
| 1 | open, seal + request, fulfill, tally, settle, close (6) + ORAO | 1,876,200 | seal + tally + settle + open next (1), close_window batched by 6 | **~5,800** |
| 2-16 | 6 + ORAO | 1,876,200 | seal + request + open next, fulfill + tally + settle (2), close batched | **~1,857,000** |
| 17 | 7 + ORAO (two settle pages) | 1,881,200 | 2 + close batched | ~1,857,000 |
| 50 | could not settle (see above); with pages that fit: 11 + ORAO | 1,901,200 | 2 + 3 tally + 2 settle + close batched | **~1,882,000** |
| 500 | with pages that fit: 66 + ORAO | 2,176,200 | 2 + 25 + 18 + close batched | **~2,072,000** |
| 2048 | with pages that fit: 253 + ORAO | 3,111,200 | 2 + 103 + 74 + close batched | **~2,742,000** |

"Before" for 17+ entries assumes the pages v20 could actually send: 17 entries per `tally_page` (a
legacy transaction with its two ATA instructions) and 16 per `settle_page` (the default compute
budget).

What changed:

* **One entry needs no randomness.** A lone entry's weight is the whole weight sum (its share is the
  whole buy whatever its roll), so `seal` moves a one-entry window straight to `Drawn` with a zero
  seed: no ORAO request, no ORAO fee, no request rent, no refund path. A one-entry round now costs
  one transaction instead of ~0.00188 SOL. Same fee rules (1 % platform fee, host fee, keeper bounty).
* **Bundled transitions.** The next window opens in the transaction that seals the previous one; an
  empty window is sealed, replaced and closed (rent back) in one transaction; up to 17 entries,
  fulfill + tally + settle go in one transaction; `close_window` goes 6 per transaction.
* **Fee accounts once.** The platform / keeper / host quote accounts are created once per market
  (`PulledClient.feeAccountsInstructions`), not in every page.
* **Not reducible here:** the ORAO request (rent kept by ORAO, no close instruction) for every round
  with 2+ entries, and one signature per transaction.
* **A bundle that fails is split** (v23): the next attempt seals alone, then the next round opens and
  `request_vrf` goes on its own (two more signatures, only after a failure). A refused or used-up
  request never holds the seal back, and a Sealed round past its VRF timeout is refunded.

The keeper bounty is 10 % of the 1 % platform fee (0.1 % of the round's total), paid since v23 to
whoever paid ORAO for the round (`window.vrf_payer`, recorded by `request_vrf`): sending the final
page first earns nothing (with another account the bounty goes to the treasury). It covers the ORAO
cost of a round with 2+ entries above ~1.86 SOL of total, and a one-entry round above ~0.006 SOL. The
whole 1 % platform fee covers the ORAO cost from 0.186 SOL of total; the 0.1 SOL minimum stake
(`MIN_ENTRY_AMOUNT`) makes every round that asks ORAO (2 entries or more) at least 0.2 SOL, so dust
entries cannot make the operator pay for draws (`docs/RISKS.md`). The keeper's own float still pays
the ORAO cost and receives only the bounty: refill it from the treasury (low-balance alert), and
`KEEPER_VRF_PER_DAY` caps the requests per 24 h if wanted (no new round past it).

**Refunds** cost the keeper nothing beyond the transaction fee: it refunds an entry only when the
owner already has a quote token account (on a native SOL market the app closes the player's wSOL
account after each entry, so most do not). Creating that account would cost the keeper ~0.00149 SOL
of rent per entry, which the owner could take back by closing it: anyone could drain the keeper that
way. The other owners take their stake back from the site (`PulledClient.refund`: the stake and the
entry's rent come back as SOL, the owner pays ~0.00001 SOL of fees).

## Devnet

Steps 2 to 5 run in one go, each skipped when already done (docs/LAUNCH.md, step 1):
`powershell -ExecutionPolicy Bypass -File scripts/devnet-up.ps1 -Treasury <mainnet treasury>`. It
builds (see **Build**; pass the mainnet treasury to test the very binary mainnet will run), checks the
`.so` (program id, treasury, SBPF version accepted), computes the balance it needs with `solana rent`
and waits for it, deploys or upgrades when the bytes changed, and verifies the on-chain bytes.

1. Fund the deployer `A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat`
   (`~/.config/solana/pulled-devnet-deployer.json`) with the SOL the script prints (2.59779008 for a
   first deploy: program data and program account rent, the writes, the 0.07207356 SOL market, the
   fee accounts and the 0.5 SOL keeper float). **State on 2026-10-28 20:00 (read-only):** an earlier
   build (393,128 B) is deployed on devnet with a market (`G7smCKFEYBU6vv3V4DWXg3BGapNRN3yW8p8U5nkRBjXd`,
   46 rounds opened, its rounds 411 B), and the deployer holds 2.52759369 SOL. Upgrading to v24
   asks for 2.03369212 SOL on the deployer: a 2.00975468 SOL buffer (refunded at the end of the
   upgrade), 0.01182624 SOL to grow the program data by 2,328 B, the writes (at most 0.0021112) and
   the new market with the treasury's fee account (0.07356200); it keeps ~0.0875. v24 cannot run
   that market's rounds (the Window is 443 B): stop its keeper, then move
   `config/deployments/devnet.json` aside so the script creates a new market;
   `create-market.ts` refuses to reuse a market whose rounds have another layout.
2. Deploy: `solana program deploy target/deploy/ladle.so --program-id target/deploy/ladle-keypair.json
   --keypair <deployer> --upgrade-authority <deployer> --max-len <.so size> --use-rpc --url devnet`.
3. Create the market with explicit settings (native SOL quote, **560-slot rounds ≈ 2 min**, 900-slot VRF
   timeout, 20 % cap above a 0.5 SOL floor, 5 SOL max entry) and the treasury and keeper fee accounts:
   ```
   node --experimental-strip-types keeper/src/ops/create-market.ts --cluster devnet --rpc https://api.devnet.solana.com `
     --keypair $env:USERPROFILE\.config\solana\pulled-devnet-deployer.json --treasury <key of the build> --keeper <keeper address> `
     --window-slots 560 --vrf-timeout-slots 900 --max-entry-sol 5 --max-entry-bps 2000 --entry-floor-sol 0.5
   ```
   (`--plan` prints the settings, the measured round length and the cost, and sends nothing.) Writes
   `config/deployments/devnet.json`, with the treasury. (The old `tests/devnet/create-market.ts`, which
   made a 92-slot market without a treasury and recorded the `--rpc` URL given, is removed.)
4. Run the keeper (its own keypair, never `id.json`; the deployment file gives cluster, market and treasury):
   ```
   pnpm keeper --deployment config/deployments/devnet.json --keypair <keeper keypair> --health-port 8788
   ```
   The keeper reads entries with `getProgramAccounts`; the public devnet RPC serves it, a paid RPC is
   advised for crowds.
5. Point the app at it (`app/.env.local`, written by the script, which keeps the previous file once
   as `app/.env.local.before-devnet`; the variables are documented in `app/.env.example`):
   ```
   NEXT_PUBLIC_DATA_SOURCE=chain
   NEXT_PUBLIC_SOLANA_CLUSTER=devnet
   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
   NEXT_PUBLIC_RPC_WS_URL=
   NEXT_PUBLIC_LADLE_PROGRAM=85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj
   NEXT_PUBLIC_LADLE_MARKET=<market from config/deployments/devnet.json>
   ```
   The same plus `NEXT_PUBLIC_LADLE_CHAT_URL=wss://chat.useladle.fun` goes to
   `%USERPROFILE%\.config\ladle\vercel-preview.env` for a Vercel Preview deployment.
6. Integration suite against devnet (real ORAO): see `tests/anchor/README.md` (16 files, incl.
   `15-rent-recovery` and `16-crowd-50`).

## Rent: who pays, who gets it back

| account | paid by | returned to | when |
|---|---|---|---|
| Entry (151 B, 0.00142 SOL) | the player | the player | `close_entry`, sent in the same transaction as the full sell-back, or by anyone once the share is sold or the stake refunded (the keeper sweeps zero shares and refunds); works after the window is closed; at a shutdown `force_exit` pays what is left to the player and closes it |
| Window (507 B) + escrow (0.00471 SOL) | the opener (keeper), or a stranger who created the escrow first | the opener | `close_window`: a Settled window at once, whatever its entries (they keep their share: everything `sell_back` / `close_entry` / `force_exit` need is in the Entry and the Market); a Refunding window once every stake is refunded; an empty window in the transaction that seals it. The market's active window too once it is finished (since the second review): the last round of a drained market comes back |
| ORAO request (0.00135 SOL kept) + ORAO fee (0.0005 SOL) | whoever sends `request_vrf` (the keeper) | not returned (ORAO) | every round with 2 or more entries; none for 0 or 1 entry; the round's bounty goes to that payer |

## Before mainnet

The owner's decisions of 2026-10-28 (`docs/LAUNCH.md`): a short devnet test, then mainnet; the
program stays upgradeable; ~2-minute rounds; the cheapest path with every SOL that can come back
listed.

* **Legal**: `docs/RISKS.md` §0 is unresolved; the owner launches without a legal opinion and carries
  that risk.
* **Audit**: none. `programs/ladle` (hand-rolled ORAO and Metaplex CPIs, settlement math, close paths,
  the Entry account creation in `enter`) is covered only by the host tests, `tests/cu-bench` on the
  built `.so`, the property and authority checks, and our own review. The Anchor suite
  (`tests/anchor`, real ORAO) has not been run: run it against the devnet deployment.
* **Treasury**: done in code (`LADLE_TREASURY` at build time, see **Build**). The scripts build with
  `-Treasury`, refuse the devnet key on mainnet, check that the `.so` embeds the program id and that
  treasury (and not the devnet key), and give the keeper and the market script the same key.
* **Treasury key**: `mainnet-up.ps1` makes the owner retype the last 8 characters of the treasury
  from their wallet (base58 has no checksum: a typo would send every fee to a key nobody holds), and
  refuses an address owned by a program (a Squads multisig account instead of its vault). On devnet,
  build with the same `-Treasury` and check in your wallet (devnet) that the 0.05 SOL creation fee
  arrived: proof that the key is yours.
* **Upgrade authority**: kept (the owner ships fixes with it), on the mainnet deployer key
  (`ladle-mainnet-deployer.json`) unless `mainnet-up.ps1 -UpgradeAuthority usb://ledger` moves it to
  a hardware wallet right after the deploy (typed confirmation; the new signer must sign, so a typo
  cannot lock the program). Without that option the script asks to type `HOTKEY`. Whoever holds it
  can replace the program and take every vault: `SECURITY.md` §2 says so. An upgrade that changes
  an account layout must keep live accounts readable: `Market` has 64 reserved bytes for a new
  field; `Window` and `Entry` have none, so a change to them ships with a decoder for the old size
  (or a migration) in the same upgrade (`programs/ladle/src/state.rs`).
* **Site copy**: a production build with `NEXT_PUBLIC_DATA_SOURCE=chain` on mainnet-beta stops and
  lists every pre-launch statement it finds (`app/next.config.ts`, launch gate, 65 on 2026-10-28):
  (1) `app/i18n/en.ts` keys pinned by the sha256 of their pre-launch text (`cannot.title`/`sub`,
  `cannot.authority`/`authorityStatus`, `house.cannotTitle`/`note`, `status.programValue`/
  `deployValue`, `faq.a2`/`a6`, `about.optA`/`optB`, `sec.lead`, `sec.optAWhy`/`optBWhy`,
  `sec.lim1`/`lim3`/`lim4`, `glossary.windowDef`, `project.p2`, `chat.sysRequest`, `h.faq.r4a`,
  `footer.status`/`demo`, the "not deployed" notes); (2) phrases false on an upgradeable mainnet
  (not deployed, revoked, timelock, after the audit, slot 92 / twenty seconds, never ran, "nobody
  can", "us included", placeholder program id, demo data in your browser) in every string of
  `app/i18n/en.ts`, `app/components` (the About / Security / tour copy in
  `components/hall/sections/copy.ts` included), `app/app` and `app/lib`; (3) `NEXT_PUBLIC_LADLE_REPO`
  set to the real repository (the "verify the law" links). It is a net, not a proof-reading: read
  the pages. What is true on mainnet: the deployed code lets nobody move a stake or choose an
  outcome without ORAO's signers, and whoever holds the upgrade authority can replace it at any
  moment. A chain build also stops without `NEXT_PUBLIC_SOLANA_CLUSTER`, and the page refuses an RPC
  whose genesis hash is not that cluster's.
* **Shutdown and the program rent**: see **Shutdown** below. The program rent (1.96787516 SOL)
  comes back when the owner stops the game; what players forget is paid to them, it does not keep
  the rent locked.
* **Round pages in chain mode**: `/window/{n}`, `/window/latest`, the recent rounds and the chat's
  `!verify` link read the round's Window and Entry accounts. The keeper closes a settled Window 1 to
  5 minutes after settlement and each full sell-back closes that player's Entry, so these pages
  show a round only for minutes, and partly once players exit. Durable history and verification
  need the program's events (`app/lib/data/chain-history.ts`, not written yet; `Entered`,
  `WindowDrawn` with the 64-byte seed, `WindowTallied` and `EntrySettled` carry everything a
  verification needs); until then the transactions on an explorer are the record.
* **Token metadata URI**: `https://useladle.fun/token.json` is live (checked by
  `keeper/src/ops/create-market.ts` before it sends anything); it can never change once the market
  exists.
* **Keeper hosting**: an always-on process (VPS / container) with its own funded keypair and a paid
  RPC: `deploy/` (systemd units, Caddyfile, Docker alternative) and **Mainnet launch** below.
* **Funds**: 2.5565076 SOL on the mainnet deployer for the whole bring-up (see **What the scripts ask
  for**); at the end 1.96787516 SOL is program rent (back at the shutdown), 0.5 SOL the keeper
  float, ~0.01 SOL left on the deployer, ~0.0188 SOL spent for good (~0.022 with the shutdown's own
  writes and fees).

### A round that does not settle

Rounds settle strictly in index order, so one round that cannot finish holds every later one. The
program stops opening rounds once 8 wait (`TooManyWindowsPending`): the stakes at risk stay bounded,
the site shows "paused", and the keeper raises `settlement_stalled` (the round at the cursor could
move and has not for `KEEPER_SETTLE_STALL_MIN`, 10 min) and `rounds_paused`, with `/health` at 503.
What to look at, in this order (`journalctl -u ladle-keeper | grep warn`):

1. **The final page fails** (`tally_page(final)` or `fulfill+tally+settle` keeps failing):
   * `PlatformAccountMismatch` or `AccountNotInitialized` on the treasury's wSOL account: the
     treasury closed it (an unwrap in its wallet). The keeper re-creates the fee accounts after a
     failed final page; if that fails too, create it yourself:
     `spl-token create-account So11111111111111111111111111111111111111112 --owner <treasury> --fee-payer <keeper key> -u m`.
   * The keeper's treasury is not the build's: since the second review it refuses to start
     (exit 2, "was not built with the treasury"); fix `LADLE_TREASURY` in `/etc/ladle/keeper.env`.
   * `HostAccountMismatch`: the page named another account than the host's associated one (a
     client bug). A host that closed its account no longer stops anything (final review): that
     round's host fee stays in its buy, and the keeper never creates a host's account (a host could
     close it again and keep the rent each time). Only markets others create have an integration.
2. **A Sealed round past its VRF timeout that will not refund**: `VrfRequestMissing` means its ORAO
   request account is gone (the program treats that as an error, `SECURITY.md` §3), `MustFulfill`
   that ORAO answered after all (the keeper then fulfils and settles it).
3. **Nothing on chain moves it any more** (a program bug, a request account ORAO deleted): the way
   out is a program upgrade (the program stays upgradeable for this), tested on devnet first: for
   example letting `refund_window` refund that round. Players' stakes wait in its escrow until then;
   nothing new comes in meanwhile (the 8-round cap). Upgrade through a **buffer** the deployer key
   writes, so an upgrade authority on a Ledger signs ONE transaction (`solana program deploy
   --upgrade-authority usb://ledger` would make it sign every one of the ~380 writes):
   ```
   solana program write-buffer target\deploy\ladle.so --buffer <buffer keypair file> --buffer-authority <deployer.json> --keypair <deployer.json> --with-compute-unit-price 20000 --use-rpc --url <your RPC>
   solana program set-buffer-authority <BUFFER> --buffer-authority <deployer.json> --new-buffer-authority <upgrade authority address> --keypair <deployer.json> --url <your RPC>
   solana program upgrade <BUFFER> <PROGRAM_ID> --upgrade-authority usb://ledger --keypair <deployer.json> --url <your RPC>
   ```
   (`Get-UpgradeCommands` in `scripts/ladle-common.ps1` prints them with the paths filled in; the
   buffer's SOL goes back to the deployer at the upgrade. A paid RPC, typed at a prompt: the public
   endpoint rate-limits the writes.)

### Shutdown

The owner stops the game with `scripts/mainnet-shutdown.ps1 -Owner <wallet> -RpcUrl <rpc>
[-Authority usb://ledger]` (`docs/LAUNCH.md` section 8; it asks before each step and resumes
where it stopped). On chain (`programs/ladle/src/instructions/wind_down.rs`):

1. **STOP**: upgrade to the wind-down build (`--features wind-down`, the deployed treasury). It
   has no `create_integration`, `create_market`, `open_window` or `enter`; rounds in flight
   seal, draw, settle or refund as usual; `sell_back`, `sell`, refunds and closes work.
2. **NOTICE**: `start_wind_down(market)` (anyone; the script and the keeper send it) records the
   cluster clock in `market.notice_start`. For `WIND_DOWN_NOTICE_SECS` (7 days) players exit by
   themselves; the site shows the end date on every page. A round opening under a normal build
   clears the notice (a called-off shutdown needs a new, full one).
3. **DRAIN** (`KEEPER_SHUTDOWN=1`, or the script from the owner's PC): after the notice,
   `force_exit(entry)` for every entry left: the unsold share sold to the curve at that moment
   (exactly what `sell_back` would pay), or the stake of a Refunding round, paid to `entry.owner`
   and nobody else, as SOL straight to the wallet (a wSOL account at the PDA ["unwrap", entry] is
   opened, filled and closed into the entry inside the instruction; the caller lends its rent and
   gets it back). Every market is quoted in wSOL (`create_market` refuses any other quote mint since
   the final review), so nothing a player does with their token accounts can block it. The entry
   closes, its rent to the owner. Then `close_window` for every round, and `close_market` once no
   round account is left (`live_windows == 0`) and no LADLE is out (`curve.y ==
   INITIAL_VIRTUAL_Y`): the unsold supply is burned, the vaults and the market close, rents and the
   curve's rounding to the creator. The keeper's `--shutdown` is program-wide: it serves every
   market of the program (`--market` optional), and closes the entries a market closed early by
   someone else left behind (`close_market` is permissionless and does not count entries; such an
   entry holds only its owner's rent, and `close_entry` needs no market).
4. **CLOSE**: `report.ts` says `programClosable` (no Entry, no Window of any market, the wind-down
   build live; entries of closed markets are listed as `orphanEntries`), and `solana program close
   <id> --bypass-warning` returns the program rent.

`pnpm bench:cu` checks it all on the real builds (`pnpm bench:wind-down`: the wind-down suite on
a normal and a wind-down `.so`).

### Shutdown rehearsal (devnet)

A separate program, so the long-lived devnet deployment keeps running: build with the `rehearsal`
feature, which takes the program id from `LADLE_REHEARSAL_PROGRAM_ID` (refused at compile time when
it is the production id; a rehearsal build can never run at the mainnet address) and shortens the
notice to 10 minutes:

```
solana-keygen new --no-bip39-passphrase --silent -o %USERPROFILE%\.config\ladle\ladle-rehearsal-program.json
set LADLE_REHEARSAL_PROGRAM_ID=<its address>
set LADLE_TREASURY=<a devnet treasury>
cargo build-sbf --tools-version v1.57 --arch v3 --features rehearsal --sbf-out-dir target\rehearsal
cargo build-sbf --tools-version v1.57 --arch v3 --features rehearsal,wind-down --sbf-out-dir target\rehearsal-wind-down
```

(delete the `ladle-keypair.json` each `--sbf-out-dir` gets: not the rehearsal program's key). Then:
deploy `target\rehearsal\ladle.so` with `--program-id` that keypair, create a market
(`keeper/src/ops/create-market.ts --cluster devnet --program <rehearsal id> --out
config/deployments/devnet-rehearsal.json`; `--program` is refused on mainnet-beta), play a 2-player
round where one player never exits (`tests/devnet/play-round.ts --deployment
config/deployments/devnet-rehearsal.json`), upgrade to the rehearsal wind-down build, run the keeper
with `--shutdown --notice-secs 600 --program <rehearsal id>` (no `--market` needed: it serves every
market of the program), wait the 10 minutes, let it drain, check `report.ts --notice-secs 600` says
`programClosable`, `solana program close`, and check the SOL back.


## Mainnet launch (keeper, scripts, hosting)

The step-by-step runbook, in French and English, with the costs per month: `docs/LAUNCH.md`.

* `scripts/mainnet-up.ps1` (the owner runs it; it spends real SOL): keypairs in
  `%USERPROFILE%\.config\ladle\` (deployer = upgrade authority, keeper, a buffer keypair so an
  interrupted deploy resumes), the build with `LADLE_TREASURY`, checks of the `.so` (program id,
  treasury, SBPF version, same bytes as on devnet), the exact SOL needed, the deploy
  (`--with-compute-unit-price`, `--use-rpc`, `--max-len` = `.so` size), a byte-for-byte check of the
  deployed program and its upgrade authority, the market (settings shown with the measured round
  length, typed confirmation), the fee accounts, the keeper float, and the env files for Vercel, the
  keeper and the relay.
* `scripts/mainnet-recover.ps1` (read-only): `-Owner` is checked first (retype its last 8
  characters from the wallet; it must be an existing wallet; the printed transfers keep the CLI's
  refusal to send to an account that does not exist), then where the operator's SOL is and the
  exact commands that bring it back (keeper float and wrapped bounty, deployer, buffers, treasury
  fees apart from the `-Owner` total), and the program close once `keeper/src/ops/report.ts`,
  reading every market, round and entry of the program, says `programClosable` (after the
  shutdown; at once when the program has no market).
* `scripts/mainnet-shutdown.ps1` (the owner runs it): **Shutdown** above.
* Keeper on mainnet (`keeper/README.md`): its own keypair (no default, `id.json` refused), the RPC's
  genesis hash checked against `LADLE_CLUSTER`, the treasury of the build (`LADLE_TREASURY`) required
  on mainnet and checked against the deployed program at start (exit 2 when the build has another),
  a capped compute-unit price on every transaction (auto from recent fees, floor 1,000, cap 100,000
  micro-lamports per unit, at most 0.0005 SOL per transaction, with a simulated limit), the
  wrapped-SOL bounty unwrapped every hour, low-balance, stalled-keeper, stalled-settlement, paused-
  rounds and failing-action alerts (log + webhook; no URL with its key in either), `GET /health`
  (503 on any of them), a clean stop on SIGTERM,
  10-second ticks while only the open round waits. Windows close on the keeper's cleanup pass, 1 to
  5 minutes after they settle (v22: the program allows it right after settlement), so the keeper's
  round rent comes back every round.
* `deploy/`: `systemd/ladle-keeper.service`, `systemd/ladle-chat.service`, `Caddyfile` (TLS for
  `wss://chat.useladle.fun`, `/health` and `/keeper/health`), `install.sh` (Ubuntu 24.04 / Debian 12),
  `Dockerfile` + `compose.yaml`, `keeper.env.example`, `chat.env.example`.
