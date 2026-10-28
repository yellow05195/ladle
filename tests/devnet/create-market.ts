/**
 * Create the Ladle market on a cluster and record it in
 * config/deployments/<cluster>.json (read by the app and the keeper).
 *
 *   cd tests
 *   node --experimental-strip-types devnet/create-market.ts \
 *     --rpc https://api.devnet.solana.com \
 *     --keypair %USERPROFILE%/.config/solana/pulled-devnet-deployer.json \
 *     --cluster devnet
 *
 * The quote is native SOL (the wSOL mint, classic SPL Token): players pay and
 * get paid in SOL, the SDK wraps and unwraps inside each transaction.
 * Idempotent: if the deployment file already names a market that exists on
 * chain, nothing is created.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  DEFAULT_VRF_TIMEOUT_SLOTS,
  DEFAULT_WINDOW_SLOTS,
  PULLED_PROGRAM_ID,
  createMarketIx,
  marketPda,
  quoteVaultAta,
  tokenVaultAta,
  type CreateMarketParams,
} from "@pulled/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

const rpc = arg("rpc", "https://api.devnet.solana.com");
const cluster = arg("cluster", "devnet");
const keypairPath = arg("keypair").replace(/^~/, homedir()).replace(/^%USERPROFILE%/i, homedir());
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))));
const connection = new Connection(rpc, "confirmed");
const outFile = resolve(root, "config", "deployments", `${cluster}.json`);

const LAMPORTS_PER_SOL = 1_000_000_000n;
const params: CreateMarketParams = {
  windowSlots: DEFAULT_WINDOW_SLOTS, //  92 slots ≈ 20 s (research/G6.md)
  vrfTimeoutSlots: DEFAULT_VRF_TIMEOUT_SLOTS, // 900 slots ≈ 3.3 min (research/G2.md)
  maxEntryAmount: 5n * LAMPORTS_PER_SOL, // one entry stakes at most 5 SOL
  maxEntryBps: 2_000, // 20 % of the round at entry time (research/G4.md)
  entryFloorAmount: LAMPORTS_PER_SOL / 2n, // the cap applies once the round passes 0.5 SOL
  name: "Ladle",
  symbol: "LADLE",
  uri: "https://useladle.fun/token.json",
};

async function main() {
  if (existsSync(outFile)) {
    const prev = JSON.parse(readFileSync(outFile, "utf8"));
    if (prev.market && (await connection.getAccountInfo(new PublicKey(prev.market)))) {
      console.log(`market already exists: ${prev.market} (${outFile})`);
      return;
    }
  }
  const programInfo = await connection.getAccountInfo(PULLED_PROGRAM_ID);
  if (!programInfo?.executable) throw new Error(`program ${PULLED_PROGRAM_ID.toBase58()} is not deployed on ${rpc}`);

  const tokenMint = Keypair.generate();
  const [market] = marketPda(tokenMint.publicKey);
  const ix = createMarketIx({
    creator: payer.publicKey,
    tokenMint: tokenMint.publicKey,
    quoteMint: NATIVE_MINT,
    market,
    tokenVault: tokenVaultAta(market, tokenMint.publicKey),
    quoteVault: quoteVaultAta(market, NATIVE_MINT, TOKEN_PROGRAM_ID),
    integration: null,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  }, params);
  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer, tokenMint], { commitment: "confirmed" });

  const deployment = {
    cluster,
    rpc,
    programId: PULLED_PROGRAM_ID.toBase58(),
    market: market.toBase58(),
    tokenMint: tokenMint.publicKey.toBase58(),
    quoteMint: NATIVE_MINT.toBase58(),
    quoteDecimals: 9,
    createdBy: payer.publicKey.toBase58(),
    createdAt: new Date().toISOString(),
    signature: sig,
    params: { ...params, windowSlots: String(params.windowSlots), vrfTimeoutSlots: String(params.vrfTimeoutSlots), maxEntryAmount: String(params.maxEntryAmount), entryFloorAmount: String(params.entryFloorAmount) },
  };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`market created: ${market.toBase58()}\n  token mint ${tokenMint.publicKey.toBase58()}\n  tx ${sig}\n  written to ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
