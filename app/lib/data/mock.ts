/**
 * Demo data source. Deterministic (seeded PRNG), runs entirely in the browser,
 * and settles every window with the REAL sdk law, so every number it shows is
 * mathematically exact for the entries it invents. Everything it returns is
 * tagged source: "demo" and must be labelled "demo data" in the UI.
 *
 * Timing model (G6 + G2):
 *   - windows open on a fixed slot grid, every WINDOW_SLOTS slots, whatever
 *     happened to the previous one (pipelined, as G2 §9 recommends);
 *   - 1 slot = the measured mainnet slot time (G6);
 *   - after a window is sealed, its seed arrives after a delay sampled from the
 *     measured ORAO latency percentiles (G2), capped for the demo;
 *   - rounds are served in order (the program's nextSettleIndex): a round whose
 *     seed came early waits for the previous one.
 *
 * v20: every round buys on ONE evolving curve, the demo ledger (momentum.ts),
 * replayed from round 1, with the demo players' sell-backs. The viewer is
 * never entered automatically: they take a seat and scoop in themselves.
 */
import type { ActivityItem, DataSource, DistributionBucket, EntryView, HistorySource, LiveWindow, PastDistribution, SiblingView, WindowView } from "./types";
import { sfc32 } from "../prng";
import { curveSellOut, multiplierOf, settle, type Curve } from "../law-settle";
import { toHex, LAMPORTS_PER_SOL } from "../format";
import {
  DEMO_CAP_BPS, DEMO_CAP_FLOOR, DEMO_HOST_FEE_BPS, DEMO_MINT, DEMO_SLOTS, DEMO_SLOT_MS, FIRST_WINDOW, SEED_FALL_MS, WINDOW_MS,
  applyCap, plan, type Plan,
} from "./demo-plan";
import { Ledger, demoGenesisClaimed } from "./momentum";
import { countLocalProfiles } from "../profile";

export {
  DEMO_SLOT_MS, DEMO_SLOTS, DEMO_CAP_BPS, DEMO_HOST_FEE_BPS, DEMO_CAP_FLOOR, DEMO_MINT, FIRST_WINDOW,
  applyCap, pseudonym, sampleOracleDelayMs, DEMO_DEFAULT_ENTRY, DEMO_DELAY_CAP_MS,
} from "./demo-plan";
/** Virtual reserves of the v18 demo bonding curve: 30 SOL against 1.073e9 tokens (6 decimals). The v20 ledger starts at its price. */
export const DEMO_CURVE: Curve = { x: 30n * LAMPORTS_PER_SOL, y: 1_073_000_000n * 1_000_000n };

const SETTLED_HOLD_MS = 7000;
const SOLD_HOLD_MS = 3000;
/** v21.4: the history replay runs in slices of about this long, one per task, off the hydration task */
const REPLAY_SLICE_MS = 6;

/**
 * perf v21.4 (T7): past this much of the replay's work since the last frame, the next slice waits for one (frames stay
 * well under 100 ms; at 12 ms, 4x CPU's slow frames made the replay, and the loader's facts with it, about 1 s later)
 */
const REPLAY_FRAME_MS = 40;
/**
 * the most the replay waits for frames in all: past it, frames are slow to come (4x CPU, a loaded machine) and each wait
 * let the arrival's other queued tasks go first, the first live window landing seconds later; at 1x it waits 2 or 3 times
 */
const REPLAY_WAIT_BUDGET_MS = 120;

/**
 * The next macrotask: scheduler.postTask where there is one, else a MessageChannel message (no 4 ms timer clamp).
 * "user-blocking": the slices go before the arrival's other tasks (at 4x CPU, behind them at the default priority,
 * the first live window came 14 to 24 s late). They go before the page's rendering too: posted back to back, they held
 * every frame until Chrome's 100 ms anti-starvation stepped in (one 93 to 108 ms frame on every visit), so whenLedger
 * waits for a frame (afterFrame) every REPLAY_FRAME_MS.
 */
