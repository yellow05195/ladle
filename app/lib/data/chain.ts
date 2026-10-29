/**
 * Solana data source, on top of @pulled/sdk (the Ladle program client).
 *
 * Configuration: lib/data/cluster.ts (cluster, RPC, program, market), read
 * at build time. A missing or wrong value is a plain sentence the HUD shows
 * (`subscribe`'s onError); nothing falls back to a cluster the build did not
 * name, and mainnet never reads through the public endpoint. The RPC's
 * genesis hash must be the cluster's: a page that shows devnet never reads
 * or sends through a mainnet RPC (and the reverse).
 *
 * Reads (v21.3, report §2: one viewer used to make ~5 calls every 1.5 s):
 *   - websocket subscriptions on the market and the rounds in reach (the
 *     open one, the one before it, the viewer's own), and on the program's
 *     logs: a new player arrives as an `Entered` event, with no program scan;
 *   - one batched read (getMultipleAccounts: the market, those rounds and the
 *     viewer's entries in them) every 20 s as a fallback; every 3 s while a
 *     round is due to move on (to tell a late keeper from a quiet socket) or
 *     after the websocket missed a change;
 *   - the slot is counted from the last context slot (no getSlot);
 *   - a round's entries (one filtered getProgramAccounts) only when its rolls
 *     or shares land, or when the events left a gap, at most every 2 s;
 *   - nothing at all once the tab has been hidden for 10 s.
 *
 * Honest states: no round opened yet, a round whose slots ran out but that
 * the keeper has not sealed, no next round after a seal, no new round while
 * eight wait to settle (`paused`): `LiveWindow.halt`, with how late the
 * keeper is. Entering is never offered then. A stake is offered back only
 * while its round can really refund (not once ORAO answered after the
 * timeout: that round settles).
 *
 * Writes go through the connected wallet: `setChainWallet` is called by the
 * wallet provider; `enter` / `sellBack` / `refund` build the transaction with
 * the sdk (native SOL is wrapped and unwrapped in the same transaction, the
 * entry's rent comes back when it is closed) and hand it to the wallet to
 * sign and send. Entries are ["entry", window, owner] (one per wallet per
 * round). The viewer's own round stays in focus from their entry until they
 * close its result (`release`), like the demo. A sell back is bound to the
 * price the viewer saw (`min_quote_out` = that quote minus 1 %): sales that
 * land first and move the price further make it fail (SlippageExceeded)
 * instead of paying less. There is no "take to my wallet" (v25).
 *
 * Shutdown (wind-down build): `readClosingNotice` reads the market's notice
 * for the banner every page shows (components/live/ClosingNotice.tsx);
 * `enter` is refused while it runs (the program refuses it anyway).
 */
import { Connection, PublicKey, type AccountInfo, type Context, type Logs, type Transaction } from "@solana/web3.js";
import {
  MAX_WINDOWS_IN_FLIGHT,
  PULLED_PROGRAM_ID,
  PulledClient,
  WindowState,
  decodeEntry,
  decodeMarket,
  computeShares,
  computeWeights,
  decodeWindow,
  deriveRoll,
  describeError,
  eventsFromLogs,
  minQuoteOut,
  multiplierOf,
  WIND_DOWN_NOTICE_SECS,
  type Entry,
  type Keyed,
  type Market,
  type Window,
} from "@pulled/sdk";
import { slotMs } from "../measurements";
import { CLUSTER, MAINNET, MARKET_ENV, PROGRAM_ENV, RPC_ENDPOINT, RPC_URL, RPC_WS_URL, clusterProblem, type Cluster } from "./cluster";
import { pseudonym } from "./mock";
import type { DataSource, EntryView, Halt, LiveWindow, PastDistribution, Phase, ScoopLeft, ScoopOutcome, SettlementView, StakeBack, WindowView } from "./types";

/* ------------------------------ config ------------------------------ */

const SLOT_MS = slotMs().value.ms;
const RECENT = 12;
/** fallback read while the websocket delivers */
const SLOW_POLL_MS = 20_000;
/** while a round is due to move on, after a missed change, or while the RPC fails */
const FAST_POLL_MS = 3_000;
/** a keeper later than this stays late: no need to check every 3 s */
const STALLED_POLL_MS = 10_000;
/** a round's entries are read at most this often */
const ROSTER_GAP_MS = 2_000;
/** a new entry's `Entered` event is awaited this long after the round's account change before the entries are read */
const EVENT_GRACE_MS = 1_500;
/** the tab is hidden this long: subscriptions and polls stop */
const HIDE_AFTER_MS = 10_000;
/** the keeper seals within a few slots of the close (it checks every 2 s); later than this, the HUD says it is late */
const STALL_SLOTS = 40;
/** reads failing this long: the page says it lost the RPC (and stops counting slots it cannot see) */
const OFFLINE_AFTER_MS = 10_000;

interface ChainConfig { program: PublicKey; market: PublicKey | null; problem: string | null }

function readConfig(): ChainConfig {
  const problems: string[] = [];
  const cp = clusterProblem();
  if (cp) problems.push(cp);
  if (MAINNET && !RPC_URL) problems.push("NEXT_PUBLIC_RPC_URL is not set: mainnet reads need the site's own RPC.");
  let program = PULLED_PROGRAM_ID;
  if (PROGRAM_ENV) {
    try { program = new PublicKey(PROGRAM_ENV); } catch { problems.push("NEXT_PUBLIC_LADLE_PROGRAM is not a valid address."); }
  }
  let market: PublicKey | null = null;
  if (!MARKET_ENV) problems.push("NEXT_PUBLIC_LADLE_MARKET is not set.");
  else {
    try { market = new PublicKey(MARKET_ENV); } catch { problems.push("NEXT_PUBLIC_LADLE_MARKET is not a valid address."); }
  }
  return { program, market, problem: problems.length ? problems.join(" ") : null };
}
const CFG = readConfig();

/** Rounds cannot be read at all: the sentence says why (shown on the page). */
export class ChainUnavailable extends Error {}

export function chainConfigured(): boolean { return CFG.problem === null; }
export const chainRpc = RPC_ENDPOINT;

let client: PulledClient | null = null;
function c(): PulledClient {
  if (CFG.problem) throw new ChainUnavailable(CFG.problem);
  if (!client) {
    const connection = new Connection(RPC_ENDPOINT, { commitment: "confirmed", ...(RPC_WS_URL ? { wsEndpoint: RPC_WS_URL } : {}) });
    client = new PulledClient({ connection, programId: CFG.program });
  }
  return client;
}
function marketKey(): PublicKey {
  if (!CFG.market) throw new ChainUnavailable(CFG.problem ?? "NEXT_PUBLIC_LADLE_MARKET is not set.");
  return CFG.market;
}

