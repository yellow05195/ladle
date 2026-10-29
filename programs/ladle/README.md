# Ladle program (Anchor)

Everyone pays into a window counted in **slots**. When the window closes, one
external random seed (ORAO VRF) decides how the window's **single**
bonding-curve buy is split among the entries; the shares sum exactly to what
the curve sold. Every entry can then sell its share straight back to the
curve. The tokens never leave the market's vault to a wallet (no `claim`
since v25): a share is sold back by its owner, or for them when the game is
stopped (the **wind-down build**, below).

There is **no admin, no pause, no `set_*`/`update_*`**. Every fee, bound and
timeout is either a `pub const` (`src/consts.rs`, `src/law.rs`) or an account
field written once at creation. The program never takes anything from the
draw itself: it lives on a fixed 1 % platform fee taken on the window total
before the curve buy (10 % of which is the keeper bounty: it goes to the
quote ATA of whoever paid the window's ORAO request, `window.vrf_payer`, or
to the finalizer when the window needed no draw). The program account itself
stays **upgradeable** (`SECURITY.md` §2): whoever holds its upgrade authority
can replace everything this file describes.

Program id (the keypair `target/deploy/ladle-keypair.json`, also in
`Anchor.toml` and `sdk/src/pda.ts`; deployed on devnet):
`85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj`.
Platform treasury: fixed at build time by the `LADLE_TREASURY` environment
variable (base58), `A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat` (the devnet
deployer) when unset; see `docs/DEPLOY.md` "Build".

## Accounts (all PDAs of this program)

| Account | Seeds | Notes |
|---|---|---|
| `Integration` | `["integration", host]` | `host`, `host_fee_bps` (<= 300), immutable. |
| `Market` | `["market", token_mint]` | Token + curve + window parameters. Only `curve`, `window_count`, `next_settle_index`, `has_active_window`/`active_window` ever change. Vaults are the market PDA's ATAs: `token_vault` (launched token) and `quote_vault` (quote mint). |
| `Window` | `["window", market, index: u64 LE]` | One per window; `escrow` = the window PDA's ATA for the quote mint. |
| `Entry` | `["entry", window, owner]` | One per wallet per window (a second `enter` fails with `AlreadyEntered`); `index` is the window's `entry_count` at entry time, assigned by the program in arrival order, so wallets entering in the same slot never collide. Also holds the window's `market` and `window_index` (copied by `enter`) and `settled` (set by `settle_page` with `share`): `sell_back`, `close_entry` and `force_exit` need nothing else, so they work after the Window is closed. |

Token programs: the launched token always uses classic SPL Token
(`market.token_mint`, 6 decimals, 1,000,000,000 supply, mint authority and
freeze authority `None`). The quote mint must be wrapped SOL
(`So11111111111111111111111111111111111111112`, classic SPL Token; any other
mint fails with `QuoteMintNotWsol`, final review 2026-10-29); its program id
is stored in `market.quote_program` and must be passed as
`quote_token_program`. Token-2022 stays refused (second review: `Pausable`,
`MemoTransfer` on a host account and other extensions would let a third
party stop transfers). Other classic mints are refused because the shutdown
must be able to pay every entry out whatever its owner did: SOL to the
wallet is the only payout nobody can block, while a payout into a token
account could be blocked by the player (a classic SPL Token account's owner
can be handed to someone else, its associated address then taken for good)
or cost the drain one account rent per entry.

## Window states

```
Open -> Sealed -> Drawn -> Tallied -> Settled
Open -> Drawn                   (exactly one entry: no randomness needed)
Open -> Settled                 (no entries)
Sealed -> Refunding             (VRF timed out without fulfilling)
```

| State | Meaning |
|---|---|
| `Open` | Entries accepted while `clock.slot < close_slot`. |
| `Sealed` | Entries closed; `vrf_seed` fixed; randomness may be requested. |
| `Drawn` | 64-byte ORAO randomness copied into `window.seed`; or, for a window with exactly one entry, straight from `seal` with a zero seed (its share is the whole buy whatever the roll). |
| `Tallied` | Rolls done; the single curve buy executed; fees paid; `roll_sum`, `tokens_out` frozen. |
| `Settled` | Shares computed; sell-backs open. |
| `Refunding` | Timeout without randomness: every entry gets its full stake back. |

Windows execute the curve **strictly in index order**: `market.next_settle_index`
is the next window allowed to finalize (`tally_page` last page), to be
sealed empty, or to be refunded. Each of those advances the cursor by one.
A window can open while the previous one is still settling (the previous one
only needs to be past `Open`).

## Instructions

Every instruction is callable by anyone unless a signer is listed.

