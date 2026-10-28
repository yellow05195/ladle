# Anchor test suite (devnet, real ORAO)

**NOT RUN YET.** The program now builds for SBF on this machine
(`docs/DEPLOY.md`), its IDL matches the SDK (`pnpm test:idl-sdk`), and every
file below type-checks, but the suite needs a funded devnet wallet and has
not been executed. The first run on a real cluster may surface runtime
issues (timeouts, devnet rate limits, ORAO latency).

## Why devnet and not localnet

`fulfill` needs the ORAO VRF program **and** an ORAO fulfiller node that
answers requests. The program can be cloned into a local validator
(`[test.validator] clone = [{ address = "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y" }]`
plus the `orao-vrf-network-configuration` PDA and its treasury), but no
fulfiller watches a local validator, so every window would time out and only
the refund path could be exercised. The program deliberately has no
`test-vrf` feature or mock seed path (that would be an authority), so the
suite runs on **devnet** against the real ORAO deployment
(`Anchor.toml` already says `cluster = "devnet"`).

## Requirements

* Linux or macOS. Install Agave (Solana CLI) and Anchor CLI 1.2.0:
  ```
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 1.2.0 && avm use 1.2.0
  ```
* Node 24 and pnpm (`corepack enable`).
* A devnet wallet with **at least 8 SOL** at `~/.config/solana/id.json`
  (`solana-keygen new`, then `solana airdrop 2 -u devnet` several times, or a
  faucet). What the suite spends:
  * market creation fee: 0.05 SOL per market (about 10 markets are created);
  * ORAO request: 0.0003 SOL fee on devnet + request account rent (~0.00135 SOL)
    per window with 2+ entries (one-entry windows need no request); test 1
    alone requests up to 50 times;
  * rents: Window (411 bytes) + escrow ATA + one Entry (110 bytes) per wallet
    and window;
  * one entry per wallet per window, so tests 8, 9 and 16 fund many ephemeral
    wallets (`crowd()`: 0.002 SOL each for the Entry rent, plus a quote ATA paid
    by the test wallet, ~0.0035 SOL per wallet in all; 590 wallets, ~2.1 SOL);
  * SOL forwarded to the other ephemeral participants (0.02 SOL each, not recovered).
* Replace the placeholder program id before deploying (`lib.rs`,
  `Anchor.toml`, `sdk/src/pda.ts` `PULLED_PROGRAM_ID`) and the placeholder
  `PLATFORM_TREASURY` (`consts.rs`, `sdk/src/pda.ts`).

## Commands

```
pnpm install
anchor build                      # programs/pulled -> target/deploy, target/idl
anchor deploy --provider.cluster devnet
anchor test --skip-build --skip-deploy --provider.cluster devnet
```

`anchor test` runs `[scripts] test` from `Anchor.toml`:
`pnpm test:all && pnpm test:anchor`. The offline gates run first (forbidden
words, 10k-window property test, IDL/source authority check, SDK codec tests,
indexer multi-hop test), then mocha over `tests/anchor/*.test.ts` with
`ANCHOR_PROVIDER_URL` / `ANCHOR_WALLET` exported by Anchor. To run the mocha
part alone against devnet:

```
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
  pnpm --filter @pulled/tests test:anchor
```

or one file:

```
cd tests && ANCHOR_PROVIDER_URL=... ANCHOR_WALLET=... \
  npx mocha --node-option=experimental-strip-types --timeout 1800000 anchor/10-single-player.test.ts
```

No `@coral-xyz/anchor` dependency: the suite builds every instruction with
`@pulled/sdk` from the Rust layouts (no IDL needed) and asserts program
errors by their Anchor code (`sdk/src/errors.ts`).

## The 16 tests

| # | File | What it proves | Needs ORAO |
|---|---|---|---|
| 1 | `01-sum-conserved` | 50 windows: `sum(share) == tokens_out`, `to_curve + fees == total`, escrow empty, vault delta exact, off-chain recompute matches | yes (50 requests) |
| 2 | `02-sim` | **skipped** - statistical fairness is the Monte Carlo gate (`pnpm sim:g3`, `tests/props`) | - |
| 3 | `03-bias` | participant grinding (seed = hash of the final entry set), creator re-ordering (indices by arrival), keeper withholding fulfil (anyone fulfils; `MustFulfill` after timeout), leader aborting (double request, foreign request account, seal twice, early refund all refused) | yes |
| 4 | `04-request-vrf-open` | `request_vrf` while Open -> `WrongWindowState` | no |
| 5 | `05-no-withdrawal-after-seal` | `refund_entry` / `refund_window` refused in Sealed, Drawn, Tallied, Settled; stake leaves escrow only at finalize | yes |
| 6 | `06-refund-timeout` | silent VRF: refund refused before `sealed_slot + timeout`, passes after from an unrelated key; full stake back; `AlreadyRefunded` | no |
| 7 | `07-exit-paths` | claim / sell_back signed by the owner only, refund_entry by nobody; sell_back pays exactly `curveSell` | yes |
| 8 | `08-pagination-500` | 500 wallets, tally pages of 20 and settle pages of 28 (the largest legacy transactions), replay = no-op, skip/overlap refused, a page with a substituted entry refused (`InvalidEntryPda`), idempotent to the end | yes |
| 9 | `09-same-slot-bundle` | 30 wallets in ten 3-wallet bundles sent at once (all land, indices 0..29 once each) under a 5 % cap with a floor; a bundle breaking the cap fails atomically; a second entry from one wallet is `AlreadyEntered` | no |
| 10 | `10-single-player` | one entry: no ORAO request, zero seed, `share == tokens_out == curveBuy(to_curve)`, no refund path | no |
| 11 | `11-zero-weight` | `enter(0)` refused; `cum_weight == ROLL_MAX * A^2 > 0` on chain | yes |
| 12 | `12-idl-no-admin` | runs `tests/idl-authority.ts` (source always, IDL when `target/idl/pulled.json` exists) | no |
| 13 | `13-forbidden-words` | runs `tests/forbidden-words.ts` | no |
| 14 | `14-token2022-rejected` | TransferFeeConfig / TransferHook / PermanentDelegate / freeze authority each rejected with its own error; clean Token-2022 accepted | no |
| 15 | `15-rent-recovery` | an empty window closes once it is not the active one (rent to the opener, even when a stranger sends it); entries close only when claimed / sold back / refunded, the claim and full sell-back close them in the same transaction; the window closes only when every entry is closed | yes |
| 16 | `16-crowd-50` | 50 wallets build `enter` from the same snapshot of the window and send at once: all 50 land (indices 0..49), `AlreadyEntered` on a second try, the round settles with keeper-sized pages and verifies | yes |

Timing: tests 3 and 6 wait for a 150-slot timeout (~33 s each at 217
ms/slot); test 1 runs 50 windows of 25 slots (~25-40 min with ORAO latency);
test 8 sends ~125 entry transactions and ~280 funding transactions. Test 16
sends 50 transactions at once: a rate-limited public RPC may refuse some of
them (a failure of the RPC, not of the program); use a private devnet RPC. The mocha timeout is 30 min per test.
