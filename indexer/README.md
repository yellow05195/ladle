# @pulled/indexer

Trade-volume indexer for a PULLED token that counts **AMM-level** legs only.

## The rule

Volume is what pools execute, not what routers announce. A Jupiter `route`
instruction that swaps A -> B -> C through Raydium and Orca is one aggregator
instruction wrapping two pool swaps; counting the route **and** its legs
doubles the number, counting routes only hides which pool traded. So:

* an **aggregator** top-level instruction (Jupiter v6/v4/v3, DCA, limit
  orders - `AGGREGATOR_PROGRAMS` in `src/parse.ts`) is never a leg;
* each **pool program** swap (Raydium AMM v4 / CLMM / CPMM, Orca Whirlpool,
  Meteora DLMM / dynamic AMM / DAMM v2 - `AMM_PROGRAMS`) is one leg, whether it
  is a top-level instruction (`innerIndex = -1`) or a CPI inside a route
  (`innerIndex = j` within the outer instruction's inner group);
* the PULLED program's own curve is the AMM of a PULLED token before any
  listing: its `Sold`, `SoldBack` and `WindowTallied` events are legs;
* legs are keyed by **(signature, outerIndex, innerIndex)**. A route that
  touches the same pool twice yields two legs with different inner indices,
  both counted; the same transaction ingested twice yields the same keys and
  is counted once (`src/dedupe.ts`).

The amount of a leg is the largest single transfer of the tracked mint among
the SPL Token transfers that follow the swap CPI (the token moves exactly
once per leg, in or out of the pool; a fee transfer of the same mint is not
added on top). Token accounts are mapped to mints with
`preTokenBalances` / `postTokenBalances`, so plain `transfer` works as well
as `transferChecked`.

### Units

AMM legs are in base units of the tracked mint. PULLED curve legs are in
**quote** base units (`quote_out`, `to_curve`), because that is what the
events carry. Totals are kept per program (`programs()`) and per pool
(`pools()`); never add the two families together without converting.

## Use

```ts
import { VolumeIndexer, indexSignatures } from "@pulled/indexer";

const idx = new VolumeIndexer(MINT);
await indexSignatures(connection, idx, signatures);   // getParsedTransactions, 20 per call
idx.pools();      // [{ program, programName, pool, volume, legs }]
idx.programs();   // { "raydium-amm-v4": 123n, "orca-whirlpool": 45n, "pulled-curve": 6n }
```

or feed `idx.ingest(parsedTx)` from your own stream (websocket, backfill,
Geyser): the deduper makes overlapping sources safe.

CLI:

```
node --experimental-strip-types indexer/src/index.ts --rpc <url> --mint <mint> [--limit 200] [--address <pool> ...]
```

## Test

```
node --test "indexer/test/**/*.test.ts"
```

`test/multihop.test.ts` ingests a **synthetic** parsed transaction modelled
on a Jupiter v6 `route` with inner Raydium + Orca swaps where the route is
A -> B -> C -> B and the Raydium pool is touched twice, and asserts: three
legs, keys distinct, the route instruction never counted, re-ingestion adds
nothing, per-pool totals equal per-leg sums. The layout follows the real
mainnet multi-hop
`52Vrdcyxp9TsfWByYdJ6nrufSBNi17oX6EmkftVcLd9YV2o4A86n8ZQCQpkvm68UyFX5eKUFfAm9PqPk5Pa7ZhXa`
(USDC -> ORE via Jupiter v6 with Orca Whirlpool + Meteora DLMM inner swaps,
cited by the Helius "explore transactions" docs); that transaction was not
fetched from this machine, so account keys and amounts in the fixture are
invented.
