/**
 * Shared plumbing of the one-shot operator tools in keeper/src/ops/
 * (create-market, report): flags, cluster check, keypair loading, the
 * deployment file, a priced send.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type Signer,
  type TransactionInstruction,
} from "@solana/web3.js";
import { MAX_TX_COMPUTE_UNITS, computeUnitLimitIx } from "@pulled/sdk";
import { CLUSTERS, ConfigError, checkCluster, expandHome, keypairFileProblem, scrubSecrets, type Cluster } from "../config.ts";
import { computeUnitPriceIx, limitFromSimulation } from "../fees.ts";

export type Flags = Map<string, string | true>;

/** `--name value` pairs and bare `--switch`es; `known` lists the switches that take no value. */
export function parseFlags(argv: readonly string[], switches: readonly string[]): Flags {
  const out: Flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (!k.startsWith("--")) throw new ConfigError([`unexpected argument ${k}`]);
    if (switches.includes(k)) { out.set(k, true); continue; }
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) throw new ConfigError([`${k} needs a value`]);
    out.set(k, v);
  }
  return out;
}

export function str(f: Flags, name: string, fallback?: string): string {
  const v = f.get(name);
  if (typeof v === "string") return v;
  if (fallback !== undefined) return fallback;
  throw new ConfigError([`${name} is required`]);
}

export function cluster(f: Flags): Cluster {
  const c = str(f, "--cluster");
  if (!(CLUSTERS as readonly string[]).includes(c)) throw new ConfigError([`unknown cluster "${c}" (${CLUSTERS.join(" | ")})`]);
  return c as Cluster;
}

/** Connection to `--rpc`, refused when it serves another cluster than `--cluster`. */
export async function connect(f: Flags, c: Cluster): Promise<Connection> {
  const connection = new Connection(str(f, "--rpc"), "confirmed");
  await checkCluster(connection, c);
  return connection;
}

export function loadKeypair(path: string): Keypair {
  const problem = keypairFileProblem(path, (p) => readFileSync(p, "utf8"));
  if (problem) throw new ConfigError([problem]);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(expandHome(path), "utf8"))));
}

export function pubkey(s: string, what: string): PublicKey {
  try { return new PublicKey(s); } catch { throw new ConfigError([`${what} is not a base58 address: ${s}`]); }
}

/** Public endpoint of a cluster: what deployment files record (a paid RPC URL carries a key). */
export const PUBLIC_RPC_URL: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

/**
 * Send with a compute-unit price: simulate under the maximum limit, ask for
 * what was used plus a margin, price it, send, confirm.
 */
export async function sendPriced(connection: Connection, ixs: TransactionInstruction[], signers: Signer[], microLamports: number): Promise<string> {
  const payer = signers[0]!.publicKey;
  const probe = new Transaction({ feePayer: payer }).add(computeUnitLimitIx(MAX_TX_COMPUTE_UNITS), ...ixs);
  const sim = await connection.simulateTransaction(probe, signers);
  if (sim.value.err) throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).slice(-8).join("\n")}`);
  const budget = [computeUnitLimitIx(limitFromSimulation(sim.value.unitsConsumed ?? 200_000))];
  if (microLamports > 0) budget.push(computeUnitPriceIx(microLamports));
  return sendAndConfirmTransaction(connection, new Transaction().add(...budget, ...ixs), signers, { commitment: "confirmed" });
}

/** True when the module at `metaUrl` is the script node was started with (not an import, e.g. from a test). */
export function isEntry(metaUrl: string): boolean {
  if (!process.argv[1]) return false;
  const norm = (p: string) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  return norm(process.argv[1]) === norm(fileURLToPath(metaUrl));
}

/** Run an ops `main`: configuration problems exit 2, anything else 1. The message never carries a URL whole (an RPC key). */
export function runMain(main: () => Promise<void>): void {
  main().catch((e) => {
    console.error(scrubSecrets(e instanceof Error ? e.message : String(e)));
    // exitCode, not exit(): let open sockets close first (process.exit can trip libuv on Windows)
    process.exitCode = e instanceof ConfigError ? 2 : 1;
  });
}
