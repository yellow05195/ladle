/**
 * Solana data source, on top of @pulled/sdk (the Ladle program client).
 *
 * Configuration (public, baked at build time):
 *   NEXT_PUBLIC_DATA_SOURCE=chain
 *   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
 *   NEXT_PUBLIC_LADLE_PROGRAM=<program id>
 *   NEXT_PUBLIC_LADLE_MARKET=<market PDA>   (config/deployments/<cluster>.json)
 *
 * Reads are plain RPC calls (no key). Writes go through the connected wallet:
 * `setChainWallet` is called by the wallet provider; `enter` / `sellBack`
 * build the transaction with the sdk (native SOL is wrapped and unwrapped in
 * the same transaction, the entry's rent comes back when it is closed) and
 * hand it to the wallet to sign and send.
 *
 * Entries are ["entry", window, owner] (one per wallet per round): the
 * viewer's own entry is one read, the round's entries one filtered
 * getProgramAccounts, and an `enter` built from a stale view of the round
 * still lands however many wallets enter in the same slot.
 */
import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import {
  PULLED_PROGRAM_ID,
  PulledClient,
  WindowState,
  describeError,
  multiplierOf,
  splitFees,
  type Entry,
  type Keyed,
  type Market,
  type Window,
} from "@pulled/sdk";
import { slotMs } from "../measurements";
import { pseudonym } from "./mock";
import type { DataSource, LiveWindow, PastDistribution, Phase, SettlementView, WindowView, EntryView } from "./types";

/* ------------------------------ config ------------------------------ */

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const PROGRAM = process.env.NEXT_PUBLIC_LADLE_PROGRAM ? new PublicKey(process.env.NEXT_PUBLIC_LADLE_PROGRAM) : PULLED_PROGRAM_ID;
const MARKET = process.env.NEXT_PUBLIC_LADLE_MARKET ?? "";
const SLOT_MS = slotMs().value.ms;
const POLL_MS = 1500;
const RECENT = 12;

export function chainConfigured(): boolean { return MARKET.length > 0; }
export const chainRpc = RPC;

let client: PulledClient | null = null;
function c(): PulledClient {
  if (!client) client = new PulledClient({ connection: new Connection(RPC, "confirmed"), programId: PROGRAM });
  return client;
}
function market(): PublicKey {
  if (!MARKET) throw new Error("NEXT_PUBLIC_LADLE_MARKET is not set");
  return new PublicKey(MARKET);
}

/* ------------------------------ wallet bridge ------------------------------ */

export interface ChainWallet {
  publicKey: PublicKey;
  /** Signs and sends; returns the signature (wallet-adapter `sendTransaction`). */
  sendTransaction(tx: Transaction, connection: Connection): Promise<string>;
}
let wallet: ChainWallet | null = null;
const walletListeners = new Set<() => void>();
export function setChainWallet(w: ChainWallet | null): void { wallet = w; walletListeners.forEach((f) => f()); }
export function getChainWallet(): ChainWallet | null { return wallet; }

