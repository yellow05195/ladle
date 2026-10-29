#!/usr/bin/env -S node --experimental-strip-types
/**
 * pulled-keeper CLI.
 *
 *   node --experimental-strip-types keeper/src/index.ts \
 *     --cluster devnet --rpc https://api.devnet.solana.com --keypair ~/.config/ladle/ladle-devnet-keeper.json \
 *     --market <MARKET_PDA> [--market <MARKET_PDA> ...] [--dry-run] [--once] [--health-port 8788]
 *
 *   or, from a deployment file written by keeper/src/ops/create-market.ts:
 *     --deployment config/deployments/devnet.json --keypair <keeper keypair>
 *
 *   or entirely from the environment (systemd, Docker: deploy/keeper.env.example).
 *
 * `--market` also accepts a token mint: the market PDA is derived when the
 * given key is not a Market account. Every setting is checked before the
 * loop starts (config.ts); SIGINT / SIGTERM finish the current tick and exit.
 * `--drain` (KEEPER_DRAIN=1) opens no new round, finishes, refunds and
 * closes the others, then exits 0 (the systemd unit does not restart it).
 * `--drain-refund-all` (KEEPER_DRAIN_REFUND_ALL=1) does the same and also
 * refunds the stakes whose owner has no SOL token account.
 * `--shutdown` (KEEPER_SHUTDOWN=1), once the wind-down build is deployed:
 * the drain, each market's notice, then every entry paid out to its owner
 * and every round and market closed; exits 0 when nothing is left
 * (loop.ts, "Shutdown"). It is program-wide: `--market` is optional (every
 * market of the program is served, and the entries a closed market left
 * are closed). Startup refuses it on the normal build.
 * Startup refuses (exit 2) a treasury the deployed program was not built
 * with: every finalizing page would fail, and every later round wait.
 */
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { PulledClient, isAccountOf, marketPda, resolveTreasury, type LadleCluster } from "@pulled/sdk";
import { ConfigError, USAGE, checkCluster, describeConfig, expandHome, parseConfig, scrubSecrets } from "./config.ts";
import { startHealthServer } from "./health.ts";
import { Keeper } from "./loop.ts";

/** URLs never reach a log line whole (web3.js errors quote the RPC URL, key included). */
let secrets: string[] = [];
const scrub = (text: string) => scrubSecrets(text, secrets);

const log = (level: "info" | "warn" | "error", action: string, extra: Record<string, unknown> = {}) =>
  process.stdout.write(scrub(JSON.stringify({ ts: new Date().toISOString(), level, action, ...extra })) + "\n");

/** How long a stop may take before the process exits anyway (a transaction in flight is safe to drop). */
const STOP_TIMEOUT_MS = 25_000;
/** ProgramData header: enum tag (4), slot (8), Option<upgrade authority> (1 + 32). The program bytes follow. */
const PROGRAM_DATA_HEADER = 45;

