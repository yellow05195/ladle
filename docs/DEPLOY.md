# Deploying Ladle

Program id (both clusters): `85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj`
(keypair `target/deploy/ladle-keypair.json`, keep a backup of it outside the repo).

## Toolchain on this Windows machine

The Solana CLI is installed but not on `PATH`; prepend it in each shell:

```
$env:PATH="$env:USERPROFILE\.local\share\solana\solana-release\bin;$env:PATH"
```

* Build: `cd programs/ladle; cargo build-sbf --tools-version v1.57` -> `target/deploy/ladle.so`
  (`anchor build` tries to install a pinned Solana release with admin rights; not needed).
  The release profile (root `Cargo.toml`) optimises for size (`opt-level = "z"`, fat LTO, one
  codegen unit, overflow checks kept): the `.so` size is the deploy rent.
* Host tests: `cargo test` (25, incl. whole windows of 1, 2, 50, 100, 500 and 2048 entries through
  the paged tally/settle arithmetic), `cargo clippy --lib`.
* Compute units and an end-to-end run of the built `.so` (LiteSVM, mainnet feature set):
  `pnpm bench:cu` (= `cargo run --release --manifest-path tests/cu-bench/Cargo.toml -- target/deploy/ladle.so owner 1,2,50,100,500,2048 20,28`;
  its own workspace, first build ~5 min; pass `index` and an older `.so` to measure the v20 layout). For every size it runs open_window, N enters, seal,
  fulfill (ORAO's fulfilled account written directly), tally/settle pages, sell_back/claim,
  close_entry for every entry, close_window, and checks sum(shares) == tokens_out and the fee split
  at the lamport; it also replays 50 enters built from one snapshot of the window.
* IDL: `cargo test __anchor_private_print_idl --features idl-build -- --show-output --quiet --test-threads=1 > idl-raw.txt`
  with `ANCHOR_IDL_BUILD_PROGRAM_PATH=<programs/ladle>` and `ANCHOR_IDL_BUILD_SKIP_LINT=TRUE`, then
  `pnpm idl:assemble idl-raw.txt target/idl/ladle.json`.
* Offline gates: `pnpm test:all` (forbidden words, 10,000-window property test, authority check on
  source + IDL, IDL/SDK consistency, SDK codec and transaction sizes, indexer, chat).
* A local validator does not start here (`solana-test-validator` needs the Windows symlink privilege:
  Developer Mode or an elevated shell). Devnet is the integration cluster.

## What deploying costs

Rent is what the cluster asks for the bytes (`solana rent <bytes>`, 2026-10-27, identical on devnet
and mainnet-beta: 5,080 lamports per byte including the 128-byte account overhead). The program
data account holds the `.so` plus a 45-byte header; `solana program deploy` first writes the `.so`
into a buffer account of the same size, which it closes (rent refunded) once the program is live,
so the deployer briefly needs both. `--max-len` defaults to the `.so` length (no headroom paid);
an upgrade with a larger `.so` extends the account and pays only the difference.

| | before (v20) | after (v21) |
|---|---|---|
| `target/deploy/ladle.so` | 535,376 B | **397,832 B** (-25.7 %) |
| program data rent (kept while deployed) | 2.72058892 SOL | **2.02186540 SOL** |
| program account (36 B) | 0.00083312 SOL | 0.00083312 SOL |
| buffer (temporary, refunded after the deploy) | 2.72054828 SOL | 2.02182476 SOL |
| write transactions (~1 KB each, 5,000 lamports) | ~530 tx, ~0.0027 SOL | ~394 tx, ~0.0020 SOL |
| **net cost of the deploy** | **~2.724 SOL** | **~2.025 SOL** |
| **balance needed during the deploy** | **~5.45 SOL** | **~4.05 SOL** |

Where the 137,544 bytes went: `opt-level = "z"` instead of the default 3 (-124,888 B; "s" gave
-87,960 B), the v21 program changes themselves (-1,384 B), `require!` instead of `require_eq!`/`require_keys_eq!` (which format both values into
the error log, -5,608 B), Anchor's `no-log-ix-name` feature (the "Instruction: X" log line, -1,304 B;
explorers name instructions from the IDL), and no `#[msg]` strings on the errors (-4,360 B; the
logs still carry `Error Code: <Name>`, the sentences live in `sdk/src/errors.ts`
`PULLED_ERROR_MESSAGES`). What remains is mostly Anchor's per-instruction account validation.
Publishing the IDL on chain (`anchor idl init`) is optional and not needed by the SDK, which is
written against the Rust layouts.

Market creation (once per token): 0.05 SOL creation fee to the treasury + about 0.01 SOL of rents
(market 562 B 0.0035 SOL, mint 0.0011 SOL, two vault accounts 0.0030 SOL, Metaplex metadata).

## Compute units (measured)

`tests/cu-bench` on the built `.so`, LiteSVM 0.18.1 with the mainnet feature set; CPIs included;
maximum over windows of 1 to 2048 entries. Before = the v20 build (opt-level 3) on the same harness.

