# @pulled/sdk

Client for the PULLED program: PDAs, account decoders, instruction builders,
event parser, live watcher, off-chain verifier and an embeddable React
component. No IDL file is needed: everything is written against the Rust
source (`programs/pulled/src`). Dependencies: `@solana/web3.js`,
`@solana/spl-token`, `@noble/hashes`. React is an optional peer.

The law itself (`@pulled/sdk/law`) is the canonical off-chain twin of
`law.rs`: exact BigInt arithmetic, no floats.

## Install

```
pnpm add @pulled/sdk @solana/web3.js
```

TypeScript projects: the package ships `.ts` sources with `.ts` extension
imports (Node 24 runs them natively). Set `allowImportingTsExtensions: true`
with `noEmit: true` in your tsconfig, or let your bundler transpile it
(Next.js: `transpilePackages: ["@pulled/sdk"]`).

## Quickstart (5 lines)

```ts
import { PulledClient, marketPda, WindowState } from "@pulled/sdk";
import { PublicKey } from "@solana/web3.js";

const client = PulledClient.readOnly("https://api.mainnet-beta.solana.com");
const [market] = marketPda(new PublicKey(MINT));                    // 1. open the market
const stop = client.watch(market, (s) => render(s.window, s.entries, s.slot)); // 2. watch the live window
const tx = await client.enter({ market, amount: 250_000_000n, owner: wallet.publicKey }); // 3. enter 0.25 SOL (minimum MIN_ENTRY_AMOUNT = 0.1 SOL; sign + send with your wallet)
// 4. reveal: the watcher's state moves Open -> Sealed -> Drawn (window.seed) -> Tallied (entry.roll) -> Settled (entry.share)
const back = await client.sellBack({ entry: myEntry.pubkey, owner: wallet.publicKey }); // 5. sell back (exact quote: client.quoteSellBack)
// a round that will not be drawn (PulledClient.entryRefundable): the stake and the entry's rent back as SOL
const refund = await client.refund({ entry: myEntry.pubkey, owner: wallet.publicKey });
```

Every write method returns an unsigned `Transaction` with the fee payer and a
recent blockhash set; sign it with any wallet (`signTransaction`) and send it
with your own connection. The SDK never holds a key.

## What is in the box

| Module | Use |
|---|---|
| `pda.ts` | `marketPda`, `windowPda`, `entryPda(window, owner)` (`["entry", window, owner]`: one entry per wallet per window, independent of arrival order), `integrationPda`, vault / escrow / platform ATAs, ORAO `network_state` and request PDAs, `deriveVrfSeed` (the seal seed: exactly `sha256("ladle:vrf:v1" ‖ window ‖ close_slot LE ‖ entry_count LE ‖ entries_commitment)`), `deriveRequestSeed(sealSeed, salt)` (what `request_vrf(salt)` asks ORAO for: `sha256("ladle:vrf:req" ‖ seal seed ‖ salt)`), `newVrfSalt`, `vrfRequestFor`, `MIN_ENTRY_AMOUNT`, `foldEntryCommitment`, measured defaults (`DEFAULT_WINDOW_SLOTS = 92`, `DEFAULT_VRF_TIMEOUT_SLOTS = 900`, `ESTIMATED_MS_PER_SLOT = 217`). |
| `accounts.ts` | Borsh decoders `decodeMarket` / `decodeWindow` / `decodeEntry` / `decodeIntegration`, `ACCOUNT_SIZES`, ORAO randomness parser. |
| `instructions.ts` | One builder per instruction (16), exact account order, `Option` accounts as the program id; `tally_page` / `settle_page` take the page's Entry addresses in index order (`PulledClient.getPageEntries`). |
| `budget.ts` | Measured compute units (LiteSVM, `tests/cu-bench`), the limits to request per page, and the page sizes that fit a legacy transaction (`TALLY_PAGE_LEGACY = 20`, `SETTLE_PAGE_LEGACY = 28`, `ONE_TX_SETTLE_MAX = 17`, checked by serialising the worst case). |
| `events.ts` | `parseEventsFromLogs(logs)`: the 13 Anchor events, attributed to the program on top of the invoke stack. |
| `client.ts` | `PulledClient`: reads (`getMarket`, `getWindow`, `getEntries`, `getLiveWindow`, `getWindows`, `getEntriesByOwner`), writes (`enter`, `sellBack` and `sell`, bound by `minQuoteOut`: 1 % under the quote by default), `quoteSellBack`, the shutdown helpers (`startWindDownInstructions`, `forceExitInstructions` (wSOL markets: every market since the final review), `closeMarketInstructions`, `noticeEnd`, `isMarketClosable`, and the program-wide scans `getAllMarkets`, `getAllEntries`, `getAccountKeys`; wind-down build only, no `claim` since v25), `checkEnter`, `watch`, `verifyWindow`, keeper-side instruction helpers. |
| `verify.ts` | Pure recomputation of every roll and share from public data (`law.ts`) with per-entry match flags. The browser "recompute" button calls `client.verifyWindow(window)`. |
| `errors.ts` | `PulledError` names and codes in program order, `parseProgramError(err)`, `PULLED_ERROR_MESSAGES` (the program carries no sentences, to save deploy rent) and `describeError(err)`. |
| `react/index.tsx` | `<PullWindow />`. |

