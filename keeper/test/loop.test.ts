/**
 * The loop's decisions after the 2026-10-28 review, against a small fake
 * chain (no RPC): the client's reads and instruction builders are stubs that
 * return tagged instructions, `send` applies their effect to the fake
 * accounts or throws.
 *
 *  - a seal bundle that failed is never retried as a bundle: the window is
 *    sealed alone, the next round opens and request_vrf goes on their own,
 *    each request with a new salt;
 *  - a Sealed window whose request never landed is refunded past its
 *    timeout instead of being requested forever;
 *  - refunds go only to owners who already have a quote account;
 *  - drain opens nothing and returns once nothing is left;
 *  - past the daily ORAO budget no new round opens.
 *
 * And after the second review (2026-10-28):
 *  - the last round of a drained market is closed too (its rent back);
 *  - drain-refund-all refunds every stake, creating the missing accounts;
 *  - no new round opens while MAX_WINDOWS_IN_FLIGHT wait to settle, and an
 *    alert says so;
 *  - a round at the cursor that could move but does not raises
 *    `settlement_stalled` and turns /health unhealthy; a failing final page
 *    makes the keeper re-create the fee accounts first;
 *  - an action failing 5 times in a row raises `action_failing`;
 *  - no log line carries the RPC URL or its key.
 *
 * And after the final review (2026-10-29):
 *  - the shutdown serves every market of the program (found by scan), and
 *    closes the entries of a market someone else already closed (only
 *    their owners' rent is left in them) before it says `drained`.
 *
 * Run: node --test "keeper/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { INITIAL_VIRTUAL_Y, TOKEN_PROGRAM_ID, WindowState, ata, type Entry, type Keyed, type Market, type Window } from "@pulled/sdk";
import { Keeper, type LogLine } from "../src/loop.ts";

const k = () => Keypair.generate().publicKey;
const MARKET = k();

interface Tagged { tag: string; salt?: string; entry?: string; createRecipient?: boolean; window?: string }

function market(over: Partial<Market> = {}): Market {
  return {
    creator: k(), tokenMint: k(), quoteMint: NATIVE_MINT, quoteProgram: TOKEN_PROGRAM_ID, integration: PublicKey.default, curve: { x: 1n, y: 1n },
    windowSlots: 560n, vrfTimeoutSlots: 900n, maxEntryAmount: 5_000_000_000n, maxEntryBps: 2_000, entryFloorAmount: 500_000_000n,
    windowCount: 1n, nextSettleIndex: 0n, hasActiveWindow: true, activeWindow: 0n, quoteVault: k(), tokenVault: k(), bump: 255,
    name: "", symbol: "", uri: "", noticeStart: 0n, liveWindows: 1n, countsWindows: true, ...over,
  };
}

function window(index: bigint, over: Partial<Window> = {}): Window {
  return {
    market: MARKET, index, state: WindowState.Open, openSlot: 0n, closeSlot: 100n, sealedSlot: 0n, totalAmount: 0n, entryCount: 0,
    entriesCommitment: new Uint8Array(32), vrfSeed: new Uint8Array(32), vrfRequested: false, vrfRequestedSlot: 0n, vrfRequest: PublicKey.default,
    seed: new Uint8Array(64), rollSum: 0n, tallyCursor: 0, settleCursor: 0, cumWeight: new Uint8Array(32), tokensOut: 0n, feePlatform: 0n,
    feeHost: 0n, toCurve: 0n, escrow: k(), bump: 255, opener: k(), refundedEntries: 0, closedEntries: 0, vrfPayer: PublicKey.default, ...over,
  };
}

/** A fake chain around one market, and a keeper wired to it. */
function rig(opts: { drain?: boolean; drainRefundAll?: boolean; shutdown?: boolean; vrfPerDay?: number; atas?: PublicKey[]; settleStallMs?: number; secrets?: string[] } = {}) {
  const w = {
    slot: 100n,
    /** The cluster clock (unix seconds). */
    now: 1_800_000_000n,
    marketOpen: true,
    market: market(),
    windows: new Map<bigint, Window>(),
    entries: new Map<bigint, Keyed<Entry>[]>(),
    /** Entries whose market is gone (closed by someone), and the program's market accounts. */
    orphans: [] as Keyed<Entry>[],
    liveMarkets: [MARKET] as PublicKey[],
    pks: new Map<string, bigint>(),
    sent: [] as Tagged[][],
    fail: (_t: Tagged[]) => false as boolean,
  };
  const pkOf = (i: bigint) => {
    for (const [s, j] of w.pks) if (j === i) return new PublicKey(s);
    const pk = k();
    w.pks.set(pk.toBase58(), i);
    return pk;
  };
  const keyed = (i: bigint): Keyed<Window> => {
    const a = w.windows.get(i);
    if (!a) throw new Error(`window ${i} not found`);
    return { pubkey: pkOf(i), account: a };
  };
  const atas = new Set((opts.atas ?? []).map((o) => ata(NATIVE_MINT, o, TOKEN_PROGRAM_ID).toBase58()));
  const connection = {
    getBalance: async () => 2_000_000_000,
    getRecentPrioritizationFees: async () => [],
    getAccountInfo: async () => null,
    getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map((x) => (atas.has(x.toBase58()) ? { lamports: 1 } : null)),
  } as unknown as Connection;
  const lines: LogLine[] = [];
  const keeper = new Keeper({
    connection, keypair: Keypair.generate(), markets: [MARKET], cluster: "devnet", log: (l) => lines.push(l), drain: opts.drain,
    drainRefundAll: opts.drainRefundAll, shutdown: opts.shutdown, vrfPerDay: opts.vrfPerDay, intervalMs: 10, settleStallMs: opts.settleStallMs, secrets: opts.secrets,
  });
  const c = keeper.client as any;
  c.getMarket = async () => ({ pubkey: MARKET, account: w.market });
  c.getMarketOrNull = async () => (w.marketOpen ? { pubkey: MARKET, account: w.market } : null);
  c.getClusterTime = async () => w.now;
  c.getEntriesByMarket = async () => [...w.entries.values()].flat();
  c.getAllEntries = async () => [...[...w.entries.values()].flat(), ...w.orphans];
  c.getAccountKeys = async (name: string) => (name === "Market" ? (w.marketOpen ? w.liveMarkets : w.liveMarkets.filter((m) => !m.equals(MARKET))) : []);
  c.getAllMarkets = async () => ((await c.getAccountKeys("Market")) as PublicKey[]).map((pubkey) => ({ pubkey, account: w.market }));
  c.startWindDownInstructions = () => [{ tag: "start_wind_down" }];
  c.forceExitInstructions = (_p: PublicKey, _m: Market, e: Keyed<Entry>, win?: Keyed<Window> | null) => [{ tag: "force_exit", entry: e.account.owner.toBase58(), window: win?.pubkey.toBase58() }];
  c.closeMarketInstructions = () => [{ tag: "close_market" }];
  c.getSlot = async () => Number(w.slot);
  c.getWindowByIndex = async (_m: PublicKey, i: bigint | number) => keyed(BigInt(i));
  c.getWindow = async (pk: PublicKey) => keyed(w.pks.get(pk.toBase58()) ?? -1n);
  c.getWindows = async () => [...w.windows.keys()].map(keyed);
  c.getEntries = async (pk: PublicKey) => w.entries.get(w.pks.get(pk.toBase58()) ?? -1n) ?? [];
  c.getFulfilledRandomness = async () => null;
  c.openWindowInstructions = async () => [{ tag: "open" }];
  c.sealInstructions = () => [{ tag: "seal" }];
  c.requestVrfInstructions = async () => [{ tag: "request", salt: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex") }];
  c.refundWindowInstructions = () => [{ tag: "refund_window" }];
  c.closeWindowInstructions = (_m: PublicKey, _mk: Market, pk: PublicKey) => [{ tag: "close", entry: pk.toBase58() }];
  c.feeAccountsInstructions = async () => [{ tag: "fee_accounts" }];
  c.getPageEntries = async (pk: PublicKey) => (w.entries.get(w.pks.get(pk.toBase58()) ?? -1n) ?? []).map((e) => e.pubkey);
  c.tallyPageIxFor = async () => ({ tag: "tally" });
  c.tallyPageInstructions = async (_p: PublicKey, _m: PublicKey, _mk: Market, _w: PublicKey, _wa: Window, _f: number, to: number) => [{ tag: to === w.windows.get(w.market.nextSettleIndex)?.entryCount ? "tally_final" : "tally" }];
  c.settlePageInstructions = () => [{ tag: "settle" }];
  c.closeEntryInstructions = (e: Keyed<Entry>) => [{ tag: "close_entry", entry: e.account.owner.toBase58() }];
  c.refundEntryInstructions = (_p: PublicKey, _m: PublicKey, _mk: Market, _w: PublicKey, _wa: Window, e: Keyed<Entry>, createRecipient = true) =>
    [{ tag: "refund_entry", entry: e.account.owner.toBase58(), createRecipient }];
  (keeper as any).send = async (ixs: Tagged[]) => {
    w.sent.push(ixs);
    if (w.fail(ixs)) throw new Error("tx failed: custom program error: 0x1771");
    for (const ix of ixs) {
      const active = w.windows.get(w.market.activeWindow)!;
      if (ix.tag === "seal") {
        active.sealedSlot = w.slot;
        if (active.entryCount === 0) { active.state = WindowState.Settled; w.market.nextSettleIndex++; } else active.state = active.entryCount === 1 ? WindowState.Drawn : WindowState.Sealed;
      } else if (ix.tag === "open") {
        const i = w.market.windowCount;
        w.windows.set(i, window(i, { closeSlot: w.slot + 560n }));
        w.market.windowCount++;
        w.market.activeWindow = i;
      } else if (ix.tag === "request") {
        const s = [...w.windows.values()].find((x) => x.state === WindowState.Sealed && !x.vrfRequested)!;
        s.vrfRequested = true; s.vrfRequestedSlot = w.slot;
      } else if (ix.tag === "refund_window") {
        const s = w.windows.get(w.market.nextSettleIndex)!;
        s.state = WindowState.Refunding; w.market.nextSettleIndex++;
      } else if (ix.tag === "refund_entry") {
        for (const [i, list] of w.entries) for (const e of list) if (e.account.owner.toBase58() === ix.entry) { e.account.refunded = true; w.windows.get(i)!.refundedEntries++; }
      } else if (ix.tag === "close_entry" || ix.tag === "force_exit") {
        for (const [i, list] of w.entries) {
          const gone = list.filter((e) => e.account.owner.toBase58() === ix.entry);
          // a forced exit of an unsold share sells it to the curve; of a stake, counts the refund
          for (const e of gone) {
            if (ix.tag === "force_exit" && e.account.settled) w.market.curve = { ...w.market.curve, y: w.market.curve.y + e.account.share - e.account.claimed };
            if (ix.tag === "force_exit" && !e.account.settled && !e.account.refunded) w.windows.get(i)!.refundedEntries++;
          }
          w.entries.set(i, list.filter((e) => e.account.owner.toBase58() !== ix.entry));
        }
        if (ix.tag === "close_entry") w.orphans = w.orphans.filter((e) => e.account.owner.toBase58() !== ix.entry);
      } else if (ix.tag === "start_wind_down") {
        w.market.noticeStart = w.now;
      } else if (ix.tag === "close_market") {
        w.marketOpen = false;
      } else if (ix.tag === "settle") {
        const t = w.windows.get(w.market.nextSettleIndex);
        if (t) { t.state = WindowState.Settled; w.market.nextSettleIndex++; }
      } else if (ix.tag === "close") {
        const i = w.pks.get(ix.entry!)!;
        w.windows.delete(i);
        w.market.liveWindows--;
        if (w.market.hasActiveWindow && w.market.activeWindow === i) w.market.hasActiveWindow = false;
      }
    }
    return "sig";
  };
  return { w, keeper, lines, clearBackoff: () => (keeper as any).backoff.clear() };
}

const tags = (txs: Tagged[][]) => txs.map((t) => t.map((x) => x.tag).join("+"));

test("a failed seal bundle is sealed alone; the next round and request_vrf go on their own, each request with a new salt", async () => {
  const { w, keeper, clearBackoff } = rig();
  w.windows.set(0n, window(0n, { entryCount: 3, totalAmount: 900_000_000n }));
  w.fail = (t) => t.some((x) => x.tag === "request");
  await keeper.tickOnce();
  assert.deepEqual(tags(w.sent), ["seal+request+open"]);
  // the bundle failed on its request: the next attempt seals alone
  await keeper.tickOnce();
  assert.deepEqual(tags(w.sent).slice(1), ["seal"]);
  assert.equal(w.windows.get(0n)!.state, WindowState.Sealed);
  // then the next round opens alone and the request is tried alone
  await keeper.tickOnce();
  assert.deepEqual(tags(w.sent).slice(2), ["open", "request"]);
  assert.equal(w.market.activeWindow, 1n);
  // ORAO takes requests again: a new salt lands
  w.fail = () => false;
  clearBackoff();
  await keeper.tickOnce();
  assert.deepEqual(tags(w.sent).slice(4), ["request"]);
  const salts = w.sent.flat().filter((x) => x.tag === "request").map((x) => x.salt);
  assert.equal(new Set(salts).size, salts.length, "every request attempt has its own salt");
  assert.equal(w.windows.get(0n)!.vrfRequested, true);
});

test("a Sealed window whose request never landed is refunded after its timeout, not requested forever", async () => {
  const { w, keeper, lines } = rig();
  w.windows.set(0n, window(0n, { state: WindowState.Sealed, entryCount: 3, sealedSlot: 100n }));
  w.windows.set(1n, window(1n, { closeSlot: 5_000n }));
  w.market.windowCount = 2n; w.market.activeWindow = 1n;
  w.fail = (t) => t.some((x) => x.tag === "request");
  w.slot = 1_000n; // deadline 100 + 900: not passed yet
  await keeper.tickOnce();
  assert.deepEqual(tags(w.sent), ["request"]);
  w.slot = 1_001n;
  await keeper.tickOnce();
  assert.deepEqual(tags(w.sent).slice(1), ["refund_window"]);
  assert.equal(w.windows.get(0n)!.state, WindowState.Refunding);
  assert.ok(lines.some((l) => l.action === "refund_window" && /no VRF request landed/.test(l.msg ?? "")));
});

test("refunds go only to owners who already have a quote account; the others are left to the app", async () => {
  const [a, b, c] = [k(), k(), k()];
  const { w, keeper, lines } = rig({ atas: [a] });
  w.windows.set(0n, window(0n, { state: WindowState.Refunding, entryCount: 3, sealedSlot: 100n }));
  w.windows.set(1n, window(1n, { closeSlot: 5_000n }));
  w.market.windowCount = 2n; w.market.activeWindow = 1n; w.market.nextSettleIndex = 1n;
  const entry = (owner: PublicKey, index: number): Keyed<Entry> => ({
    pubkey: k(),
    account: { window: k(), owner, index, amount: 100_000_000n, roll: 0n, share: 0n, claimed: 0n, refunded: false, bump: 255, market: MARKET, windowIndex: 0n, settled: false },
  });
  w.entries.set(0n, [entry(a, 0), entry(b, 1), entry(c, 2)]);
  await keeper.tickOnce();
  const refunds = w.sent.flat().filter((x) => x.tag === "refund_entry");
  assert.deepEqual(refunds.map((x) => x.entry), [a.toBase58()]);
  assert.ok(refunds.every((x) => x.createRecipient === false), "the keeper never creates the owner's account");
  assert.ok(lines.some((l) => l.action === "refunds_left_to_owners" && /2 stake/.test(l.msg ?? "")));
  // nothing more for the keeper to do: no further refund transaction, and the tick is not kept busy by them
  const before = w.sent.length;
  const idle = await keeper.tickOnce();
  assert.equal(w.sent.length, before);
  assert.notEqual(idle, null);
});

test("drain opens nothing, seals the open round at its close, closes it too (the last round's rent), and returns once nothing is left", async () => {
  const { w, keeper, lines } = rig({ drain: true });
  w.windows.set(0n, window(0n, { entryCount: 0 }));
  await keeper.run();
  assert.deepEqual(tags(w.sent), ["seal", "close"]);
  assert.equal(w.market.windowCount, 1n);
  assert.equal(w.windows.has(0n), false, "the last round is closed");
  assert.equal(w.market.hasActiveWindow, false);
  assert.ok(lines.some((l) => l.action === "drained"));
});

test("drain-refund-all refunds every stake, creating the accounts owners lack, then returns", async () => {
  const [a, b] = [k(), k()];
  const { w, keeper, lines } = rig({ drainRefundAll: true, atas: [a] });
  w.windows.set(0n, window(0n, { state: WindowState.Refunding, entryCount: 2, sealedSlot: 100n }));
  w.market.windowCount = 1n; w.market.nextSettleIndex = 1n;
  const entry = (owner: PublicKey, index: number): Keyed<Entry> => ({
    pubkey: k(),
    account: { window: k(), owner, index, amount: 100_000_000n, roll: 0n, share: 0n, claimed: 0n, refunded: false, bump: 255, market: MARKET, windowIndex: 0n, settled: false },
  });
  w.entries.set(0n, [entry(a, 0), entry(b, 1)]);
  await keeper.run();
  const refunds = w.sent.flat().filter((x) => x.tag === "refund_entry");
  assert.deepEqual(refunds.map((x) => [x.entry, x.createRecipient]).sort(), [[a.toBase58(), false], [b.toBase58(), true]].sort());
  assert.equal(w.windows.has(0n), false, "every stake back: the round closed");
  assert.ok(lines.some((l) => l.action === "drained"));
});

test("shutdown: notice started, nothing paid before it ends, then every entry paid out (forgotten share, unrefunded stake), rounds and market closed", async () => {
  const [a, b, c] = [k(), k(), k()];
  const { w, keeper, lines } = rig({ shutdown: true });
  // round 0 settled (a forgot half its share, c sold everything but never closed); round 1 refunding (b never came back)
  w.windows.set(0n, window(0n, { state: WindowState.Settled, entryCount: 2, sealedSlot: 100n }));
  w.windows.set(1n, window(1n, { state: WindowState.Refunding, entryCount: 1, sealedSlot: 300n }));
  w.market.windowCount = 2n; w.market.nextSettleIndex = 2n; w.market.activeWindow = 1n; w.market.liveWindows = 2n;
  w.market.curve = { x: 31_000_000_000n, y: INITIAL_VIRTUAL_Y - 1_000n };
  const settled = (owner: PublicKey, index: number, share: bigint, claimed: bigint): Keyed<Entry> => ({
    pubkey: k(),
    account: { window: k(), owner, index, amount: 100_000_000n, roll: 0n, share, claimed, refunded: false, bump: 255, market: MARKET, windowIndex: 0n, settled: true },
  });
  w.entries.set(0n, [settled(a, 0, 2_000n, 1_000n), settled(c, 1, 500n, 500n)]);
  const stake: Keyed<Entry> = { pubkey: k(), account: { window: k(), owner: b, index: 0, amount: 200_000_000n, roll: 0n, share: 0n, claimed: 0n, refunded: false, bump: 255, market: MARKET, windowIndex: 1n, settled: false } };
  // the stake's entry points at round 1
  stake.account.window = ((await (keeper as any).client.getWindows()) as Keyed<Window>[]).find((x) => x.account.index === 1n)!.pubkey;
  w.entries.set(1n, [stake]);
  // first tick: the notice starts; nothing is paid out
  await keeper.tickOnce();
  assert.ok(w.sent.flat().some((x) => x.tag === "start_wind_down"));
  assert.equal(w.market.noticeStart, w.now);
  assert.equal(w.sent.flat().filter((x) => x.tag === "force_exit").length, 0);
  // during the notice: the drain closes what it can (the settled round), nothing is paid out, then the keeper idles until its end
  w.now += 604_799n;
  let idle: number | null = null;
  for (let i = 0; i < 5 && idle === null; i++) { (keeper as any).backoff.clear(); idle = await keeper.tickOnce(); }
  assert.equal(w.sent.flat().filter((x) => x.tag === "force_exit").length, 0, "nothing before the notice ends");
  assert.ok(idle !== null && idle > 0);
  assert.ok(lines.some((l) => l.action === "notice"));
  // the notice is over: a run pays everyone out, closes the rounds and the market, and returns
  w.now += 1n;
  await keeper.run();
  const exits = w.sent.flat().filter((x) => x.tag === "force_exit");
  assert.deepEqual(exits.map((x) => x.entry).sort(), [a.toBase58(), b.toBase58()].sort(), "the forgotten share and the forgotten stake");
  assert.equal(exits.find((x) => x.entry === b.toBase58())!.window, stake.account.window.toBase58(), "the stake's round goes along");
  assert.ok(w.sent.flat().some((x) => x.tag === "close_entry" && x.entry === c.toBase58()), "a finished entry only gets its rent back");
  assert.equal(w.marketOpen, false, "market closed");
  assert.ok(w.sent.flat().findIndex((x) => x.tag === "close_market") > w.sent.flat().findIndex((x) => x.tag === "force_exit"));
  assert.ok(lines.some((l) => l.action === "drained"));
});

test("shutdown: every market of the program is served, and entries left by a market someone else closed are closed before 'drained'", async () => {
  const [a, b, c] = [k(), k(), k()];
  const OTHER = k();
  const { w, keeper, lines } = rig({ shutdown: true });
  // someone sent close_market the moment the notice ended: MARKET is gone, two entries with only
  // their owners' rent are left (a sold out, b refunded); another market of the program shows up
  w.marketOpen = false;
  w.liveMarkets = [MARKET, OTHER];
  const left = (owner: PublicKey, over: Partial<Entry>): Keyed<Entry> => ({
    pubkey: k(),
    account: { window: k(), owner, index: 0, amount: 100_000_000n, roll: 0n, share: 0n, claimed: 0n, refunded: false, bump: 255, market: MARKET, windowIndex: 3n, settled: false, ...over },
  });
  w.orphans = [left(a, { settled: true, share: 700n, claimed: 700n }), left(b, { refunded: true })];
  // an entry of a market still open is not the sweep's: its market's drain pays it out
  w.orphans.push(left(c, { market: OTHER, settled: true, share: 5n, claimed: 0n }));
  // OTHER reads as closed too in this fake chain (one market state): only its discovery is checked
  await keeper.run();
  assert.ok(keeper.markets.some((m) => m.equals(OTHER)), "the other market of the program is served");
  assert.ok(lines.some((l) => l.action === "market_found" && l.market === OTHER.toBase58()));
  const closed = w.sent.flat().filter((x) => x.tag === "close_entry").map((x) => x.entry);
  assert.deepEqual(closed.sort(), [a.toBase58(), b.toBase58()].sort(), "both entries of the closed market get their rent back, nothing else");
  assert.equal(w.sent.flat().filter((x) => x.tag === "force_exit").length, 0);
  assert.ok(lines.some((l) => l.action === "drained"));
  assert.ok(lines.findIndex((l) => l.action === "drained") > lines.findIndex((l) => l.action === "close_entry"), "drained only once they are closed");
});

test("shutdown: while an entry of a closed market is left, the drain is not over", async () => {
  const { w, keeper, lines } = rig({ shutdown: true });
  w.marketOpen = false;
  w.liveMarkets = [MARKET];
  w.orphans = [{ pubkey: k(), account: { window: k(), owner: k(), index: 0, amount: 1n, roll: 0n, share: 0n, claimed: 0n, refunded: true, bump: 255, market: MARKET, windowIndex: 0n, settled: false } }];
  // its close keeps failing: the keeper never says drained
  w.fail = (t) => t.some((x) => x.tag === "close_entry");
  for (let i = 0; i < 4; i++) { (keeper as any).backoff.clear(); await keeper.tickOnce(); }
  assert.equal((keeper as any).drained, false);
  assert.ok(!lines.some((l) => l.action === "drained"));
  w.fail = () => false;
  (keeper as any).backoff.clear();
  await keeper.run();
  assert.equal(w.orphans.length, 0);
  assert.ok(lines.some((l) => l.action === "drained"));
});

test("no new round opens while 8 rounds wait to settle, and an alert says so", async () => {
  const { w, keeper, lines } = rig();
  // round 0 drawn and stuck (its final page fails), rounds 1..7 behind it, the active one past Open
  for (let i = 0n; i < 8n; i++) w.windows.set(i, window(i, { state: WindowState.Drawn, entryCount: 1, sealedSlot: 100n }));
  w.market.windowCount = 8n; w.market.activeWindow = 7n; w.market.nextSettleIndex = 0n;
  w.fail = (t) => t.some((x) => x.tag === "tally" || x.tag === "tally_final");
  await keeper.tickOnce();
  assert.equal(w.sent.flat().filter((x) => x.tag === "open").length, 0, "no ninth round");
  assert.ok(lines.some((l) => l.action === "rounds_paused" && l.level === "warn"));
  assert.ok(keeper.health().reasons.some((r) => /no new round opens/.test(r)));
});

test("a round at the cursor that could move but does not: settlement_stalled, /health unhealthy, fee accounts re-created first", async () => {
  const { w, keeper, lines, clearBackoff } = rig({ settleStallMs: 50 });
  w.windows.set(0n, window(0n, { state: WindowState.Drawn, entryCount: 1, sealedSlot: 100n }));
  w.windows.set(1n, window(1n, { closeSlot: 5_000n }));
  w.market.windowCount = 2n; w.market.activeWindow = 1n;
  // the treasury closed its wSOL account: every final page fails
  w.fail = (t) => t.some((x) => x.tag === "tally");
  (keeper as any).lastOkTickAt = Date.now();
  await keeper.tickOnce();
  assert.equal(w.sent.flat().filter((x) => x.tag === "fee_accounts").length, 1);
  clearBackoff();
  await keeper.tickOnce();
  assert.equal(w.sent.flat().filter((x) => x.tag === "fee_accounts").length, 2, "the fee accounts are created again after a failed final page");
  await new Promise((r) => setTimeout(r, 60));
  clearBackoff();
  await keeper.tickOnce();
  assert.ok(lines.some((l) => l.action === "settlement_stalled" && l.level === "warn" && /round 0/.test(l.msg ?? "")), JSON.stringify(lines.filter((l) => l.level !== "info")));
  const h = keeper.health();
  assert.equal(h.ok, false);
  assert.ok(h.reasons.some((r) => /settlement stalled/.test(r)));
  // the page lands again: cleared
  w.fail = () => false;
  clearBackoff();
  await keeper.tickOnce();
  await keeper.tickOnce();
  assert.ok(lines.some((l) => l.action === "settlement_stalled" && /cleared/.test(l.msg ?? "")));
});

test("an action failing 5 times in a row raises action_failing; no log line carries the RPC URL or its key", async () => {
  const rpc = "https://mainnet.helius-rpc.com/?api-key=SERVERKEY123";
  const { w, keeper, lines } = rig({ secrets: [rpc] });
  // the open round is past its close and empty: the keeper seals it, and every attempt fails
  w.windows.set(0n, window(0n, { closeSlot: 100n }));
  // the RPC is down: web3.js quotes the URL, key included
  (keeper as any).send = async () => { throw new Error(`failed to get info about account x: FetchError: request to ${rpc} failed, reason: getaddrinfo ENOTFOUND`); };
  for (let i = 0; i < 7; i++) { (keeper as any).backoff.forEach((b: { until: number }) => { b.until = 0; }); await keeper.tickOnce(); }
  const all = JSON.stringify(lines);
  assert.ok(!all.includes("SERVERKEY123"), "the key never reaches a log line");
  assert.ok(all.includes("https://mainnet.helius-rpc.com"), "the host stays, to say which RPC failed");
  assert.ok(lines.some((l) => l.action === "action_failing" && l.level === "warn"));
  assert.ok(keeper.health().reasons.some((r) => /failing 5\+ times/.test(r)));
});

test("past the daily ORAO budget no new round opens and an alert says so", async () => {
  const { w, keeper, lines } = rig({ vrfPerDay: 2 });
  w.windows.set(0n, window(0n, { state: WindowState.Sealed, entryCount: 3, sealedSlot: 100n, vrfRequested: true, vrfRequestedSlot: 100n }));
  (keeper as any).vrfSent = [Date.now() - 1_000, Date.now() - 2_000];
  await keeper.tickOnce();
  assert.equal(w.sent.flat().filter((x) => x.tag === "open").length, 0);
  assert.ok(lines.some((l) => l.action === "vrf_budget" && l.level === "warn"));
  // a day later the count fell back: the next round opens
  (keeper as any).vrfSent = [Date.now() - 86_400_001];
  await keeper.tickOnce();
  assert.deepEqual(tags(w.sent), ["open"]);
});