| instruction | before | after |
|---|---|---|
| `enter` | 38,255 | 47,705 |
| `open_window` | 48,642 | 61,466 |
| `seal` | 10,044 | 17,157 |
| `fulfill` | 6,006 | 9,604 |
| `tally_page`, 20 entries / final page of 20 | 78,115 / 87,073 | 111,557 / 123,974 |
| `tally_page`, 48 entries | 163,571 | 229,409 |
| `settle_page`, 28 entries | 329,219 | 317,558 |
| `settle_page`, 48 entries | 556,093 | 528,738 |
| `sell_back` / `claim` | 18,750 / 15,207 | 29,901 / 24,818 |
| `close_entry` / `close_window` | 8,068 / 12,297 | 13,470 / 21,052 |

The size profile costs ~25-55 % more compute units per instruction; `settle_page` still got cheaper
because it now carries `floor(tokens_out * cum / S)` from one entry to the next (one 256-bit division
per entry instead of two, identical shares: `tests_pages.rs` checks both against each other). The
heaviest possible page (48 entries) uses 38 % of the 1.4M ceiling. `request_vrf` is not measured
(the ORAO program is not in LiteSVM); it runs under the default 200,000 units per instruction.

What the keeper requests (`sdk/src/budget.ts`, a `SetComputeUnitLimit` instruction in every page
transaction): `tally_page` 60,000 + 5,000 x entries (160,000 for 20), `settle_page`
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
locked until fulfilment and then refunded. Rents that come back are not counted: Window (411 B) +
escrow = 4,226,560 lamports from `open_window` to `close_window`; each Entry (110 B, 1,209,040
lamports) is the player's, returned by `close_entry` in their claim / sell-back transaction.

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

The keeper bounty is 10 % of the 1 % platform fee (0.1 % of the round's total). It covers the ORAO
cost of a round with 2+ entries above ~1.86 SOL of total, and a one-entry round above ~0.006 SOL.

## Devnet

Steps 2 to 5 run in one go, each skipped when already done:
`powershell -ExecutionPolicy Bypass -File scripts/devnet-up.ps1` (it computes the balance the deploy
needs from the `.so` size with `solana rent`).

1. Fund the deployer `A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat`
   (`~/.config/solana/pulled-devnet-deployer.json`) with at least 4.7 SOL from faucet.solana.com
   (2.02 SOL program rent, 2.02 SOL buffer returned after the deploy, ~0.06 SOL market, 0.5 SOL keeper
   float).
2. Deploy:
   ```
   solana program deploy target/deploy/ladle.so --program-id target/deploy/ladle-keypair.json `
     --keypair $env:USERPROFILE\.config\solana\pulled-devnet-deployer.json --url devnet
   ```
3. Create the market (native SOL quote, 92-slot rounds, 20 % cap above a 0.5 SOL floor, 5 SOL max entry):
   ```
   cd tests
   node --experimental-strip-types devnet/create-market.ts --cluster devnet `
     --keypair $env:USERPROFILE\.config\solana\pulled-devnet-deployer.json
   ```
   Writes `config/deployments/devnet.json`.
4. Run the keeper (its own keypair, never `id.json`):
   ```
   pnpm keeper --deployment config/deployments/devnet.json --keypair <keeper keypair>
   ```
   The keeper reads entries with `getProgramAccounts`; the public devnet RPC serves it, a paid RPC is
   advised for crowds.
5. Point the app at it (`app/.env.local`):
   ```
   NEXT_PUBLIC_DATA_SOURCE=chain
   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
   NEXT_PUBLIC_LADLE_PROGRAM=85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj
   NEXT_PUBLIC_LADLE_MARKET=<market from config/deployments/devnet.json>
   ```
6. Integration suite against devnet (real ORAO): see `tests/anchor/README.md` (16 files, incl.
   `15-rent-recovery` and `16-crowd-50`).

## Rent: who pays, who gets it back

| account | paid by | returned to | when |
|---|---|---|---|
| Entry (110 B, 0.00121 SOL) | the player | the player | `close_entry`, sent in the same transaction as the claim / full sell-back, or by the keeper after a refund |
| Window (411 B) + escrow (0.00423 SOL) | the opener (keeper) | the opener | `close_window`, once every entry is closed and the window is no longer the active one (an empty window: in the transaction that seals it) |
| ORAO request (0.00135 SOL kept) + ORAO fee (0.0005 SOL) | the keeper | not returned (ORAO) | every round with 2 or more entries; none for 0 or 1 entry |

## Before mainnet (none of this is done)

* **Legal**: `docs/RISKS.md` §0 is unresolved. No mainnet before a written legal opinion.
* **Audit** of `programs/ladle` (hand-rolled ORAO and Metaplex CPIs, settlement math, close paths,
  the Entry account creation in `enter`).
* **Treasury**: replace `PLATFORM_TREASURY` (`programs/ladle/src/consts.rs`, `sdk/src/pda.ts`) with the
  owner's mainnet key, rebuild, re-run `pnpm test:all`.
* **Upgrade authority**: decide, then either keep it on a hardware wallet / multisig or make the
  program immutable (`solana program set-upgrade-authority --final`). `SECURITY.md` must state which.
* **Token metadata URI**: host `app/public/token.json` at `https://useladle.fun/token.json` before
  creating the mainnet market (the metadata is immutable).
* **Keeper hosting**: an always-on process (VPS / container) with its own funded keypair and a paid RPC.
* **Funds**: program deploy 2.02 SOL rent (398 KB `.so`) + 2.02 SOL temporary buffer, market creation
  0.05 SOL + ~0.01 SOL rents, keeper float.
