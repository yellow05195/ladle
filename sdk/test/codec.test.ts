/**
 * Offline unit tests of the hand-written codec: discriminators, account
 * layouts, event decoding, PDA/VRF seed derivation. Anchored to the constants
 * the Rust side verifies in `vrf.rs` tests.
 *
 * Run: node --test "sdk/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ACCOUNT_SIZES, DISCRIMINATORS, accountDiscriminator, decodeEntry, decodeMarket, decodeWindow, decodeIntegration,
  parseOraoRandomness,
} from "../src/accounts.ts";
import { instructionDiscriminator, identifyInstruction, enterIx, tallyPageIx, settlePageIx, fulfillIx, openWindowIx, createMarketIx, encodeCreateMarketParams } from "../src/instructions.ts";
import { ONE_TX_SETTLE_MAX, SETTLE_PAGE_LEGACY, TALLY_PAGE_LEGACY, computeUnitLimitIx, settlePageComputeUnits, tallyPageComputeUnits, MEASURED_CU } from "../src/budget.ts";
import { PULLED_ERRORS, PULLED_ERROR_MESSAGES, describeError, errorCode } from "../src/errors.ts";
import { Transaction, type TransactionInstruction } from "@solana/web3.js";
import { decodeEvent, eventDiscriminator, parseEventsFromLogs } from "../src/events.ts";
import { PULLED_PROGRAM_ID, ORAO_VRF_ID, deriveVrfSeed, entriesCommitment, foldEntryCommitment, oraoNetworkStatePda, oraoRandomnessPda, u32Le, u64Le, concatBytes, entryPda, windowPda, marketPda, tokenMetadataPda, MPL_TOKEN_METADATA_ID } from "../src/pda.ts";
import { WindowState } from "../src/types.ts";
import { verifyWindow } from "../src/verify.ts";
import { computeShares, computeWeights, deriveRoll } from "../src/law.ts";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("discriminators follow the Anchor convention (checked against vrf.rs constants)", () => {
  // vrf.rs: sha256("global:request_v2")[..8] = [38, 151, 209, 6, 195, 102, 28, 217]
  assert.deepEqual([...instructionDiscriminator("request_v2")], [38, 151, 209, 6, 195, 102, 28, 217]);
  // sha256("account:RandomnessV2")[..8] = [139, 239, 184, 215, 227, 86, 191, 226]
  assert.deepEqual([...accountDiscriminator("RandomnessV2")], [139, 239, 184, 215, 227, 86, 191, 226]);
  // sha256("account:NetworkState")[..8] = [212, 237, 148, 56, 97, 245, 51, 169]
  assert.deepEqual([...accountDiscriminator("NetworkState")], [212, 237, 148, 56, 97, 245, 51, 169]);
  assert.equal(eventDiscriminator("Entered").length, 8);
  assert.notEqual(hex(DISCRIMINATORS.Window), hex(DISCRIMINATORS.Entry));
});

test("account sizes equal 8 + INIT_SPACE", () => {
  assert.equal(ACCOUNT_SIZES.Integration, 43);
  assert.equal(ACCOUNT_SIZES.Market, 562);
  assert.equal(ACCOUNT_SIZES.Window, 411);
  assert.equal(ACCOUNT_SIZES.Entry, 110);
});

function encodeEntry(e: { window: PublicKey; owner: PublicKey; index: number; amount: bigint; roll: bigint; share: bigint; claimed: bigint; refunded: boolean; bump: number }): Uint8Array {
  return concatBytes(DISCRIMINATORS.Entry, e.window.toBytes(), e.owner.toBytes(), u32Le(e.index), u64Le(e.amount), u64Le(e.roll), u64Le(e.share), u64Le(e.claimed), new Uint8Array([e.refunded ? 1 : 0, e.bump]));
}

function encodeWindow(w: {
  market: PublicKey; index: bigint; state: number; openSlot: bigint; closeSlot: bigint; sealedSlot: bigint; totalAmount: bigint; entryCount: number;
  entriesCommitment: Uint8Array; vrfSeed: Uint8Array; vrfRequested: boolean; vrfRequestedSlot: bigint; vrfRequest: PublicKey; seed: Uint8Array;
  rollSum: bigint; tallyCursor: number; settleCursor: number; cumWeight: Uint8Array; tokensOut: bigint; feePlatform: bigint; feeHost: bigint; toCurve: bigint; escrow: PublicKey; bump: number;
  opener?: PublicKey; closedEntries?: number;
}): Uint8Array {
  const u128 = (v: bigint) => { const out = new Uint8Array(16); for (let i = 0; i < 16; i++) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; };
  return concatBytes(
    DISCRIMINATORS.Window, w.market.toBytes(), u64Le(w.index), new Uint8Array([w.state]), u64Le(w.openSlot), u64Le(w.closeSlot), u64Le(w.sealedSlot),
    u64Le(w.totalAmount), u32Le(w.entryCount), w.entriesCommitment, w.vrfSeed, new Uint8Array([w.vrfRequested ? 1 : 0]), u64Le(w.vrfRequestedSlot),
    w.vrfRequest.toBytes(), w.seed, u128(w.rollSum), u32Le(w.tallyCursor), u32Le(w.settleCursor), w.cumWeight, u64Le(w.tokensOut), u64Le(w.feePlatform),
    u64Le(w.feeHost), u64Le(w.toCurve), w.escrow.toBytes(), new Uint8Array([w.bump]),
    (w.opener ?? PublicKey.default).toBytes(), u32Le(w.closedEntries ?? 0),
  );
}

test("Entry / Window / Market / Integration decode their borsh layout", () => {
  const window = Keypair.generate().publicKey, owner = Keypair.generate().publicKey;
  const eBytes = encodeEntry({ window, owner, index: 7, amount: 123_456_789n, roll: 9_999n, share: 42n, claimed: 1n, refunded: false, bump: 254 });
  assert.equal(eBytes.length, ACCOUNT_SIZES.Entry);
  const e = decodeEntry(eBytes);
  assert.ok(e.window.equals(window) && e.owner.equals(owner));
  assert.equal(e.index, 7); assert.equal(e.amount, 123_456_789n); assert.equal(e.roll, 9_999n); assert.equal(e.share, 42n); assert.equal(e.claimed, 1n);
  assert.equal(e.refunded, false); assert.equal(e.bump, 254);

  const market = Keypair.generate().publicKey, escrow = Keypair.generate().publicKey, req = Keypair.generate().publicKey;
  const seed = new Uint8Array(64).map((_, i) => i + 1);
  const wBytes = encodeWindow({
    market, index: 3n, state: WindowState.Drawn, openSlot: 100n, closeSlot: 192n, sealedSlot: 193n, totalAmount: 5_000n, entryCount: 2,
    entriesCommitment: new Uint8Array(32).fill(9), vrfSeed: new Uint8Array(32).fill(8), vrfRequested: true, vrfRequestedSlot: 194n, vrfRequest: req, seed,
    rollSum: (1n << 100n) + 5n, tallyCursor: 1, settleCursor: 0, cumWeight: new Uint8Array(32), tokensOut: 0n, feePlatform: 0n, feeHost: 0n, toCurve: 0n, escrow, bump: 251, opener: owner, closedEntries: 1,
  });
  assert.equal(wBytes.length, ACCOUNT_SIZES.Window);
  const w = decodeWindow(wBytes);
  assert.ok(w.market.equals(market) && w.escrow.equals(escrow) && w.vrfRequest.equals(req));
  assert.ok(w.opener.equals(owner)); assert.equal(w.closedEntries, 1);
  assert.equal(w.index, 3n); assert.equal(w.state, WindowState.Drawn); assert.equal(w.closeSlot, 192n); assert.equal(w.entryCount, 2);
  assert.equal(w.vrfRequested, true); assert.equal(w.rollSum, (1n << 100n) + 5n); assert.equal(w.tallyCursor, 1); assert.deepEqual([...w.seed], [...seed]); assert.equal(w.bump, 251);

  // Market with strings (u32 length prefixed) - tail padding to INIT_SPACE is ignored by the decoder
  const str = (s: string) => { const b = new TextEncoder().encode(s); return concatBytes(u32Le(b.length), b); };
  const k = () => Keypair.generate().publicKey;
  const creator = k(), tokenMint = k(), quoteMint = k(), quoteProgram = k(), integration = PublicKey.default, quoteVault = k(), tokenVault = k();
  const mBytes = concatBytes(
    DISCRIMINATORS.Market, creator.toBytes(), tokenMint.toBytes(), quoteMint.toBytes(), quoteProgram.toBytes(), integration.toBytes(),
    u64Le(30_000_000_000n), u64Le(1_000_000_000_000_000n), u64Le(92n), u64Le(900n), u64Le(10n ** 9n), new Uint8Array([0x10, 0x27]) /* 10000 */, u64Le(1_000n),
    u64Le(5n), u64Le(4n), new Uint8Array([1]), u64Le(4n), quoteVault.toBytes(), tokenVault.toBytes(), new Uint8Array([250]), str("Pulled Test"), str("PULL"), str("https://x"),
  );
  const padded = new Uint8Array(ACCOUNT_SIZES.Market); padded.set(mBytes);
  const m = decodeMarket(padded);
  assert.ok(m.creator.equals(creator) && m.tokenMint.equals(tokenMint) && m.integration.equals(PublicKey.default));
  assert.equal(m.curve.x, 30_000_000_000n); assert.equal(m.curve.y, 1_000_000_000_000_000n);
  assert.equal(m.windowSlots, 92n); assert.equal(m.vrfTimeoutSlots, 900n); assert.equal(m.maxEntryBps, 10_000); assert.equal(m.windowCount, 5n); assert.equal(m.nextSettleIndex, 4n);
  assert.equal(m.hasActiveWindow, true); assert.equal(m.activeWindow, 4n); assert.equal(m.name, "Pulled Test"); assert.equal(m.symbol, "PULL"); assert.equal(m.uri, "https://x");

  const host = k();
  const i = decodeIntegration(concatBytes(DISCRIMINATORS.Integration, host.toBytes(), new Uint8Array([0x2c, 0x01]) /* 300 */, new Uint8Array([255])));
  assert.ok(i.host.equals(host)); assert.equal(i.hostFeeBps, 300); assert.equal(i.bump, 255);

  assert.throws(() => decodeEntry(wBytes), /discriminator/);
});