async function sendAndConfirm(tx: Transaction): Promise<string> {
  if (!wallet) throw new Error("connect a wallet first");
  const conn = c().connection;
  const sig = await wallet.sendTransaction(tx, conn);
  const { blockhash, lastValidBlockHeight } = { blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! };
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

/* ------------------------------ mapping ------------------------------ */

function phaseOf(w: Window, mineSold: boolean): Phase {
  switch (w.state) {
    case WindowState.Open: return "open";
    case WindowState.Sealed: return "sealed";
    case WindowState.Drawn:
    case WindowState.Tallied: return "seeded";
    case WindowState.Settled: return mineSold ? "sold" : "settled";
    case WindowState.Refunding: return "sealed";
  }
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const isZero = (b: Uint8Array) => b.every((x) => x === 0);

/**
 * A round's entries (one filtered getProgramAccounts), re-read only when the
 * window says something changed: a crowd of viewers polling every 1.5 s then
 * costs one small account read each, not a program scan. The viewer's own
 * entry is read on its own (its `claimed` moves without touching the window
 * when part of a share is sold back).
 */
const entryCache = new Map<string, { key: string; entries: Keyed<Entry>[] }>();
async function entriesOf(cl: PulledClient, window: PublicKey, w: Window, me: PublicKey | null): Promise<Keyed<Entry>[]> {
  if (w.entryCount === 0) return [];
  const id = window.toBase58();
  const key = `${w.state}:${w.entryCount}:${w.tallyCursor}:${w.settleCursor}:${w.closedEntries}`;
  const hit = entryCache.get(id);
  let entries = hit?.key === key ? hit.entries : null;
  if (!entries) {
    entries = await cl.getEntries(window);
    if (entryCache.size > 64) entryCache.clear();
    entryCache.set(id, { key, entries });
  }
  if (me && w.state === WindowState.Settled) {
    const mine = await cl.getEntryOf(window, me);
    if (mine) entries = entries.map((e) => (e.pubkey.equals(mine.pubkey) ? mine : e));
  }
  return entries;
}

function entryViews(entries: Keyed<Entry>[], w: Window, me: PublicKey | null, now: number, openedAt: number): EntryView[] {
  return entries.map((e) => {
    const mine = !!me && e.account.owner.equals(me);
    const v: EntryView = {
      index: e.account.index,
      owner: e.account.owner.toBytes(),
      label: mine ? "you" : pseudonym(e.account.owner.toBytes()),
      amount: e.account.amount,
      mine,
      arrivedAt: Math.max(0, Math.min(now - openedAt, (e.account.index + 1) * 500)),
    };
    if (w.state >= WindowState.Tallied || (w.state === WindowState.Drawn && w.tallyCursor > e.account.index)) v.roll = e.account.roll;
    if (w.state === WindowState.Settled) v.share = e.account.share;
    return v;
  });
}

async function liveWindow(): Promise<LiveWindow> {
  const cl = c();
  const mk = market();
  const [m, slot] = await Promise.all([cl.getMarket(mk), cl.getSlot()]);
  const now = Date.now();
  if (!m.account.hasActiveWindow) return emptyLive(m.account, mk, now);

  // focus: the window the viewer is in if it is still running, else the active one
  const active = await cl.getWindowByIndex(mk, m.account.activeWindow);
  let focus = active;
  const me = wallet?.publicKey ?? null;
  if (me && m.account.activeWindow > m.account.nextSettleIndex) {
    const prev = await cl.getWindowByIndex(mk, m.account.activeWindow - 1n).catch(() => null);
    if (prev && prev.account.state !== WindowState.Settled) {
      if (await cl.getEntryOf(prev.pubkey, me)) focus = prev;
    }
  }
  const w = focus.account;
  const entries = await entriesOf(cl, focus.pubkey, w, me);
  const slotsTotal = Number(w.closeSlot - w.openSlot);
  const slotsRemaining = Math.max(0, Number(w.closeSlot) - slot);
  const closeAt = now + slotsRemaining * SLOT_MS;
  const openedAt = closeAt - slotsTotal * SLOT_MS;
  const mineEntry = me ? entries.find((e) => e.account.owner.equals(me)) ?? null : null;
  const mineSold = !!mineEntry && w.state === WindowState.Settled && mineEntry.account.share > 0n && mineEntry.account.claimed === mineEntry.account.share;
  const hostFeeBps = BigInt(await cl.getHostFeeBps(m.account));

  let settlement: SettlementView | null = null;
  if (w.state === WindowState.Settled) {
    const myShare = mineEntry ? mineEntry.account.share : null;
    const q = mineEntry ? cl.quoteSellBackSync(m.account, mineEntry.account) : null;
    settlement = {
      tokensOut: w.tokensOut,
      platformFee: w.feePlatform,
      hostFee: w.feeHost,
      toCurve: w.toCurve,
      myMultiplier: mineEntry && myShare !== null ? multiplierOf(myShare, mineEntry.account.amount, w.totalAmount, w.tokensOut) : null,
      myShare,
      mySellBack: q ? q.quoteOut : null,
      curveAfter: m.account.curve,
    };
  }

  const sibIndex = focus === active ? (m.account.activeWindow > 0n ? m.account.activeWindow - 1n : null) : m.account.activeWindow;
  let sibling: LiveWindow["sibling"] = null;
  if (sibIndex !== null && sibIndex >= m.account.nextSettleIndex) {
    const s = await cl.getWindowByIndex(mk, sibIndex).catch(() => null);
    if (s) sibling = {
      id: s.account.index.toString(),
      phase: phaseOf(s.account, false),
      slotsRemaining: Math.max(0, Number(s.account.closeSlot) - slot),
      slotsSinceSeal: s.account.sealedSlot > 0n ? Math.max(0, slot - Number(s.account.sealedSlot)) : 0,
      entries: s.account.entryCount,
      total: s.account.totalAmount,
    };
  }

  return {
    id: w.index.toString(),
    mint: m.account.tokenMint.toBase58(),
    source: "chain",
    phase: phaseOf(w, mineSold),
    openedAt,
    closeAt,
    slotsTotal,
    slotsRemaining,
    slotMs: SLOT_MS,
    slotsSinceSeal: w.sealedSlot > 0n ? Math.max(0, slot - Number(w.sealedSlot)) : 0,
    seedDelayMs: null,
    capBps: BigInt(m.account.maxEntryBps),
    hostFeeBps,
    entries: entryViews(entries, w, me, now, openedAt),
    total: w.totalAmount,
    mineIndex: mineEntry ? mineEntry.account.index : null,
    seedHex: isZero(w.seed) ? null : hex(w.seed),
    vrfAccount: w.vrfRequested ? w.vrfRequest.toBase58() : null,
    settlement,
    soldFor: mineSold && settlement ? settlement.mySellBack : null,
    sibling,
  };
}

function emptyLive(m: Market, mk: PublicKey, now: number): LiveWindow {
  const slotsTotal = Number(m.windowSlots);
  return {
    id: "0", mint: m.tokenMint.toBase58(), source: "chain", phase: "open", openedAt: now, closeAt: now + slotsTotal * SLOT_MS,
    slotsTotal, slotsRemaining: slotsTotal, slotMs: SLOT_MS, slotsSinceSeal: 0, seedDelayMs: null, capBps: BigInt(m.maxEntryBps),
    hostFeeBps: 0n, entries: [], total: 0n, mineIndex: null, seedHex: null, vrfAccount: null, settlement: null, soldFor: null, sibling: null,
  };
  void mk;
}

async function windowView(w: Keyed<Window>, m: Market): Promise<WindowView> {
  const cl = c();
  const entries = await entriesOf(cl, w.pubkey, w.account, null);
  const hostFeeBps = BigInt(await cl.getHostFeeBps(m));
  const blockTime = w.account.sealedSlot > 0n ? await cl.connection.getBlockTime(Number(w.account.sealedSlot)).catch(() => null) : null;
  // the curve before this window's buy: x_before = x_after_buy - to_curve is not recoverable once
  // later windows moved the curve, so the verifier recomputes shares from tokens_out (sdk verifyWindow)
  const fees = splitFees(w.account.totalAmount, hostFeeBps);
  void fees;
  return {
    id: w.account.index.toString(),
    mint: m.tokenMint.toBase58(),
    source: "chain",
    closedAt: new Date((blockTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    // a one-entry round is drawn without randomness: zero seed, no ORAO request ("")
    seedHex: hex(w.account.seed),
    vrfAccount: w.account.vrfRequested ? w.account.vrfRequest.toBase58() : "",
    settleTx: "",
    hostFeeBps,
    capBps: BigInt(m.maxEntryBps),
    curveBefore: m.curve,
    entries: entries.map((e) => ({ index: e.account.index, owner: e.account.owner.toBytes(), amount: e.account.amount, roll: e.account.roll, share: e.account.share })),
    total: w.account.totalAmount,
    tokensOut: w.account.tokensOut,
  };
}

/* ------------------------------ the source ------------------------------ */

export const chainSource: DataSource = {
  getLiveWindow: liveWindow,

  subscribe(cb) {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (!alive) return;
      try { cb(await liveWindow()); } catch { /* transient RPC error: next tick */ }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    const onWallet = () => { void liveWindow().then((w) => alive && cb(w)).catch(() => {}); };
    walletListeners.add(onWallet);
    void tick();
    return () => { alive = false; if (timer) clearTimeout(timer); walletListeners.delete(onWallet); };
  },

  async getWindow(id) {
    const cl = c();
    const mk = market();
    if (!/^\d+$/.test(id)) return null;
    const m = (await cl.getMarket(mk)).account;
    const w = await cl.getWindowByIndex(mk, BigInt(id)).catch(() => null);
    if (!w || w.account.state !== WindowState.Settled) return null;
    return windowView(w, m);
  },

  async listRecentWindows() {
    const cl = c();
    const mk = market();
    const m = (await cl.getMarket(mk)).account;
    const out: WindowView[] = [];
    for (let i = m.nextSettleIndex - 1n; i >= 0n && out.length < RECENT; i--) {
      const w = await cl.getWindowByIndex(mk, i).catch(() => null);
      if (!w) continue; // closed (rent recovered): history lives in the events
      if (w.account.state === WindowState.Settled && w.account.entryCount > 0) out.push(await windowView(w, m));
      if (m.nextSettleIndex - i > 60n) break;
    }
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
    const cl = c();
    try {
      await sendAndConfirm(await cl.enter({ market: market(), amount, owner: wallet.publicKey }));
    } catch (e) {
      throw new Error(describeError(e));
    }
  },

  /** Sell the viewer's whole share of the focused round back to the curve (0 fee; the entry's rent comes back). */
  async sellBack() {
    if (!wallet) throw new Error("connect a wallet first");
    const cl = c();
    const live = await liveWindow();
    if (live.mineIndex === null) throw new Error("no entry of yours in this round");
    const w = cl.windowAddress(market(), BigInt(live.id));
    const entry = cl.entryAddress(w, wallet.publicKey);
    try {
      await sendAndConfirm(await cl.sellBack({ entry, owner: wallet.publicKey }));
    } catch (e) {
      throw new Error(describeError(e));
    }
  },
};