### Read-only mode

`PulledClient.readOnly(rpcUrl)` or `new PulledClient({ connection })` - there
is no wallet concept in the client at all. Everything that reads
(`getMarket`, `watch`, `verifyWindow`, `quoteSellBack`...) works with nothing
else. The component takes `readOnly` to hide the write actions.

### Verify a window

```ts
const v = await client.verifyWindow(windowPubkey);
v.ok;                      // true when every roll, every share, roll_sum, fees and sum(shares) == tokens_out match
v.entries[i].rollMatch;    // deriveRoll(window.seed, owner, index) == entry.roll
v.entries[i].shareMatch;   // computeShares(tokens_out, weights) == entry.share
```

## The embeddable component

```tsx
import { PullWindow } from "@pulled/sdk/react";

<PullWindow
  mint="..."                 // launched token mint; the market PDA is derived
  rpc="https://..."          // HTTP RPC (websocket derived; or pass wsRpc)
  lang="en"                  // "en" | "fr"
  host="..."                 // optional, attribution only
  publicKey={wallet.publicKey}             // wallet-adapter compatible
  signTransaction={wallet.signTransaction} // omit both (or set readOnly) for a read-only view
/>
```

Self-contained: one scoped stylesheet injected once, no Tailwind, no reliance
on the host's CSS, light theme, two accent colours (mine / others), no emoji,
no sound, no confetti. It shows the live window (entries arriving, countdown
in slots with a seconds estimate), the three-beat reveal (closed -> seed
landed -> your roll, then your share), "Sell back now for X" with the exact
`curveSell` quote, the smallest and largest result of the window at identical
size and colour, and the sentence shown before every draw: *"The sum is
conserved. So for someone to take more, someone takes less. That someone can
be you."*

### iframe embed

The app serves the same component without site chrome at
`/embed/<mint>` with `Content-Security-Policy: frame-ancestors *`:

```html
<iframe src="https://pulled.fun/embed/<MINT>?lang=fr" width="420" height="640" style="border:0"></iframe>
```

## Host fee share (integrations)

A host (another app embedding PULLED) creates an `Integration` once:

```ts
import { createIntegrationIx, integrationPda } from "@pulled/sdk";
const [integration] = integrationPda(host.publicKey);
tx.add(createIntegrationIx({ host: host.publicKey, integration }, 200)); // 200 bps = 2 %
```

* `host_fee_bps <= 300` (3 %), **immutable**: there is no instruction that
  edits or closes an Integration.
* A market created with this `integration` pays `total * host_fee_bps / 10000`
  of every window to the host's associated token account for the quote mint,
  automatically, at every settlement (last `tally_page`). The host does
  nothing; the keeper passes the host ATA (created idempotently if missing).
* The platform fee is a fixed 1 % on top; 10 % of it is the keeper bounty,
  paid to the quote ATA of whoever paid the window's ORAO request
  (`window.vrfPayer`), or to the finalizer when the window needed no draw.
  Everything else goes to the curve.

## Slots and seconds

The program counts **slots**, never wall-clock time. The seconds shown next to
a countdown are an estimate: `ESTIMATED_MS_PER_SLOT = 217` ms, measured on
mainnet-beta on 2026-10-23 (`research/G6.md`: 216.6 ms over the 200 ms-target
regime, 212 ms after Alpenglow; the previous regime ran at 268 ms). It drifts
with the network; never derive anything but a display estimate from it.

## Running the offline tests

```
node --test "sdk/test/**/*.test.ts"
```
