# @pulled/keeper

A permissionless, bountied keeper for PULLED markets. Anyone can run one; a
dead keeper only delays a window, it never blocks anything (every step is
callable by anyone, and users keep `claim`, `sell_back` and refunds whatever
the keeper does).

```
node --experimental-strip-types keeper/src/index.ts \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json \
  --market <MARKET_PDA or TOKEN_MINT> [--market ...] \
  [--dry-run] [--interval 2000] [--page 28] [--once]
```

`--dry-run` builds and simulates every transaction and sends nothing.
`--once` runs a single tick (cron-friendly). `--page` only lowers the page
sizes (default: 20 entries per `tally_page`, 28 per `settle_page`, the largest
that fit a legacy transaction). Logs are JSON lines:
`{"ts","level","market","window","index","action","sig","msg","err"}`.

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
   * two or more: **seal + request_vrf + open_window(next)** (the seed is
     derivable the moment entries are closed).
3. Watches the ORAO request account; when fulfilled, **fulfill**, and for up
   to 17 entries **fulfill + tally_page + settle_page in one transaction**.
4. Larger windows: **tally_page** in pages of 20 entries (the finalizing page
   pays the curve, the fees and the bounty into `keeper_quote_account`).
   The Entry accounts are read with `getProgramAccounts` filtered on the
   window and sorted by index (Entry PDAs are `["entry", window, owner]`).
5. **settle_page** in pages of 28.
   Every page transaction requests a measured compute-unit limit
   (`sdk/src/budget.ts`: tally 60,000 + 5,000 per entry, settle 60,000 +
   12,000 per entry); without it a settle page above 16 entries would exceed
   the default 200,000 units.
6. After the VRF timeout with no randomness: **refund_window**, then
   **refund_entry** for every entry (6 per transaction) into each owner's
   quote ATA (created idempotently; the keeper pays that rent).

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

`bounty` is paid to `keeper_quote_account`, chosen by whoever pays the
finalizing page: **0.1 % of every window's total**, in the quote token
(e.g. a 100 SOL window pays 0.1 SOL to the finalizer). The remaining 0.9 %
goes to the platform treasury ATA. No other instruction pays the keeper.

## What the keeper pays

* Transaction fees for every step (5000 lamports base each, plus priority
  fees if you add them).
* `open_window`: rent of the Window account (411 bytes) and the escrow ATA,
  0.00274 + 0.00149 SOL, returned by `close_window` once every entry of the
  window is closed (the keeper closes finished windows, 6 per transaction).
* `request_vrf` (rounds with 2 or more entries only): the **ORAO fee + the
  request account rent**. Measured on mainnet (research/G2.md): about
  **0.00185 SOL net per request** (0.0005 SOL fee + ~0.00135 SOL rent that is
  not refunded). A one-entry round costs one transaction (5,000 lamports).
  Per-round totals by entry count: `docs/DEPLOY.md`. A request that
  **times out** (no fulfilment inside `vrf_timeout_slots`) loses about
  **0.005 SOL** in total for that window and earns no bounty (refunded
  windows take no fee).
* `refund_entry`: rent of a recipient ATA when the owner has none.

Rule of thumb: the bounty covers costs once rounds with 2+ entries average
more than ~1.86 SOL of stakes (one-entry rounds: ~0.006 SOL); below that,
running a keeper is a service, not a business.

## Timing (measured, research/G6.md and G2.md)

1 slot is about 217 ms on mainnet (2026-10-23). The suggested market
parameters are `window_slots = 92` (~20 s) and `vrf_timeout_slots = 900`
(~3.3 min). ORAO request -> value on mainnet (n = 314): median 4 s,
p90 72 s, p99 113 s, max 158 s, so a 900-slot timeout leaves margin above the
observed maximum. The default tick is 2 s.