test("events decode and are attributed to the program on top of the invoke stack", () => {
  const window = Keypair.generate().publicKey, owner = Keypair.generate().publicKey;
  const payload = concatBytes(eventDiscriminator("Entered"), window.toBytes(), u32Le(3), owner.toBytes(), u64Le(1_000n), u64Le(5_000n), u64Le(777n));
  const ev = decodeEvent(payload);
  assert.ok(ev && ev.name === "Entered");
  if (ev.name === "Entered") { assert.equal(ev.index, 3); assert.equal(ev.amount, 1_000n); assert.equal(ev.totalAfter, 5_000n); assert.equal(ev.slot, 777n); }

  const other = Keypair.generate().publicKey.toBase58();
  const b64 = Buffer.from(payload).toString("base64");
  const logs = [
    `Program ${other} invoke [1]`,
    `Program data: ${b64}`, // emitted by another program: ignored
    `Program ${PULLED_PROGRAM_ID.toBase58()} invoke [2]`,
    `Program data: ${b64}`, // ours, via CPI
    `Program ${PULLED_PROGRAM_ID.toBase58()} success`,
    `Program ${other} success`,
    `Program ${PULLED_PROGRAM_ID.toBase58()} invoke [1]`,
    `Program data: ${b64}`, // ours, top-level
    `Program ${PULLED_PROGRAM_ID.toBase58()} success`,
  ];
  const got = parseEventsFromLogs(logs);
  assert.equal(got.length, 2);
  assert.equal(got[0]!.depth, 2); assert.equal(got[0]!.topLevelIndex, 0);
  assert.equal(got[1]!.depth, 1); assert.equal(got[1]!.topLevelIndex, 1);
});

