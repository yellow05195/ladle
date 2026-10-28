# Ladle program (Anchor)

Everyone pays into a window counted in **slots**. When the window closes, one
external random seed (ORAO VRF) decides how the window's **single**
bonding-curve buy is split among the entries; the shares sum exactly to what
the curve sold. Every entry can then claim its tokens or sell them straight
back to the curve.

There is **no admin, no pause, no `set_*`/`update_*`**. Every fee, bound and
timeout is either a `pub const` (`src/consts.rs`, `src/law.rs`) or an account
field written once at creation. The program never takes anything from the
draw itself: it lives on a fixed 1 % platform fee taken on the window total
before the curve buy (10 % of which goes to whoever finalizes the window).

Program id (placeholder, replace before deploy, also in `Anchor.toml`):
`85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj`.
Platform treasury (placeholder): `A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat`.

## Accounts (all PDAs of this program)

| Account | Seeds | Notes |
|---|---|---|
| `Integration` | `["integration", host]` | `host`, `host_fee_bps` (<= 300), immutable. |
| `Market` | `["market", token_mint]` | Token + curve + window parameters. Only `curve`, `window_count`, `next_settle_index`, `has_active_window`/`active_window` ever change. Vaults are the market PDA's ATAs: `token_vault` (launched token) and `quote_vault` (quote mint). |
| `Window` | `["window", market, index: u64 LE]` | One per window; `escrow` = the window PDA's ATA for the quote mint. |
| `Entry` | `["entry", window, owner]` | One per wallet per window (a second `enter` fails with `AlreadyEntered`); `index` is the window's `entry_count` at entry time, assigned by the program in arrival order, so wallets entering in the same slot never collide. |

Token programs: the launched token always uses classic SPL Token
(`market.token_mint`, 6 decimals, 1,000,000,000 supply, mint authority and
freeze authority `None`). The quote mint may be SPL Token or Token-2022; its
program id is stored in `market.quote_program` and must be passed as
`quote_token_program`. Quote mints with a freeze authority, or Token-2022
mints with `TransferFeeConfig`, `TransferHook` or `PermanentDelegate`, are
rejected at `create_market`.

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
| `Settled` | Shares computed; claims / sell-backs open. |
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
| 2 | `create_market(params)` | creator (+ fresh `token_mint` keypair) | bounds: `window_slots` in [25, 600]; `vrf_timeout_slots >= 150` and `> window_slots`; `max_entry_bps` in [500, 10000]; `max_entry_amount > 0`; name/symbol/uri <= 32/10/200 bytes; quote mint check | Creates mint + Market + both vaults, mints the supply to `token_vault`, sets mint authority to `None`, pays 0.05 SOL to the platform treasury. Optional `integration` account (pass the program id for none). |
| 3 | `open_window()` | payer | no active window, or the active window (`prev_window`) is past `Open` | Creates Window `index = market.window_count` with `close_slot = slot + window_slots`, and its escrow ATA. |
| 4 | `enter(amount)` | owner | window `Open`, `slot < close_slot`, no entry of this wallet yet, `< 2048` entries, `0 < amount <= max_entry_amount`, cap rule | Updates `total_amount`, `entry_count`, `entries_commitment`, creates the Entry `["entry", window, owner]` (index = `entry_count`), then `transfer_checked` into escrow. |
| 5 | `seal()` | – | `Open`, `slot >= close_slot` | 2+ entries: `Sealed`, `vrf_seed` fixed. 1 entry: `Drawn`, no randomness. None: `Settled` (must be next in settle order). |
| 6 | `request_vrf()` | payer (pays ORAO fee + request rent) | `Sealed`, not yet requested | CPI ORAO `request_v2(vrf_seed)`; records `vrf_request`, `vrf_requested_slot`. |
| 7 | `fulfill()` | – | `Sealed`, requested, ORAO account fulfilled | Copies randomness into `window.seed`; `Drawn`. |
| 8 | `tally_page(from, to)` | payer (receives the keeper bounty on the last page) | `Drawn`, cursor rule | Rolls for entries `[from, to)`; last page finalizes (see below). |
| 9 | `settle_page(from, to)` | – | `Tallied`, cursor rule | Shares for `[from, to)`; last page checks `cum == weight_sum`, sets `Settled`, advances `next_settle_index`. |
| 10 | `refund_window()` | – | `Sealed`, timeout passed, next in settle order; if requested, the ORAO request account must exist with the Pending tag | `Refunding`; advances `next_settle_index`. Fails with `MustFulfill` if the randomness exists, `VrfRequestMissing` if the request account is gone. |
| 11 | `refund_entry()` | – | `Refunding`, not yet refunded; `recipient.owner == entry.owner` | Full stake back to the owner's token account. |
| 12 | `claim()` | owner | `Settled`, `share - claimed > 0` | Tokens from `token_vault`; `claimed = share`. |
| 13 | `sell_back(amount)` | owner | `Settled`, `share - claimed > 0` | Sells `min(amount, share - claimed)` to the curve, tokens stay in the vault, quote paid from `quote_vault`. Zero fee. |
| 14 | `sell(amount)` | seller | – | Tokens into `token_vault`, quote out of `quote_vault` at the curve price. Zero fee. |

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
`bounty -> keeper_quote_account` (chosen by the payer), `host -> host ATA`.
Identity: `to_curve + (platform - bounty) + bounty + host == total`.