| # | Instruction | Signer | Requires | Effect |
|---|---|---|---|---|
| 1 | `create_integration(host_fee_bps)` | host | `host_fee_bps <= 300` | Creates the immutable Integration. |
| 2 | `create_market(params)` | creator (+ fresh `token_mint` keypair) | bounds: `window_slots` in [25, 600]; `vrf_timeout_slots` in [150, 9000] and `> window_slots`; `max_entry_bps` in [500, 10000]; `max_entry_amount >= MIN_ENTRY_AMOUNT` (0.1 SOL); name/symbol/uri <= 32/10/200 bytes; quote mint is wSOL (`QuoteMintNotWsol`) | Creates mint + Market + both vaults, mints the supply to `token_vault`, sets mint authority to `None`, pays 0.05 SOL to the platform treasury. Optional `integration` account (pass the program id for none). |
| 3 | `open_window()` | payer | no active window, or the active window (`prev_window`) is past `Open`; fewer than 8 windows waiting to settle (`window_count - next_settle_index < MAX_WINDOWS_IN_FLIGHT`, else `TooManyWindowsPending`) | Creates Window `index = market.window_count` with `close_slot = slot + window_slots`, and its escrow ATA unless someone created it first (`init_if_needed`: mint, owner, token program and address checked; anyone can create an ATA for a future window, which a plain `init` turned into a permanent stop). |
| 4 | `enter(amount)` | owner | window `Open`, `slot < close_slot`, no entry of this wallet yet, `< 2048` entries, `MIN_ENTRY_AMOUNT <= amount <= max_entry_amount` (0.1 SOL minimum: `EntryTooSmall`), cap rule | Updates `total_amount`, `entry_count`, `entries_commitment`, creates the Entry `["entry", window, owner]` (index = `entry_count`), then `transfer_checked` into escrow. |
| 5 | `seal()` | – | `Open`, `slot >= close_slot` | 2+ entries: `Sealed`, the seal seed fixed in `vrf_seed`. 1 entry: `Drawn`, no randomness. None: `Settled` (must be next in settle order). |
| 6 | `request_vrf(salt)` | payer (pays ORAO fee + request rent, at most `MAX_VRF_REQUEST_COST_LAMPORTS` = 0.01 SOL across the CPI, else `VrfRequestTooCostly`) | `Sealed`, not yet requested | `seed = sha256("ladle:vrf:req" || seal seed || salt)`, non-zero; CPI ORAO `request_v2(seed)`; records it as `vrf_seed`, and `vrf_request`, `vrf_requested_slot`, `vrf_payer`; emits the salt. |
| 7 | `fulfill()` | – | `Sealed`, requested, ORAO account fulfilled | Copies randomness into `window.seed`; `Drawn`. |
| 8 | `tally_page(from, to)` | payer | `Drawn`, cursor rule | Rolls for entries `[from, to)`; last page finalizes (see below). |
| 9 | `settle_page(from, to)` | – | `Tallied`, cursor rule | Shares for `[from, to)`; last page checks `cum == weight_sum`, sets `Settled`, advances `next_settle_index`. |
| 10 | `refund_window()` | – | `Sealed`, timeout passed, next in settle order; if requested, the ORAO request account must exist with the Pending tag | `Refunding`; advances `next_settle_index`. Fails with `MustFulfill` if the randomness exists, `VrfRequestMissing` if the request account is gone. |
| 11 | `refund_entry()` | – | `Refunding`, not yet refunded; `recipient` is the owner's associated token account for the quote mint, owned by `entry.owner` | Full stake back to the owner's associated token account; `window.refunded_entries += 1`. |
| 12 | `sell_back(amount, min_quote_out)` | owner | the entry's window `Settled`: `entry.settled` and `entry.window_index < market.next_settle_index`, with `entry.market == market` (no Window account); `share - claimed > 0` | Sells `min(amount, share - claimed)` to the curve (`claimed` counts what is sold), tokens stay in the vault, quote paid from `quote_vault`; `SlippageExceeded` when it would pay less than `min_quote_out`. Zero fee. |
| 13 | `sell(amount, min_quote_out)` | seller | – | Tokens into `token_vault`, quote out of `quote_vault` at the curve price (`SlippageExceeded` below `min_quote_out`). Zero fee. Only LADLE a pre-v25 `claim` took out can be in a wallet. |
| 14 | `close_entry()` | – | `settled` and `claimed == share` (a zero share included), or `refunded` (no Window account) | Closes the Entry; rent to `entry.owner`. |
| 15 | `close_window()` | – | `Settled` (entries may still be open), or `Refunding` with `refunded_entries == entry_count`; the market's active window included | Sweeps escrow dust to `quote_vault`, closes the escrow and the Window; rent to `window.opener`. Closing the active window clears `market.has_active_window` (the next `open_window` passes no previous window). |

### Wind-down build (`--features wind-down`): stopping the game