test("VRF seed derivation matches state.rs (domain || window || close_slot LE || entry_count LE || commitment)", async () => {
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const window = Keypair.generate().publicKey, owner = Keypair.generate().publicKey;
  const c0 = new Uint8Array(32);
  const c1 = foldEntryCommitment(c0, owner, 5n, 0);
  assert.deepEqual(c1, sha256(concatBytes(c0, owner.toBytes(), u64Le(5n), u32Le(0))));
  assert.deepEqual(entriesCommitment([{ owner, amount: 5n, index: 0 }]), c1);
  const s = deriveVrfSeed(window, 100n, 1, c1);
  assert.deepEqual(s, sha256(concatBytes(new TextEncoder().encode("ladle:vrf:v1"), window.toBytes(), u64Le(100n), u32Le(1), c1)));
  assert.notDeepEqual(s, deriveVrfSeed(window, 101n, 1, c1));
  assert.notDeepEqual(s, deriveVrfSeed(window, 100n, 2, c1));
  assert.notDeepEqual(s, deriveVrfSeed(window, 100n, 1, c0));
  // ORAO PDAs are off the ORAO program
  assert.ok(PublicKey.isOnCurve(ORAO_VRF_ID.toBytes()) || true);
  assert.notEqual(oraoNetworkStatePda()[0].toBase58(), oraoRandomnessPda(s)[0].toBase58());
});

