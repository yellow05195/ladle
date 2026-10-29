#!/usr/bin/env -S node --experimental-strip-types
/**
 * Create a Ladle market with explicit settings, then the fee token accounts
 * the finalizing page pays into, and record it in
 * config/deployments/<cluster>.json (read by the keeper and the scripts).
 *
 *   node --experimental-strip-types keeper/src/ops/create-market.ts \
 *     --cluster devnet --rpc https://api.devnet.solana.com \
 *     --keypair %USERPROFILE%/.config/solana/pulled-devnet-deployer.json \
 *     --window-slots 560 --vrf-timeout-slots 900 --max-entry-sol 5 --max-entry-bps 2000 \
 *     --entry-floor-sol 0.5 --name Ladle --symbol LADLE --uri https://useladle.fun/token.json \
 *     [--treasury <key the program was built with>] [--keeper <keeper address>] [--cu-price 20000]
 *     [--plan] [--yes] [--skip-uri-check] [--program <id>] [--out <deployment file>]
 *
 * `--program` (devnet only): another deployment of the program, a shutdown
 * rehearsal build (`--features rehearsal`, its own program id); with
 * `--out` so the long-lived devnet record stays as it is.
 *
 * Every setting is fixed forever once the market exists: there is no admin
 * and no `set_*` instruction. `--plan` prints the settings, the measured
 * round duration and the cost, and sends nothing. Nothing is sent on
 * mainnet-beta without `--yes` (scripts/mainnet-up.ps1 asks first). The quote is native SOL (the
 * wSOL mint, classic SPL Token). Idempotent: when the deployment file names
 * a market that exists, nothing is created (the fee accounts are still
 * ensured, except with `--plan`, or on mainnet-beta without `--yes`: it then
 * prints "market already exists" and sends nothing); when it names one the cluster does not have (a stale file, a
 * lagging RPC), it stops instead of creating another. Before sending, the
 * new market's address goes to `<file>.pending.json`: a creation whose
 * confirmation was lost is found again on the next run (never a second
 * market). The file records the cluster's public RPC, never the `--rpc`
 * given here (paid URLs carry a key), and the treasury.
 *
 * The treasury is `--treasury`, else `LADLE_TREASURY` (the variable the
 * program was built with), else the devnet default; mainnet-beta has no
 * default. A different key than the build's fails on chain, moving nothing.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey, type Connection, type TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import {
  ACCOUNT_SIZES,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ESTIMATED_MS_PER_SLOT,
  MARKET_CREATION_FEE_LAMPORTS,
  MAX_VRF_TIMEOUT_SLOTS,
  MAX_WINDOW_SLOTS,
  MIN_ENTRY_AMOUNT,
  MIN_VRF_TIMEOUT_SLOTS,
  MIN_WINDOW_SLOTS,
  PULLED_PROGRAM_ID,
  ata,
  createMarketIx,
  decodeMarket,
  marketPda,
  platformQuoteAta,
  quoteVaultAta,
  resolveTreasury,
  tokenVaultAta,
  windowPda,
  type CreateMarketParams,
  type LadleCluster,
} from "@pulled/sdk";
import { ConfigError, solToLamports } from "../config.ts";
import { PUBLIC_RPC_URL, cluster as clusterOf, connect, isEntry, loadKeypair, parseFlags, pubkey, runMain, sendPriced, str } from "./args.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..");

/** Mirrors create_market's bounds (programs/ladle/src/consts.rs). */
const MIN_MAX_ENTRY_BPS = 500;
const MAX_MAX_ENTRY_BPS = 10_000;
const MAX_NAME_LEN = 32, MAX_SYMBOL_LEN = 10, MAX_URI_LEN = 200;
/** Metaplex metadata account of a fungible token with these string limits. */
const METADATA_BYTES = 679;
/** Metaplex's metadata creation fee, paid by the creator and kept by Metaplex (seen on devnet, 2026-10-28). */
const METAPLEX_CREATE_FEE = 10_000_000n;
const TOKEN_ACCOUNT_BYTES = 165, MINT_BYTES = 82;

