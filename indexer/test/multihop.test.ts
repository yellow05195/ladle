/**
 * Anti-double-count test: a Jupiter v6 multi-hop route must contribute one
 * leg per pool CPI, keyed by (signature, outerIndex, innerIndex), and the
 * aggregator's outer `route` instruction must never be counted.
 *
 * FIXTURE: SYNTHETIC. Hand-built from the documented structure of a Jupiter
 * v6 `route` transaction as returned by `getParsedTransaction` (jsonParsed):
 * one top-level instruction of JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
 * whose inner instructions are pool swaps (Raydium AMM v4, Orca Whirlpool)
 * each followed by the SPL Token transfers it performs. It is modelled on
 * the layout of the real mainnet multi-hop
 *   52Vrdcyxp9TsfWByYdJ6nrufSBNi17oX6EmkftVcLd9YV2o4A86n8ZQCQpkvm68UyFX5eKUFfAm9PqPk5Pa7ZhXa
 * (USDC -> ORE through Jupiter v6 with Orca Whirlpool + Meteora DLMM inner
 * swaps, cited in the Helius "explore transactions" docs). That transaction
 * was NOT fetched here (no RPC access from this machine): the account keys,
 * amounts and the route A -> B -> C -> B below are invented so that the same
 * pool is touched twice, which is the case this test is about.
 *
 * Run: node --test indexer/test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { VolumeIndexer, extractLegs, legKey, type ParsedTx } from "../src/index.ts";

const JUP6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const RAYDIUM = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const ORCA = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// mints: A = USDC (in), B = the PULLED token we index, C = wSOL
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PULL = "PULLEDtokenMint11111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";

// token accounts (indices into accountKeys)
const KEYS = [
  "UserWa11et111111111111111111111111111111111", // 0 signer
  "userUSDC11111111111111111111111111111111111", // 1
  "userPULL11111111111111111111111111111111111", // 2
  "userWSOL11111111111111111111111111111111111", // 3
  "poolP1USDC111111111111111111111111111111111", // 4  Raydium pool P1 (USDC/PULL) vaults
  "poolP1PULL111111111111111111111111111111111", // 5
  "poolP2PULL111111111111111111111111111111111", // 6  Orca pool P2 (PULL/wSOL) vaults
  "poolP2WSOL111111111111111111111111111111111", // 7
  "P1RaydiumAmmState11111111111111111111111111", // 8  pool P1 state
  "P2OrcaWhirlpool111111111111111111111111111", // 9  pool P2 state
  JUP6, RAYDIUM, ORCA, TOKEN,
];

const bal = (accountIndex: number, mint: string) => ({ accountIndex, mint, uiTokenAmount: { amount: "0", decimals: 6 } });
const transfer = (amount: bigint, source: string, destination: string) => ({
  programId: TOKEN, program: "spl-token",
  parsed: { type: "transfer", info: { amount: amount.toString(), source, destination, authority: KEYS[0] } },
});
const swap = (programId: string, pool: string, data: string) => ({ programId, accounts: [KEYS[0]!, pool, TOKEN], data });

const SIG = "5ynTHeTicMultiHopSignature1111111111111111111111111111111111111111111111111111111111";

/**
 * Route: 1000 USDC -> 400 PULL (P1, Raydium) -> 2 wSOL (P2, Orca) -> 150 PULL (P1 again, Raydium).
 * PULL moves in three legs: 400 (out of P1), 400 (into P2), 150 (out of P1).
 * Expected PULL volume = 950, counted as exactly three legs; P1 has two legs.
 */
const FIXTURE: ParsedTx = {
  slot: 460_000_000,
  blockTime: 1_761_200_000,
  transaction: {
    signatures: [SIG],
    message: {
      accountKeys: KEYS.map((pubkey) => ({ pubkey, signer: pubkey === KEYS[0], writable: true })),
      instructions: [
        // 0: compute budget (not an AMM, no inner)
        { programId: "ComputeBudget111111111111111111111111111111", accounts: [], data: "3gJqkocMWaMm" },
        // 1: Jupiter v6 `route` - the aggregator instruction; MUST NOT be counted
        { programId: JUP6, accounts: [TOKEN, KEYS[0]!, KEYS[1]!, KEYS[3]!, JUP6, PULL, JUP6], data: "e517cb977ae3ad2a0100000011640001" },
      ],
    },
  },
  meta: {
    err: null,
    preTokenBalances: [bal(1, USDC), bal(2, PULL), bal(3, WSOL), bal(4, USDC), bal(5, PULL), bal(6, PULL), bal(7, WSOL)],
    postTokenBalances: [bal(1, USDC), bal(2, PULL), bal(3, WSOL), bal(4, USDC), bal(5, PULL), bal(6, PULL), bal(7, WSOL)],
    innerInstructions: [
      {
        index: 1,
        instructions: [
          // leg 1: Raydium P1, USDC -> PULL
          swap(RAYDIUM, KEYS[8]!, "09e803000000000000"),
          transfer(1_000_000_000n, KEYS[1]!, KEYS[4]!), // 1000 USDC in
          transfer(400_000_000n, KEYS[5]!, KEYS[2]!),   // 400 PULL out
          // leg 2: Orca P2, PULL -> wSOL
          swap(ORCA, KEYS[9]!, "f8c69e91e17587c8"),
          transfer(400_000_000n, KEYS[2]!, KEYS[6]!),   // 400 PULL in
          transfer(2_000_000_000n, KEYS[7]!, KEYS[3]!), // 2 wSOL out
          // leg 3: Raydium P1 AGAIN, wSOL -> PULL (same pool as leg 1, different inner index)
          swap(RAYDIUM, KEYS[8]!, "09c800000000000000"),
          transfer(2_000_000_000n, KEYS[3]!, KEYS[4]!), // 2 wSOL in (fixture: P1 vault reused)
          transfer(150_000_000n, KEYS[5]!, KEYS[2]!),   // 150 PULL out
          // Jupiter's own event CPI (self-CPI to its event authority): not a pool, must be ignored
          { programId: JUP6, accounts: ["D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf"], data: "e445a52e51cb9a1d40c6cde8260871e2" },
        ],
      },
    ],
    logMessages: [
      "Program ComputeBudget111111111111111111111111111111 invoke [1]",
      "Program ComputeBudget111111111111111111111111111111 success",
      `Program ${JUP6} invoke [1]`,
      `Program ${RAYDIUM} invoke [2]`, `Program ${TOKEN} invoke [3]`, `Program ${TOKEN} success`, `Program ${TOKEN} invoke [3]`, `Program ${TOKEN} success`, `Program ${RAYDIUM} success`,
      `Program ${ORCA} invoke [2]`, `Program ${TOKEN} invoke [3]`, `Program ${TOKEN} success`, `Program ${TOKEN} invoke [3]`, `Program ${TOKEN} success`, `Program ${ORCA} success`,
      `Program ${RAYDIUM} invoke [2]`, `Program ${TOKEN} invoke [3]`, `Program ${TOKEN} success`, `Program ${TOKEN} invoke [3]`, `Program ${TOKEN} success`, `Program ${RAYDIUM} success`,
      `Program ${JUP6} success`,
    ],
  },
};

