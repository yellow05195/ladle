/**
 * Keeper settings, checked before anything touches the network.
 *
 * Each setting comes from a command-line flag, else an environment variable,
 * else the deployment file (config/deployments/<cluster>.json, written by
 * keeper/src/ops/create-market.ts), else a default. Every problem is
 * reported at once. There is no default keypair: the keeper must be given
 * its own (never ~/.config/solana/id.json, often shared with other tools).
 *
 *   flag                 env                      default
 *   --cluster            LADLE_CLUSTER            from the deployment file (required)
 *   --rpc                RPC_URL                  from the deployment file (required)
 *   --keypair            KEEPER_KEYPAIR           (required; KEYPAIR also read)
 *   --market (repeat)    LADLE_MARKET (a,b)       from the deployment file (optional with --shutdown: every market
 *                                                 of the program is served then, given or not)
 *   --deployment         LADLE_DEPLOYMENT         -
 *   --program            LADLE_PROGRAM            the SDK's program id
 *   --treasury           LADLE_TREASURY           from the deployment file; devnet: the SDK default; required on mainnet-beta
 *   --interval           KEEPER_INTERVAL_MS       2000
 *   --idle-interval      KEEPER_IDLE_INTERVAL_MS  10000 (0: always --interval)
 *   --page               KEEPER_PAGE              48 (capped by what fits a transaction)
 *   --cu-price           KEEPER_CU_PRICE          auto (micro-lamports per CU, 0: none)
 *   --cu-price-min       KEEPER_CU_PRICE_MIN      1000
 *   --cu-price-max       KEEPER_CU_PRICE_MAX      100000 (at most 1000000)
 *   --max-fee-sol        KEEPER_MAX_FEE_SOL       0.0005 (priority fee ceiling per transaction: price x limit)
 *   --unwrap-every-min   KEEPER_UNWRAP_EVERY_MIN  60 (0: never)
 *   --unwrap-min-sol     KEEPER_UNWRAP_MIN_SOL    0.01
 *   --alert-below-sol    KEEPER_ALERT_BELOW_SOL   0.2
 *   --alert-webhook      KEEPER_ALERT_WEBHOOK     - (https URL; Slack/Discord style)
 *   --alert-repeat-h     KEEPER_ALERT_REPEAT_H    3
 *   --health-port        KEEPER_HEALTH_PORT       0 (off)
 *   --health-host        KEEPER_HEALTH_HOST       127.0.0.1
 *   --vrf-per-day        KEEPER_VRF_PER_DAY       0 (no cap: past N ORAO requests in 24 h, no new round opens)
 *   --drain              KEEPER_DRAIN=1           off (no new round; finish, refund, close, then exit 0)
 *   --drain-refund-all   KEEPER_DRAIN_REFUND_ALL=1 off (drain, and refund every stake: creates the missing
 *                                                 SOL token accounts, ~0.0015 SOL each, which then belong to the players)
 *   --shutdown           KEEPER_SHUTDOWN=1        off (the game is stopped: needs the wind-down build. Drains, starts
 *                                                 each market's notice, and once it is over pays every entry out to
 *                                                 its owner (force_exit), closes every round and the markets, then exits 0.
 *                                                 Program-wide: every market of the program, and the entries left by
 *                                                 markets already closed)
 *   --notice-secs        KEEPER_NOTICE_SECS       604800 (7 days: the notice of the build; 600 for a devnet rehearsal build)
 *   --settle-stall-min   KEEPER_SETTLE_STALL_MIN  10 (alarm + /health 503 when the settlement queue has not moved
 *                                                 for this long while its next round could move)
 *   --dry-run            KEEPER_DRY_RUN=1         off
 *   --once                                        off
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import { PublicKey, type Connection } from "@solana/web3.js";
import { DEFAULT_CU_PRICE_MAX, DEFAULT_CU_PRICE_MIN } from "./fees.ts";

export type Cluster = "mainnet-beta" | "devnet" | "testnet" | "localnet";
export const CLUSTERS: readonly Cluster[] = ["mainnet-beta", "devnet", "testnet", "localnet"];

/** Genesis hash per public cluster (`solana genesis-hash`); localnet is not checked. */
export const GENESIS_HASH: Record<Exclude<Cluster, "localnet">, string> = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
};

