/**
 * The operator tools' pure parts (second review, 2026-10-28):
 *  - create-market refuses settings the program would accept but that make
 *    a round past its floor refuse every entry (floor x bps below the
 *    minimum stake), and a VRF timeout above the program's bound;
 *  - report.ts encodes the discriminators it scans the program for in
 *    base58 the way the RPC reads them;
 *  - (final review) report.ts tells apart the entries a closed market left
 *    behind.
 *
 * Run: node --test "keeper/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { DISCRIMINATORS, type Entry, type Keyed } from "@pulled/sdk";
import { marketParams } from "../src/ops/create-market.ts";
import { base58, orphanEntries, windDownFromLogs } from "../src/ops/report.ts";

const flags = (o: Record<string, string>) => new Map<string, string | true>(Object.entries(o));
const problemsOf = (o: Record<string, string>): string[] => {
  try { marketParams(flags(o)); return []; } catch (e) { return (e as { problems?: string[] }).problems ?? [String(e)]; }
};

test("create-market: the defaults pass, exactly at the floor x bps limit", () => {
  // 0.5 SOL x 2000 bps = 0.1 SOL: the minimum stake still fits just past the floor
  assert.deepEqual(problemsOf({}), []);
  const p = marketParams(flags({}));
  assert.equal(p.entryFloorAmount * BigInt(p.maxEntryBps) / 10_000n, 100_000_000n);
});

test("create-market: a floor x bps below the minimum stake is refused, unless bps is 10000", () => {
  assert.ok(problemsOf({ "--max-entry-bps": "1000", "--entry-floor-sol": "0.5" }).some((x) => /minimum stake/.test(x)));
  assert.ok(problemsOf({ "--max-entry-bps": "2000", "--entry-floor-sol": "0.4" }).some((x) => /minimum stake/.test(x)));
  assert.deepEqual(problemsOf({ "--max-entry-bps": "10000", "--entry-floor-sol": "0" }), []);
  assert.deepEqual(problemsOf({ "--max-entry-bps": "1000", "--entry-floor-sol": "1" }), []);
});

test("create-market: the VRF timeout is bounded both ways, like the program", () => {
  assert.deepEqual(problemsOf({ "--vrf-timeout-slots": "9000" }), []);
  assert.ok(problemsOf({ "--vrf-timeout-slots": "9001" }).some((x) => /vrf-timeout-slots/.test(x)));
  assert.ok(problemsOf({ "--vrf-timeout-slots": "149" }).some((x) => /vrf-timeout-slots/.test(x)));
});

test("report: the wind-down build is told apart by start_wind_down (the normal build does not route it)", () => {
  const fallback = ["Program 85ig invoke [1]", "Program log: AnchorError occurred. Error Code: InstructionFallbackNotFound. Error Number: 101. Error Message: Fallback functions are not supported."];
  assert.equal(windDownFromLogs({ InstructionError: [0, { Custom: 101 }] }, fallback), false);
  assert.equal(windDownFromLogs(null, ["Program 85ig success"]), true);
  assert.equal(windDownFromLogs({ InstructionError: [0, { Custom: 6059 }] }, ["Program log: AnchorError thrown in programs/ladle/src/instructions/wind_down.rs:79. Error Code: NoticeAlreadyStarted."]), true);
  assert.equal(windDownFromLogs("AccountNotFound", []), null, "the payer has no SOL: unknown");
});

test("report: base58 of the discriminators, as getProgramAccounts memcmp reads it", () => {
  // a 32-byte value must give what PublicKey gives
  const k = new PublicKey("85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj");
  assert.equal(base58(k.toBytes()), k.toBase58());
  assert.equal(base58(new Uint8Array([0, 0, 1])), "112");
  for (const d of Object.values(DISCRIMINATORS)) assert.ok(/^[1-9A-HJ-NP-Za-km-z]+$/.test(base58(d)));
});

test("report: entries whose market is gone (a close_market by anyone) are told apart", () => {
  const k = () => Keypair.generate().publicKey;
  const [open, closed] = [k(), k()];
  const entry = (market: PublicKey): Keyed<Entry> => ({
    pubkey: k(),
    account: { window: k(), owner: k(), index: 0, amount: 1n, roll: 0n, share: 0n, claimed: 0n, refunded: true, bump: 255, market, windowIndex: 0n, settled: false },
  });
  const entries = [entry(open), entry(closed), entry(closed)];
  assert.deepEqual(orphanEntries([open], entries).map((e) => e.pubkey.toBase58()), entries.slice(1).map((e) => e.pubkey.toBase58()));
  assert.equal(orphanEntries([open, closed], entries).length, 0);
  assert.equal(orphanEntries([], entries).length, 3, "no market left: every entry is one");
});
