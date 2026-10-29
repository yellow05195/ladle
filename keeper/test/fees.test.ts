/**
 * Priority fee: the auto estimate, the floor and the cap, the boost after an
 * expiry, and the one thing that could break sending: every transaction
 * shape the keeper builds must still fit a legacy transaction (1232 bytes)
 * once the compute-budget instructions are added, in the worst case.
 *
 * Run: node --test "keeper/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ComputeBudgetProgram, Keypair, PACKET_DATA_SIZE, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, MAX_TX_COMPUTE_UNITS, ONE_TX_SETTLE_MAX, SETTLE_PAGE_LEGACY, TALLY_PAGE_LEGACY, TOKEN_PROGRAM_ID,
  closeEntryIx, closeWindowIx, computeUnitLimitIx, fulfillIx, openWindowIx, refundEntryIx, refundWindowIx, requestVrfIx, sealIx,
  settlePageComputeUnits, settlePageIx, tallyPageComputeUnits, tallyPageIx,
} from "@pulled/sdk";
import { PriorityFees, capPriceForFee, computeUnitLimitOf, computeUnitPriceIx, isComputeUnitLimitIx, legacySize, limitFromSimulation, percentile, writableAccounts } from "../src/fees.ts";
import { unwrapInstructions } from "../src/loop.ts";

const k = () => Keypair.generate().publicKey;

test("percentile picks from the sorted values", () => {
  assert.equal(percentile([], 0.75), 0);
  assert.equal(percentile([5], 0.75), 5);
  assert.equal(percentile([0, 0, 0, 100], 0.75), 100);
  assert.equal(percentile([40, 10, 30, 20], 0.5), 30);
});

test("auto price: recent fees on the written accounts, raised to the floor, capped", async () => {
  let fees = [0, 0, 0, 0];
  let calls = 0;
  const rpc = { getRecentPrioritizationFees: async () => { calls++; return fees.map((f, i) => ({ slot: i, prioritizationFee: f })); } };
  const pf = new PriorityFees(rpc as never, { price: "auto", min: 1_000, max: 100_000, cacheMs: 10_000 });
  const a = [k()];
  assert.equal(await pf.price(a, 0), 1_000); // all zero: the floor
  fees = [5_000, 6_000, 7_000, 8_000];
  assert.equal(await pf.price(a, 5_000), 1_000); // cached for 10 s
  assert.equal(calls, 1);
  assert.equal(await pf.price(a, 11_000), 8_000); // p75 of four values is the largest
  fees = [900_000, 900_000];
  assert.equal(await pf.price([k()], 11_000), 100_000); // the cap
});

test("an estimate failure falls back to the floor, never blocks", async () => {
  const pf = new PriorityFees({ getRecentPrioritizationFees: async () => { throw new Error("429"); } } as never, { price: "auto", min: 2_000, max: 50_000 });
  assert.equal(await pf.price([k()]), 2_000);
});

test("fixed price, boost after an expiry, back down after landings, cap holds", async () => {
  const pf = new PriorityFees({ getRecentPrioritizationFees: async () => [] } as never, { price: 20_000, min: 0, max: 100_000 });
  assert.equal(await pf.price([]), 20_000);
  pf.expired();
  assert.equal(await pf.price([]), 40_000);
  pf.expired(); pf.expired(); pf.expired();
  assert.equal(await pf.price([]), 100_000);
  for (let i = 0; i < 10; i++) pf.landed();
  assert.equal(await pf.price([]), 20_000);
});

test("price 0 or cap 0 disables the priority fee", async () => {
  const off = new PriorityFees({ getRecentPrioritizationFees: async () => [] } as never, { price: 0, min: 1_000, max: 100_000 });
  assert.equal(off.enabled, false);
  assert.equal(await off.price([k()]), 0);
  assert.equal(new PriorityFees({} as never, { price: "auto", min: 0, max: 0 }).enabled, false);
});

test("the per-transaction fee ceiling lowers the price, never raises it", () => {
  // 0.0005 SOL on a 1.4M-unit limit: at most 357,142 micro-lamports per unit (a cap of 10M would have paid 0.014 SOL)
  assert.equal(capPriceForFee(10_000_000, 1_400_000, 500_000n), 357_142);
  assert.ok((357_142n * 1_400_000n) / 1_000_000n <= 500_000n);
  assert.equal(capPriceForFee(20_000, 200_000, 500_000n), 20_000);
  assert.equal(capPriceForFee(20_000, 200_000, 0n), 0);
  assert.equal(capPriceForFee(0, 200_000, 500_000n), 0);
  assert.equal(computeUnitLimitOf([computeUnitPriceIx(5)]), null);
  assert.equal(computeUnitLimitOf([ComputeBudgetProgram.setComputeUnitLimit({ units: 321_000 })]), 321_000);
});

test("compute-budget helpers", () => {
  assert.ok(isComputeUnitLimitIx(computeUnitLimitIx(100_000)));
  assert.ok(!isComputeUnitLimitIx(computeUnitPriceIx(1_000)));
  assert.ok(!isComputeUnitLimitIx(sealIx({ market: k(), window: k() })));
  assert.equal(limitFromSimulation(100_000), 120_000);
  assert.equal(limitFromSimulation(2_000_000), MAX_TX_COMPUTE_UNITS);
  const market = k(), window = k();
  const w = writableAccounts([sealIx({ market, window }), ComputeBudgetProgram.setComputeUnitLimit({ units: 1 })]);
  assert.deepEqual(w.map((x) => x.toBase58()).sort(), [market, window].map((x) => x.toBase58()).sort());
});

test("unwrap closes the keeper's wSOL ATA to the keeper and re-creates it in the same transaction", () => {
  const owner = k();
  const wsol = k();
  const [close, create] = unwrapInstructions(owner, wsol);
  assert.ok(close!.programId.equals(TOKEN_PROGRAM_ID));
  assert.equal(close!.data[0], 9); // CloseAccount
  assert.ok(close!.keys[0]!.pubkey.equals(wsol));
  assert.ok(close!.keys[1]!.pubkey.equals(owner)); // destination
  assert.ok(close!.keys[2]!.pubkey.equals(owner)); // authority
  assert.ok(create!.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.equal(create!.data[0], 1); // CreateIdempotent
  assert.ok(create!.keys[1]!.pubkey.equals(wsol));
  assert.ok(create!.keys[3]!.pubkey.equals(NATIVE_MINT));
});

/* ---------------- every keeper transaction still fits, priced ---------------- */