function nextTask(fn: () => void): void {
  const s = (globalThis as { scheduler?: { postTask?: (f: () => void, o?: { priority?: string }) => Promise<unknown> } }).scheduler;
  if (s?.postTask) { void s.postTask(fn, { priority: "user-blocking" }); return; }
  if (typeof MessageChannel !== "undefined") {
    const c = new MessageChannel();
    c.port1.onmessage = () => { c.port1.close(); fn(); };
    c.port2.postMessage(0);
    return;
  }
  setTimeout(fn, 0);
}

/**
 * `fn` once the page has drawn its next frame, or now (false) where no frame is coming: no document (Node, the perf
 * scripts), a hidden page. (A frame that never comes, a throttled frame, gives way to a 50 ms timer.)
 */
function afterFrame(fn: () => void): boolean {
  if (typeof requestAnimationFrame !== "function" || typeof document === "undefined" || document.visibilityState !== "visible") return false;
  let done = false;
  const go = () => { if (done) return; done = true; clearTimeout(t); fn(); };
  const t = setTimeout(go, 50);
  requestAnimationFrame(go);
  return true;
}

function windowId(n: number): string { return `demo-${n}`; }
function parseId(id: string): number | null {
  const m = /^demo-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/* ------------------------------------------------------------------ */

type Listener = (w: LiveWindow) => void;

/**
 * Everything is driven by the 100 ms tick against the wall clock, never by
 * per-event timers: background tabs throttle timers by up to a minute, which
 * would let a window seal before its entries landed.
 */
interface DemoWindow {
  n: number;
  k: number; // grid index
  w: LiveWindow;
  plan: Plan;
  nextEntry: number; // index of the next planned entry to land
  sealedSlot: number | null;
  sealedAt: number | null;
  seedAt: number | null;
  settledAt: number | null;
  soldAt: number | null;
}

class MockSource implements DataSource {
  private t0 = 0;
  private windows = new Map<number, DemoWindow>();
  private focusK = -1;
  private listeners = new Set<Listener>();
  private interval: ReturnType<typeof setInterval> | null = null;
  /** the first tick has run (the replay is done and the open window exists) */
  private running: Promise<void> | null = null;
  private distribution: PastDistribution | null = null;
  private ledgerInst: Ledger | null = null;
  /** v21.4: the next history round to replay; FIRST_WINDOW once the replay is done */
  private replayNext = 1;
  /** the replay's end (replayEnd) has run: the ledger is the replayed one */
  private ended = false;
  private replayed: Promise<Ledger> | null = null;
  private replayDone: ((l: Ledger) => void) | null = null;
  private lastServed = FIRST_WINDOW - 1;
  readonly myOwner: Uint8Array = sfc32(0xf00d).bytes(32);

  /**
   * The demo ledger, replayed (rounds 1 … FIRST_WINDOW-1). v21.4: the replay runs in slices (whenLedger); a caller
   * that needs it now finishes the rest at once, the correctness fallback (the page's own readers wait for it).
   */
  ledger(): Ledger {
    const l = this.book();
    if (!this.ended) { this.replaySlice(Infinity); this.endReplay(false); }
    return l;
  }

  /**
   * The replayed ledger, without blocking: the replay runs in slices of about REPLAY_SLICE_MS, one per task, a frame
   * let through every REPLAY_FRAME_MS (perf v21.4, T7); its end (replayEnd) in a task of its own, and the readers
   * waiting on it in another (together they were one 28 to 31 ms slice).
   */
  whenLedger(): Promise<Ledger> {
    const l = this.book();
    if (this.ended) return Promise.resolve(l);
    if (!this.replayed) {
      this.replayed = new Promise<Ledger>((res, rej) => {
        this.replayDone = res;
        let since = typeof performance !== "undefined" ? performance.now() : 0, waited = 0;
        const next = (f: () => void) => {
          if (typeof performance === "undefined" || performance.now() - since < REPLAY_FRAME_MS || waited >= REPLAY_WAIT_BUDGET_MS) { nextTask(f); return; }
          const t0 = performance.now();
          if (!afterFrame(() => { since = performance.now(); waited += since - t0; nextTask(f); })) nextTask(f);
        };
        const step = () => {
          try {
            if (!this.replaySlice(REPLAY_SLICE_MS)) { next(step); return; }
            next(() => { try { this.endReplay(true, next); } catch (e) { rej(e); } });
          } catch (e) { rej(e); }
        };
        nextTask(step);
      });
    }
    return this.replayed;
  }

  /** Runs `fn` with the replayed ledger (now, or when the replay ends); returns what undoes it. */
  onLedger(fn: (l: Ledger) => () => void): () => void {
    if (this.ledgerInst && this.ended) return fn(this.ledgerInst);
    let off: (() => void) | null = null, alive = true;
    this.whenLedger().then((l) => { if (alive) off = fn(l); }).catch(() => {});
    return () => { alive = false; off?.(); };
  }

  /** The ledger as far as it is replayed. */
  private book(): Ledger {
    this.ensureEpoch();
    return (this.ledgerInst ??= new Ledger());
  }

  /** Replays history rounds until `budgetMs` is spent (at least one round). Returns whether the replay is done. */
  private replaySlice(budgetMs: number): boolean {
    const l = this.book();
    const last = FIRST_WINDOW - 1;
    if (this.replayNext > last) return true;
    const clock = typeof performance !== "undefined" ? performance : Date;
    const t = clock.now();
    const closedAt = (n: number) => this.closedAtMs(n);
    while (this.replayNext <= last) {
      l.replayStep(this.replayNext, this.replayNext, closedAt);
      this.replayNext++;
      if (clock.now() - t >= budgetMs) break;
    }
    const done = this.replayNext > last;
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      // dev: the replay's total and its longest slice (perf/verify.mjs reads __ledgerMs); a forced finish is counted
      const w = window as unknown as { __ledgerMs?: number; __ledgerSlices?: { n: number; maxMs: number; forced: number } };
      const ms = clock.now() - t;
      const s = (w.__ledgerSlices ??= { n: 0, maxMs: 0, forced: 0 });
      s.n++; s.maxMs = Math.max(s.maxMs, Math.round(ms * 10) / 10);
      if (budgetMs === Infinity) s.forced++;
      w.__ledgerMs = Math.round((w.__ledgerMs ?? 0) + ms);
    }
    return done;
  }

  /**
   * The end of the replay (every round replayed): the history's activity list, then the readers waiting on whenLedger
   * (`later`: in a task of their own, through `post`). Once only.
   */
  private endReplay(later: boolean, post: (f: () => void) => void = nextTask): void {
    if (this.ended) return;
    const l = this.book();
    l.replayEnd();
    this.ended = true;
    const done = this.replayDone;
    this.replayDone = null;
    if (!done) return;
    if (later) post(() => done(l)); else done(l);
  }

  /* ---- DataSource ---- */

  async getLiveWindow(): Promise<LiveWindow> {
    await this.ensureRunning();
    return this.snapshot();
  }

  subscribe(cb: Listener): () => void {
    void this.ensureRunning();
    this.listeners.add(cb);
    // v21.4: no window before the replay is done; the first tick's snapshot reaches every listener
    if (this.windows.size) cb(this.snapshot());
    return () => { this.listeners.delete(cb); };
  }

  async getWindow(id: string): Promise<WindowView | null> {
    const l = await this.whenLedger();
    const n = id === "latest" ? l.lastRound : parseId(id);
    if (n === null || !l.rounds.has(n)) return null;
    return this.settledView(n);
  }

  async listRecentWindows(): Promise<WindowView[]> {
    const l = await this.whenLedger();
    const out: WindowView[] = [];
    for (let n = l.lastRound; n >= Math.max(1, l.lastRound - 11); n--) if (l.rounds.has(n)) out.push(this.settledView(n));
    return out;
  }

  async getPastDistribution(): Promise<PastDistribution> {
    if (this.distribution) return this.distribution;
    const l = await this.whenLedger();
    const rows: Array<{ frac: number; mult: number }> = [];
    for (let n = Math.max(1, FIRST_WINDOW - 150); n < FIRST_WINDOW; n++) {
      const r = l.rounds.get(n);
      if (!r) continue;
      r.fracs.forEach((f, i) => rows.push({ frac: f, mult: r.mults[i]! }));
    }
    rows.sort((a, b) => a.frac - b.frac);
    const buckets: DistributionBucket[] = [];
    const per = rows.length / 10;
    for (let d = 0; d < 10; d++) {
      const slice = rows.slice(Math.floor(d * per), Math.floor((d + 1) * per));
      const ms = slice.map((r) => r.mult).sort((a, b) => a - b);
      const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 1;
      buckets.push({
        decile: d + 1,
        lo: slice[0]?.frac ?? 0,
        hi: slice[slice.length - 1]?.frac ?? 0,
        n: slice.length,
        meanMultiplier: ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length),
        p10: q(0.1),
        p50: q(0.5),
        p90: q(0.9),
      });
    }
    const all = rows.map((r) => r.mult);
    this.distribution = { buckets, measuredAt: new Date().toISOString(), sampleSize: rows.length, source: "demo", min: Math.min(...all), max: Math.max(...all) };
    return this.distribution;
  }

  async enter(amount: bigint): Promise<void> {
    const d = this.openWindow0();
    if (!d || d.w.phase !== "open" || d.w.mineIndex !== null) throw new Error("sealed");
    this.focusK = d.k;
    this.pushEntry(d, { owner: this.myOwner, label: "you", amount, mine: true });
  }

  async sellBack(): Promise<void> {
    const d = this.focus();
    if (!d || d.w.phase !== "settled" || !d.w.settlement || d.w.settlement.myShare === null) return;
    const out = this.ledger().sell("you", d.w.settlement.myShare, this.now(), true);
    d.w.phase = "sold";
    d.w.soldFor = out;
    d.soldAt = this.now();
    this.emit();
  }

  /** The largest entry the cap allows right now in the open round (lamports). */
  maxEntryNow(): bigint {
    const d = this.openWindow0();
    const total = d?.w.total ?? 0n;
    return applyCap(10_000n * LAMPORTS_PER_SOL, total, DEMO_CAP_BPS, DEMO_CAP_FLOOR);
  }

  /* ---- a settled round, as /window/{n} recomputes it ---- */

  private settledView(n: number): WindowView {
    const l = this.ledger();
    const r = l.rounds.get(n)!;
    const pl = plan(n);
    const inputs = r.inputs ?? pl.entries.map((e, i) => ({ owner: e.owner, index: i, amount: e.amount }));
    const s = settle(pl.seed, inputs, r.before, DEMO_HOST_FEE_BPS);
    return {
      id: windowId(n),
      mint: DEMO_MINT,
      source: "demo",
      closedAt: new Date(r.closedAt).toISOString(),
      seedHex: toHex(pl.seed),
      vrfAccount: pl.vrfAccount,
      settleTx: pl.settleTx,
      hostFeeBps: DEMO_HOST_FEE_BPS,
      capBps: DEMO_CAP_BPS,
      curveBefore: r.before,
      entries: inputs.map((e, i) => ({ ...e, roll: s.rolls[i]!, share: s.shares[i]! })),
      total: s.total,
      tokensOut: s.tokensOut,
    };
  }

  /* ---- clock ---- */

  private now(): number { return Date.now(); }
  private slot(): number { return Math.floor((this.now() - this.t0) / DEMO_SLOT_MS); }
  private currentK(): number { return Math.max(0, Math.floor(this.slot() / DEMO_SLOTS)); }
  /** When round n closed (or closes), on the fixed slot grid. */
  closedAtMs(n: number): number {
    this.ensureEpoch();
    const k = n - FIRST_WINDOW;
    return this.t0 + (k + 1) * WINDOW_MS;
  }
  /** The round number open right now. */
  openRound(): number { this.ensureEpoch(); return FIRST_WINDOW + this.currentK(); }

  /** The demo epoch: set once, at the first use, so that window FIRST_WINDOW opens then and every earlier index closed on the fixed slot grid before it. */
  private ensureEpoch(): void {
    if (this.t0 === 0) this.t0 = this.now() - Math.floor(WINDOW_MS * 0.4);
  }

  /** v21.4: the first tick and the 100 ms tick start once the sliced replay is done (in a task of their own: T7). */
  private ensureRunning(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (!this.running) {
      this.ensureEpoch();
      this.running = this.whenLedger().then(() => new Promise<void>((r) => nextTask(r))).then(() => {
        this.tick();
        this.interval = setInterval(() => this.tick(), 100);
      });
    }
    return this.running;
  }

  private focus(): DemoWindow | undefined { return this.windows.get(this.focusK); }
  private openWindow0(): DemoWindow | undefined { return this.windows.get(this.currentK()); }

  /* ---- the 100 ms tick: grid, seals, elapsed slots, focus ---- */

  private tick(): void {
    const k = this.currentK();
    const slot = this.slot();
    let changed = false;

    if (!this.windows.has(k)) { this.openWindow(k); changed = true; }

    const now = this.now();
    const l = this.ledger();
    if (l.flush(now)) { l.emit(); changed = true; }

    for (const d of this.windows.values()) {
      const w = d.w;
      if (w.phase === "open") {
        // planned entries whose time has come
        while (d.nextEntry < d.plan.entries.length && w.openedAt + d.plan.entries[d.nextEntry]!.frac * WINDOW_MS <= now) {
          const e = d.plan.entries[d.nextEntry++]!;
          this.pushEntry(d, { owner: e.owner, label: e.label, amount: e.amount, mine: false });
        }
        const remaining = Math.max(0, (d.k + 1) * DEMO_SLOTS - slot);
        if (remaining !== w.slotsRemaining) { w.slotsRemaining = remaining; changed = true; }
        if (remaining === 0) { this.seal(d, slot, now); changed = true; }
      } else if (w.phase === "sealed" && d.sealedSlot !== null && d.sealedAt !== null) {
        const since = slot - d.sealedSlot;
        if (since !== w.slotsSinceSeal) { w.slotsSinceSeal = since; changed = true; }
        // beat 2 happens when the oracle answers: demo delay sampled from the measured latency
        if (now >= d.sealedAt + d.plan.delayMs) { this.seedArrives(d, now); changed = true; }
      } else if (w.phase === "seeded" && d.seedAt !== null) {
        // served in order: wait for the previous round
        if (now >= d.seedAt + SEED_FALL_MS && this.lastServed >= d.n - 1) { this.settleNow(d, now); changed = true; }
      }
      // the sell-back quote follows the curve as other players buy and sell
      const s = w.settlement;
      if (s && s.myShare !== null && w.phase === "settled") {
        const q = curveSellOut(l.curve, s.myShare).out;
        if (q !== s.mySellBack) { s.mySellBack = q; changed = true; }
      }
    }

    // focus: every round in focus plays out to its reveal (spectators watch it served), then the
    // open round takes the focus; the viewer's own round stays until they close their result
    const f = this.focus();
    const t = this.now();
    const done = !f
      || f.w.phase === "open" && f.k !== k && f.w.mineIndex === null
      || f.w.phase === "sold" && f.soldAt !== null && t - f.soldAt > SOLD_HOLD_MS && f.w.mineIndex === null
      || f.w.phase === "settled" && f.settledAt !== null && t - f.settledAt > SETTLED_HOLD_MS && f.w.mineIndex === null
      || f.w.phase === "settled" && f.w.entries.length === 0;
    if (done) {
      // v21 fix: a long seed delay can leave a round sealed behind the open one; it is watched to its serve before the
      // open round takes the focus, so no round is skipped (1100, 1101, 1102 ... never 1100 then 1102)
      let next = k;
      for (const [kk, d] of this.windows) {
        if (kk > (f ? f.k : -1) && kk < next && d.w.entries.length > 0 && (d.w.phase === "sealed" || d.w.phase === "seeded")) next = kk;
      }
      if (this.focusK !== next) { this.focusK = next; changed = true; }
    }

    // forget windows nobody looks at any more
    for (const [kk, d] of this.windows) {
      if (kk !== this.focusK && kk !== k && (d.w.phase === "settled" || d.w.phase === "sold")) this.windows.delete(kk);
    }

    if (changed) this.emit();
  }

  /** The viewer is done with their result (they closed the panel or kept): follow the open round again. */
  release(): void {
    const f = this.focus();
    if (f && (f.w.phase === "settled" || f.w.phase === "sold")) { this.focusK = this.currentK(); this.emit(); }
  }

  private openWindow(k: number): void {
    const n = FIRST_WINDOW + k;
    const pl = plan(n);
    const openedAt = this.t0 + k * WINDOW_MS;
    const w: LiveWindow = {
      id: windowId(n),
      mint: DEMO_MINT,
      source: "demo",
      phase: "open",
      openedAt,
      closeAt: openedAt + WINDOW_MS,
      slotsTotal: DEMO_SLOTS,
      slotsRemaining: DEMO_SLOTS,
      slotMs: DEMO_SLOT_MS,
      slotsSinceSeal: 0,
      seedDelayMs: pl.delayMs,
      capBps: DEMO_CAP_BPS,
      hostFeeBps: DEMO_HOST_FEE_BPS,
      entries: [],
      total: 0n,
      mineIndex: null,
      seedHex: null,
      vrfAccount: pl.vrfAccount,
      settlement: null,
      soldFor: null,
      sibling: null,
    };
    const d: DemoWindow = { n, k, w, plan: pl, nextEntry: 0, sealedSlot: null, sealedAt: null, seedAt: null, settledAt: null, soldAt: null };
    // a page opened mid-round shows the entries that already landed, without replaying them as arrivals
    const now = this.now();
    while (d.nextEntry < pl.entries.length && openedAt + pl.entries[d.nextEntry]!.frac * WINDOW_MS <= now) {
      const e = pl.entries[d.nextEntry++]!;
      this.pushEntry(d, { owner: e.owner, label: e.label, amount: e.amount, mine: false }, openedAt + e.frac * WINDOW_MS, false);
    }
    this.windows.set(k, d);
    if (this.focusK < 0) this.focusK = k;
  }

  private pushEntry(d: DemoWindow, e: { owner: Uint8Array; label: string; amount: bigint; mine: boolean }, at = this.now(), emit = true): void {
    const w = d.w;
    const amount = applyCap(e.amount, w.total, w.capBps, DEMO_CAP_FLOOR);
    const entry: EntryView = {
      index: w.entries.length,
      owner: e.owner,
      label: e.label,
      amount,
      mine: e.mine,
      arrivedAt: at - w.openedAt,
    };
    w.entries.push(entry);
    w.total += amount;
    if (e.mine) w.mineIndex = entry.index;
    this.ledger().pushActivity({ at, kind: "join", round: String(d.n), name: e.label, sol: amount, mine: e.mine });
    if (emit) this.emit();
  }

  private seal(d: DemoWindow, slot: number, now: number): void {
    const w = d.w;
    w.phase = "sealed";
    w.slotsRemaining = 0;
    w.slotsSinceSeal = 0;
    d.sealedSlot = slot;
    d.sealedAt = now;
    this.ledger().pushActivity({ at: now, kind: "close", round: String(d.n), players: w.entries.length, sol: w.total });
  }

  private seedArrives(d: DemoWindow, now: number): void {
    const w = d.w;
    w.phase = "seeded";
    w.seedHex = toHex(d.plan.seed);
    d.seedAt = now;
    this.ledger().pushActivity({ at: now, kind: "seed", round: String(d.n), seed8: w.seedHex.slice(0, 8) });
  }

  private settleNow(d: DemoWindow, now: number): void {
    const w = d.w;
    this.lastServed = Math.max(this.lastServed, d.n);
    if (w.entries.length) {
      const l = this.ledger();
      const inputs = w.entries.map((e) => ({ owner: e.owner, index: e.index, amount: e.amount }));
      const s = l.buy(d.n, w.closeAt, now, d.plan.seed, inputs, w.entries.map((e) => e.label), w.entries.map((e) => e.mine));
      w.entries.forEach((e, i) => { e.roll = s.rolls[i]; e.share = s.shares[i]; });
      const mine = w.mineIndex !== null ? w.entries[w.mineIndex] : undefined;
      const myShare = mine?.share ?? null;
      w.settlement = {
        tokensOut: s.tokensOut,
        platformFee: s.platform,
        hostFee: s.host,
        toCurve: s.toCurve,
        myShare,
        myMultiplier: mine && myShare !== null ? multiplierOf(myShare, mine.amount, s.total, s.tokensOut) : null,
        mySellBack: myShare !== null ? curveSellOut(l.curve, myShare).out : null,
        curveAfter: s.curveAfter,
      };
      const r = l.rounds.get(d.n)!;
      l.pushActivity({ at: now, kind: "served", round: String(d.n), players: r.players, min: r.min, max: r.max });
    }
    w.phase = "settled";
    d.settledAt = now;
  }

  /* ---- snapshots ---- */

  private siblingOf(d: DemoWindow): SiblingView | null {
    let best: DemoWindow | null = null;
    for (const o of this.windows.values()) {
      if (o === d) continue;
      if (d.w.phase === "open") {
        // the most recent window still waiting for its draw
        if ((o.w.phase === "sealed" || o.w.phase === "seeded") && (!best || o.k > best.k)) best = o;
      } else if (o.w.phase === "open") {
        best = o;
      }
    }
    if (!best) return null;
    return {
      id: best.w.id,
      phase: best.w.phase,
      slotsRemaining: best.w.slotsRemaining,
      slotsSinceSeal: best.w.slotsSinceSeal,
      entries: best.w.entries.length,
      total: best.w.total,
    };
  }

  private snapshot(): LiveWindow {
    const d = this.focus() ?? this.windows.get(this.currentK())!;
    return { ...d.w, entries: d.w.entries.map((e) => ({ ...e })), settlement: d.w.settlement ? { ...d.w.settlement } : null, sibling: this.siblingOf(d) };
  }

  private emit(): void {
    if (!this.windows.size) return;
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }
}

const mock = new MockSource();
export const mockSource: DataSource & { maxEntryNow(): bigint; release(): void; openRound(): number } = mock;

/** The demo history: the ledger's curve, the live activity, the books and the demo Genesis count. v21.4: each waits for the sliced replay. */
export const mockHistory: HistorySource = {
  source: "demo",
  async getCurve() { return (await mock.whenLedger()).points.slice(); },
  subscribeActivity(cb: (items: ActivityItem[]) => void) {
    return mock.onLedger((l) => {
      const off = l.onActivity(() => cb(l.activity));
      cb(l.activity);
      return off;
    });
  },
  subscribeCurve(cb: () => void) { return mock.onLedger((l) => l.onChange(cb)); },
  async getBooks() { return (await mock.whenLedger()).books(Date.now()); },
  async getGenesis() { return { claimed: demoGenesisClaimed(mock.openRound()) + countLocalProfiles(), cap: 1000 }; },
};