/** Genesis hash of each cluster (`solana genesis-hash`). */
const GENESIS: Record<Cluster, string> = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
};
let genesisOk: Promise<void> | null = null;
/**
 * The RPC must serve the cluster this build shows (second review): a
 * mainnet RPC under a build that says devnet would take real SOL while the
 * footer says "test SOL" and every explorer link points at devnet. Checked
 * once before the first read and before every send; a wrong cluster stops
 * the page for good (ChainUnavailable), a failed check is tried again.
 */
function checkGenesis(): Promise<void> {
  if (!genesisOk) {
    const p = c().connection.getGenesisHash().then((h) => {
      if (h === GENESIS[CLUSTER]) return;
      const other = (Object.keys(GENESIS) as Cluster[]).find((k) => GENESIS[k] === h) ?? "another cluster";
      throw new ChainUnavailable(`This site's RPC serves ${other}, not ${CLUSTER}: nothing is read or sent until the site's settings agree.`);
    });
    genesisOk = p;
    p.catch((e) => { if (!(e instanceof ChainUnavailable)) genesisOk = null; });
  }
  return genesisOk;
}

/* ------------------------------ wallet bridge ------------------------------ */

export interface ChainWallet {
  publicKey: PublicKey;
  /** Signs and sends; returns the signature (wallet-adapter `sendTransaction`). */
  sendTransaction(tx: Transaction, connection: Connection): Promise<string>;
}
let wallet: ChainWallet | null = null;
export function setChainWallet(w: ChainWallet | null): void {
  const changed = (wallet?.publicKey.toBase58() ?? null) !== (w?.publicKey.toBase58() ?? null);
  wallet = w;
  if (!changed) return;
  // another viewer: nothing of the last one's is kept
  mine.clear(); outcomes.clear(); scoops = []; stakes = [];
  held = null; released = -1n;
  bump();
  if (running) { void readAll("ws"); void readScoops(); }
}
export function getChainWallet(): ChainWallet | null { return wallet; }

async function sendAndConfirm(tx: Transaction): Promise<string> {
  if (!wallet) throw new Error("connect a wallet first");
  await checkGenesis();
  const conn = c().connection;
  const sig = await wallet.sendTransaction(tx, conn);
  const res = await conn.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! }, "confirmed");
  if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

/* ------------------------------ what this page knows ------------------------------ */

let market: Market | null = null;
/** the rounds in reach, by index: the active one, the one before it, the viewer's held one */
const wins = new Map<bigint, Keyed<Window>>();
/** rounds in `wins` whose account the keeper closed after settling them (their last view, settled) */
const closed = new Set<bigint>();
/** the viewer's entry in each round in reach (null: none; absent: not read yet) */
const mine = new Map<bigint, Keyed<Entry> | null>();
/** a round's entries; "settled" lists are kept once known (rolls and shares are final, entries close after) */
const rosters = new Map<string, { key: string; list: Keyed<Entry>[] }>();
/** `Entered` events not yet in a roster, by round address and index */
const arrived = new Map<string, Map<number, Keyed<Entry>>>();
/** what this page did with the viewer's scoops (their entry closes in the same transaction) */
const outcomes = new Map<bigint, { kind: "taken" | "sold"; entry: Keyed<Entry>; tokens: bigint; sol: bigint | null }>();
/** the viewer's settled scoops still in the program, from a scan by owner (wallet connect) */
let scoops: Array<{ index: bigint; entry: Keyed<Entry> }> = [];
/** the viewer's stakes in rounds that will not be drawn (Refunding, or Sealed past the VRF timeout), same scan */
let stakes: Array<{ index: bigint; entry: Keyed<Entry> }> = [];
/** Sealed rounds past their VRF timeout whose randomness came after all (by address): drawn, never refundable (MustFulfill) */
const answered = new Set<string>();
/**
 * A Sealed round past its timeout is refundable only while ORAO has not
 * answered: once the randomness exists the program refuses the refund
 * (`MustFulfill`) and the round settles instead. Only a yes is kept (an
 * answer can still come).
 */
async function drawnAfterAll(key: PublicKey, w: Window): Promise<boolean> {
  if (w.state !== WindowState.Sealed || !w.vrfRequested) return false;
  const k = key.toBase58();
  if (answered.has(k)) return true;
  const yes = !!(await c().getFulfilledRandomness(w).catch(() => null));
  if (yes) answered.add(k);
  return yes;
}
/** the viewer's round in focus until they close its result; `released` rounds never come back */
let held: bigint | null = null;
let released = -1n;
let hostFee: { integration: string; bps: bigint } | null = null;
/** last data seen per account (to tell a change the websocket missed) */
const seen = new Map<string, string>();

let slotBase = 0, slotAt = 0;
/** since when every read fails (0: the last one answered) */
let failingSince = 0;
/** when a read last answered */
let answeredAt = 0;
/** reads have failed for a while, or since an answer long enough ago (a quiet socket hides a lost RPC until the next poll) */
const offline = () => failingSince > 0 && (Date.now() - failingSince > OFFLINE_AFTER_MS || Date.now() - answeredAt > SLOW_POLL_MS + 5_000);
/** The current slot, counted from the last context slot at the measured slot time (frozen once the RPC stopped answering). */
function slotNow(): number {
  if (!slotAt) return 0;
  const t = offline() ? Math.min(Date.now(), failingSince + OFFLINE_AFTER_MS, answeredAt + SLOW_POLL_MS + 5_000) : Date.now();
  return slotBase + Math.max(0, Math.floor((t - slotAt) / SLOT_MS));
}
function seeSlot(s: number): void {
  const est = slotNow();
  // a context slot a little behind the count is the slot of a change, not drift: keep counting
  if (slotAt && s <= est && s >= est - 4) return;
  slotBase = s; slotAt = Date.now();
}

const winKey = (i: bigint) => c().windowAddress(marketKey(), i);
const idOf = (i: bigint) => i.toString();

/** The rounds worth reading: the active one, the one before it (drawing while the next fills), the viewer's held one. */
function inReach(m: Market): bigint[] {
  if (!m.hasActiveWindow) return [];
  const a = m.activeWindow;
  const out = [a];
  if (a > 0n) out.push(a - 1n);
  if (held !== null && held < a - 1n) out.push(held);
  return out;
}

/* ------------------------------ reads ------------------------------ */

let reading: Promise<void> | null = null;
let readAgain = false;
let lastError: Error | null = null;
/** a poll found a change the websocket did not deliver: poll fast until it delivers again */
let fastUntil = 0;

