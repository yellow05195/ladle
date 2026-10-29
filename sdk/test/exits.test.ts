/**
 * Offline tests of the exit paths on the client side: sell_back /
 * close_entry without the Window account (no claim since v25), the
 * closability rules the keeper follows (mirrors of `Entry::window_settled`,
 * `close_entry`, `close_window`, `close_market`), the shutdown builders, the
 * sale bound, and the per-cluster platform treasury.
 *
 * Run: node --test "sdk/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { INSTRUCTION_NAMES, closeEntryIx, closeWindowIx, refundEntryIx, sellBackIx, sellIx, instructionDiscriminator } from "../src/instructions.ts";
import { DEFAULT_TREASURIES, INITIAL_VIRTUAL_Y, PLATFORM_TREASURY, PULLED_PROGRAM_ID, WIND_DOWN_NOTICE_SECS, ata, platformQuoteAta, resolveTreasury, u64Le, unwrapPda } from "../src/pda.ts";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PulledClient, minQuoteOut } from "../src/client.ts";
import { WindowState, type Entry, type Market, type Window } from "../src/types.ts";
import { DISCRIMINATORS } from "../src/accounts.ts";

const k = () => Keypair.generate().publicKey;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("sell_back / close_entry carry no Window account; refund_entry writes the window; no claim", () => {
  const owner = k(), market = k(), entry = k();
  assert.ok(!(INSTRUCTION_NAMES as readonly string[]).includes("claim"), "v25: LADLE never leaves the game to a wallet");

  const s = sellBackIx({ owner, market, entry, quoteMint: k(), quoteVault: k(), ownerQuote: k(), quoteTokenProgram: k() }, 5n, 7n);
  assert.equal(s.keys.length, 7);
  // amount, then the least the seller accepts
  assert.equal(hex(s.data), hex(instructionDiscriminator("sell_back")) + hex(u64Le(5n)) + hex(u64Le(7n)));
  const w = sellIx({ seller: owner, market, tokenMint: k(), sellerTokenAccount: k(), tokenVault: k(), quoteMint: k(), quoteVault: k(), sellerQuote: k(), quoteTokenProgram: k() }, 9n, 8n);
  assert.equal(hex(w.data), hex(instructionDiscriminator("sell")) + hex(u64Le(9n)) + hex(u64Le(8n)));
  assert.ok(s.keys[0]!.isSigner && s.keys[1]!.isWritable && s.keys[2]!.pubkey.equals(entry) && s.keys[2]!.isWritable);

  const ce = closeEntryIx({ entry, owner });
  assert.equal(ce.keys.length, 2);
  assert.ok(ce.keys.every((m) => m.isWritable && !m.isSigner));
  assert.ok(ce.keys[0]!.pubkey.equals(entry) && ce.keys[1]!.pubkey.equals(owner));

  const window = k();
  const re = refundEntryIx({ market, window, entry, quoteMint: k(), escrow: k(), recipient: k(), quoteTokenProgram: k() });
  assert.ok(re.keys[1]!.pubkey.equals(window) && re.keys[1]!.isWritable, "refund_entry counts the refund on the window");

  const cw = closeWindowIx({ market, window, opener: owner, quoteMint: k(), escrow: k(), quoteVault: k(), quoteTokenProgram: k() });
  assert.equal(cw.keys.length, 7);
});

function entry(over: Partial<Entry> = {}): Entry {
  return {
    window: k(), owner: k(), index: 0, amount: 1_000n, roll: 0n, share: 0n, claimed: 0n, refunded: false, bump: 255,
    market: k(), windowIndex: 3n, settled: false, ...over,
  };
}

function market(over: Partial<Market> = {}): Market {
  return {
    creator: k(), tokenMint: k(), quoteMint: k(), quoteProgram: k(), integration: PublicKey.default, curve: { x: 1n, y: 1n },
    windowSlots: 300n, vrfTimeoutSlots: 900n, maxEntryAmount: 1n, maxEntryBps: 10_000, entryFloorAmount: 0n,
    windowCount: 5n, nextSettleIndex: 4n, hasActiveWindow: true, activeWindow: 4n, quoteVault: k(), tokenVault: k(), bump: 255,
    name: "", symbol: "", uri: "", noticeStart: 0n, liveWindows: 0n, countsWindows: true, ...over,
  };
}

function window(over: Partial<Window> = {}): Window {
  return {
    market: k(), index: 3n, state: WindowState.Settled, openSlot: 0n, closeSlot: 300n, sealedSlot: 300n, totalAmount: 10n, entryCount: 3,
    entriesCommitment: new Uint8Array(32), vrfSeed: new Uint8Array(32), vrfRequested: true, vrfRequestedSlot: 301n, vrfRequest: k(),
    seed: new Uint8Array(64), rollSum: 0n, tallyCursor: 3, settleCursor: 3, cumWeight: new Uint8Array(32), tokensOut: 0n, feePlatform: 0n,
    feeHost: 0n, toCurve: 0n, escrow: k(), bump: 255, opener: k(), refundedEntries: 0, closedEntries: 0, vrfPayer: k(), ...over,
  };
}

test("a sale's bound: the quote minus the tolerance, 1 % by default", () => {
  assert.equal(minQuoteOut(1_000_000n), 990_000n);
  assert.equal(minQuoteOut(1_000_000n, 0), 1_000_000n);
  assert.equal(minQuoteOut(999n, 100), 989n, "rounded down");
  assert.equal(minQuoteOut(5n, 10_000), 0n);
  assert.throws(() => minQuoteOut(1n, -1));
  assert.throws(() => minQuoteOut(1n, 10_001));
});

test("shutdown: force_exit pays the owner through the unwrap PDA (wSOL markets only); close_market needs the notice and a drained market", () => {
  const client = new PulledClient({ connection: new Connection("http://127.0.0.1:1") });
  const payer = k();
  const wsol = market({ quoteMint: NATIVE_MINT, quoteProgram: TOKEN_PROGRAM_ID });
  const settled = { pubkey: k(), account: entry({ settled: true, share: 10n, claimed: 3n }) };
  const [fx] = client.forceExitInstructions(payer, wsol, settled);
  assert.equal(fx!.keys.length, 11);
  assert.ok(fx!.keys[0]!.pubkey.equals(payer) && fx!.keys[0]!.isSigner && fx!.keys[0]!.isWritable);
  assert.ok(fx!.keys[3]!.pubkey.equals(settled.account.owner) && fx!.keys[3]!.isWritable, "the owner is paid");
  assert.ok(fx!.keys[4]!.pubkey.equals(PULLED_PROGRAM_ID) && fx!.keys[5]!.pubkey.equals(PULLED_PROGRAM_ID), "no window for a settled entry");
  assert.ok(fx!.keys[8]!.pubkey.equals(unwrapPda(settled.pubkey)[0]), "payout = [\"unwrap\", entry]");
  // a stake to refund carries its window and escrow
  const stake = { pubkey: k(), account: entry({ settled: false, refunded: false }) };
  const round = { pubkey: k(), account: window({ state: WindowState.Refunding }) };
  const [fr] = client.forceExitInstructions(payer, wsol, stake, round);
  assert.ok(fr!.keys[4]!.pubkey.equals(round.pubkey) && fr!.keys[5]!.pubkey.equals(round.account.escrow));
  // another quote mint (final review): no payout path a player cannot block, so none at all
  assert.throws(() => client.forceExitInstructions(payer, market(), settled), /not quoted in wSOL/);

  // close_market: the notice runs its 7 days, every round closed, no LADLE out, a v25 market
  const start = 1_800_000_000n;
  const drained = market({ noticeStart: start, liveWindows: 0n, countsWindows: true, hasActiveWindow: false, curve: { x: 30_000_000_001n, y: INITIAL_VIRTUAL_Y } });
  assert.equal(PulledClient.noticeEnd(drained), start + WIND_DOWN_NOTICE_SECS);
  assert.equal(PulledClient.noticeEnd(market()), null);
  assert.equal(PulledClient.isMarketClosable(drained, start + WIND_DOWN_NOTICE_SECS - 1n), false, "notice not over");
  assert.equal(PulledClient.isMarketClosable(drained, start + WIND_DOWN_NOTICE_SECS), true);
  assert.equal(PulledClient.isMarketClosable({ ...drained, liveWindows: 1n }, start + WIND_DOWN_NOTICE_SECS), false, "a round left");
  assert.equal(PulledClient.isMarketClosable({ ...drained, curve: { x: 1n, y: INITIAL_VIRTUAL_Y - 1n } }, start + WIND_DOWN_NOTICE_SECS), false, "LADLE out");
  assert.equal(PulledClient.isMarketClosable({ ...drained, countsWindows: false }, start + WIND_DOWN_NOTICE_SECS), false, "a market made before v25");
  assert.equal(PulledClient.isMarketClosable({ ...drained, noticeStart: 0n }, 10n ** 12n), false, "no notice");
  const cms = client.closeMarketInstructions(payer, k(), { ...drained, quoteMint: NATIVE_MINT, quoteProgram: TOKEN_PROGRAM_ID });
  assert.equal(cms.length, 1, "nothing created for anyone");
  const [cm] = cms;
  assert.equal(cm!.keys.length, 8);
  assert.ok(cm!.keys[1]!.pubkey.equals(drained.creator), "everything to the creator, as SOL");
  assert.ok(cm!.keys[6]!.pubkey.equals(TOKEN_PROGRAM_ID), "no creator token account");
});

test("shutdown: program-wide scans go by discriminator (both Market sizes, entries of closed markets)", async () => {
  const calls: { filters: unknown[]; dataSlice?: unknown }[] = [];
  const connection = {
    getProgramAccounts: async (_p: PublicKey, cfg: { filters: unknown[]; dataSlice?: unknown }) => { calls.push(cfg); return []; },
  } as unknown as Connection;
  const client = new PulledClient({ connection });
  await client.getAllMarkets();
  await client.getAllEntries();
  assert.deepEqual(await client.getAccountKeys("Window"), []);
  const disc = (f: unknown) => (f as { memcmp: { offset: number; bytes: string; encoding: string } }).memcmp;
  assert.deepEqual(calls.map((c) => c.filters.length), [1, 1, 1], "no dataSize filter: markets of 562 and 626 bytes both count");
  assert.deepEqual(calls.map((c) => Buffer.from(disc(c.filters[0]).bytes, "base64")), [DISCRIMINATORS.Market, DISCRIMINATORS.Entry, DISCRIMINATORS.Window].map((d) => Buffer.from(d)));
  assert.ok(calls.every((c) => disc(c.filters[0]).offset === 0 && disc(c.filters[0]).encoding === "base64"));
  assert.deepEqual(calls[2]!.dataSlice, { offset: 0, length: 0 }, "keys only: no data fetched");
});

test("claimable only once the whole window is Settled (settled flag + settlement cursor), whatever the Window account", () => {
  const m = market({ nextSettleIndex: 4n });
  assert.equal(PulledClient.entryClaimable(m, entry({ settled: true, share: 10n, windowIndex: 3n })), true);
  // its own page is settled but the window still sits at the cursor (pages pending)
  assert.equal(PulledClient.entryClaimable(m, entry({ settled: true, share: 10n, windowIndex: 4n })), false);
  // a refunded window's entries are never settled
  assert.equal(PulledClient.entryClaimable(m, entry({ settled: false, refunded: true, share: 0n, windowIndex: 3n })), false);
  // nothing left
  assert.equal(PulledClient.entryClaimable(m, entry({ settled: true, share: 10n, claimed: 10n, windowIndex: 3n })), false);
  assert.equal(PulledClient.entryClaimable(m, entry({ settled: true, share: 0n, windowIndex: 3n })), false);
});

test("entries close when the stake is back or the final share is fully out; windows close without waiting for entries", () => {
  assert.equal(PulledClient.isEntryClosable(entry({ settled: true, share: 0n })), true, "zero share");
  assert.equal(PulledClient.isEntryClosable(entry({ settled: true, share: 7n, claimed: 7n })), true);
  assert.equal(PulledClient.isEntryClosable(entry({ settled: true, share: 7n, claimed: 6n })), false, "tokens left");
  assert.equal(PulledClient.isEntryClosable(entry({ settled: false, share: 0n })), false, "not settled yet (or Refunding, not refunded)");
  assert.equal(PulledClient.isEntryClosable(entry({ refunded: true })), true);
  // the deprecated form ignores the window
  assert.equal(PulledClient.entryClosable(null, entry({ refunded: true })), true);

  const m = market({ hasActiveWindow: true, activeWindow: 4n });
  assert.equal(PulledClient.isWindowClosable(m, window({ index: 3n, state: WindowState.Settled, entryCount: 50 })), true, "Settled: entries may stay open");
  // second review: the finished active window closes too (the market then has none)
  assert.equal(PulledClient.isWindowClosable(m, window({ index: 4n, state: WindowState.Settled })), true, "finished active window");
  assert.equal(PulledClient.isWindowClosable(m, window({ index: 4n, state: WindowState.Open })), false, "open active window");
  assert.equal(PulledClient.isWindowClosable(m, window({ index: 3n, state: WindowState.Refunding, entryCount: 3, refundedEntries: 2 })), false);
  assert.equal(PulledClient.isWindowClosable(m, window({ index: 3n, state: WindowState.Refunding, entryCount: 3, refundedEntries: 3 })), true);
  for (const st of [WindowState.Open, WindowState.Sealed, WindowState.Drawn, WindowState.Tallied]) {
    assert.equal(PulledClient.isWindowClosable(m, window({ index: 3n, state: st })), false);
  }
});

test("closeEntryInstructions takes the entry (the old (window, entry) form still builds the same instruction)", () => {
  const client = new PulledClient({ connection: new Connection("http://127.0.0.1:1") });
  const e = { pubkey: k(), account: entry({ refunded: true }) };
  const [a] = client.closeEntryInstructions(e);
  const [b] = client.closeEntryInstructions(k(), e);
  assert.equal(a!.keys.length, 2);
  assert.deepEqual(a!.keys.map((m) => m.pubkey.toBase58()), [e.pubkey.toBase58(), e.account.owner.toBase58()]);
  assert.deepEqual(b!.keys.map((m) => m.pubkey.toBase58()), a!.keys.map((m) => m.pubkey.toBase58()));
});

test("treasury: devnet default, mainnet only from configuration, used by the finalizing tally page", async () => {
  assert.ok(resolveTreasury("devnet").equals(PLATFORM_TREASURY));
  assert.ok(resolveTreasury("localnet").equals(PLATFORM_TREASURY));
  assert.equal(DEFAULT_TREASURIES["mainnet-beta"], null);
  assert.throws(() => resolveTreasury("mainnet-beta"), /LADLE_TREASURY/);
  assert.throws(() => resolveTreasury("mainnet-beta", "  "), /LADLE_TREASURY/);
  const mainnet = k();
  assert.ok(resolveTreasury("mainnet-beta", ` ${mainnet.toBase58()}\n`).equals(mainnet));
  assert.ok(resolveTreasury("mainnet-beta", mainnet).equals(mainnet));
  assert.ok(resolveTreasury("devnet", mainnet.toBase58()).equals(mainnet), "a configured key comes first on every cluster");
  assert.throws(() => resolveTreasury("mainnet-beta", "not-a-key"));

  const quoteMint = k(), quoteProgram = k();
  assert.ok(platformQuoteAta(quoteMint, quoteProgram).equals(ata(quoteMint, PLATFORM_TREASURY, quoteProgram)));
  assert.ok(platformQuoteAta(quoteMint, quoteProgram, mainnet).equals(ata(quoteMint, mainnet, quoteProgram)));

  // the client pays the configured treasury's ATA (no RPC: no integration on this market)
  const client = new PulledClient({ connection: new Connection("http://127.0.0.1:1"), treasury: mainnet });
  assert.ok(client.treasury.equals(mainnet));
  assert.ok(new PulledClient({ connection: new Connection("http://127.0.0.1:1") }).treasury.equals(PLATFORM_TREASURY));
  const m = market({ quoteMint, quoteProgram });
  const w = window({ state: WindowState.Drawn });
  const t = await client.tallyPageIxFor(k(), k(), m, k(), w, 0, 1, [k()]);
  assert.ok(t.keys[6]!.pubkey.equals(ata(quoteMint, mainnet, quoteProgram)), "platform_quote_account");
  assert.ok(t.programId.equals(PULLED_PROGRAM_ID));
  const fees = await client.feeAccountsInstructions(k(), m);
  assert.ok(fees[0]!.keys[1]!.pubkey.equals(ata(quoteMint, mainnet, quoteProgram)) && fees[0]!.keys[2]!.pubkey.equals(mainnet));
  // final review: never the host's account (a host could close it and keep the rent, round after
  // round); a market with an integration needs no read of it either (this client has no RPC)
  const withHost = await client.feeAccountsInstructions(k(), { ...m, integration: k() });
  assert.equal(withHost.length, 2, "treasury and keeper accounts only");
});
test("a stake comes back from a Refunding round, or from a Sealed one past the VRF timeout at the settlement cursor", () => {
  const m = market({ nextSettleIndex: 3n, vrfTimeoutSlots: 900n });
  const e = entry({ refunded: false, windowIndex: 3n });
  // Refunding: yes until refunded
  assert.equal(PulledClient.entryRefundable(m, window({ state: WindowState.Refunding }), e, 0n), true);
  assert.equal(PulledClient.entryRefundable(m, window({ state: WindowState.Refunding }), entry({ refunded: true }), 0n), false);
  // Sealed, requested at 301: from slot 1202 on (strictly after the deadline)
  const sealed = window({ state: WindowState.Sealed, vrfRequested: true, vrfRequestedSlot: 301n });
  assert.equal(PulledClient.entryRefundable(m, sealed, e, 1201n), false);
  assert.equal(PulledClient.entryRefundable(m, sealed, e, 1202n), true);
  // never requested: the timeout runs from the seal
  const unrequested = window({ state: WindowState.Sealed, vrfRequested: false, sealedSlot: 300n });
  assert.equal(PulledClient.entryRefundable(m, unrequested, e, 1201n), true);
  // not at the cursor yet, or drawn / settled: no
  assert.equal(PulledClient.entryRefundable(market({ nextSettleIndex: 2n }), sealed, e, 5_000n), false);
  assert.equal(PulledClient.entryRefundable(m, window({ state: WindowState.Drawn }), e, 5_000n), false);
  assert.equal(PulledClient.entryRefundable(m, window({ state: WindowState.Settled }), e, 5_000n), false);
});