test("each pool leg of a Jupiter multi-hop is counted once, by (signature, outer, inner)", () => {
  const legs = extractLegs(FIXTURE, PULL);
  assert.equal(legs.length, 3, "three pool legs");
  // the aggregator instruction itself is not a leg
  assert.ok(legs.every((l) => l.program !== JUP6), "no Jupiter leg");
  assert.ok(legs.every((l) => l.outerIndex === 1), "all inside the route instruction");
  assert.deepEqual(legs.map((l) => l.innerIndex), [0, 3, 6], "inner indices of the three swaps");
  assert.deepEqual(legs.map((l) => l.programName), ["raydium-amm-v4", "orca-whirlpool", "raydium-amm-v4"]);
  assert.deepEqual(legs.map((l) => l.volume), [400_000_000n, 400_000_000n, 150_000_000n]);
  // same pool twice -> two legs with distinct keys
  const keys = new Set(legs.map(legKey));
  assert.equal(keys.size, 3, "keys are distinct");
  assert.equal(legs.filter((l) => l.pool === KEYS[8]).length, 2, "pool P1 touched twice");
});

test("volume is counted exactly once per leg across re-ingestion", () => {
  const idx = new VolumeIndexer(PULL);
  const first = idx.ingest(FIXTURE);
  assert.equal(first.length, 3);
  // re-ingest the same transaction (backfill overlap): nothing new
  const again = idx.ingest(FIXTURE);
  assert.equal(again.length, 0);
  // ingesting a copy with a fresh object identity but the same signature: still nothing new
  const copy = JSON.parse(JSON.stringify(FIXTURE)) as ParsedTx;
  assert.equal(idx.ingest(copy).length, 0);

  const pools = idx.pools();
  const p1 = pools.find((p) => p.pool === KEYS[8]);
  const p2 = pools.find((p) => p.pool === KEYS[9]);
  assert.ok(p1 && p2);
  assert.equal(p1.legs, 2);
  assert.equal(p1.volume, 550_000_000n, "P1: 400 + 150");
  assert.equal(p2.legs, 1);
  assert.equal(p2.volume, 400_000_000n);
  const total = pools.reduce((a, p) => a + p.volume, 0n);
  assert.equal(total, 950_000_000n, "sum over pools == sum over legs, not doubled by the route");
  assert.equal(idx.dedupe.legCount, 3);
});

test("a top-level swap (no aggregator) is one leg with innerIndex -1", () => {
  const tx: ParsedTx = {
    transaction: {
      signatures: ["DirectSwap111111111111111111111111111111111111111111111111111111111111111111111111111"],
      message: {
        accountKeys: KEYS.map((pubkey) => ({ pubkey })),
        instructions: [swap(ORCA, KEYS[9]!, "f8c69e91e17587c8")],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [bal(2, PULL), bal(6, PULL), bal(3, WSOL), bal(7, WSOL)],
      postTokenBalances: [],
      innerInstructions: [{ index: 0, instructions: [transfer(10_000_000n, KEYS[2]!, KEYS[6]!), transfer(50_000n, KEYS[7]!, KEYS[3]!)] }],
      logMessages: [],
    },
  };
  const legs = extractLegs(tx, PULL);
  assert.equal(legs.length, 1);
  assert.equal(legs[0]!.innerIndex, -1);
  assert.equal(legs[0]!.volume, 10_000_000n);
});

test("failed transactions and transactions without the tracked mint contribute nothing", () => {
  const failed = { ...FIXTURE, meta: { ...FIXTURE.meta!, err: { InstructionError: [1, "Custom"] } } } as ParsedTx;
  assert.equal(extractLegs(failed, PULL).length, 0);
  assert.equal(extractLegs(FIXTURE, "SomeOtherMint1111111111111111111111111111111").length, 0);
});