const payer = k();
const priced = (ixs: TransactionInstruction[]) =>
  legacySize([...(ixs.some(isComputeUnitLimitIx) ? [] : [computeUnitLimitIx(MAX_TX_COMPUTE_UNITS)]), computeUnitPriceIx(100_000), ...ixs], payer);
const fits = (name: string, ixs: TransactionInstruction[]) => {
  const n = priced(ixs);
  assert.ok(n <= PACKET_DATA_SIZE, `${name}: ${n} bytes with the compute-budget instructions`);
};

// worst case: distinct accounts everywhere, a market with a host integration
const market = k(), window = k(), prev = k(), next = k(), quoteMint = k(), escrow = k(), quoteVault = k(), quoteTokenProgram = k();
const tallyAccs = { payer, market, window, quoteMint, escrow, quoteVault, platformQuoteAccount: k(), keeperQuoteAccount: k(), integration: k(), hostQuoteAccount: k(), quoteTokenProgram };
const entries = (n: number) => Array.from({ length: n }, () => k());
const open = () => openWindowIx({ payer, market, prevWindow: prev, window: next, quoteMint, escrow: k(), quoteTokenProgram });
const closeWin = (w: PublicKey) => closeWindowIx({ market, window: w, opener: k(), quoteMint, escrow: k(), quoteVault, quoteTokenProgram });
const ataIx = (owner: PublicKey) => createAssociatedTokenAccountIdempotentInstruction(payer, k(), owner, quoteMint, quoteTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);

test("seal + request_vrf + open_window(next), priced", () => {
  fits("seal+request+open", [sealIx({ market, window }), requestVrfIx({ payer, window, treasury: k(), vrfRequest: k() }, new Uint8Array(32)), open()]);
});

test("empty round: seal + open_window(next) + close_window, priced", () => {
  fits("seal+open+close", [sealIx({ market, window }), open(), closeWin(window)]);
});

test("one entry: seal + tally + settle + open, priced", () => {
  const e = entries(1);
  fits("seal+settle(1)", [computeUnitLimitIx(400_000), sealIx({ market, window }), tallyPageIx(tallyAccs, 0, 1, e), settlePageIx({ market, window }, 0, 1, e), open()]);
});

test("pages at their legacy maximum, priced", () => {
  const t = entries(TALLY_PAGE_LEGACY);
  fits(`tally_page(${TALLY_PAGE_LEGACY})`, [computeUnitLimitIx(tallyPageComputeUnits(TALLY_PAGE_LEGACY)), tallyPageIx(tallyAccs, 0, TALLY_PAGE_LEGACY, t)]);
  const s = entries(SETTLE_PAGE_LEGACY);
  fits(`settle_page(${SETTLE_PAGE_LEGACY})`, [computeUnitLimitIx(settlePageComputeUnits(SETTLE_PAGE_LEGACY)), settlePageIx({ market, window }, 0, SETTLE_PAGE_LEGACY, s)]);
  const o = entries(ONE_TX_SETTLE_MAX);
  fits(`fulfill+tally+settle(${ONE_TX_SETTLE_MAX})`, [
    computeUnitLimitIx(1_000_000), fulfillIx({ window, vrfRequest: k() }),
    tallyPageIx(tallyAccs, 0, ONE_TX_SETTLE_MAX, o), settlePageIx({ market, window }, 0, ONE_TX_SETTLE_MAX, o),
  ]);
});

test("fee accounts, fulfill, refund_window, unwrap, priced", () => {
  fits("fee_accounts", [ataIx(k()), ataIx(k()), ataIx(k())]);
  fits("fulfill", [fulfillIx({ window, vrfRequest: k() })]);
  fits("refund_window", [refundWindowIx({ market, window, vrfRequest: k() })]);
  fits("unwrap", unwrapInstructions(payer, k()));
});

test("batches: refund_entry x5 priced / x6 unpriced (with ATA and close_entry), close_entry x8, close_window x6", () => {
  const refunds = (n: number) => {
    const out: TransactionInstruction[] = [];
    for (let i = 0; i < n; i++) {
      const owner = k(), entry = k(), recipient = k();
      out.push(
        createAssociatedTokenAccountIdempotentInstruction(payer, recipient, owner, quoteMint, quoteTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
        refundEntryIx({ market, window, entry, quoteMint, escrow, recipient, quoteTokenProgram }),
        closeEntryIx({ entry, owner }),
      );
    }
    return out;
  };
  // loop.ts: 5 refunds per transaction when a priority fee is on, 6 without
  fits("refund_entry x5", refunds(5));
  assert.ok(legacySize(refunds(6), payer) <= PACKET_DATA_SIZE, "refund_entry x6 unpriced");
  assert.ok(priced(refunds(6)) > PACKET_DATA_SIZE, "x6 would not fit priced: keep the batch at 5 when priced");
  fits("close_entry x8", Array.from({ length: 8 }, () => closeEntryIx({ entry: k(), owner: k() })));
  fits("close_window x6", Array.from({ length: 6 }, () => closeWin(k())));
});