/** One batched read of everything in reach (two when a new round opened since the last one). Coalesces concurrent calls. */
function readAll(why: "poll" | "ws"): Promise<void> {
  if (reading) { readAgain = true; return reading; }
  reading = (async () => {
    try {
      await readOnce(why);
      lastError = null;
      failingSince = 0;
      answeredAt = Date.now();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!failingSince) failingSince = Date.now();
      if (!snap) errorListeners.forEach((f) => f(unavailable(lastError!)));
    } finally {
      reading = null;
      if (readAgain) { readAgain = false; void readAll("ws"); }
    }
    bump();
    void syncRoster();
    syncSubs();
  })();
  return reading;
}

async function readOnce(why: "poll" | "ws"): Promise<void> {
  await checkGenesis();
  const cl = c();
  const mk = marketKey();
  for (let pass = 0; pass < 2; pass++) {
    const idx = market ? inReach(market) : [];
    const me = wallet?.publicKey ?? null;
    const wk = idx.map(winKey);
    const ek = me ? wk.map((w) => cl.entryAddress(w, me)) : [];
    const res = await cl.connection.getMultipleAccountsInfoAndContext([mk, ...wk, ...ek], "confirmed");
    seeSlot(res.context.slot);
    const mi = res.value[0];
    if (!mi) throw new ChainUnavailable(`No Ladle market at ${mk.toBase58()} on ${CLUSTER}.`);
    if (!mi.owner.equals(CFG.program)) throw new ChainUnavailable(`The account at ${mk.toBase58()} is not a market of the configured program.`);
    noteSeen(mk, mi, why);
    const m = decodeMarket(new Uint8Array(mi.data));
    const want = inReach(m);
    market = m;
    if (pass === 0 && want.join() !== idx.join()) continue; // a new round opened: read the right ones
    idx.forEach((i, k) => {
      const info = res.value[1 + k] ?? null;
      putWindow(i, wk[k]!, info, why);
      if (me) {
        const e = res.value[1 + idx.length + k] ?? null;
        mine.set(i, e && e.data.length ? { pubkey: ek[k]!, account: decodeEntry(new Uint8Array(e.data)) } : null);
      }
    });
    for (const [i, x] of [...wins]) {
      if (want.includes(i)) continue;
      const k = x.pubkey.toBase58();
      wins.delete(i); closed.delete(i); arrived.delete(k); gapSince.delete(k);
    }
    break;
  }
  // the viewer's rounds in reach that look refundable: drawn after all? (then no refund is offered)
  const slot = BigInt(slotNow());
  for (const [i, e] of mine) {
    const w = wins.get(i);
    if (e && w && market && w.account.state === WindowState.Sealed && PulledClient.entryRefundable(market, w.account, e.account, slot)) {
      void drawnAfterAll(w.pubkey, w.account).then((yes) => { if (yes) bump(); });
    }
  }
  adoptHeld();
  await readHostFee();
}

function putWindow(i: bigint, key: PublicKey, info: AccountInfo<Buffer> | null, why: "poll" | "ws"): void {
  if (!info || !info.data.length || !info.owner.equals(CFG.program)) {
    // closed. The keeper closes a settled round within minutes (its entries keep their share): a round last seen
    // tallied or settled keeps that view, marked settled, while it is in reach (its tally, seed and fees are final)
    const last = wins.get(i);
    if (last && (last.account.state === WindowState.Tallied || last.account.state === WindowState.Settled)) {
      wins.set(i, { pubkey: key, account: { ...last.account, state: WindowState.Settled, settleCursor: last.account.entryCount } });
      closed.add(i);
    } else { wins.delete(i); closed.delete(i); }
    return;
  }
  noteSeen(key, info, why);
  closed.delete(i);
  wins.set(i, { pubkey: key, account: decodeWindow(new Uint8Array(info.data)) });
}

/** A poll that finds data the websocket never delivered: the socket is down or late, so poll fast for a minute. */
function noteSeen(key: PublicKey, info: AccountInfo<Buffer>, why: "poll" | "ws"): void {
  const k = key.toBase58();
  const d = info.data.toString("base64");
  const before = seen.get(k);
  seen.set(k, d);
  if (why === "poll" && before !== undefined && before !== d) fastUntil = Date.now() + 60_000;
}

/** The viewer's newest round with an entry becomes the focus until they close its result (a round already settled at first sight goes to the scoops left instead). */
function adoptHeld(): void {
  for (const [i, e] of mine) {
    if (!e || i <= released || (held !== null && i <= held)) continue;
    const w = wins.get(i);
    if (!w) continue;
    if (w.account.state === WindowState.Settled && held === null && !outcomes.has(i)) continue;
    held = i;
  }
  // the held round closed (every entry taken or sold): follow the open round
  if (held !== null && !wins.has(held)) held = null;
}

async function readHostFee(): Promise<void> {
  const m = market;
  if (!m) return;
  const integration = m.integration.toBase58();
  if (hostFee?.integration === integration) return;
  hostFee = { integration, bps: BigInt(await c().getHostFeeBps(m)) };
}

/**
 * The viewer's settled scoops still in the program: one scan by owner and
 * market. Entries outlive their round (the keeper closes a settled round
 * within minutes), and carry its index: the sdk says which ones can still be
 * claimed.
 */
async function readScoops(): Promise<void> {
  const me = wallet?.publicKey;
  if (!me || CFG.problem) { scoops = []; stakes = []; return; }
  try {
    const cl = c();
    if (!market) await readAll("ws");
    const m = market;
    if (!m) return;
    const all = await cl.getEntriesByOwner(me, undefined, marketKey());
    scoops = all.filter((e) => PulledClient.entryClaimable(m, e.account)).map((e) => ({ index: e.account.windowIndex, entry: e }));
    // stakes not settled nor refunded: their round may be one that will not be drawn (its account is still there:
    // a refunding round closes only after its last refund)
    const open = all.filter((e) => !e.account.settled && !e.account.refunded && e.account.windowIndex < m.windowCount);
    const infos = open.length ? await cl.connection.getMultipleAccountsInfo(open.map((e) => e.account.window), "confirmed") : [];
    const slot = BigInt(slotNow());
    const found: Array<{ index: bigint; entry: Keyed<Entry> }> = [];
    for (const [i, e] of open.entries()) {
      const info = infos[i];
      if (!info || !info.owner.equals(CFG.program)) continue;
      const w = decodeWindow(new Uint8Array(info.data));
      if (!PulledClient.entryRefundable(m, w, e.account, slot)) continue;
      // ORAO answered after the timeout: the round settles, it does not refund
      if (await drawnAfterAll(e.account.window, w)) continue;
      found.push({ index: e.account.windowIndex, entry: e });
    }
    stakes = found;
    bump();
  } catch { /* next connect or action reads again */ }
}

/* ------------------------------ a round's entries ------------------------------ */

