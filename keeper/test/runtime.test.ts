/**
 * The always-on parts around the loop: alarms and the webhook, the /health
 * endpoint, the low-balance alert raised by a tick, and a stop that does not
 * wait for the tick interval. No network: the RPC is a stub, the webhook a
 * local HTTP server.
 *
 * Run: node --test "keeper/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Keypair, type Connection } from "@solana/web3.js";
import { Alarm, postWebhook, sol } from "../src/alerts.ts";
import { startHealthServer } from "../src/health.ts";
import { Keeper, type LogLine } from "../src/loop.ts";

async function webhookSink(status = 200) {
  const got: Record<string, unknown>[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { got.push(JSON.parse(body)); res.writeHead(status); res.end(); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  return { url, got, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("an alarm is raised once, repeated after the interval, cleared once", () => {
  const a = new Alarm("low_balance", 1_000);
  assert.equal(a.update(false, 0), null);
  assert.equal(a.update(true, 0), "raise");
  assert.equal(a.update(true, 500), null);
  assert.equal(a.update(true, 1_000), "repeat");
  assert.equal(a.update(true, 1_500), null);
  assert.equal(a.update(false, 1_600), "clear");
  assert.equal(a.update(false, 5_000), null);
  const once = new Alarm("x", 0);
  assert.equal(once.update(true, 0), "raise");
  assert.equal(once.update(true, 10 ** 9), null);
});

test("the webhook gets Slack and Discord fields; failures come back as a message", async () => {
  const sink = await webhookSink();
  const payload = { level: "warn" as const, alarm: "low_balance", event: "raise" as const, text: "hello", keeper: "K", cluster: "devnet", ts: "t" };
  assert.equal(await postWebhook(sink.url, payload), null);
  assert.equal(sink.got[0]!.text, "hello");
  assert.equal(sink.got[0]!.content, "hello");
  await sink.close();
  const bad = await webhookSink(500);
  assert.equal(await postWebhook(bad.url, payload), "webhook answered 500");
  await bad.close();
  assert.match((await postWebhook("http://127.0.0.1:9/none", payload, 1_000))!, /.+/);
  assert.equal(sol(123_456_789n), "0.1235");
  assert.equal(sol(1_000_000_000n), "1");
});

test("GET /health answers 200 when ok, 503 with the reasons otherwise, 404 elsewhere", async () => {
  let report = { ok: true, reasons: [] as string[] };
  const server = await startHealthServer("127.0.0.1", 0, () => report);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  report = { ok: false, reasons: ["no successful tick for 300 s"] };
  r = await fetch(`${base}/health`);
  assert.equal(r.status, 503);
  assert.deepEqual((await r.json()).reasons, ["no successful tick for 300 s"]);
  assert.equal((await fetch(`${base}/`)).status, 404);
  await new Promise<void>((res) => server.close(() => res()));
});

function stubConnection(balanceLamports: number): Connection {
  return {
    getBalance: async () => balanceLamports,
    getRecentPrioritizationFees: async () => [],
    getAccountInfo: async () => null,
  } as unknown as Connection;
}

test("a low balance raises an alert (log + webhook) and turns /health unhealthy", async () => {
  const sink = await webhookSink();
  const lines: LogLine[] = [];
  const keeper = new Keeper({
    connection: stubConnection(100_000_000), keypair: Keypair.generate(), markets: [], cluster: "devnet",
    alertBelowLamports: 200_000_000n, alertWebhook: sink.url, log: (l) => lines.push(l),
  });
  assert.deepEqual(keeper.health().reasons, ["starting"]);
  await keeper.tickOnce();
  const h = keeper.health();
  assert.equal(h.ok, false);
  assert.deepEqual(h.reasons, ["balance below 0.2 SOL"]);
  assert.equal(h.balanceSol, 0.1);
  assert.ok(lines.some((l) => l.level === "warn" && l.action === "low_balance" && /0\.1 SOL/.test(l.msg ?? "")));
  for (let i = 0; i < 50 && sink.got.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(sink.got[0]!.alarm, "low_balance");
  assert.equal(sink.got[0]!.event, "raise");
  assert.match(String(sink.got[0]!.text), /below 0\.2 SOL/);
  await sink.close();
});

test("a funded keeper with good ticks is healthy", async () => {
  const keeper = new Keeper({ connection: stubConnection(2_000_000_000), keypair: Keypair.generate(), markets: [], alertBelowLamports: 200_000_000n, log: () => {} });
  await keeper.tickOnce();
  const h = keeper.health();
  assert.equal(h.ok, true);
  assert.deepEqual(h.reasons, []);
  assert.equal(h.balanceSol, 2);
});

test("stop() ends run() without waiting for the tick interval", async () => {
  const lines: LogLine[] = [];
  const keeper = new Keeper({ connection: stubConnection(2_000_000_000), keypair: Keypair.generate(), markets: [], intervalMs: 60_000, log: (l) => lines.push(l) });
  const t0 = Date.now();
  const running = keeper.run();
  await new Promise((r) => setTimeout(r, 100));
  keeper.stop();
  await running;
  assert.ok(Date.now() - t0 < 5_000, `run() took ${Date.now() - t0} ms to stop`);
  assert.ok(lines.some((l) => l.action === "stopped"));
  assert.ok(keeper.health().reasons.includes("stopping"));
});