export interface KeeperConfig {
  cluster: Cluster;
  rpc: string;
  keypairPath: string;
  markets: string[];
  programId?: string;
  /** The platform treasury the program was built with (`LADLE_TREASURY` of the build). */
  treasury?: string;
  dryRun: boolean;
  once: boolean;
  /** Open no new round; finish, refund and close the others, then exit. */
  drain: boolean;
  /** Drain, and refund every stake, creating the owners' missing quote accounts. */
  drainRefundAll: boolean;
  /** Stop the game for good (wind-down build): notice, force_exit of every entry, close every round and market. */
  shutdown: boolean;
  /** The deployed wind-down build's notice (seconds): 604800, 600 for a rehearsal build. */
  noticeSecs: bigint;
  /** Settlement queue stuck this long (while its next round could move): alarm, /health 503 (ms). */
  settleStallMs: number;
  /** Priority fee ceiling per transaction (lamports): the price is lowered to fit price x limit. */
  maxFeeLamports: bigint;
  /** Open no new round past this many ORAO requests in 24 h (0: no cap). */
  vrfPerDay: number;
  intervalMs: number;
  idleIntervalMs: number;
  page: number;
  cuPrice: "auto" | number;
  cuPriceMin: number;
  cuPriceMax: number;
  unwrapEveryMs: number;
  unwrapMinLamports: bigint;
  alertBelowLamports: bigint;
  alertWebhook: string;
  alertRepeatMs: number;
  healthHost: string;
  healthPort: number;
  help: boolean;
  /** Not fatal, logged at start. */
  warnings: string[];
}

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`invalid configuration:\n  - ${problems.join("\n  - ")}`);
    this.problems = problems;
  }
}

export const USAGE = `pulled-keeper --cluster <mainnet-beta|devnet|testnet|localnet> --rpc <url> --keypair <file>
              --market <pda|mint> [--market ...] | --deployment config/deployments/<cluster>.json (optional with --shutdown)
              [--dry-run] [--once] [--interval ms] [--idle-interval ms] [--page n]
              [--cu-price auto|<micro-lamports>] [--cu-price-min n] [--cu-price-max n]
              [--unwrap-every-min n] [--unwrap-min-sol x] [--alert-below-sol x] [--alert-webhook url]
              [--alert-repeat-h n] [--health-port n] [--health-host addr] [--program id] [--treasury key]
              [--vrf-per-day n] [--drain] [--drain-refund-all] [--shutdown] [--notice-secs n]
              [--settle-stall-min n] [--max-fee-sol x]
Every flag has an environment variable (keeper/README.md).
`;

/** Decimal SOL string -> lamports, exactly (no float). */
export function solToLamports(s: string): bigint {
  const m = /^(\d+)(?:\.(\d{0,9}))?$/.exec(s.trim());
  if (!m) throw new Error(`not a SOL amount: ${s}`);
  return BigInt(m[1]!) * 1_000_000_000n + BigInt((m[2] ?? "").padEnd(9, "0") || "0");
}

/** Problem with a keypair file, or null when it holds a 64-byte secret key. Never echoes the content. */
export function keypairFileProblem(path: string, readFile: (p: string) => string): string | null {
  if (basename(path).toLowerCase() === "id.json") {
    return `refusing ${path}: id.json is the Solana CLI's shared default wallet; give the keeper its own keypair (solana-keygen new -o ladle-keeper.json)`;
  }
  let raw: unknown;
  try { raw = JSON.parse(readFile(expandHome(path))); } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? `keypair file not found: ${path}` : `keypair file unreadable or not JSON: ${path}`;
  }
  if (!Array.isArray(raw) || raw.length !== 64 || !raw.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    return `keypair file is not a Solana keypair (a JSON array of 64 bytes): ${path}`;
  }
  return null;
}