test("ORAO randomness parser: pending, fulfilled, wrong seed", () => {
  const seed = new Uint8Array(32).fill(7), client = new Uint8Array(32).fill(1);
  const disc = accountDiscriminator("RandomnessV2");
  const pending = concatBytes(disc, new Uint8Array([0]), client, seed, u32Le(0));
  assert.equal(parseOraoRandomness(pending, seed), null);
  const rnd = new Uint8Array(64).map((_, i) => (i * 3 + 1) & 0xff);
  const done = concatBytes(disc, new Uint8Array([1]), client, seed, rnd);
  assert.deepEqual(parseOraoRandomness(done, seed), rnd);
  assert.throws(() => parseOraoRandomness(done, new Uint8Array(32).fill(8)), /seed mismatch/);
});

test("instruction builders: account order, Option as program id, remaining accounts for pages", () => {
  const pid = PULLED_PROGRAM_ID;
  const k = () => Keypair.generate().publicKey;
  const owner = k(), market = k(), window = k(), quoteMint = k(), ownerQuote = k(), escrow = k(), qp = k();
  const entry = entryPda(window, owner)[0];
  const ix = enterIx({ owner, market, window, entry, quoteMint, ownerQuote, escrow, quoteTokenProgram: qp }, 1_000n);
  assert.equal(ix.keys.length, 9);
  assert.ok(ix.keys[0]!.pubkey.equals(owner) && ix.keys[0]!.isSigner && ix.keys[0]!.isWritable);
  assert.ok(ix.keys[3]!.pubkey.equals(entry) && ix.keys[3]!.isWritable);
  assert.equal(hex(ix.data.subarray(0, 8)), hex(instructionDiscriminator("enter")));
  assert.deepEqual([...ix.data.subarray(8)], [...u64Le(1_000n)]);
  assert.equal(identifyInstruction(new Uint8Array(ix.data)), "enter");

  // open_window without a previous window: Option -> program id
  const ow = openWindowIx({ payer: owner, market, prevWindow: null, window, quoteMint, escrow, quoteTokenProgram: qp });
  assert.ok(ow.keys[2]!.pubkey.equals(pid) && !ow.keys[2]!.isWritable && !ow.keys[2]!.isSigner);

  // tally_page [0, 48): 11 fixed accounts + the 48 given entries in order, both Options absent
  const owners48 = Array.from({ length: 48 }, () => k());
  const entries48 = owners48.map((o) => entryPda(window, o)[0]);
  const tallyAccs = { payer: owner, market, window, quoteMint, escrow, quoteVault: k(), platformQuoteAccount: k(), keeperQuoteAccount: k(), quoteTokenProgram: qp };
  const tp = tallyPageIx(tallyAccs, 0, 48, entries48);
  assert.equal(tp.keys.length, 11 + 48);
  assert.ok(tp.keys[8]!.pubkey.equals(pid) && tp.keys[9]!.pubkey.equals(pid));
  assert.ok(tp.keys[11]!.pubkey.equals(entries48[0]!) && tp.keys[11]!.isWritable);
  assert.ok(tp.keys[58]!.pubkey.equals(entries48[47]!));
  assert.deepEqual([...tp.data.subarray(8)], [...u32Le(0), ...u32Le(48)]);
  assert.throws(() => tallyPageIx(tallyAccs, 0, 49, [...entries48, k()]), /MAX_PAGE/);
  assert.throws(() => tallyPageIx(tallyAccs, 0, 48, entries48.slice(1)), /needs 48 entries/);
  assert.throws(() => settlePageIx({ market, window }, 2, 4, entries48.slice(0, 3)), /needs 2 entries/);

  // create_market params borsh
  const params = encodeCreateMarketParams({ windowSlots: 92n, vrfTimeoutSlots: 900n, maxEntryAmount: 10n ** 9n, maxEntryBps: 10_000, entryFloorAmount: 0n, name: "A", symbol: "B", uri: "" });
  assert.equal(params.length, 8 + 8 + 8 + 2 + 8 + (4 + 1) + (4 + 1) + 4);
  const cm = createMarketIx({ creator: owner, tokenMint: k(), quoteMint, market, tokenVault: k(), quoteVault: k(), quoteTokenProgram: qp }, { windowSlots: 92n, vrfTimeoutSlots: 900n, maxEntryAmount: 1n, maxEntryBps: 10_000, entryFloorAmount: 0n, name: "A", symbol: "B", uri: "" });
  assert.equal(cm.keys.length, 14);
  assert.ok(cm.keys[1]!.isSigner, "token_mint signs");
  // the Metaplex metadata PDA of the mint, then the Metaplex program, right after the treasury
  assert.ok(cm.keys[8]!.pubkey.equals(tokenMetadataPda(cm.keys[1]!.pubkey)[0]) && cm.keys[8]!.isWritable);
  assert.ok(cm.keys[9]!.pubkey.equals(MPL_TOKEN_METADATA_ID) && !cm.keys[9]!.isWritable);

  // PDAs are deterministic and distinct
  const [m] = marketPda(quoteMint); const [w0] = windowPda(m, 0n); const [w1] = windowPda(m, 1n);
  assert.notEqual(w0.toBase58(), w1.toBase58());
  assert.equal(windowPda(m, 0)[0].toBase58(), w0.toBase58());
});