let rosterAt = 0;
let rosterBusy = false;
let rosterTimer: ReturnType<typeof setTimeout> | null = null;
/** since when a round's entry count is ahead of the `Entered` events seen (by round address) */
const gapSince = new Map<string, number>();

/**
 * Entries change only when a player arrives, until the shares are written:
 * the rolls of a drawing round are derived here from its seed (the sdk law,
 * as `verifyWindow` does), and the shares once the round is settled (from
 * the law on the whole roster, else read).
 */
function rosterKey(w: Window): string {
  return w.state === WindowState.Settled ? "settled" : String(w.entryCount);
}

/**
 * The shares of a settled round from its whole roster: the sdk law on the
 * tally's tokens_out, exactly what settle_page writes (sdk verifyWindow does
 * the same). Null when the recomputed roll sum is not the tally's, or the
 * shares do not add up to tokens_out: then the entries are read instead.
 */
function lawShares(list: Keyed<Entry>[], w: Window): Keyed<Entry>[] | null {
  try {
    const rolls = list.map((e) => deriveRoll(w.seed, e.account.owner.toBytes(), e.account.index));
    const wt = computeWeights(list.map((e) => e.account.amount), rolls);
    if (wt.rollSum !== w.rollSum) return null;
    const shares = computeShares(w.tokensOut, wt.weights, wt.weightSum);
    if (shares.reduce((a, b) => a + b, 0n) !== w.tokensOut) return null;
    return list.map((e, k) => ({ pubkey: e.pubkey, account: { ...e.account, roll: rolls[k]!, share: shares[k]!, settled: true } }));
  } catch { return null; }
}

/** Brings the focused round's entries up to date: from `Entered` events, else one scan (at most every 2 s). */
async function syncRoster(): Promise<void> {
  const f = focus();
  if (!f) return;
  const id = f.pubkey.toBase58();
  const w = f.account;
  // a round seen empty: its players will all arrive as events
  if (w.entryCount === 0) { if (!rosters.has(id)) rosters.set(id, { key: "0", list: [] }); return; }
  const key = rosterKey(w);
  const r = rosters.get(id);
  if (r?.key === key) return;
  if (w.state !== WindowState.Settled) {
    const list = r ? [...r.list] : [];
    const got = arrived.get(id);
    while (list.length < w.entryCount && got?.has(list.length)) list.push(got.get(list.length)!);
    if (list.length === w.entryCount) { rosters.set(id, { key, list }); gapSince.delete(id); bump(); return; }
    // the event usually lands a moment after the account change: wait for it before scanning the program
    if (logSub !== null && r && r.key !== "partial") {
      const since = gapSince.get(id) ?? Date.now();
      gapSince.set(id, since);
      const left = since + EVENT_GRACE_MS - Date.now();
      if (left > 0) {
        if (!rosterTimer) rosterTimer = setTimeout(() => { rosterTimer = null; void syncRoster(); }, left);
        return;
      }
    }
  } else if (r && r.list.length === w.entryCount) {
    // settled with the whole roster in hand: the shares are the law's, no scan (and none is possible for entries already closed)
    const list = lawShares(r.list, w);
    if (list) { rosters.set(id, { key, list }); bump(); return; }
  }
  const wait = rosterAt + ROSTER_GAP_MS - Date.now();
  if (wait > 0 || rosterBusy) {
    if (!rosterTimer) rosterTimer = setTimeout(() => { rosterTimer = null; void syncRoster(); }, Math.max(wait, 200));
    return;
  }
  rosterBusy = true;
  rosterAt = Date.now();
  try {
    const list = await c().getEntries(f.pubkey);
    if (rosters.size > 16) rosters.clear();
    // a lagging node may miss the newest entries: keep what came and read again; a settled round's closed entries never come back
    const whole = list.length >= w.entryCount || w.state === WindowState.Settled;
    rosters.set(id, { key: whole ? key : "partial", list });
    if (!whole && !rosterTimer) rosterTimer = setTimeout(() => { rosterTimer = null; void syncRoster(); }, ROSTER_GAP_MS);
    arrived.delete(id);
    gapSince.delete(id);
  } catch { /* the next change or poll tries again */ }
  finally { rosterBusy = false; }
  bump();
  // the round moved on while it was read
  const now = focus();
  if (now && rosters.get(now.pubkey.toBase58())?.key !== rosterKey(now.account)) void syncRoster();
}

/* ------------------------------ websocket ------------------------------ */

const subs = new Map<string, number>();
let logSub: number | null = null;

function syncSubs(): void {
  if (!running || !awake || CFG.problem || !market) return;
  const conn = c().connection;
  // the market, the rounds in reach (not the closed ones) and the viewer's entries in them (settle_page writes the share, a take closes it)
  const want = new Map<string, { pk: PublicKey; on: (info: AccountInfo<Buffer>, ctx: Context) => void }>();
  want.set(marketKey().toBase58(), { pk: marketKey(), on: onMarket });
  for (const [i, w] of wins) if (!closed.has(i)) want.set(w.pubkey.toBase58(), { pk: w.pubkey, on: (info, ctx) => onWindow(i, w.pubkey, info, ctx) });
  for (const [i, e] of mine) if (e) want.set(e.pubkey.toBase58(), { pk: e.pubkey, on: (info, ctx) => onEntry(i, e.pubkey, info, ctx) });
  for (const [k, s] of want) {
    if (subs.has(k)) continue;
    try { subs.set(k, conn.onAccountChange(s.pk, s.on, { commitment: "confirmed", encoding: "base64" })); } catch { /* polls cover it */ }
  }
  for (const [k, id] of subs) if (!want.has(k)) { subs.delete(k); void conn.removeAccountChangeListener(id).catch(() => {}); }
  if (logSub === null) {
    try { logSub = conn.onLogs(CFG.program, onLogs, "confirmed"); } catch { /* polls cover it */ }
  }
}

function dropSubs(): void {
  if (!client) return;
  const conn = client.connection;
  for (const id of subs.values()) void conn.removeAccountChangeListener(id).catch(() => {});
  subs.clear();
  if (logSub !== null) { void conn.removeOnLogsListener(logSub).catch(() => {}); logSub = null; }
}

function onMarket(info: AccountInfo<Buffer>, ctx: Context): void {
  fastUntil = 0;
  seeSlot(ctx.slot);
  if (!info.data.length) return;
  try {
    noteSeen(marketKey(), info, "ws");
    const m = decodeMarket(new Uint8Array(info.data));
    const moved = !market || inReach(m).join() !== inReach(market).join();
    market = m;
    // a round opened: read the new one (and the viewer's entries in reach) in one batch
    if (moved) void readAll("ws");
  } catch { /* a layout this build does not know: the next poll says so */ }
  bump();
}