export function expandHome(p: string): string {
  return p.replace(/^~(?=$|[\\/])/, homedir()).replace(/^%USERPROFILE%/i, homedir());
}

/** Scheme and host only: RPC and webhook URLs often carry a key in the path or the query. */
export function redactUrl(u: string): string {
  try { const x = new URL(u); return `${x.protocol}//${x.host}`; } catch { return "<invalid url>"; }
}

/**
 * Text for a log line or an alert, with every URL cut to its scheme and host
 * and any `api-key=` value hidden. web3.js puts the RPC URL, key included,
 * in its fetch errors ("request to https://...?api-key=... failed"), which
 * would otherwise reach journald and the alert webhook. `secrets` (the
 * configured RPC and webhook URLs) are replaced first, whatever their form.
 */
export function scrubSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join(redactUrl(s));
  out = out.replace(/\b(?:https?|wss?):\/\/[^\s"'<>()\]\[{},]+/gi, (u) => redactUrl(u.replace(/[.;:]+$/, "")));
  return out.replace(/(api[-_]?key|token|secret)=([^&\s"']+)/gi, "$1=<hidden>");
}

const PUBLIC_RPC: Record<Exclude<Cluster, "localnet">, string> = {
  "mainnet-beta": "api.mainnet-beta.solana.com",
  devnet: "api.devnet.solana.com",
  testnet: "api.testnet.solana.com",
};

export function parseConfig(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  readFile: (p: string) => string = (p) => readFileSync(p, "utf8"),
): KeeperConfig {
  const problems: string[] = [];
  const warnings: string[] = [];
  const flags = new Map<string, string>();
  const flagMarkets: string[] = [];
  let dryRun = false, once = false, help = false, drain = false, drainRefundAll = false, shutdown = false;

  const VALUED = new Set(["--cluster", "--rpc", "--keypair", "--market", "--deployment", "--program", "--interval", "--idle-interval", "--page",
    "--cu-price", "--cu-price-min", "--cu-price-max", "--unwrap-every-min", "--unwrap-min-sol", "--alert-below-sol", "--alert-webhook",
    "--alert-repeat-h", "--health-port", "--health-host", "--treasury", "--vrf-per-day", "--settle-stall-min", "--max-fee-sol", "--notice-secs"]);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === "--dry-run") { dryRun = true; continue; }
    if (k === "--once") { once = true; continue; }
    if (k === "--drain") { drain = true; continue; }
    if (k === "--drain-refund-all") { drainRefundAll = true; continue; }
    if (k === "--shutdown") { shutdown = true; continue; }
    if (k === "-h" || k === "--help") { help = true; continue; }
    if (!VALUED.has(k)) { problems.push(`unknown flag ${k}`); continue; }
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) { problems.push(`${k} needs a value`); if (v !== undefined) i--; continue; }
    if (k === "--market") flagMarkets.push(v); else flags.set(k, v);
  }
  const pick = (flag: string, envName: string): string | undefined => {
    const f = flags.get(flag);
    if (f !== undefined) return f;
    const e = env[envName];
    return e !== undefined && e !== "" ? e : undefined;
  };

  // the deployment file fills what flags and environment leave empty
  let dep: { cluster?: string; rpc?: string; market?: string; programId?: string; treasury?: string } = {};
  const depPath = pick("--deployment", "LADLE_DEPLOYMENT");
  if (depPath) {
    try { dep = JSON.parse(readFile(expandHome(depPath))); } catch { problems.push(`deployment file unreadable or not JSON: ${depPath}`); }
  }

  // cluster
  const clusterRaw = pick("--cluster", "LADLE_CLUSTER") ?? dep.cluster;
  let cluster: Cluster = "devnet";
  if (!clusterRaw) problems.push(`cluster is required: --cluster or LADLE_CLUSTER (${CLUSTERS.join(" | ")})`);
  else if (!(CLUSTERS as readonly string[]).includes(clusterRaw)) problems.push(`unknown cluster "${clusterRaw}" (${CLUSTERS.join(" | ")})`);
  else cluster = clusterRaw as Cluster;
  if (dep.cluster && clusterRaw && dep.cluster !== clusterRaw) problems.push(`cluster ${clusterRaw} but the deployment file is for ${dep.cluster}`);

  // rpc
  const rpc = pick("--rpc", "RPC_URL") ?? dep.rpc ?? "";
  if (!rpc) problems.push("RPC is required: --rpc or RPC_URL (a paid endpoint on mainnet)");
  else {
    let url: URL | null = null;
    try { url = new URL(rpc); } catch { problems.push(`RPC_URL is not a URL: ${redactUrl(rpc)}`); }
    if (url && url.protocol !== "https:" && url.protocol !== "http:") problems.push(`RPC_URL must be http(s): ${redactUrl(rpc)}`);
    if (url && cluster !== "localnet") {
      for (const [c, host] of Object.entries(PUBLIC_RPC)) {
        if (url.host === host && c !== cluster) problems.push(`RPC_URL ${host} is ${c}, not ${cluster}`);
      }
      const known = Object.values(PUBLIC_RPC).includes(url.host);
      if (cluster === "mainnet-beta" && !known && /devnet|testnet/i.test(url.host)) problems.push(`RPC_URL ${url.host} looks like a test cluster, not mainnet-beta`);
      if (cluster === "mainnet-beta" && url.host === PUBLIC_RPC["mainnet-beta"]) {
        warnings.push("the public mainnet RPC is rate limited and restricts getProgramAccounts: use a paid RPC");
      }
    }
  }

  // keypair: no default, ever
  const keypairPath = pick("--keypair", "KEEPER_KEYPAIR") ?? (env.KEYPAIR || "");
  if (!keypairPath) problems.push("keypair is required: --keypair or KEEPER_KEYPAIR (a dedicated keeper keypair, never id.json)");
  else { const p = keypairFileProblem(keypairPath, readFile); if (p) problems.push(p); }

  // markets
  const markets = [...flagMarkets];
  if (markets.length === 0 && env.LADLE_MARKET) markets.push(...env.LADLE_MARKET.split(",").map((s) => s.trim()).filter(Boolean));
  if (dep.market && !markets.includes(dep.market)) markets.push(dep.market);
  for (const m of markets) if (!isPubkey(m)) problems.push(`market is not a base58 address: ${m}`);

  const programId = pick("--program", "LADLE_PROGRAM") ?? dep.programId;
  if (programId && !isPubkey(programId)) problems.push(`program is not a base58 address: ${programId}`);

  // the treasury is compiled into the program: the keeper must name the same one (its ATA gets the platform fee)
  const treasury = pick("--treasury", "LADLE_TREASURY") ?? dep.treasury;
  if (treasury && !isPubkey(treasury)) problems.push(`treasury is not a base58 address: ${treasury}`);
  if (!treasury && (cluster === "mainnet-beta" || cluster === "testnet")) {
    problems.push(`treasury is required on ${cluster}: --treasury or LADLE_TREASURY, the key the program was built with`);
  }

  // numbers
  const int = (flag: string, envName: string, d: number, min: number, max: number): number => {
    const raw = pick(flag, envName);
    if (raw === undefined) return d;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) { problems.push(`${flag} / ${envName} must be an integer in [${min}, ${max}] (got ${raw})`); return d; }
    return n;
  };
  const lamports = (flag: string, envName: string, d: string, min: bigint): bigint => {
    const raw = pick(flag, envName) ?? d;
    try {
      const v = solToLamports(raw);
      if (v < min) { problems.push(`${flag} / ${envName} must be at least ${Number(min) / 1e9} SOL (got ${raw})`); return solToLamports(d); }
      return v;
    } catch { problems.push(`${flag} / ${envName} is not a SOL amount (got ${raw})`); return solToLamports(d); }
  };

  const intervalMs = int("--interval", "KEEPER_INTERVAL_MS", 2000, 500, 600_000);
  const idleIntervalMs = int("--idle-interval", "KEEPER_IDLE_INTERVAL_MS", 10_000, 0, 600_000);
  if (idleIntervalMs !== 0 && idleIntervalMs < intervalMs) problems.push(`--idle-interval (${idleIntervalMs}) must be 0 or at least --interval (${intervalMs})`);
  const page = int("--page", "KEEPER_PAGE", 48, 1, 48);

  const priceRaw = pick("--cu-price", "KEEPER_CU_PRICE") ?? "auto";
  let cuPrice: "auto" | number = "auto";
  if (priceRaw !== "auto") {
    const n = Number(priceRaw);
    if (!Number.isInteger(n) || n < 0) problems.push(`--cu-price / KEEPER_CU_PRICE must be "auto" or micro-lamports per compute unit (got ${priceRaw})`);
    else cuPrice = n;
  }
  // micro-lamports per compute unit: 1,000,000 on a 1.4M-unit page is already 1.4 SOL... per 1,000 transactions
  const cuPriceMin = int("--cu-price-min", "KEEPER_CU_PRICE_MIN", DEFAULT_CU_PRICE_MIN, 0, 1_000_000);
  const cuPriceMax = int("--cu-price-max", "KEEPER_CU_PRICE_MAX", DEFAULT_CU_PRICE_MAX, 0, 1_000_000);
  if (cuPriceMax < cuPriceMin) problems.push(`--cu-price-max (${cuPriceMax}) is below --cu-price-min (${cuPriceMin})`);
  if (typeof cuPrice === "number" && cuPrice > cuPriceMax) warnings.push(`--cu-price ${cuPrice} is above the cap ${cuPriceMax}: the cap applies`);
  // the per-transaction ceiling, whatever the price and the limit (KEEPER_CU_PRICE_MAX is in micro-lamports per unit, an easy unit to get wrong)
  const maxFeeLamports = lamports("--max-fee-sol", "KEEPER_MAX_FEE_SOL", "0.0005", 0n);
  if (maxFeeLamports > 10_000_000n) problems.push("--max-fee-sol / KEEPER_MAX_FEE_SOL must be at most 0.01 SOL (a priority fee per transaction)");

  const unwrapEveryMs = int("--unwrap-every-min", "KEEPER_UNWRAP_EVERY_MIN", 60, 0, 7 * 24 * 60) * 60_000;
  // below 0.001 SOL the 5,000-lamport transaction would cost more than 0.5 % of what it unwraps
  const unwrapMinLamports = lamports("--unwrap-min-sol", "KEEPER_UNWRAP_MIN_SOL", "0.01", 1_000_000n);
  const alertBelowLamports = lamports("--alert-below-sol", "KEEPER_ALERT_BELOW_SOL", "0.2", 0n);
  const alertRepeatMs = int("--alert-repeat-h", "KEEPER_ALERT_REPEAT_H", 3, 0, 24 * 7) * 3_600_000;

  const alertWebhook = pick("--alert-webhook", "KEEPER_ALERT_WEBHOOK") ?? "";
  if (alertWebhook) {
    try {
      const u = new URL(alertWebhook);
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (u.protocol !== "https:" && !(local && u.protocol === "http:")) problems.push(`--alert-webhook must be https (got ${redactUrl(alertWebhook)})`);
    } catch { problems.push("--alert-webhook / KEEPER_ALERT_WEBHOOK is not a URL"); }
  }

  const healthPort = int("--health-port", "KEEPER_HEALTH_PORT", 0, 0, 65_535);
  const healthHost = pick("--health-host", "KEEPER_HEALTH_HOST") ?? "127.0.0.1";
  if (healthPort && healthHost !== "127.0.0.1" && healthHost !== "::1" && healthHost !== "localhost") {
    warnings.push(`health endpoint bound to ${healthHost}: prefer 127.0.0.1 behind the TLS proxy`);
  }

  const vrfPerDay = int("--vrf-per-day", "KEEPER_VRF_PER_DAY", 0, 0, 1_000_000);
  const settleStallMs = int("--settle-stall-min", "KEEPER_SETTLE_STALL_MIN", 10, 1, 24 * 60) * 60_000;
  if (env.KEEPER_DRY_RUN === "1" || env.KEEPER_DRY_RUN?.toLowerCase() === "true") dryRun = true;
  if (env.KEEPER_DRAIN === "1" || env.KEEPER_DRAIN?.toLowerCase() === "true") drain = true;
  if (env.KEEPER_DRAIN_REFUND_ALL === "1" || env.KEEPER_DRAIN_REFUND_ALL?.toLowerCase() === "true") drainRefundAll = true;
  if (env.KEEPER_SHUTDOWN === "1" || env.KEEPER_SHUTDOWN?.toLowerCase() === "true") shutdown = true;
  // refunding everyone, and the shutdown, drain too
  if (drainRefundAll || shutdown) drain = true;
  // the shutdown finds every market of the program by itself (a market may also be closed already)
  if (markets.length === 0 && !shutdown) problems.push("at least one market is required: --market, LADLE_MARKET or --deployment (optional with --shutdown)");
  const noticeSecs = BigInt(int("--notice-secs", "KEEPER_NOTICE_SECS", 604_800, 60, 30 * 86_400));
  if (noticeSecs !== 604_800n && cluster === "mainnet-beta") problems.push("--notice-secs / KEEPER_NOTICE_SECS other than 604800 is for a devnet rehearsal build only");

  if (problems.length && !help) throw new ConfigError(problems);
  return {
    cluster, rpc, keypairPath, markets, programId, treasury, dryRun, once, drain, drainRefundAll, shutdown, noticeSecs, settleStallMs, maxFeeLamports, vrfPerDay, intervalMs, idleIntervalMs, page,
    cuPrice, cuPriceMin, cuPriceMax, unwrapEveryMs, unwrapMinLamports, alertBelowLamports, alertWebhook, alertRepeatMs,
    healthHost, healthPort, help, warnings,
  };
}

