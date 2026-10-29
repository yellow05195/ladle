# @pulled/keeper

A permissionless, bountied keeper for PULLED markets. Anyone can run one; a
dead keeper only delays a window, it never blocks anything (every step is
callable by anyone, and users keep `sell_back` and refunds whatever the
keeper does). A round in progress when it dies stays open past its close
until something seals it: to pause, drain it (`--drain`) instead; to stop the
game for good, `--shutdown` with the wind-down build (below).

```
node --experimental-strip-types keeper/src/index.ts \
  --cluster devnet --rpc https://api.devnet.solana.com \
  --keypair ~/.config/ladle/ladle-devnet-keeper.json \
  --market <MARKET_PDA or TOKEN_MINT> [--market ...] \
  [--dry-run] [--once] [--interval 2000] [--page 28] [--health-port 8788]
```

`--dry-run` builds and simulates every transaction and sends nothing.
`--once` runs a single tick (cron-friendly). `--page` only lowers the page
sizes (default: 20 entries per `tally_page`, 28 per `settle_page`, the largest
that fit a legacy transaction). Logs are JSON lines:
`{"ts","level","market","window","index","action","sig","msg","err"}`.

## Settings (flags or environment)

Everything is checked before the loop starts and every problem is printed at
once (exit code 2, which the systemd unit does not restart on). There is no
default keypair, and `id.json` is refused: the keeper gets its own key.
The RPC's genesis hash must match `--cluster`, the program must be deployed
and every market must exist.