function onWindow(i: bigint, pk: PublicKey, info: AccountInfo<Buffer>, ctx: Context): void {
  fastUntil = 0;
  seeSlot(ctx.slot);
  if (!wins.has(i)) return;
  try {
    putWindow(i, pk, info, "ws");
    adoptHeld();
  } catch { /* as above */ }
  bump();
  void syncRoster();
  syncSubs();
}

function onEntry(i: bigint, pk: PublicKey, info: AccountInfo<Buffer>, ctx: Context): void {
  fastUntil = 0;
  seeSlot(ctx.slot);
  try {
    mine.set(i, info.data.length && info.owner.equals(CFG.program) ? { pubkey: pk, account: decodeEntry(new Uint8Array(info.data)) } : null);
  } catch { /* as above */ }
  bump();
}

function onLogs(logs: Logs, ctx: Context): void {
  fastUntil = 0;
  if (logs.err) return;
  let any = false;
  for (const e of eventsFromLogs(logs.logs, CFG.program)) {
    if (e.name !== "Entered") continue;
    const id = e.window.toBase58();
    const w = [...wins.values()].find((x) => x.pubkey.toBase58() === id);
    if (!w) continue;
    const got = arrived.get(id) ?? new Map<number, Keyed<Entry>>();
    // the entry as enter writes it (no roll, no share yet)
    got.set(e.index, {
      pubkey: c().entryAddress(e.window, e.owner),
      account: {
        window: e.window, owner: e.owner, index: e.index, amount: e.amount, roll: 0n, share: 0n, claimed: 0n, refunded: false, bump: 0,
        market: w.account.market, windowIndex: w.account.index, settled: false,
      },
    });
    arrived.set(id, got);
    any = true;
  }
  if (any) { seeSlot(ctx.slot); void syncRoster(); }
}

/* ------------------------------ the snapshot ------------------------------ */

function focusIndex(): bigint | null {
  if (held !== null && wins.has(held)) return held;
  return market?.hasActiveWindow && wins.has(market.activeWindow) ? market.activeWindow : null;
}
function focus(): Keyed<Window> | null {
  const i = focusIndex();
  return i === null ? null : wins.get(i) ?? null;
}

function phaseOf(w: Window, slot: number): Phase {
  switch (w.state) {
    // the program refuses entries from the close slot: an open round past it reads as closed
    case WindowState.Open: return slot >= Number(w.closeSlot) ? "sealed" : "open";
    case WindowState.Sealed: return "sealed";
    case WindowState.Drawn:
    case WindowState.Tallied: return "seeded";
    case WindowState.Settled: return "settled";
    case WindowState.Refunding: return "sealed";
  }
}

/** Why no round takes entries right now, or null when the active one does. */
function haltOf(m: Market, slot: number): Halt | null {
  // the reads fail (the RPC, not the keeper): what this page shows is stale, say so rather than blame the keeper
  if (offline()) return { kind: "offline", round: null, late: Math.round((Date.now() - (answeredAt || failingSince)) / SLOT_MS), stalled: true };
  const a = m.hasActiveWindow ? wins.get(m.activeWindow) : undefined;
  // the program opens no new round while eight wait to settle behind one that has not finished
  if (m.windowCount - m.nextSettleIndex >= MAX_WINDOWS_IN_FLIGHT && (!a || a.account.state !== WindowState.Open)) {
    return { kind: "paused", round: idOf(m.nextSettleIndex), late: 0, stalled: true };
  }
  // no round yet, or the last one closed (a drained market): nothing open
  if (!m.hasActiveWindow) return { kind: "none", round: null, late: 0, stalled: false };
  if (!a) return null;
  const w = a.account;
  if (w.state === WindowState.Open) {
    if (slot < Number(w.closeSlot)) return null;
    const late = slot - Number(w.closeSlot);
    return { kind: "closing", round: idOf(w.index), late, stalled: late > STALL_SLOTS };
  }
  const late = Math.max(0, slot - Number(w.sealedSlot > 0n ? w.sealedSlot : w.closeSlot));
  return { kind: "between", round: idOf(w.index), late, stalled: late > STALL_SLOTS };
}

/** The largest entry the program takes in the active round now: the per-entry cap of the total after it, or the floor, within the maximum entry. */
function maxEntryOf(m: Market): bigint {
  const a = m.hasActiveWindow ? wins.get(m.activeWindow)?.account : undefined;
  const total = a && a.state === WindowState.Open ? a.totalAmount : 0n;
  const bps = BigInt(m.maxEntryBps);
  const byCap = bps >= 10_000n ? m.maxEntryAmount : (bps * total) / (10_000n - bps);
  const byFloor = m.entryFloorAmount > total ? m.entryFloorAmount - total : 0n;
  const best = byCap > byFloor ? byCap : byFloor;
  return best < m.maxEntryAmount ? best : m.maxEntryAmount;
}

function stakesBack(m: Market, slot: number): StakeBack[] {
  const byIndex = new Map<bigint, Keyed<Entry>>();
  for (const s of stakes) byIndex.set(s.index, s.entry);
  // the rounds in reach were read with this batch: a round that just turned to refunds shows at once
  for (const [i, e] of mine) {
    const w = wins.get(i);
    if (e && w && !closed.has(i) && PulledClient.entryRefundable(m, w.account, e.account, BigInt(slot)) && !answered.has(w.pubkey.toBase58())) byIndex.set(i, e);
    else if (e?.account.refunded || (w && answered.has(w.pubkey.toBase58()))) byIndex.delete(i);
  }
  return [...byIndex].map(([i, e]) => ({ id: idOf(i), amount: e.account.amount })).sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
}

function scoopsLeft(m: Market): ScoopLeft[] {
  const cl = c();
  const byIndex = new Map<bigint, Keyed<Entry>>();
  for (const s of scoops) byIndex.set(s.index, s.entry);
  // the rounds in reach were read with this batch: fresher than the scan
  for (const [i, e] of mine) if (e) byIndex.set(i, e);
  const out: ScoopLeft[] = [];
  for (const [i, e] of byIndex) {
    if (outcomes.has(i) || !PulledClient.entryClaimable(m, e.account)) continue;
    out.push({ id: idOf(i), tokens: e.account.share - e.account.claimed, sellBack: cl.quoteSellBackSync(m, e.account).quoteOut });
  }
  return out.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
}