The finalization accounts are required on **every** `tally_page` call
(`quote_mint`, `escrow`, `quote_vault`, `platform_quote_account`,
`keeper_quote_account`, optional `integration` + `host_quote_account`,
`quote_token_program`). `platform_quote_account` must be the ATA of the
platform treasury for the quote mint (anyone can create it beforehand with the
ATA program); `host_quote_account` must be the host's ATA.

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
  (PDA `["orao-vrf-randomness-request", vrf_seed]` of ORAO), `vrf_program`,
  `system_program`.
* `vrf_seed = sha256("ladle:vrf:v1" || window || close_slot LE || entry_count LE || entries_commitment)`
  where `entries_commitment` starts at zero and is folded on every `enter` as
  `sha256(prev || owner || amount LE || index LE)`. The seed is fixed at
  `seal`; nobody chooses it and it cannot be evaluated before the last entry.
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
2. At `close_slot`: `seal`, then `request_vrf` (same transaction is fine).
3. Watch `window.vrf_request`; when fulfilled: `fulfill`.
4. `tally_page` in pages of <= 48 entries, then `settle_page` likewise.
5. If the timeout passes without fulfillment: `refund_window`, then
   `refund_entry` for every entry.

Everything in 1-5 is permissionless; a dead keeper only delays.

## Events

`WindowOpened`, `Entered`, `WindowSealed`, `VrfRequested`, `WindowDrawn`,
`WindowTallied`, `EntrySettled`, `WindowSettled`, `Claimed`, `SoldBack`,
`Sold`, `WindowRefunding`, `EntryRefunded` (`src/events.rs`).

## Building and testing

The crate is verified on the host target (no SBF toolchain on the dev
machine):

```
cd programs/pulled
cargo check --lib
cargo check --lib --features idl-build
cargo test
```

`anchor build` (Anchor CLI 1.2.0, anchor-lang/anchor-spl 1.2.0) is expected
to work unchanged once a Solana/Agave toolchain is available.

## Deviations from the brief worth knowing

* `INITIAL_VIRTUAL_Y == TOKEN_SUPPLY` (1e9 tokens) instead of 1.073e9: with a
  virtual reserve larger than the real supply the curve could sell tokens the
  vault does not hold, and there is no graduation/cap mechanism to stop it.
  `INITIAL_VIRTUAL_X` stays 30 * 1e9 quote base units.
* `seal` of an **empty** window and `refund_window` both require the window
  to be next in settlement order (so the cursor is never advanced past a
  window that still has to execute the curve).