export function marketParams(f: Map<string, string | true>): CreateMarketParams {
  const problems: string[] = [];
  const int = (name: string, d: string) => { const v = Number(str(f, name, d)); if (!Number.isInteger(v) || v < 0) problems.push(`${name} must be a whole number`); return v; };
  const lam = (name: string, d: string) => { try { return solToLamports(str(f, name, d)); } catch { problems.push(`${name} is not a SOL amount`); return 0n; } };
  const p: CreateMarketParams = {
    windowSlots: BigInt(int("--window-slots", "560")),
    vrfTimeoutSlots: BigInt(int("--vrf-timeout-slots", "900")),
    maxEntryAmount: lam("--max-entry-sol", "5"),
    maxEntryBps: int("--max-entry-bps", "2000"),
    entryFloorAmount: lam("--entry-floor-sol", "0.5"),
    name: str(f, "--name", "Ladle"),
    symbol: str(f, "--symbol", "LADLE"),
    uri: str(f, "--uri", "https://useladle.fun/token.json"),
  };
  if (p.windowSlots < MIN_WINDOW_SLOTS || p.windowSlots > MAX_WINDOW_SLOTS) problems.push(`--window-slots must be in [${MIN_WINDOW_SLOTS}, ${MAX_WINDOW_SLOTS}]`);
  if (p.vrfTimeoutSlots < MIN_VRF_TIMEOUT_SLOTS || p.vrfTimeoutSlots > MAX_VRF_TIMEOUT_SLOTS || p.vrfTimeoutSlots <= p.windowSlots) {
    problems.push(`--vrf-timeout-slots must be in [${MIN_VRF_TIMEOUT_SLOTS}, ${MAX_VRF_TIMEOUT_SLOTS}] and > --window-slots`);
  }
  if (p.maxEntryBps < MIN_MAX_ENTRY_BPS || p.maxEntryBps > MAX_MAX_ENTRY_BPS) problems.push(`--max-entry-bps must be in [${MIN_MAX_ENTRY_BPS}, ${MAX_MAX_ENTRY_BPS}]`);
  if (p.maxEntryAmount < MIN_ENTRY_AMOUNT) problems.push(`--max-entry-sol must be at least ${sol(MIN_ENTRY_AMOUNT)} (the program's minimum stake)`);
  // past the floor an entry may be at most bps of the round total; at the floor that is floor * bps / 10000. Below the minimum
  // stake, a round that passed the floor could take no entry at all until it grew, and the settings are fixed forever.
  if (p.maxEntryBps < MAX_MAX_ENTRY_BPS && (p.entryFloorAmount * BigInt(p.maxEntryBps)) / 10_000n < MIN_ENTRY_AMOUNT) {
    problems.push(`--entry-floor-sol x --max-entry-bps / 10000 must be at least ${sol(MIN_ENTRY_AMOUNT)} SOL (the minimum stake), or --max-entry-bps 10000: otherwise a round just past the floor refuses every entry`);
  }
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (bytes(p.name) > MAX_NAME_LEN) problems.push(`--name is longer than ${MAX_NAME_LEN} bytes`);
  if (bytes(p.symbol) > MAX_SYMBOL_LEN) problems.push(`--symbol is longer than ${MAX_SYMBOL_LEN} bytes`);
  if (bytes(p.uri) > MAX_URI_LEN) problems.push(`--uri is longer than ${MAX_URI_LEN} bytes`);
  if (!/^https:\/\//.test(p.uri)) problems.push("--uri must be an https URL");
  if (problems.length) throw new ConfigError(problems);
  return p;
}

/** The measured slot time of the cluster (ms), for the duration shown next to slot counts. */
async function msPerSlot(connection: Connection): Promise<number> {
  try {
    const s = await connection.getRecentPerformanceSamples(30);
    const slots = s.reduce((a, x) => a + x.numSlots, 0);
    const secs = s.reduce((a, x) => a + x.samplePeriodSecs, 0);
    return slots > 0 ? (secs * 1000) / slots : ESTIMATED_MS_PER_SLOT;
  } catch { return ESTIMATED_MS_PER_SLOT; }
}

const sol = (l: bigint | number) => (Number(l) / 1e9).toFixed(9).replace(/\.?0+$/, "");
const secs = (slots: bigint, ms: number) => `${Math.round((Number(slots) * ms) / 1000)} s`;

async function feeAccounts(connection: Connection, payer: Keypair, treasury: PublicKey, keeper: PublicKey | null, cuPrice: number): Promise<void> {
  const ixs: TransactionInstruction[] = [];
  const targets: [string, PublicKey, PublicKey][] = [["platform treasury", platformQuoteAta(NATIVE_MINT, TOKEN_PROGRAM_ID, treasury), treasury]];
  if (keeper) targets.push(["keeper bounty", ata(NATIVE_MINT, keeper, TOKEN_PROGRAM_ID), keeper]);
  const infos = await connection.getMultipleAccountsInfo(targets.map((t) => t[1]));
  for (const [i, [what, account, owner]] of targets.entries()) {
    if (infos[i]) { console.log(`fee account ok: ${what} wSOL ${account.toBase58()}`); continue; }
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, account, owner, NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    console.log(`creating fee account: ${what} wSOL ${account.toBase58()}`);
  }
  if (ixs.length) console.log(`  tx ${await sendPriced(connection, ixs, [payer], cuPrice)}`);
}

async function main() {
  const f = parseFlags(process.argv.slice(2), ["--yes", "--plan", "--skip-uri-check"]);
  const c = clusterOf(f);
  const params = marketParams(f);
  const payer = loadKeypair(str(f, "--keypair"));
  const keeper = f.has("--keeper") ? pubkey(str(f, "--keeper"), "--keeper") : null;
  // another program id: a devnet shutdown rehearsal (the production id everywhere else)
  const programId = f.has("--program") ? pubkey(str(f, "--program"), "--program") : PULLED_PROGRAM_ID;
  if (c === "mainnet-beta" && !programId.equals(PULLED_PROGRAM_ID)) throw new ConfigError(["--program is for a devnet rehearsal only"]);
  let treasury: PublicKey;
  try { treasury = resolveTreasury(c as LadleCluster, f.has("--treasury") ? str(f, "--treasury") : process.env.LADLE_TREASURY); } catch (e) {
    throw new ConfigError([e instanceof Error ? e.message : String(e)]);
  }
  const cuPrice = Number(str(f, "--cu-price", c === "mainnet-beta" ? "20000" : "1000"));
  if (!Number.isInteger(cuPrice) || cuPrice < 0 || cuPrice > 1_000_000) throw new ConfigError(["--cu-price must be micro-lamports per compute unit, 0..1000000"]);
  const outFile = resolve(root, str(f, "--out", `config/deployments/${c}.json`));
  const connection = await connect(f, c);

  // a creation sent by an earlier run whose confirmation was lost: adopt it, or wait until it can no longer land
  const pendingFile = `${outFile}.pending.json`;
  if (existsSync(pendingFile) && !existsSync(outFile)) {
    const pend = JSON.parse(readFileSync(pendingFile, "utf8")) as { market: string; tokenMint: string; notAfterBlockHeight: number; record: Record<string, unknown> };
    if (await connection.getAccountInfo(new PublicKey(pend.market))) {
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, JSON.stringify({ ...pend.record, signature: "unknown: confirmation lost, market found on chain by the next run" }, null, 2) + "\n");
      rmSync(pendingFile);
      console.log(`market ${pend.market} was created by an earlier run (its confirmation was lost): recorded in ${outFile}`);
    } else if ((await connection.getBlockHeight("finalized")) <= pend.notAfterBlockHeight) {
      throw new ConfigError([`an earlier run sent the creation of market ${pend.market} and its outcome is not known yet: rerun in a minute (it either appears, or can no longer land)`]);
    } else {
      rmSync(pendingFile);
      console.log(`the creation an earlier run sent (market ${pend.market}) never landed and can no longer: creating it anew`);
    }
  }

  // already there: check its settings, ensure the fee accounts, stop
  if (existsSync(outFile)) {
    const prev = JSON.parse(readFileSync(outFile, "utf8"));
    const info = prev.market ? await connection.getAccountInfo(new PublicKey(prev.market)) : null;
    if (prev.market && !info) {
      // never create a second market behind a recorded one: the file is stale, or the RPC has not seen it yet
      throw new ConfigError([`${outFile} records the market ${prev.market}, which ${c} does not have (yet). Rerun in a minute if it was just created; ` +
        `if the file is stale, move it aside to create a new market (the plan and its confirmation are shown again)`]);
    }
    if (info) {
      const m = decodeMarket(new Uint8Array(info.data));
      console.log(`market already exists: ${prev.market} (${outFile})`);
      const diff: string[] = [];
      if (m.windowSlots !== params.windowSlots) diff.push(`window slots ${m.windowSlots} (asked ${params.windowSlots})`);
      if (m.vrfTimeoutSlots !== params.vrfTimeoutSlots) diff.push(`VRF timeout ${m.vrfTimeoutSlots} (asked ${params.vrfTimeoutSlots})`);
      if (m.maxEntryAmount !== params.maxEntryAmount) diff.push(`max entry ${sol(m.maxEntryAmount)} SOL (asked ${sol(params.maxEntryAmount)})`);
      if (m.maxEntryBps !== params.maxEntryBps) diff.push(`max entry bps ${m.maxEntryBps} (asked ${params.maxEntryBps})`);
      if (m.entryFloorAmount !== params.entryFloorAmount) diff.push(`entry floor ${sol(m.entryFloorAmount)} SOL (asked ${sol(params.entryFloorAmount)})`);
      if (diff.length) console.log(`  NOTE: its settings differ from the ones asked and can never change: ${diff.join("; ")}`);
      // a market whose rounds an older build made (another Window layout) cannot run on this program
      if (m.hasActiveWindow) {
        const active = await connection.getAccountInfo(windowPda(new PublicKey(prev.market), m.activeWindow, programId)[0]);
        if (active && active.data.length !== ACCOUNT_SIZES.Window) {
          throw new ConfigError([`market ${prev.market} has rounds of ${active.data.length} bytes, made by an older build (this program's are ${ACCOUNT_SIZES.Window}): it cannot run on this program. Move ${outFile} aside and rerun to create a new market`]);
        }
      }
      // the fee accounts are a transaction too: --plan sends nothing, and mainnet nothing without --yes
      if (f.has("--plan")) { console.log("  fee accounts: not checked (nothing sent: --plan)"); return; }
      if (c === "mainnet-beta" && !f.has("--yes")) throw new ConfigError(["mainnet-beta: nothing sent without --yes (the fee accounts of the existing market)"]);
      await feeAccounts(connection, payer, treasury, keeper, cuPrice);
      return;
    }
  }

  // the program, and the treasury compiled into it (the one passed here must be the same)
  const program = await connection.getAccountInfo(programId);
  if (!program?.executable) {
    if (!f.has("--plan")) throw new ConfigError([`program ${programId.toBase58()} is not deployed on ${c}`]);
    console.log(`program ${programId.toBase58()} is not deployed on ${c} yet`);
  } else {
    const pd = await connection.getAccountInfo(new PublicKey(program.data.subarray(4, 36)));
    // the program bytes only: the 45-byte ProgramData header holds the upgrade authority
    if (pd && Buffer.from(pd.data).subarray(45).indexOf(treasury.toBuffer()) < 0) {
      // the program's address check refuses a wrong treasury without moving funds; this only says it early
      console.log(`WARNING: the deployed program does not contain the treasury ${treasury.toBase58()}: was it built with this LADLE_TREASURY?`);
    }
  }

  // the metadata URI is written once and never again
  if (!f.has("--skip-uri-check")) {
    let problem = "";
    try {
      const res = await fetch(params.uri, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) problem = `answered ${res.status}`;
      else {
        const j = await res.json() as { name?: string; symbol?: string; image?: string };
        if (j.name !== params.name || j.symbol !== params.symbol) problem = `name/symbol there are "${j.name}"/"${j.symbol}", the market's are "${params.name}"/"${params.symbol}"`;
        else if (!j.image) problem = "it has no image";
      }
    } catch (e) { problem = e instanceof Error ? e.message : String(e); }
    if (problem) throw new ConfigError([`token metadata ${params.uri}: ${problem} (it can never be edited after the market exists; --skip-uri-check to go on anyway)`]);
    console.log(`token metadata ok: ${params.uri}`);
  }

  // cost and balance
  const rent = async (n: number) => BigInt(await connection.getMinimumBalanceForRentExemption(n));
  const rents = (await rent(ACCOUNT_SIZES.Market)) + (await rent(MINT_BYTES)) + 2n * (await rent(TOKEN_ACCOUNT_BYTES)) + (await rent(METADATA_BYTES));
  const need = MARKET_CREATION_FEE_LAMPORTS + rents + METAPLEX_CREATE_FEE + 2n * (await rent(TOKEN_ACCOUNT_BYTES)) + 100_000n;
  const balance = BigInt(await connection.getBalance(payer.publicKey));
  const ms = await msPerSlot(connection);

  console.log(`\nmarket on ${c}, settings fixed forever:`);
  console.log(`  round length       ${params.windowSlots} slots (~${secs(params.windowSlots, ms)} at the current ${ms.toFixed(0)} ms/slot)`);
  console.log(`  VRF timeout        ${params.vrfTimeoutSlots} slots (~${secs(params.vrfTimeoutSlots, ms)}) before refunds open`);
  console.log(`  max entry          ${sol(params.maxEntryAmount)} SOL, and at most ${params.maxEntryBps / 100} % of the round once it passes ${sol(params.entryFloorAmount)} SOL`);
  console.log(`  token              ${params.name} (${params.symbol}), metadata ${params.uri}`);
  console.log(`  creator            ${payer.publicKey.toBase58()} (${sol(balance)} SOL)`);
  console.log(`  cost               ${sol(MARKET_CREATION_FEE_LAMPORTS)} SOL creation fee to the treasury ${treasury.toBase58()} + ~${sol(rents)} SOL of rent (kept by the market's accounts) + ${sol(METAPLEX_CREATE_FEE)} SOL Metaplex fee`);
  if (f.has("--plan")) { console.log(`  needs              ~${sol(need)} SOL (nothing sent: --plan)`); return; }
  if (balance < need) throw new ConfigError([`the creator needs about ${sol(need)} SOL, it has ${sol(balance)}`]);
  if (c === "mainnet-beta" && !f.has("--yes")) throw new ConfigError(["mainnet-beta: nothing sent without --yes"]);

  const tokenMint = Keypair.generate();
  const [market] = marketPda(tokenMint.publicKey, programId);
  const ix = createMarketIx({
    creator: payer.publicKey,
    tokenMint: tokenMint.publicKey,
    quoteMint: NATIVE_MINT,
    market,
    tokenVault: tokenVaultAta(market, tokenMint.publicKey),
    quoteVault: quoteVaultAta(market, NATIVE_MINT, TOKEN_PROGRAM_ID),
    integration: null,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    platformTreasury: treasury,
  }, params, programId);
  const deployment = {
    cluster: c,
    rpc: PUBLIC_RPC_URL[c],
    programId: programId.toBase58(),
    market: market.toBase58(),
    tokenMint: tokenMint.publicKey.toBase58(),
    quoteMint: NATIVE_MINT.toBase58(),
    quoteDecimals: 9,
    treasury: treasury.toBase58(),
    createdBy: payer.publicKey.toBase58(),
    createdAt: new Date().toISOString(),
    params: {
      ...params,
      windowSlots: String(params.windowSlots), vrfTimeoutSlots: String(params.vrfTimeoutSlots),
      maxEntryAmount: String(params.maxEntryAmount), entryFloorAmount: String(params.entryFloorAmount),
    },
  };
  // before sending: the address of what is about to exist, so a lost confirmation is found again (the transaction's blockhash
  // is fetched after this one, and expires 150 blocks later: 300 is a margin)
  mkdirSync(dirname(outFile), { recursive: true });
  const notAfterBlockHeight = (await connection.getLatestBlockhash("finalized")).lastValidBlockHeight + 300;
  writeFileSync(pendingFile, JSON.stringify({ market: market.toBase58(), tokenMint: tokenMint.publicKey.toBase58(), notAfterBlockHeight, record: deployment }, null, 2) + "\n");
  const sig = await sendPriced(connection, [ix], [payer, tokenMint], cuPrice);
  writeFileSync(outFile, JSON.stringify({ ...deployment, signature: sig }, null, 2) + "\n");
  rmSync(pendingFile);
  console.log(`\nmarket created: ${market.toBase58()}\n  token mint ${tokenMint.publicKey.toBase58()}\n  tx ${sig}\n  written to ${outFile}`);

  await feeAccounts(connection, payer, treasury, keeper, cuPrice);
}

if (isEntry(import.meta.url)) runMain(main);