function entryViews(entries: Keyed<Entry>[], w: Window, me: PublicKey | null, now: number, openedAt: number): EntryView[] {
  return entries.map((e) => {
    const isMine = !!me && e.account.owner.equals(me);
    const v: EntryView = {
      index: e.account.index,
      owner: e.account.owner.toBytes(),
      label: isMine ? "you" : pseudonym(e.account.owner.toBytes()),
      amount: e.account.amount,
      mine: isMine,
      arrivedAt: Math.max(0, Math.min(now - openedAt, (e.account.index + 1) * 500)),
    };
    if (w.state >= WindowState.Tallied || (w.state === WindowState.Drawn && w.tallyCursor > e.account.index)) {
      // settled: the roster's (read, or the law's); while the round draws, derived from its seed as tally_page does
      v.roll = w.state === WindowState.Settled ? e.account.roll : deriveRoll(w.seed, v.owner, e.account.index);
    }
    if (w.state === WindowState.Settled) v.share = e.account.share;
    return v;
  });
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const isZero = (b: Uint8Array) => b.every((x) => x === 0);
/** a fixed instant for the quiet snapshot (no round in reach), so nothing counts down */
let quietAt = 0;

function build(): LiveWindow | null {
  const m = market;
  if (!m) return null;
  const cl = c();
  const slot = slotNow();
  const now = Date.now();
  const me = wallet?.publicKey ?? null;
  const halt = haltOf(m, slot);
  const hostFeeBps = hostFee?.bps ?? 0n;
  const left = me ? scoopsLeft(m) : [];
  const done: Record<string, ScoopOutcome> = {};
  for (const [i, o] of outcomes) done[idOf(i)] = { kind: o.kind, tokens: o.tokens, sol: o.sol };
  const extra = { halt, maxEntry: maxEntryOf(m), scoopsLeft: left, stakesBack: me ? stakesBack(m, slot) : [], outcomes: done };
  const fi = focusIndex();
  const f = fi === null ? null : wins.get(fi)!;
  if (!f || fi === null) {
    // no round in reach: nothing is open and nothing counts down
    if (!quietAt) quietAt = now;
    return {
      id: idOf(m.windowCount), mint: m.tokenMint.toBase58(), source: "chain", phase: "sealed", openedAt: quietAt, closeAt: quietAt,
      slotsTotal: Number(m.windowSlots), slotsRemaining: 0, slotMs: SLOT_MS, slotsSinceSeal: 0, seedDelayMs: null, capBps: BigInt(m.maxEntryBps),
      hostFeeBps, entries: [], total: 0n, mineIndex: null, seedHex: null, vrfAccount: null, settlement: null, soldFor: null, sibling: null, ...extra,
    };
  }
  quietAt = 0;
  const w = f.account;
  // the viewer's entry: the fresh read (its `claimed` moves), else what this page did with it before it closed
  const out = outcomes.get(fi) ?? null;
  const mineEntry = me ? (mine.get(fi) ?? out?.entry ?? null) : null;
  let entries = rosters.get(f.pubkey.toBase58())?.list ?? [];
  if (mineEntry) {
    const k = entries.findIndex((e) => e.account.index === mineEntry.account.index);
    entries = k >= 0 ? entries.map((e, j) => (j === k ? mineEntry : e)) : [...entries, mineEntry].sort((a, b) => a.account.index - b.account.index);
  }
  const slotsTotal = Number(w.closeSlot - w.openSlot);
  const slotsRemaining = w.state === WindowState.Open ? Math.max(0, Number(w.closeSlot) - slot) : 0;
  const closeAt = now + slotsRemaining * SLOT_MS;
  const openedAt = closeAt - slotsTotal * SLOT_MS;
  const sold = out?.kind === "sold";

  let settlement: SettlementView | null = null;
  if (w.state === WindowState.Settled) {
    const myShare = mineEntry ? mineEntry.account.share : null;
    const q = mineEntry && !out ? cl.quoteSellBackSync(m, mineEntry.account) : null;
    settlement = {
      tokensOut: w.tokensOut,
      platformFee: w.feePlatform,
      hostFee: w.feeHost,
      toCurve: w.toCurve,
      myMultiplier: mineEntry && myShare !== null ? multiplierOf(myShare, mineEntry.account.amount, w.totalAmount, w.tokensOut) : null,
      myShare,
      mySellBack: q ? q.quoteOut : null,
      curveAfter: m.curve,
    };
  }

  // rounds are pipelined: the other round in flight (the open one while this one draws, or the one drawing while this one is open)
  const active = m.activeWindow;
  const sibIndex = fi === active ? (active > 0n ? active - 1n : null) : active;
  let sibling: LiveWindow["sibling"] = null;
  const s = sibIndex !== null && sibIndex >= m.nextSettleIndex ? wins.get(sibIndex) : undefined;
  if (s) sibling = {
    id: idOf(s.account.index),
    phase: phaseOf(s.account, slot),
    slotsRemaining: s.account.state === WindowState.Open ? Math.max(0, Number(s.account.closeSlot) - slot) : 0,
    slotsSinceSeal: s.account.sealedSlot > 0n ? Math.max(0, slot - Number(s.account.sealedSlot)) : 0,
    entries: s.account.entryCount,
    total: s.account.totalAmount,
  };

  return {
    id: idOf(w.index),
    mint: m.tokenMint.toBase58(),
    source: "chain",
    phase: sold && w.state === WindowState.Settled ? "sold" : phaseOf(w, slot),
    openedAt,
    closeAt,
    slotsTotal,
    slotsRemaining,
    slotMs: SLOT_MS,
    slotsSinceSeal: w.sealedSlot > 0n ? Math.max(0, slot - Number(w.sealedSlot)) : 0,
    seedDelayMs: null,
    capBps: BigInt(m.maxEntryBps),
    hostFeeBps,
    entries: entryViews(entries, w, me, now, openedAt),
    total: w.totalAmount,
    mineIndex: mineEntry ? mineEntry.account.index : null,
    seedHex: isZero(w.seed) ? null : hex(w.seed),
    vrfAccount: w.vrfRequested ? w.vrfRequest.toBase58() : null,
    settlement,
    soldFor: sold ? out!.sol : null,
    sibling,
    ...extra,
  };
}

/* ------------------------------ the loop ------------------------------ */

type Listener = (w: LiveWindow) => void;
const listeners = new Set<Listener>();
const errorListeners = new Set<(e: Error) => void>();
let snap: LiveWindow | null = null;
let version = 0, emitted = -1, emittedSlot = -1;
let running = false, awake = true;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Something this page knows changed: rebuild and emit now. */
function bump(): void { version++; emit(); }

function emit(): void {
  if (!listeners.size) return;
  const slot = slotNow();
  if (version === emitted && slot === emittedSlot) return;
  let w: LiveWindow | null = null;
  try { w = build(); } catch { return; }
  if (!w) return;
  emitted = version; emittedSlot = slot;
  snap = w;
  listeners.forEach((f) => f(w));
}

function unavailable(e: Error): Error {
  if (e instanceof ChainUnavailable) return e;
  return new ChainUnavailable(`The Solana RPC did not answer (${e.message.slice(0, 120)}). Retrying.`);
}

function pollDelay(): number {
  // the RPC fails: retry soon, then less often (every viewer retries)
  if (lastError) return lastError instanceof ChainUnavailable ? SLOW_POLL_MS : Date.now() - failingSince > 60_000 ? STALLED_POLL_MS : FAST_POLL_MS;
  if (Date.now() < fastUntil) return FAST_POLL_MS;
  const h = market ? haltOf(market, slotNow()) : null;
  // a round is due to move on: confirm it did (the socket says so first when it works), or measure how late the keeper is
  if (h && h.kind !== "none") return h.stalled ? STALLED_POLL_MS : FAST_POLL_MS;
  const a = market?.hasActiveWindow ? wins.get(market.activeWindow)?.account : undefined;
  if (a && a.state === WindowState.Open) {
    const toClose = (Number(a.closeSlot) - slotNow()) * SLOT_MS;
    if (toClose > 0 && toClose < SLOW_POLL_MS) return Math.max(FAST_POLL_MS, toClose + FAST_POLL_MS);
  }
  return SLOW_POLL_MS;
}

function schedulePoll(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (!running || !awake) return;
  pollTimer = setTimeout(() => { void readAll("poll").finally(schedulePoll); }, pollDelay());
}

function onVisibility(): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "hidden") {
    if (!hideTimer) hideTimer = setTimeout(sleep, HIDE_AFTER_MS);
    return;
  }
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (!awake) wake();
}