The build the owner upgrades to to stop the game and get the program rent
back (`scripts/mainnet-shutdown.ps1`, `src/instructions/wind_down.rs`). It
has none of `create_integration`, `create_market`, `open_window`,
`enter` (`InstructionFallbackNotFound`), everything else as above, and:

| # | Instruction | Signer | Requires | Effect |
|---|---|---|---|---|
| 16 | `start_wind_down()` | – | `market.notice_start == 0` (else `NoticeAlreadyStarted`) | `notice_start = clock.unix_timestamp`: the market's 7-day notice (`WIND_DOWN_NOTICE_SECS`; 10 min in a `rehearsal` build). Every `open_window` of a normal build clears it. |
| 17 | `force_exit()` | payer (lends the unwrap account's rent, gets it back) | notice over (`NoticeNotOver`); the entry settled in a Settled window, or refunded, or not settled with its window `Refunding` (pass the window and its escrow) | Pays what is left to `entry.owner` only: the unsold share sold to the curve now (as `sell_back` would), or the full stake (`refunded_entries += 1`), as SOL to the wallet, through a wSOL account at `["unwrap", entry]` opened, filled and closed into the entry in the instruction (a market not quoted in wSOL, which only an earlier build could make: `QuoteMintNotWsol`). Closes the entry, rent (and the payout) to the owner. |
| 18 | `close_market()` | – | notice over; `counts_windows`, `live_windows == 0`, `curve.y == INITIAL_VIRTUAL_Y` (else `MarketNotDrained`) | Burns the token vault's LADLE, closes both vaults and the market; rents and the quote left (the curve's rounding, anything sent to the vault) to `market.creator` as SOL (wSOL markets only: `QuoteMintNotWsol`). Entries are not counted: any left hold only their owner's rent and close with `close_entry` (the keeper's `--shutdown` closes them program-wide, whoever closed the market). The mint and its metadata stay (they cannot be closed). |

### Rehearsal build (`--features rehearsal`, devnet only)

The program id comes from `LADLE_REHEARSAL_PROGRAM_ID` at build time (the
build fails without it, and refuses the production id), and the notice is
10 minutes: a full shutdown rehearsal on its own devnet program
(`docs/DEPLOY.md`, "Shutdown rehearsal").

### Cap rule (`enter`)

With `new_total = total_amount + amount`:
`amount * 10000 <= max_entry_bps * new_total` **or** `new_total <= entry_floor_amount`.

### Page / cursor rule (`tally_page`, `settle_page`)

A page `[from, to)` with `0 < to - from <= 48` (`MAX_PAGE`):

* `from == cursor` -> processed, cursor becomes `to`;
* `to <= cursor` -> no-op success (idempotent replay);
* anything else (`from > cursor`, overlap, `to > entry_count`) -> error.

Remaining accounts: the Entries with indices `[from, to)`, in index order,
writable (found with `getProgramAccounts` on the window, sorted by index).
Each is checked for its window, its expected index and its canonical PDA
`["entry", window, entry.owner]`, so every entry is counted exactly once.

### Finalize (last `tally_page` page)

Requires `window.index == market.next_settle_index`. Then, with
`total = window.total_amount` and `host_bps` from the market's integration
(0 without one):

```
platform   = total * 100 / 10000          (PLATFORM_FEE_BPS)
host       = total * host_bps / 10000
to_curve   = total - platform - host
bounty     = platform * 1000 / 10000      (KEEPER_BOUNTY_BPS_OF_PLATFORM_FEE)
```

`(tokens_out, curve') = curve.buy(to_curve)` is executed **once**; the escrow
pays `to_curve -> quote_vault`, `platform - bounty -> platform treasury ATA`,
`bounty -> keeper_quote_account`, `host -> host ATA`. The bounty pays
whoever paid ORAO: for a window that asked it (`vrf_requested`),
`keeper_quote_account` must be the quote ATA of `window.vrf_payer`, or the
bounty goes to the platform treasury ATA instead (`WindowTallied.keeper_bounty`
= 0); a one-entry window pays any `keeper_quote_account` the payer gives.
Identity: `to_curve + (platform - bounty) + bounty + host == total`.

The finalization accounts are required on **every** `tally_page` call
(`quote_mint`, `escrow`, `quote_vault`, `platform_quote_account`,
`keeper_quote_account`, optional `integration` + `host_quote_account`,
`quote_token_program`). `platform_quote_account` must be the ATA of the
platform treasury for the quote mint (anyone can create it beforehand with the
ATA program); `host_quote_account` must be the host's ATA's address, and
may not exist: then that round's host fee stays in its buy (`to_curve`; final
review, 2026-10-29: a host closing its account could otherwise hold every
later round of its market, a Drawn round having no refund path, or make the
keeper pay that account's rent again and again).

### Settlement law (`src/law.rs`, mirrored by `sdk/src/law.ts`)

