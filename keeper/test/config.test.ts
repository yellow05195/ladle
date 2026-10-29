/**
 * Startup configuration: flags, environment, deployment file, and every
 * refusal (no keypair, id.json, wrong cluster for the RPC, bad numbers).
 *
 * Run: node --test "keeper/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { ConfigError, GENESIS_HASH, checkCluster, describeConfig, parseConfig, redactUrl, scrubSecrets, solToLamports } from "../src/config.ts";

const KEY = JSON.stringify(Array.from(Keypair.generate().secretKey));
const MARKET = Keypair.generate().publicKey.toBase58();
const MARKET2 = Keypair.generate().publicKey.toBase58();
const TREASURY = Keypair.generate().publicKey.toBase58();
const files: Record<string, string> = {
  "/srv/ladle/keeper.json": KEY,
  "/home/u/.config/solana/id.json": KEY,
  "/srv/ladle/bad.json": "[1,2,3]",
  "/srv/ladle/mainnet.json": JSON.stringify({ cluster: "mainnet-beta", rpc: "https://api.mainnet-beta.solana.com", market: MARKET, programId: "85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj", treasury: TREASURY }),
};
const readFile = (p: string) => {
  const v = files[p.replace(/\\/g, "/")];
  if (v === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
  return v;
};
const base = ["--cluster", "devnet", "--rpc", "https://api.devnet.solana.com", "--keypair", "/srv/ladle/keeper.json", "--market", MARKET];

function problems(argv: string[], env: Record<string, string> = {}): string[] {
  try { parseConfig(argv, env, readFile); return []; } catch (e) {
    assert.ok(e instanceof ConfigError, String(e));
    return e.problems;
  }
}

test("a complete command line parses, with the documented defaults", () => {
  const c = parseConfig(base, {}, readFile);
  assert.equal(c.cluster, "devnet");
  assert.deepEqual(c.markets, [MARKET]);
  assert.equal(c.intervalMs, 2000);
  assert.equal(c.idleIntervalMs, 10_000);
  assert.equal(c.cuPrice, "auto");
  assert.equal(c.cuPriceMin, 1_000);
  assert.equal(c.cuPriceMax, 100_000);
  assert.equal(c.unwrapEveryMs, 60 * 60_000);
  assert.equal(c.unwrapMinLamports, 10_000_000n);
  assert.equal(c.alertBelowLamports, 200_000_000n);
  assert.equal(c.healthPort, 0);
  assert.equal(c.healthHost, "127.0.0.1");
  assert.equal(c.dryRun, false);
});

test("the environment alone is enough (systemd / Docker)", () => {
  const c = parseConfig([], {
    LADLE_CLUSTER: "mainnet-beta", RPC_URL: "https://mainnet.helius-rpc.com/?api-key=SECRET", KEEPER_KEYPAIR: "/srv/ladle/keeper.json",
    LADLE_MARKET: `${MARKET}, ${MARKET2}`, KEEPER_CU_PRICE: "25000", KEEPER_HEALTH_PORT: "8788",
    KEEPER_ALERT_WEBHOOK: "https://hooks.slack.com/services/T/B/X", KEEPER_ALERT_BELOW_SOL: "0.35", KEEPER_DRY_RUN: "1",
    LADLE_TREASURY: TREASURY,
  }, readFile);
  assert.equal(c.cluster, "mainnet-beta");
  assert.deepEqual(c.markets, [MARKET, MARKET2]);
  assert.equal(c.cuPrice, 25_000);
  assert.equal(c.healthPort, 8788);
  assert.equal(c.alertBelowLamports, 350_000_000n);
  assert.equal(c.dryRun, true);
  // the start log never shows the API key, the webhook token or the keypair path
  const shown = JSON.stringify(describeConfig(c));
  assert.ok(!shown.includes("SECRET"));
  assert.ok(!shown.includes("/services/"));
  assert.ok(!shown.includes("keeper.json"));
});

test("flags win over the environment, which wins over the deployment file", () => {
  const c = parseConfig(["--deployment", "/srv/ladle/mainnet.json", "--keypair", "/srv/ladle/keeper.json", "--rpc", "https://rpc.example.org"],
    { RPC_URL: "https://ignored.example.org" }, readFile);
  assert.equal(c.cluster, "mainnet-beta");
  assert.equal(c.rpc, "https://rpc.example.org");
  assert.deepEqual(c.markets, [MARKET]);
  assert.equal(c.programId, "85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj");
  assert.equal(c.treasury, TREASURY);
  const fromEnv = parseConfig(["--deployment", "/srv/ladle/mainnet.json", "--keypair", "/srv/ladle/keeper.json"], { RPC_URL: "https://env.example.org" }, readFile);
  assert.equal(fromEnv.rpc, "https://env.example.org");
  // the deployment's public RPC is used last, with a warning on mainnet
  const fromFile = parseConfig(["--deployment", "/srv/ladle/mainnet.json", "--keypair", "/srv/ladle/keeper.json"], {}, readFile);
  assert.equal(fromFile.rpc, "https://api.mainnet-beta.solana.com");
  assert.ok(fromFile.warnings.some((w) => /paid RPC/.test(w)));
});

test("mainnet needs the treasury the program was built with; devnet falls back to the SDK default", () => {
  const p = problems(["--cluster", "mainnet-beta", "--rpc", "https://rpc.example.org", "--keypair", "/srv/ladle/keeper.json", "--market", MARKET]);
  assert.ok(p.some((x) => /treasury is required on mainnet-beta/.test(x)), p.join("; "));
  assert.equal(parseConfig(base, {}, readFile).treasury, undefined);
  assert.ok(problems([...base, "--treasury", "not-a-key"]).some((x) => /treasury is not a base58 address/.test(x)));
});

test("no keypair, no default: the keeper refuses to guess", () => {
  const p = problems(["--cluster", "devnet", "--rpc", "https://api.devnet.solana.com", "--market", MARKET]);
  assert.ok(p.some((x) => /keypair is required/.test(x)), p.join("; "));
});

test("id.json is refused even when given explicitly", () => {
  const p = problems(["--cluster", "devnet", "--rpc", "https://api.devnet.solana.com", "--keypair", "/home/u/.config/solana/id.json", "--market", MARKET]);
  assert.ok(p.some((x) => /id\.json/.test(x)), p.join("; "));
});

test("a missing or malformed keypair file is reported without echoing its content", () => {
  assert.ok(problems([...base.slice(0, 4), "--keypair", "/nope.json", "--market", MARKET]).some((x) => /not found/.test(x)));
  const p = problems([...base.slice(0, 4), "--keypair", "/srv/ladle/bad.json", "--market", MARKET]);
  assert.ok(p.some((x) => /64 bytes/.test(x)));
  assert.ok(!p.join(" ").includes("[1,2,3]"));
});

test("cluster: required, known, and consistent with the RPC host and the deployment file", () => {
  assert.ok(problems(base.slice(2)).some((x) => /cluster is required/.test(x)));
  assert.ok(problems(["--cluster", "mainnet", ...base.slice(2)]).some((x) => /unknown cluster/.test(x)));
  assert.ok(problems(["--cluster", "mainnet-beta", ...base.slice(2)]).some((x) => /api\.devnet\.solana\.com is devnet/.test(x)));
  assert.ok(problems(["--cluster", "mainnet-beta", "--rpc", "https://devnet.helius-rpc.com/?api-key=x", ...base.slice(4)]).some((x) => /test cluster/.test(x)));
  assert.ok(problems(["--cluster", "devnet", "--deployment", "/srv/ladle/mainnet.json", "--keypair", "/srv/ladle/keeper.json"]).some((x) => /deployment file is for mainnet-beta/.test(x)));
});

test("every problem is listed at once", () => {
  const p = problems(["--interval", "10", "--cu-price", "cheap", "--page", "99", "--alert-webhook", "http://hooks.example.org/x", "--bogus"]);
  for (const re of [/unknown flag --bogus/, /cluster is required/, /RPC is required/, /keypair is required/, /market is required/, /--interval/, /--cu-price/, /--page/, /https/]) {
    assert.ok(p.some((x) => re.test(x)), `${re} not in: ${p.join("; ")}`);
  }
});

test("price cap, idle interval and unwrap floor are checked", () => {
  assert.ok(problems([...base, "--cu-price-min", "5000", "--cu-price-max", "1000"]).some((x) => /below --cu-price-min/.test(x)));
  assert.ok(problems([...base, "--idle-interval", "1000"]).some((x) => /--idle-interval/.test(x)));
  assert.equal(parseConfig([...base, "--idle-interval", "0"], {}, readFile).idleIntervalMs, 0);
  assert.ok(problems([...base, "--unwrap-min-sol", "0.0001"]).some((x) => /at least 0.001 SOL/.test(x)));
  assert.equal(parseConfig([...base, "--cu-price", "0"], {}, readFile).cuPrice, 0);
  assert.ok(parseConfig([...base, "--cu-price", "500000"], {}, readFile).warnings.some((w) => /above the cap/.test(w)));
});

test("SOL amounts convert exactly", () => {
  assert.equal(solToLamports("0.2"), 200_000_000n);
  assert.equal(solToLamports("1"), 1_000_000_000n);
  assert.equal(solToLamports("0.000000001"), 1n);
  assert.throws(() => solToLamports("-1"));
  assert.throws(() => solToLamports("1e9"));
});

test("scrubSecrets: URLs cut to their host, keys hidden, the configured secrets first", () => {
  const rpc = "https://x.solana-mainnet.quiknode.pro/0123456789abcdef/";
  assert.equal(scrubSecrets(`request to ${rpc} failed`, [rpc]), "request to https://x.solana-mainnet.quiknode.pro failed");
  assert.equal(scrubSecrets("FetchError: request to https://mainnet.helius-rpc.com/?api-key=abc failed, reason: x"), "FetchError: request to https://mainnet.helius-rpc.com failed, reason: x");
  assert.equal(scrubSecrets("ws wss://atlas.helius-rpc.com/?api-key=abc closed"), "ws wss://atlas.helius-rpc.com closed");
  assert.equal(scrubSecrets("bare api-key=abc&x=1"), "bare api-key=<hidden>&x=1");
  assert.equal(scrubSecrets("nothing to hide"), "nothing to hide");
});

test("redactUrl keeps only scheme and host", () => {
  assert.equal(redactUrl("https://mainnet.helius-rpc.com/?api-key=abc"), "https://mainnet.helius-rpc.com");
  assert.equal(redactUrl("https://x.solana-mainnet.quiknode.pro/0123456789abcdef/"), "https://x.solana-mainnet.quiknode.pro");
});

test("checkCluster compares the RPC's genesis hash with the configured cluster", async () => {
  const rpc = (h: string) => ({ getGenesisHash: async () => h });
  await checkCluster(rpc(GENESIS_HASH["mainnet-beta"]), "mainnet-beta");
  await checkCluster(rpc("anything"), "localnet");
  await assert.rejects(checkCluster(rpc(GENESIS_HASH.devnet), "mainnet-beta"), /serves devnet, but the cluster is set to mainnet-beta/);
  await assert.rejects(checkCluster(rpc("1111"), "devnet"), /unknown cluster/);
});

test("drain and the daily ORAO budget: off by default, from flags or the environment", () => {
  const c = parseConfig(base, {}, readFile);
  assert.equal(c.drain, false);
  assert.equal(c.vrfPerDay, 0);
  const d = parseConfig([...base, "--drain", "--vrf-per-day", "400"], {}, readFile);
  assert.equal(d.drain, true);
  assert.equal(d.vrfPerDay, 400);
  const e = parseConfig(base, { KEEPER_DRAIN: "1", KEEPER_VRF_PER_DAY: "720" }, readFile);
  assert.equal(e.drain, true);
  assert.equal(e.vrfPerDay, 720);
  assert.ok(problems([...base, "--vrf-per-day", "-1"]).some((p) => /vrf-per-day/.test(p)));
});

test("second review: drain-refund-all implies drain, the stall delay, the per-transaction fee ceiling and the price cap's range", () => {
  const c = parseConfig(base, {}, readFile);
  assert.equal(c.drainRefundAll, false);
  assert.equal(c.settleStallMs, 10 * 60_000);
  assert.equal(c.maxFeeLamports, 500_000n);
  const r = parseConfig([...base, "--drain-refund-all", "--settle-stall-min", "3", "--max-fee-sol", "0.001"], {}, readFile);
  assert.equal(r.drainRefundAll, true);
  assert.equal(r.drain, true);
  assert.equal(r.settleStallMs, 3 * 60_000);
  assert.equal(r.maxFeeLamports, 1_000_000n);
  assert.equal(parseConfig(base, { KEEPER_DRAIN_REFUND_ALL: "1" }, readFile).drain, true);
  // micro-lamports per unit: a cap in the millions is a unit mistake
  assert.ok(problems([...base, "--cu-price-max", "10000000"]).some((p) => /cu-price-max/.test(p)));
  assert.ok(problems([...base, "--max-fee-sol", "0.5"]).some((p) => /max-fee-sol/.test(p)));
});

test("final review: --shutdown needs no market (it serves every market of the program); without it a market is still required", () => {
  const noMarket = ["--cluster", "devnet", "--rpc", "https://api.devnet.solana.com", "--keypair", "/srv/ladle/keeper.json"];
  assert.ok(problems(noMarket).some((x) => /market is required/.test(x)));
  const c = parseConfig([...noMarket, "--shutdown"], {}, readFile);
  assert.equal(c.shutdown, true);
  assert.deepEqual(c.markets, []);
  assert.deepEqual(parseConfig(noMarket, { KEEPER_SHUTDOWN: "1" }, readFile).markets, []);
});