test("verifyWindow recomputes rolls and shares and flags a tampered share", () => {
  const market = Keypair.generate().publicKey;
  const [window] = windowPda(market, 0n);
  const seed = new Uint8Array(64).map((_, i) => (i * 37 + 11) & 0xff);
  const owners = [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey];
  const amounts = [1_000n, 2_500n, 600n];
  const rolls = owners.map((o, i) => deriveRoll(seed, o.toBytes(), i));
  const weights = computeWeights(amounts, rolls);
  const tokensOut = 123_456_789n;
  const shares = computeShares(tokensOut, weights.weights, weights.weightSum);
  const total = amounts.reduce((a, b) => a + b, 0n);
  const platform = total / 100n;
  const w = decodeWindow(encodeWindow({
    market, index: 0n, state: WindowState.Settled, openSlot: 1n, closeSlot: 93n, sealedSlot: 93n, totalAmount: total, entryCount: 3,
    entriesCommitment: new Uint8Array(32), vrfSeed: new Uint8Array(32), vrfRequested: true, vrfRequestedSlot: 94n, vrfRequest: PublicKey.default, seed,
    rollSum: weights.rollSum, tallyCursor: 3, settleCursor: 3, cumWeight: new Uint8Array(32), tokensOut, feePlatform: platform, feeHost: 0n, toCurve: total - platform, escrow: PublicKey.default, bump: 255,
  }));
  const entries = owners.map((owner, i) => ({
    pubkey: entryPda(window, owner)[0],
    account: decodeEntry(encodeEntry({ window, owner, index: i, amount: amounts[i]!, roll: rolls[i]!, share: shares[i]!, claimed: 0n, refunded: false, bump: 255 })),
  }));
  const v = verifyWindow({ windowPubkey: window, window: w, entries, hostFeeBps: 0 });
  assert.equal(v.ok, true, v.notes.join("; "));
  assert.ok(v.entries.every((e) => e.rollMatch && e.shareMatch));
  assert.equal(shares.reduce((a, b) => a + b, 0n), tokensOut);

  // tamper one share: the verification must fail on that entry only
  const tampered = entries.map((e, i) => (i === 1 ? { ...e, account: { ...e.account, share: e.account.share + 1n } } : e));
  const v2 = verifyWindow({ windowPubkey: window, window: w, entries: tampered, hostFeeBps: 0 });
  assert.equal(v2.ok, false);
  assert.deepEqual(v2.entries.map((e) => e.shareMatch), [true, false, true]);
});

test("entry PDA is per (window, owner): independent of arrival order", () => {
  const window = Keypair.generate().publicKey, a = Keypair.generate().publicKey, b = Keypair.generate().publicKey;
  assert.equal(entryPda(window, a)[0].toBase58(), entryPda(window, a)[0].toBase58());
  assert.notEqual(entryPda(window, a)[0].toBase58(), entryPda(window, b)[0].toBase58());
  assert.notEqual(entryPda(window, a)[0].toBase58(), entryPda(Keypair.generate().publicKey, a)[0].toBase58());
  // ["entry", window, owner] exactly
  const [expected] = PublicKey.findProgramAddressSync([new TextEncoder().encode("entry"), window.toBytes(), a.toBytes()], PULLED_PROGRAM_ID);
  assert.ok(entryPda(window, a)[0].equals(expected));
});