| flag | environment | default | |
|---|---|---|---|
| `--cluster` | `LADLE_CLUSTER` | from `--deployment` | `mainnet-beta`, `devnet`, `testnet`, `localnet` |
| `--rpc` | `RPC_URL` | from `--deployment` | a paid endpoint on mainnet; logs show only its host |
| `--keypair` | `KEEPER_KEYPAIR` (`KEYPAIR`) | none | a dedicated keypair file |
| `--market` | `LADLE_MARKET` (`a,b`) | from `--deployment` | market PDA or token mint |
| `--deployment` | `LADLE_DEPLOYMENT` | | `config/deployments/<cluster>.json` |
| `--treasury` | `LADLE_TREASURY` | from `--deployment`; devnet: the SDK default | the key the program was built with; required on mainnet-beta |
| `--interval` | `KEEPER_INTERVAL_MS` | 2000 | tick while something is pending |
| `--idle-interval` | `KEEPER_IDLE_INTERVAL_MS` | 10000 | tick while only the open window waits for its close slot (0: always `--interval`) |
| `--cu-price` | `KEEPER_CU_PRICE` | `auto` | micro-lamports per compute unit; `0` = no priority fee |
| `--cu-price-min` / `--cu-price-max` | `KEEPER_CU_PRICE_MIN` / `_MAX` | 1000 / 100000 | floor of `auto`, cap of everything (micro-lamports per unit, at most 1,000,000) |
| `--max-fee-sol` | `KEEPER_MAX_FEE_SOL` | 0.0005 | priority fee ceiling per transaction (price x limit), whatever the price settings; at most 0.01 |
| `--unwrap-every-min` | `KEEPER_UNWRAP_EVERY_MIN` | 60 | 0: never |
| `--unwrap-min-sol` | `KEEPER_UNWRAP_MIN_SOL` | 0.01 | |
| `--alert-below-sol` | `KEEPER_ALERT_BELOW_SOL` | 0.2 | 0: off |
| `--alert-webhook` | `KEEPER_ALERT_WEBHOOK` | none | https; body has `text` (Slack) and `content` (Discord) |
| `--alert-repeat-h` | `KEEPER_ALERT_REPEAT_H` | 3 | |
| `--health-port` / `--health-host` | `KEEPER_HEALTH_PORT` / `_HOST` | off / 127.0.0.1 | `GET /health` |
| `--vrf-per-day` | `KEEPER_VRF_PER_DAY` | 0 (no cap) | past N ORAO requests in 24 h no new round opens (alert `vrf_budget`); sealing, finalizing and refunds go on |
| `--drain` | `KEEPER_DRAIN=1` | off | no new round; the open one is sealed at its close; everything is finished, refunded and closed (the last round too); then exit 0 (log `drained`) |
| `--drain-refund-all` | `KEEPER_DRAIN_REFUND_ALL=1` | off | a drain that also refunds the stakes whose owner has no SOL token account, creating it (~0.0015 SOL each, paid by the keeper; the account is then the player's). Not needed for the shutdown: `force_exit` pays such stakes as SOL |
| `--shutdown` | `KEEPER_SHUTDOWN=1` | off | stop the game for good, once the **wind-down build** is deployed (refused at startup otherwise): the drain, `start_wind_down` for each market, then after the notice `force_exit` for every entry left (its unsold share sold to the curve, or its unrefunded stake, paid to the owner's wallet as SOL; its rent too), `close_entry` for finished ones, every round closed, `close_market`; exits 0 when every market is closed and no entry of the program is left (log `drained`; `market_left_open` for one that cannot close). Program-wide: `--market` is optional, every market of the program is served (`market_found`), and the entries a market closed early by someone else left behind (only their owners' rent) are closed with `close_entry`. Every step is idempotent: rerun it after any stop |
| `--notice-secs` | `KEEPER_NOTICE_SECS` | 604800 | the deployed wind-down build's notice: 7 days; 600 only for a devnet `rehearsal` build (refused on mainnet-beta) |
| `--settle-stall-min` | `KEEPER_SETTLE_STALL_MIN` | 10 | `settlement_stalled` alarm and `/health` 503 when the round at the settlement cursor could move but has not for this long |
| `--dry-run` | `KEEPER_DRY_RUN=1` | off | |

**Priority fee.** Every transaction carries a compute-unit price: `auto` takes
the 75th percentile of `getRecentPrioritizationFees` over the accounts it
writes, raised to the floor; a fixed number is used as is; both are capped.
The price is charged on the requested compute-unit limit, so a transaction
without one (seal + request, open, close batches) is simulated first and asks
for what it uses plus 15 % and 5,000 units. After a transaction expires
unconfirmed the price doubles (up to 16x, never above the cap) and halves
again with each one that lands. Cost at the default floor: ~120 lamports on a
~120,000-unit transaction, next to the 5,000-lamport signature fee; at the
cap, 12,000 lamports. Refunds go 5 per transaction instead of 6 when priced
(6 leave no room for the two compute-budget instructions).

**Unwrap.** The bounty arrives as wrapped SOL in the keeper's ATA. Every hour,
when it holds at least 0.01 SOL, one transaction closes the ATA (its balance
and its rent go to the keeper as SOL) and re-creates it empty, so the next
finalizing page still finds it (5,000 lamports + priority fee).

**Alerts.** The balance is read every minute. Below `--alert-below-sol`: a
`warn` log line `low_balance` and, with a webhook, a POST; repeated every
`--alert-repeat-h` hours while it lasts, cleared once the balance is back 25 %
above the line. The same for `ticks_failing` (no successful tick for 5 min,
usually the RPC), `vrf_request_failing` (5 `request_vrf` failures in a row:
ORAO refusing requests, or someone using up each salt; the round refunds
after its timeout), `vrf_budget` (`--vrf-per-day` reached),
`settlement_stalled` (the round at the settlement cursor is Drawn, Tallied,
or Sealed with its randomness in or past its timeout, and has not moved for
`--settle-stall-min`: every later round waits behind it), `rounds_paused` (8
rounds wait to settle: the program opens no new one, `MAX_WINDOWS_IN_FLIGHT`)
and `action_failing` (any action failed 5 times in a row). A failing final
page also makes the keeper re-create the fee accounts before its next
attempt (a treasury that unwrapped its wSOL account closes it). Every log
line and alert is scrubbed: URLs are cut to their host and `api-key=` values
hidden (web3.js puts the RPC URL, key included, in its fetch errors).

**Start checks.** Besides the settings (`config.ts`), the RPC's genesis hash
must be the cluster's, the program must be deployed, every market must
exist, and the deployed program must have been built with the configured
treasury: otherwise every finalizing page would fail and every later round
wait, so the keeper exits 2 instead.

**Health.** `GET /health` answers 200 with
`{"ok":true,"reasons":[],"keeper","cluster","markets","ticks","lastOkTickAgoMs","balanceSol",...}`,
or 503 with the reasons (`starting`, `no successful tick for N s`,
`balance below X SOL`, `settlement stalled: ...`, `no new round opens: ...`,
`failing 5+ times in a row: ...`, `stopping`). Point an uptime monitor at it through the
TLS proxy (`deploy/Caddyfile`).

**Stop.** SIGINT / SIGTERM finish the current tick and exit 0 (after 25 s at
the latest; a transaction dropped mid-flight is harmless, see below). A second
signal exits at once. **Drain** (`KEEPER_DRAIN=1`, then a restart) is the
clean shutdown: no new round opens, the open one is sealed at its close, every
round is finished or refunded and closed (cleanup every tick), then the keeper
exits 0 by itself; the systemd unit does not restart it (`Restart=on-failure`;
under Docker `restart: on-failure:5`, so a configuration error, exit 2, stops
after 5 tries). Stakes whose owner has no quote account stay for the owners
(see step 6), unless `KEEPER_DRAIN_REFUND_ALL=1`.

**Shutdown** (`KEEPER_SHUTDOWN=1`, after `scripts/mainnet-shutdown.ps1` deployed
the wind-down build): the game stops for good. The keeper starts each market's
7-day notice (`start_wind_down`), keeps finishing and refunding rounds during
it (players sell back and take refunds themselves meanwhile), then pays every
entry left out to its owner (`force_exit`: the share sold to the curve at that
moment, or the stake; as SOL straight to the wallet, nothing for the owner to
do and nothing they can block: every market is quoted in wSOL), closes every
round and the market, and exits 0. It works program-wide: every market of the
program is served, given or not, and the entries a market closed by someone
else left behind are closed too (`close_market` is permissionless and does not
count entries; they hold only their owners' rent). It closes finished entries
during the notice as well, every `fullScanEvery` ticks. It puts up ~0.0015 SOL
per `force_exit` for the instruction's length and gets it back; it pays only
transaction fees. Then `scripts/mainnet-recover.ps1` says
`programClosable` and prints `solana program close`.

**Hosting.** `deploy/systemd/ladle-keeper.service` (settings in
`/etc/ladle/keeper.env`, template `deploy/keeper.env.example`), or
`deploy/compose.yaml`; the whole procedure is `docs/LAUNCH.md`.

## Operator tools

* `keeper/src/ops/create-market.ts`: creates a market with every immutable
  setting given explicitly (round length, VRF timeout, max entry, cap, floor,
  name, symbol, metadata URI), checks the metadata URI is live first, refuses
  mainnet without `--yes`, creates the treasury and keeper fee accounts, and
  writes `config/deployments/<cluster>.json` (with the cluster's public RPC,
  never a paid URL).
* `keeper/src/ops/report.ts`: read-only JSON of where the operator's SOL is
  (program rent, buffers, deployer, keeper, wrapped bounty, treasury, rent
  locked in windows). `scripts/mainnet-recover.ps1` prints the commands from it.

## What it does, per market, every tick

0. Once per market: the fee token accounts (platform treasury ATA, the
   keeper's own quote ATA, the host ATA when the market has an integration),
   created idempotently in one transaction, so page transactions carry none.
1. **open_window** when the market has no active window, or as soon as the
   active window is past `Open`. Windows are pipelined: the next one opens
   **in the transaction that seals** the previous one.
2. At `close_slot`, one transaction per round:
   * no entry: **seal + open_window(next) + close_window** (the empty window's
     rent comes straight back), when it is next in the settle order;
   * one entry: **seal** (the program moves it straight to `Drawn`: a lone
     entry takes the whole buy, no randomness is needed, no ORAO request)
     **+ tally_page + settle_page + open_window(next)** when it is next in the
     settle order (otherwise seal + open now, tally + settle later);
   * two or more: **seal + request_vrf(salt) + open_window(next)** (the seal
     seed is derivable the moment entries are closed; the request salts it
     with 32 fresh random bytes, so nobody can use the seed up at ORAO first).
   A bundle that fails is not sent again: the next attempt is **seal** alone,
   then open_window and request_vrf go on their own (an ORAO refusal or a
   stranger's escrow can no longer hold the seal back). Every request_vrf
   attempt has a new salt.
3. Watches the ORAO request account; when fulfilled, **fulfill**, and for up
   to 17 entries **fulfill + tally_page + settle_page in one transaction**.
4. Larger windows: **tally_page** in pages of 20 entries (the finalizing page
   pays the curve, the fees and the bounty into `keeper_quote_account`).
   The Entry accounts are read with `getProgramAccounts` filtered on the
   window and sorted by index (Entry PDAs are `["entry", window, owner]`).
5. **settle_page** in pages of 28.
   Every page transaction requests a measured compute-unit limit
   (`sdk/src/budget.ts`: tally 60,000 + 5,500 per entry, settle 60,000 +
   12,000 per entry); without it a settle page above 16 entries would exceed
   the default 200,000 units.
6. After the VRF timeout with no randomness (requested or not: a request
   that never lands does not hold the refund back): **refund_window**, then
   **refund_entry** (6 per transaction, 5 with a priority fee) for every
   entry **whose owner already has a quote ATA**, with its `close_entry`.
   The keeper never creates that ATA: it would pay ~0.0015 SOL of rent per
   entry, which the owner gets back by closing it, so anyone could drain the
   keeper with many small entries in a round forced to refunds. The other
   owners take their stake back from the app (`PulledClient.refund`: the
   stake and the entry's rent come back as SOL, they pay the fees); the
   keeper looks at those windows again on its full scans only.

Windows are finalized strictly in `market.next_settle_index` order: the
loop walks from the cursor upwards and stops at the first window that still
blocks it. Tally pages that are not the last one run ahead of the cursor;
only the finalizing page waits for it.

## Idempotent by construction

Nothing here needs local state to be safe:

* `open_window`, `seal`, `request_vrf`, `fulfill`, `refund_window` are state
  transitions the program accepts exactly once;
* `tally_page` / `settle_page` follow the program's cursor rule
  (`from == cursor` processes, `to <= cursor` is a no-op success, anything
  else fails), so a replayed or racing page cannot double count;
* `refund_entry` is refused once `entry.refunded`.

Two keepers on the same market only waste a few failed transactions. After a
failure the loop backs off per (window, action): 2 s, 4 s, ... 60 s.

## Bounty economics

On the last `tally_page` of a window the program splits `total` (the
window's stakes):

```
platform = total * 1 %          (PLATFORM_FEE_BPS = 100, hard-coded)
host     = total * host_bps     (0..3 %, fixed at the market's integration)
to_curve = total - platform - host
bounty   = platform * 10 %      (KEEPER_BOUNTY_BPS_OF_PLATFORM_FEE = 1000)
```

`bounty` is **0.1 % of every window's total**, in the quote token (e.g. a
100 SOL window pays 0.1 SOL). For a window that asked ORAO it goes to the
quote ATA of whoever paid ORAO (`window.vrf_payer`, recorded by
`request_vrf`) and only there: finalized with any other `keeper_quote_account`
(a bot racing the keeper to the last page), the bounty goes to the platform
treasury instead, and the window still settles. A one-entry window (no ORAO)
pays it to whichever `keeper_quote_account` the finalizer gives. The
remaining 0.9 % goes to the platform treasury ATA. No other instruction pays
the keeper.

## What the keeper pays

* Transaction fees for every step (5000 lamports base each, plus the
  priority fee, see Settings).
* `open_window`: rent of the Window account and the escrow ATA (~0.0047 SOL;
  only the Window when someone created the escrow first),
  returned by `close_window`: a Settled window at once (the market's active
  one too once finished: the last round of a drain), a Refunding window once
  every stake is back (v22: players sell back from their Entry alone, so
  none of them can hold this rent).
  The keeper closes them on its cleanup pass (every 30 ticks: 1 to 5 minutes
  after the round settles), 6 per transaction, after
  closing the window's already finished entries (rent to their owners).
* `request_vrf` (rounds with 2 or more entries only): the **ORAO fee + the
  request account rent**. Measured on mainnet (research/G2.md): about
  **0.00185 SOL net per request** (0.0005 SOL fee + ~0.00135 SOL rent that is
  not refunded). A one-entry round costs one transaction (5,000 lamports).
  Per-round totals by entry count: `docs/DEPLOY.md`. A request that
  **times out** (no fulfilment inside `vrf_timeout_slots`) loses about
  **0.005 SOL** in total for that window and earns no bounty (refunded
  windows take no fee).
* `refund_entry`: transaction fees only (it refunds owners who already have
  a quote ATA, never creating one).

Rule of thumb: the bounty covers costs once rounds with 2+ entries average
more than ~1.86 SOL of stakes (one-entry rounds: ~0.006 SOL); below that,
running a keeper is a service, not a business. The program's 0.1 SOL
minimum stake keeps dust entries from forcing draws: a round that asks ORAO
is at least 0.2 SOL, whose 1 % platform fee covers the draw, but the keeper's
own float gets only the bounty and is refilled from the treasury.

## Timing (measured, research/G6.md and G2.md)

1 slot is about 217 ms on mainnet (2026-10-23; 213 ms measured 2026-10-28,
239 ms on devnet). The launch settings are `window_slots = 560` (~2 min) and
`vrf_timeout_slots = 900` (~3.2 min); the earlier suggestion was 92 (~20 s).
ORAO request -> value on mainnet (n = 314): median 4 s, p90 72 s, p99 113 s,
max 158 s, so a 900-slot timeout leaves margin above the observed maximum.
The tick is 2 s while something is pending and 10 s while only the open
window waits (it shortens again just before the close slot), about 4x fewer
RPC calls over a 2-minute round.
