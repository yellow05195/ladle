/**
 * @pulled/indexer - AMM-level volume for a PULLED token.
 *
 * Library: `VolumeIndexer` (ingest parsed transactions, read totals).
 * CLI:     node --experimental-strip-types indexer/src/index.ts --rpc <url> --mint <mint> [--limit 200]
 *          scans the recent signatures of the PULLED market and of the
 *          tracked mint's token accounts is left to the operator (pass
 *          `--address` to add program/pool addresses to scan).
 */
import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { marketPda } from "@pulled/sdk";
import { Deduper, type PoolTotal } from "./dedupe.ts";
import { extractLegs, type ParsedTx, type VolumeLeg } from "./parse.ts";

export { AGGREGATOR_PROGRAMS, AMM_PROGRAMS, extractLegs, legKey, type ParsedTx, type VolumeLeg } from "./parse.ts";
export { Deduper, type PoolTotal } from "./dedupe.ts";

export class VolumeIndexer {
  readonly mint: string;
  readonly dedupe = new Deduper();
  constructor(mint: string | PublicKey) { this.mint = typeof mint === "string" ? mint : mint.toBase58(); }

  /** Ingest one parsed transaction. Returns the legs that were new. */
  ingest(tx: ParsedTx | ParsedTransactionWithMeta): VolumeLeg[] {
    return this.dedupe.add(extractLegs(tx as ParsedTx, this.mint));
  }

  ingestAll(txs: readonly (ParsedTx | ParsedTransactionWithMeta | null)[]): VolumeLeg[] {
    const out: VolumeLeg[] = [];
    for (const tx of txs) if (tx) out.push(...this.ingest(tx));
    return out;
  }

  pools(): PoolTotal[] { return this.dedupe.pools(); }
  programs(): Record<string, bigint> { return this.dedupe.programs(); }
}

/** Fetch and ingest the transactions of `signatures` (jsonParsed, 20 per RPC call). */
export async function indexSignatures(connection: Connection, indexer: VolumeIndexer, signatures: string[]): Promise<VolumeLeg[]> {
  const out: VolumeLeg[] = [];
  for (let i = 0; i < signatures.length; i += 20) {
    const txs = await connection.getParsedTransactions(signatures.slice(i, i + 20), { maxSupportedTransactionVersion: 0 });
    out.push(...indexer.ingestAll(txs));
  }
  return out;
}

/* --------------------------------- CLI --------------------------------- */

async function main() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const rpc = get("--rpc") ?? process.env.RPC_URL;
  const mint = get("--mint");
  const limit = Number(get("--limit") ?? 200);
  const extra = argv.flatMap((a, i) => (a === "--address" ? [argv[i + 1]!] : []));
  if (!rpc || !mint) { process.stderr.write("usage: --rpc <url> --mint <mint> [--limit n] [--address <pool or program> ...]\n"); process.exit(2); }

  const connection = new Connection(rpc, "confirmed");
  const indexer = new VolumeIndexer(mint);
  const addresses = [marketPda(new PublicKey(mint))[0], ...extra.map((a) => new PublicKey(a))];
  for (const a of addresses) {
    const sigs = await connection.getSignaturesForAddress(a, { limit });
    await indexSignatures(connection, indexer, sigs.filter((s) => !s.err).map((s) => s.signature));
  }
  const pools = indexer.pools().map((p) => ({ ...p, volume: p.volume.toString() }));
  const programs = Object.fromEntries(Object.entries(indexer.programs()).map(([k, v]) => [k, v.toString()]));
  process.stdout.write(JSON.stringify({ mint, legs: indexer.dedupe.legCount, programs, pools }, null, 2) + "\n");
}

const isMain = typeof process !== "undefined" && process.argv[1] && /indexer[\\/]src[\\/]index\.ts$/.test(process.argv[1]);
if (isMain) main().catch((e) => { process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n"); process.exit(1); });