```
roll_i  = entry_roll(window.seed, entry.owner, index)          in [0, 10000]
A       = total_amount,   W = roll_sum = sum(amount_i * roll_i)
w_i     = amount_i * (A * (10000 + roll_i) - W)
S       = 10000 * A^2 = sum(w_i)
share_i = floor(tokens_out * cum_i / S) - floor(tokens_out * cum_{i-1} / S)
```

`sum(share_i) == tokens_out` exactly. `roll_sum` and `tokens_out` are frozen
in the Window at finalize; `settle_page` only reads them.

## VRF (ORAO, `src/vrf.rs`)

* Program `VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y` (devnet and mainnet).
* `request_vrf` accounts: `payer`, `window`, `network_state`
  (PDA `["orao-vrf-network-configuration"]` of ORAO), `treasury`
  (= `network_state.config.treasury`, read on chain), `vrf_request`
  (PDA `["orao-vrf-randomness-request", seed]` of ORAO for the salted seed
  below), `vrf_program`, `system_program`; argument `salt: [u8; 32]`.
* Seal seed (at `seal`): `sha256("ladle:vrf:v1" || window || close_slot LE || entry_count LE || entries_commitment)`
  where `entries_commitment` starts at zero and is folded on every `enter` as
  `sha256(prev || owner || amount LE || index LE)`: it binds the final entry
  set and cannot be evaluated before the last entry.
* Requested seed (at `request_vrf`): `sha256("ladle:vrf:req" || seal seed || salt)`,
  stored in `vrf_seed`. The seal seed is public from the close slot on and
  ORAO takes each seed once, from anyone: without the salt, a stranger who
  requested it at ORAO first made every `request_vrf` of the window fail
  (a forced refund for ~0.002 SOL). A request whose salted seed was used
  meanwhile fails; retry with another salt. Trust: `SECURITY.md` §3.
* The CPI is hand-rolled (the `orao-solana-vrf` crate pins anchor-lang 0.32);
  instruction and account layouts are documented at the top of `src/vrf.rs`
  and checked by unit tests.
* Refund timeout: `slot > start + vrf_timeout_slots`, `start` =
  `vrf_requested_slot` if a request exists, else `sealed_slot`.
* Assumption to VERIFY on devnet (G2 notes §3): ORAO `fulfill_v2` reallocs the
  request account and keeps it; it does not close it. `refund_window` relies on
  it by refusing a missing request account (`VrfRequestMissing`).

## Keeper loop (suggested)

1. `open_window` when the market has no open window (pass the active window
   as `prev_window` when there is one).
2. At `close_slot`: `seal`, then `request_vrf` with a fresh random salt (same
   transaction is fine; if that bundle fails, send `seal` alone, then the
   request with a new salt).
3. Watch `window.vrf_request`; when fulfilled: `fulfill`.
4. `tally_page` in pages of <= 48 entries, then `settle_page` likewise.
5. If the timeout passes without fulfillment (requested or not):
   `refund_window`, then `refund_entry` for every entry whose owner has a
   quote account (paying another wallet's account rent is a drain).
6. Rent: `close_window` as soon as a window is Settled and no longer the
   active one (players sell back later from their Entry), or Refunding with every
   stake refunded; `close_entry` for zero shares and refunded entries (rent
   to their owners).

Everything in 1-6 is permissionless; a dead keeper only delays.

## Events

`WindowOpened`, `Entered`, `WindowSealed`, `VrfRequested`, `WindowDrawn`,
`WindowTallied`, `EntrySettled`, `WindowSettled`, `Claimed`, `SoldBack`,
`Sold`, `WindowRefunding`, `EntryRefunded`, `EntryClosed`, `WindowClosed`
(`src/events.rs`).

## Building and testing

```
cd programs/ladle
cargo test
cargo clippy --lib
# SBF build (SBPF v3, accepted on devnet and mainnet-beta); LADLE_TREASURY
# picks the treasury, the devnet key when unset
cargo build-sbf --tools-version v1.57 --arch v3
```

`anchor build` is not used on this machine (it tries to install a pinned
Solana release); the IDL is assembled from the `idl-build` test output
(`docs/DEPLOY.md`). `pnpm bench:cu` runs every instruction of the built `.so`
on LiteSVM.

## Deviations from the brief worth knowing

* `INITIAL_VIRTUAL_Y == TOKEN_SUPPLY` (1e9 tokens) instead of 1.073e9: with a
  virtual reserve larger than the real supply the curve could sell tokens the
  vault does not hold, and there is no graduation/cap mechanism to stop it.
  `INITIAL_VIRTUAL_X` stays 30 * 1e9 quote base units.
* `seal` of an **empty** window and `refund_window` both require the window
  to be next in settlement order (so the cursor is never advanced past a
  window that still has to execute the curve).