async function main() {
  const cfg = parseConfig(process.argv.slice(2), process.env);
  secrets = [cfg.rpc, cfg.alertWebhook].filter(Boolean);
  if (cfg.help) { process.stdout.write(USAGE); return; }
  for (const w of cfg.warnings) log("warn", "config", { msg: w });

  const connection = new Connection(cfg.rpc, "confirmed");
  await checkCluster(connection, cfg.cluster);
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(expandHome(cfg.keypairPath), "utf8"))));
  const programId = cfg.programId ? new PublicKey(cfg.programId) : undefined;
  const treasury = resolveTreasury(cfg.cluster as LadleCluster, cfg.treasury);
  const client = new PulledClient({ connection, programId, treasury });

  const problems: string[] = [];
  const program = await connection.getAccountInfo(client.programId);
  if (!program?.executable) problems.push(`program ${client.programId.toBase58()} is not deployed on ${cfg.cluster}`);
  else {
    // the treasury is a constant of the build: a keeper naming another one fails every finalizing page, and since rounds
    // settle in order, every later round would wait behind the first one (scripts/mainnet-up.ps1 checks the .so the same way).
    // Only the program bytes count: the 45-byte header holds the upgrade authority, which may be the treasury's key.
    const data = await connection.getAccountInfo(new PublicKey(program.data.subarray(4, 36)));
    if (!data) problems.push(`the program data of ${client.programId.toBase58()} could not be read: rerun when the RPC answers`);
    else if (Buffer.from(data.data).subarray(PROGRAM_DATA_HEADER).indexOf(treasury.toBuffer()) < 0) {
      problems.push(`the deployed program was not built with the treasury ${treasury.toBase58()}: set LADLE_TREASURY to the key it was built with (config/deployments/<cluster>.json "treasury")`);
    }
  }
  const markets: PublicKey[] = [];
  for (const m of cfg.markets) {
    const key = new PublicKey(m);
    const info = await connection.getAccountInfo(key);
    if (info && isAccountOf(new Uint8Array(info.data), "Market")) { markets.push(key); continue; }
    // a token mint: its market PDA
    const pda = marketPda(key, client.programId)[0];
    const pdaInfo = await connection.getAccountInfo(pda);
    if (pdaInfo && isAccountOf(new Uint8Array(pdaInfo.data), "Market")) markets.push(pda);
    // shutdown: a market closed by an earlier run (or by anyone: close_market is permissionless) is done
    else if (cfg.shutdown && !info && !pdaInfo) log("info", "market_closed", { market: m });
    else problems.push(`no Ladle market at ${m} (nor at its market PDA ${pda.toBase58()}) on ${cfg.cluster}`);
  }
  // shutdown: any market of the program will do for the probe (the loop serves them all)
  let probe: PublicKey | undefined;
  if (cfg.shutdown && !problems.length) {
    probe = markets[0];
    if (!probe) {
      try {
        probe = (await client.getAccountKeys("Market"))[0];
        if (!probe) log("info", "no_market", { msg: "no market left in the program: only the entries closed markets left behind are swept" });
      } catch (e) { log("warn", "market_scan", { err: scrub(e instanceof Error ? e.message : String(e)), msg: "the program's markets could not be listed: the loop retries" }); }
    }
  }
  if (probe) {
    // the normal build has no start_wind_down (InstructionFallbackNotFound): the shutdown needs the wind-down build
    try {
      const tx = new Transaction({ feePayer: keypair.publicKey }).add(...client.startWindDownInstructions(probe));
      const logs = ((await connection.simulateTransaction(tx)).value.logs ?? []).join("\n");
      if (/InstructionFallbackNotFound|Fallback functions are not supported/.test(logs)) {
        problems.push("--shutdown needs the wind-down build: the deployed program has no start_wind_down (upgrade first: scripts/mainnet-shutdown.ps1, docs/LAUNCH.md)");
      }
    } catch (e) { log("warn", "shutdown_probe", { err: scrub(e instanceof Error ? e.message : String(e)) }); }
  }
  const lamports = await connection.getBalance(keypair.publicKey);
  if (lamports === 0 && !cfg.dryRun) problems.push(`keeper ${keypair.publicKey.toBase58()} has 0 SOL on ${cfg.cluster}: fund it first`);
  if (problems.length) throw new ConfigError(problems);

  log("info", "config", { keeper: keypair.publicKey.toBase58(), balanceSol: lamports / 1e9, ...describeConfig(cfg) });

  const keeper = new Keeper({
    connection, keypair, markets, programId, treasury, cluster: cfg.cluster,
    intervalMs: cfg.intervalMs, idleIntervalMs: cfg.idleIntervalMs, dryRun: cfg.dryRun, pageSize: cfg.page,
    fees: { price: cfg.cuPrice, min: cfg.cuPriceMin, max: cfg.cuPriceMax },
    unwrapEveryMs: cfg.unwrapEveryMs, unwrapMinLamports: cfg.unwrapMinLamports,
    alertBelowLamports: cfg.alertBelowLamports, alertWebhook: cfg.alertWebhook, alertRepeatMs: cfg.alertRepeatMs,
    drain: cfg.drain, drainRefundAll: cfg.drainRefundAll, shutdown: cfg.shutdown, noticeSecs: cfg.noticeSecs, vrfPerDay: cfg.vrfPerDay,
    settleStallMs: cfg.settleStallMs, maxFeeLamports: cfg.maxFeeLamports, secrets,
  });

  if (cfg.once) { await keeper.tickOnce(); return; }

  let health: Server | null = null;
  if (cfg.healthPort) health = await startHealthServer(cfg.healthHost, cfg.healthPort, () => keeper.health());

  let stopping = false;
  const stop = (sig: string) => {
    if (stopping) { log("warn", "stop", { msg: `${sig} again: exiting now` }); process.exit(1); }
    stopping = true;
    log("info", "stop", { msg: `${sig}: finishing the current tick` });
    keeper.stop();
    setTimeout(() => { log("warn", "stop", { msg: `still busy after ${STOP_TIMEOUT_MS} ms: exiting` }); process.exit(0); }, STOP_TIMEOUT_MS).unref();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  await keeper.run();
  await new Promise<void>((r) => (health ? health.close(() => r()) : r()));
  process.exit(0);
}

process.on("unhandledRejection", (e) => {
  log("error", "unhandled", { err: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});

main().catch((e) => {
  const err = scrub(e instanceof Error ? e.message : String(e));
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: "error", action: "main", err }) + "\n");
  // configuration problems will not fix themselves: exit 2 (the systemd unit does not restart on it)
  process.exitCode = e instanceof ConfigError ? 2 : 1;
});