/** The tab is hidden: stop reading (the websocket closes once it has no subscription). */
function sleep(): void {
  hideTimer = null;
  awake = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  dropSubs();
}

function wake(): void {
  awake = true;
  tickTimer = setInterval(emit, Math.max(100, Math.round(SLOT_MS / 2)));
  void readAll("ws").finally(schedulePoll);
}

function start(): void {
  if (running) return;
  running = true;
  awake = typeof document === "undefined" || document.visibilityState !== "hidden";
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  if (awake) wake();
  else onVisibility();
  void readScoops();
}

function stop(): void {
  running = false;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (rosterTimer) { clearTimeout(rosterTimer); rosterTimer = null; }
  sleep();
}

/* ------------------------------ history pages ------------------------------ */

/** Settled rounds never change (only their entries close): one view per round per page load. */
const views = new Map<bigint, WindowView>();

async function windowView(w: Keyed<Window>, m: Market): Promise<WindowView> {
  const hit = views.get(w.account.index);
  if (hit) return hit;
  const cl = c();
  const entries = await cl.getEntries(w.pubkey);
  if (!hostFee || hostFee.integration !== m.integration.toBase58()) hostFee = { integration: m.integration.toBase58(), bps: BigInt(await cl.getHostFeeBps(m)) };
  const blockTime = w.account.sealedSlot > 0n ? await cl.connection.getBlockTime(Number(w.account.sealedSlot)).catch(() => null) : null;
  const v: WindowView = {
    id: idOf(w.account.index),
    mint: m.tokenMint.toBase58(),
    source: "chain",
    closedAt: new Date((blockTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    // a one-entry round is drawn without randomness: zero seed, no ORAO request ("")
    seedHex: hex(w.account.seed),
    vrfAccount: w.account.vrfRequested ? w.account.vrfRequest.toBase58() : "",
    settleTx: "",
    hostFeeBps: hostFee.bps,
    capBps: BigInt(m.maxEntryBps),
    // the curve before this window's buy is not recoverable once later windows moved it: the verifier recomputes shares from tokens_out (sdk verifyWindow)
    curveBefore: m.curve,
    entries: entries.map((e) => ({ index: e.account.index, owner: e.account.owner.toBytes(), amount: e.account.amount, roll: e.account.roll, share: e.account.share })),
    total: w.account.totalAmount,
    tokensOut: w.account.tokensOut,
  };
  // a list missing entries (closed before this read) is not kept: the next read may be the same, but never cached as whole
  if (entries.length === w.account.entryCount) views.set(w.account.index, v);
  return v;
}

/** The newest settled rounds with entries, from one batched read of the last `span` indices. */
async function recentSettled(span: bigint, want: number): Promise<{ m: Market; list: Keyed<Window>[] }> {
  await checkGenesis();
  const cl = c();
  const mk = marketKey();
  const m = (await cl.getMarket(mk)).account;
  const idx: bigint[] = [];
  for (let i = m.nextSettleIndex - 1n; i >= 0n && m.nextSettleIndex - i <= span; i--) idx.push(i);
  const keys = idx.map((i) => cl.windowAddress(mk, i));
  const infos = idx.length ? await cl.connection.getMultipleAccountsInfo(keys, "confirmed") : [];
  const list: Keyed<Window>[] = [];
  infos.forEach((info, k) => {
    if (list.length >= want || !info || !info.data.length) return; // closed (rent recovered): history lives in the events
    const w = decodeWindow(new Uint8Array(info.data));
    if (w.state === WindowState.Settled && w.entryCount > 0) list.push({ pubkey: keys[k]!, account: w });
  });
  return { m, list };
}

/* ------------------------------ writes ------------------------------ */

function roundIndex(id?: string): bigint {
  if (id !== undefined) {
    if (!/^\d+$/.test(id)) throw new Error("no such round");
    return BigInt(id);
  }
  const fi = focusIndex();
  if (fi === null) throw new Error("no round in focus");
  return fi;
}

/** The viewer's entry in round `i`, as last read (a fresh read when this page has none). */
async function myEntry(i: bigint): Promise<Keyed<Entry>> {
  if (!wallet) throw new Error("connect a wallet first");
  const known = mine.get(i) ?? scoops.find((s) => s.index === i)?.entry ?? null;
  if (known) return known;
  const e = await c().getEntryOf(winKey(i), wallet.publicKey);
  if (!e) throw new Error("no entry of yours in this round");
  return e;
}

/** After a sell back: the entry closed in the same transaction; keep its record, drop it from what is left. */
function settleOutcome(i: bigint, entry: Keyed<Entry>, kind: "taken" | "sold", sol: bigint | null): void {
  const tokens = entry.account.share - entry.account.claimed;
  outcomes.set(i, { kind, entry: { pubkey: entry.pubkey, account: { ...entry.account, claimed: entry.account.share } }, tokens, sol });
  mine.set(i, null);
  scoops = scoops.filter((s) => s.index !== i);
  bump();
  void readAll("ws");
}

export const chainSource: DataSource = {
  async getLiveWindow() {
    if (CFG.problem) throw new ChainUnavailable(CFG.problem);
    if (snap) return snap;
    if (!running) await readAll("poll");
    else await (reading ?? readAll("poll"));
    if (lastError) throw unavailable(lastError);
    const w = build();
    if (!w) throw new ChainUnavailable("The market could not be read.");
    return w;
  },

  subscribe(cb, onError) {
    if (CFG.problem) {
      const e = new ChainUnavailable(CFG.problem);
      queueMicrotask(() => onError?.(e));
      return () => {};
    }
    listeners.add(cb);
    if (onError) errorListeners.add(onError);
    if (snap) cb(snap);
    start();
    return () => {
      listeners.delete(cb);
      if (onError) errorListeners.delete(onError);
      if (!listeners.size) stop();
    };
  },

  async getWindow(id) {
    await checkGenesis();
    const cl = c();
    const mk = marketKey();
    if (id === "latest") {
      const { m, list } = await recentSettled(30n, 1);
      return list[0] ? windowView(list[0], m) : null;
    }
    if (!/^\d+$/.test(id)) return null;
    const m = (await cl.getMarket(mk)).account;
    const w = await cl.getWindowByIndex(mk, BigInt(id)).catch(() => null);
    if (!w || w.account.state !== WindowState.Settled) return null;
    return windowView(w, m);
  },

  async listRecentWindows() {
    const { m, list } = await recentSettled(60n, RECENT);
    const out: WindowView[] = [];
    for (const w of list) out.push(await windowView(w, m));
    return out;
  },

  async getPastDistribution(): Promise<PastDistribution> {
    const recent = await chainSource.listRecentWindows();
    const rows: { frac: number; mult: number }[] = [];
    for (const w of recent) for (const e of w.entries) {
      if (w.total === 0n || w.tokensOut === 0n) continue;
      rows.push({ frac: Number(e.amount) / Number(w.total), mult: multiplierOf(e.share, e.amount, w.total, w.tokensOut) });
    }
    rows.sort((a, b) => a.frac - b.frac);
    const buckets = Array.from({ length: 10 }, (_, d) => {
      const part = rows.slice(Math.floor((d * rows.length) / 10), Math.floor(((d + 1) * rows.length) / 10));
      const ms = part.map((r) => r.mult).sort((a, b) => a - b);
      const q = (p: number) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]! : 1);
      return {
        decile: d + 1,
        lo: part[0]?.frac ?? 0,
        hi: part[part.length - 1]?.frac ?? 0,
        n: part.length,
        meanMultiplier: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 1,
        p10: q(0.1), p50: q(0.5), p90: q(0.9),
      };
    });
    return { buckets, measuredAt: new Date().toISOString(), sampleSize: rows.length, source: "chain" };
  },

  /** Stake `amount` lamports into the open round (one entry per wallet per round). */
  async enter(amount: bigint) {
    if (!wallet) throw new Error("connect a wallet first");
    const m = market;
    if (m && m.noticeStart > 0n) throw new Error("Ladle is closing: no new entry");
    const h = m ? haltOf(m, slotNow()) : null;
    if (h) throw new Error(h.kind === "none" ? "no round is open yet" : "this round is closed to new entries");
    try {
      await sendAndConfirm(await c().enter({ market: marketKey(), amount, owner: wallet.publicKey }));
    } catch (e) {
      throw new Error(describeError(e));
    }
    await readAll("ws");
  },

  /**
   * Sell the viewer's whole scoop of round `id` (default: the round in focus) back to the curve (0 fee; the entry's rent
   * comes back), bound to the price on screen: at least that quote minus 1 % (the sdk's DEFAULT_SLIPPAGE_BPS).
   */
  async sellBack(id?: string) {
    if (!wallet) throw new Error("connect a wallet first");
    const cl = c();
    const i = roundIndex(id);
    const entry = await myEntry(i);
    const quote = market ? cl.quoteSellBackSync(market, entry.account).quoteOut : null;
    let sig: string;
    try {
      sig = await sendAndConfirm(await cl.sellBack({ entry: entry.pubkey, owner: wallet.publicKey, minQuoteOut: quote !== null ? minQuoteOut(quote) : undefined }));
    } catch (e) {
      throw new Error(describeError(e));
    }
    // what the curve actually paid, from the transaction's SoldBack event (the quote if the RPC does not have it yet)
    let sol = quote;
    try {
      const tx = await cl.connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const ev = eventsFromLogs(tx?.meta?.logMessages ?? [], CFG.program).find((e) => e.name === "SoldBack");
      if (ev && ev.name === "SoldBack") sol = ev.quoteOut;
    } catch { /* keep the quote */ }
    settleOutcome(i, entry, "sold", sol);
  },

  /**
   * Take the viewer's stake of round `id` back from a round that will not be drawn (the sdk's `refund`: it switches a
   * round past its VRF timeout to refunds when nobody did, returns the stake and the entry's rent as SOL; the viewer
   * pays the fees). The keeper does it only for wallets that already hold a SOL token account.
   */
  async refund(id: string) {
    if (!wallet) throw new Error("connect a wallet first");
    const i = roundIndex(id);
    const entry = stakes.find((x) => x.index === i)?.entry ?? mine.get(i) ?? null;
    if (!entry) throw new Error("no stake of yours waits in this round");
    try {
      await sendAndConfirm(await c().refund({ entry: entry.pubkey, owner: wallet.publicKey }));
    } catch (e) {
      throw new Error(describeError(e));
    }
    stakes = stakes.filter((x) => x.index !== i);
    // the entry closed in the same transaction
    mine.set(i, null);
    bump();
    void readAll("ws");
  },

  /** The viewer closed their result: follow the open round again. */
  release() {
    const fi = focusIndex();
    if (held === null || fi !== held) return;
    const w = wins.get(held)?.account;
    if (!w || w.state !== WindowState.Settled) return;
    released = held;
    held = null;
    bump();
  },
};

/* ------------------------------ shutdown notice ------------------------------ */

/** The market's closing notice (wind-down build): when entries are paid out, and whether that time has come. */
export interface ClosingNotice {
  /** Unix seconds: from then on whatever is left in entries is paid to their owners. */
  endsAt: number;
  over: boolean;
}

/**
 * One read of the market (the RPC checked first, like every read): its
 * notice when `start_wind_down` ran (the wind-down build is live), null
 * otherwise or when the market cannot be read (the rest of the page says
 * why). A round opening under the normal build clears the notice.
 */
export async function readClosingNotice(): Promise<ClosingNotice | null> {
  if (CFG.problem || !CFG.market) return null;
  await checkGenesis();
  const m = await c().getMarketOrNull(CFG.market);
  if (!m || m.account.noticeStart <= 0n) return null;
  const end = PulledClient.noticeEnd(m.account, WIND_DOWN_NOTICE_SECS)!;
  return { endsAt: Number(end), over: Date.now() / 1000 >= Number(end) };
}