function isPubkey(s: string): boolean {
  try { new PublicKey(s); return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s); } catch { return false; }
}

/** The RPC must serve the cluster the keeper was told about (genesis hash). */
export async function checkCluster(connection: Pick<Connection, "getGenesisHash">, cluster: Cluster): Promise<void> {
  if (cluster === "localnet") return;
  const got = await connection.getGenesisHash();
  if (got !== GENESIS_HASH[cluster]) {
    const actual = (Object.entries(GENESIS_HASH).find(([, h]) => h === got)?.[0]) ?? `an unknown cluster (genesis ${got})`;
    throw new ConfigError([`RPC_URL serves ${actual}, but the cluster is set to ${cluster}`]);
  }
}

/** What the start log shows: no secret, no key, no full URL. */
export function describeConfig(c: KeeperConfig): Record<string, unknown> {
  return {
    cluster: c.cluster,
    rpc: redactUrl(c.rpc),
    markets: c.markets,
    program: c.programId ?? "sdk default",
    treasury: c.treasury ?? "sdk default (devnet)",
    dryRun: c.dryRun,
    drain: c.drain,
    drainRefundAll: c.drainRefundAll,
    shutdown: c.shutdown,
    noticeSecs: Number(c.noticeSecs),
    settleStallMin: c.settleStallMs / 60_000,
    maxFeeSol: Number(c.maxFeeLamports) / 1e9,
    vrfPerDay: c.vrfPerDay || "no cap",
    intervalMs: c.intervalMs,
    idleIntervalMs: c.idleIntervalMs,
    cuPrice: c.cuPrice,
    cuPriceMin: c.cuPriceMin,
    cuPriceMax: c.cuPriceMax,
    unwrapEveryMin: c.unwrapEveryMs / 60_000,
    unwrapMinSol: Number(c.unwrapMinLamports) / 1e9,
    alertBelowSol: Number(c.alertBelowLamports) / 1e9,
    alertWebhook: c.alertWebhook ? redactUrl(c.alertWebhook) : "none",
    health: c.healthPort ? `${c.healthHost}:${c.healthPort}/health` : "off",
  };
}