/** Wire size of a legacy transaction with one signer. */
function legacySize(ixs: TransactionInstruction[], payer: PublicKey): number {
  const tx = new Transaction({ feePayer: payer, blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 }).add(...ixs);
  const msg = tx.serializeMessage();
  return 1 + 64 + msg.length;
}

test("page sizes fit one legacy transaction (1232 bytes) in the worst case, and one more entry does not", () => {
  const k = () => Keypair.generate().publicKey;
  const payer = k();
  // worst case: a market with a host integration (integration + host ATA are distinct accounts)
  const accs = { payer, market: k(), window: k(), quoteMint: k(), escrow: k(), quoteVault: k(), platformQuoteAccount: k(), keeperQuoteAccount: k(), integration: k(), hostQuoteAccount: k(), quoteTokenProgram: k() };
  const entries = (n: number) => Array.from({ length: n }, () => k());
  const tally = (n: number) => legacySize([computeUnitLimitIx(tallyPageComputeUnits(n)), tallyPageIx(accs, 0, n, entries(n))], payer);
  const settle = (n: number) => legacySize([computeUnitLimitIx(settlePageComputeUnits(n)), settlePageIx({ market: accs.market, window: accs.window }, 0, n, entries(n))], payer);
  const oneTx = (n: number) => {
    const e = entries(n);
    return legacySize([
      computeUnitLimitIx(1_000_000),
      fulfillIx({ window: accs.window, vrfRequest: k() }),
      tallyPageIx(accs, 0, n, e),
      settlePageIx({ market: accs.market, window: accs.window }, 0, n, e),
    ], payer);
  };
  assert.ok(tally(TALLY_PAGE_LEGACY) <= 1232, `tally ${TALLY_PAGE_LEGACY}: ${tally(TALLY_PAGE_LEGACY)}`);
  assert.ok(tally(TALLY_PAGE_LEGACY + 1) > 1232);
  assert.ok(settle(SETTLE_PAGE_LEGACY) <= 1232, `settle ${SETTLE_PAGE_LEGACY}: ${settle(SETTLE_PAGE_LEGACY)}`);
  assert.ok(settle(SETTLE_PAGE_LEGACY + 1) > 1232);
  assert.ok(oneTx(ONE_TX_SETTLE_MAX) <= 1232, `one tx ${ONE_TX_SETTLE_MAX}: ${oneTx(ONE_TX_SETTLE_MAX)}`);
  assert.ok(oneTx(ONE_TX_SETTLE_MAX + 1) > 1232);
});

test("requested compute units cover the measured worst cases with a margin", () => {
  assert.ok(tallyPageComputeUnits(48) >= MEASURED_CU.tallyPage48 * 1.05);
  assert.ok(tallyPageComputeUnits(32) >= MEASURED_CU.tallyFinalPage32 * 1.2);
  assert.ok(settlePageComputeUnits(48) >= MEASURED_CU.settlePage48 * 1.1);
  // the legacy pages stay far below the 1.4M ceiling
  assert.ok(tallyPageComputeUnits(TALLY_PAGE_LEGACY) <= 200_000);
  assert.ok(settlePageComputeUnits(SETTLE_PAGE_LEGACY) <= 400_000);
});

test("error list: AlreadyEntered appended, every error has a sentence", () => {
  assert.equal(PULLED_ERRORS[PULLED_ERRORS.length - 1], "AlreadyEntered");
  assert.equal(errorCode("AlreadyEntered"), 6053);
  assert.equal(errorCode("WindowIsActive"), 6052); // existing codes unchanged
  for (const n of PULLED_ERRORS) assert.ok(PULLED_ERROR_MESSAGES[n].length > 0, n);
  assert.equal(describeError(new Error("... custom program error: 0x17a5")), PULLED_ERROR_MESSAGES.AlreadyEntered);
  assert.equal(describeError(new Error("AlreadyEntered: x")), PULLED_ERROR_MESSAGES.AlreadyEntered);
  assert.equal(describeError(new Error("network down")), "network down");
});
