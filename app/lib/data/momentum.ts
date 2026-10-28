/**
 * The demo ledger (v20): one LADLE curve, replayed from round 1.
 *
 * Every demo round is `plan(n)` settled with the REAL law (`settle()`) against
 * the curve as the previous rounds and sells left it, so the price history,
 * the books and `/window/{n}` recompute all read the same numbers. About a
 * third of the demo entries sell their scoop back 1 to 20 rounds later
 * (sfc32 per round, so the history is the same on every visit), through the
 * same `curveSell` the program uses: sells step the price down exactly as
 * buys step it up.
 *
 * Depth. DEMO_CURVE (30 SOL virtual) replayed over a thousand demo rounds
 * would multiply the price by about 11,000: an invented run-up, which the
 * demo must not show. The ledger keeps DEMO_CURVE's starting price (about
 * 0.0280 SOL per 1M LADLE) with deeper virtual reserves (DEMO_LEDGER_CURVE),
 * so the replay moves the way a deep market moves.
 *
 * Everything here is demo data and is shown with the DEMO DATA chip.
 */
import { curveSellOut, multiplierOf, settle, type Curve, type SettleInput } from "../law-settle";
import { sfc32 } from "../prng";
import { LAMPORTS_PER_SOL, toHex } from "../format";
import { DEMO_HOST_FEE_BPS, FIRST_WINDOW, SEED_FALL_MS, WINDOW_MS, plan, pseudonym } from "./demo-plan";
import type { ActivityItem, Books, CurvePoint } from "./types";

/** Starting price of DEMO_CURVE (30 SOL : 1.073e9 LADLE), 133.3× deeper. */
export const DEMO_LEDGER_CURVE: Curve = { x: 4000n * LAMPORTS_PER_SOL, y: (1_073_000_000n * 1_000_000n * 400n) / 3n };

/** Spot price, SOL per 1M LADLE: x (lamports) * 1e3 / y (base units). */
export function spotPrice(c: Curve): number {
  return (Number(c.x) * 1e3) / Number(c.y);
}
/** What a buy paid per 1M LADLE: toCurve / tokensOut in the same unit. */
export function roundPriceOf(toCurve: bigint, tokensOut: bigint): number {
  return tokensOut > 0n ? (Number(toCurve) * 1e3) / Number(tokensOut) : 0;
}

export interface LedgerRound {
  n: number;
  at: number;
  closedAt: number;
  total: bigint;
  toCurve: bigint;
  platform: bigint;
  host: bigint;
  tokensOut: bigint;
  before: Curve;
  after: Curve;
  players: number;
  min: number;
  max: number;
  seedHex: string;
  /** stake fraction and multiplier per entry, for the past distribution */
  fracs: number[];
  mults: number[];
  /** live rounds only: the entries as they landed (the viewer's included) */
  inputs?: SettleInput[];
  labels?: string[];
}

interface QueuedSell { at: number; name: string; tokens: bigint; mine: boolean }

const SELL_P = 1 / 3;
const SELL_GAP_MS = 700;
const MAX_ACTIVITY = 30;

export class Ledger {
  readonly points: CurvePoint[] = [];
  readonly rounds = new Map<number, LedgerRound>();
  curve: Curve = DEMO_LEDGER_CURVE;
  lastRound = 0;
  private pending = new Map<number, Array<{ name: string; tokens: bigint }>>();
  private queue: QueuedSell[] = [];
  private owners = new Set<string>();
  private sums = { rounds: 0, entered: 0n, toCurve: 0n, platform: 0n, host: 0n, soldBack: 0n, bought: 0n, sold: 0n };
  /** newest first */
  activity: ActivityItem[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();
  private activityListeners = new Set<() => void>();

  /** Replays rounds 1 … upTo with their planned entries. `closedAt(n)` gives each round's close time (ms). */
  replay(upTo: number, closedAt: (n: number) => number): void {
    let prevAt = 0;
    for (let n = 1; n <= upTo; n++) {
      const pl = plan(n);
      const close = closedAt(n);
      const at = Math.max(close + pl.delayMs + SEED_FALL_MS, prevAt + 300);
      prevAt = at;
      const inputs = pl.entries.map((e, i) => ({ owner: e.owner, index: i, amount: e.amount }));
      this.buy(n, close, at, pl.seed, inputs, pl.entries.map((e) => e.label), [], true);
    }
    // the history fills the activity list with its last served rounds and sells
    const recent: ActivityItem[] = [];
    for (let i = this.points.length - 1; i >= 0 && recent.length < 12; i--) {
      const p = this.points[i]!;
      if (p.kind === "buy" && p.round !== null) {
        const r = this.rounds.get(p.round)!;
        recent.push({ id: `h${i}`, at: r.at, kind: "served", round: String(r.n), players: r.players, min: r.min, max: r.max });
      } else if (p.kind === "sell") {
        recent.push({ id: `h${i}`, at: p.at, kind: "sellback", name: p.name, tokens: p.tokens, sol: p.sol });
      }
    }
    this.activity = recent;
  }

  /**
   * One round's single buy. Applies every queued sell first (they happened
   * before this round was served), then the buy, then queues the sells this
   * round's serving triggers. Returns the law's settlement.
   */
  buy(n: number, closedAt: number, at: number, seed: Uint8Array, inputs: SettleInput[], labels: string[], mine: boolean[], history = false) {
    this.flush(Infinity);
    const before = this.curve;
    const s = settle(seed, inputs, before, DEMO_HOST_FEE_BPS);
    this.curve = s.curveAfter;
    let min = Infinity, max = -Infinity;
    const mults: number[] = [], fracs: number[] = [];
    inputs.forEach((e, i) => {
      const m = s.tokensOut > 0n ? multiplierOf(s.shares[i]!, e.amount, s.total, s.tokensOut) : 1;
      mults.push(m);
      fracs.push(s.total > 0n ? Number(e.amount) / Number(s.total) : 0);
      if (m < min) min = m;
      if (m > max) max = m;
      this.owners.add(toHex(e.owner.subarray(0, 12)));
    });
    const r: LedgerRound = {
      n, at, closedAt, total: s.total, toCurve: s.toCurve, platform: s.platform, host: s.host, tokensOut: s.tokensOut,
      before, after: s.curveAfter, players: inputs.length, min: Number.isFinite(min) ? min : 1, max: Number.isFinite(max) ? max : 1,
      seedHex: toHex(seed), fracs, mults,
    };
    if (!history) { r.inputs = inputs; r.labels = labels; }
    this.rounds.set(n, r);
    this.lastRound = Math.max(this.lastRound, n);
    this.sums.rounds++;
    this.sums.entered += s.total;
    this.sums.toCurve += s.toCurve;
    this.sums.platform += s.platform;
    this.sums.host += s.host;
    this.sums.bought += s.tokensOut;
    this.points.push({ kind: "buy", round: n, at, before: spotPrice(before), after: spotPrice(s.curveAfter), roundPrice: roundPriceOf(s.toCurve, s.tokensOut), tokens: s.tokensOut, sol: s.toCurve, players: inputs.length });

    // the sells this round triggers: about a third of the demo entries, 1 to 20 rounds later
    const p = sfc32(0x5e110000 ^ Math.imul(n, 104729));
    inputs.forEach((e, i) => {
      const go = p.next() < SELL_P;
      const later = 1 + p.int(20);
      if (!go || mine[i] || s.shares[i]! <= 0n) return;
      const m = n + later;
      const list = this.pending.get(m) ?? [];
      list.push({ name: labels[i] ?? pseudonym(e.owner), tokens: s.shares[i]! });
      this.pending.set(m, list);
    });
    const due = this.pending.get(n);
    if (due) {
      this.pending.delete(n);
      due.forEach((d, j) => this.queue.push({ at: at + (j + 1) * SELL_GAP_MS, name: d.name, tokens: d.tokens, mine: false }));
    }
    if (!history) this.emit();
    return s;
  }

  /** Applies queued sells whose time has come. Returns whether the curve moved. */
  flush(now: number): boolean {
    if (!this.queue.length) return false;
    let moved = false;
    this.queue.sort((a, b) => a.at - b.at);
    while (this.queue.length && this.queue[0]!.at <= now) {
      const q = this.queue.shift()!;
      this.applySell(q.name, q.tokens, q.at, q.mine);
      moved = true;
    }
    return moved;
  }

  /** A sell at the curve price now (0 fee). Returns the SOL it paid. */
  sell(name: string, tokens: bigint, at: number, mine: boolean): bigint {
    this.flush(at);
    const out = this.applySell(name, tokens, at, mine);
    this.emit();
    return out;
  }

  private applySell(name: string, tokens: bigint, at: number, mine: boolean): bigint {
    const before = this.curve;
    const r = curveSellOut(before, tokens);
    this.curve = r.next;
    this.sums.soldBack += r.out;
    this.sums.sold += tokens;
    this.points.push({ kind: "sell", round: null, at, before: spotPrice(before), after: spotPrice(r.next), roundPrice: null, tokens, sol: r.out, players: null, name });
    this.pushActivity({ at, kind: "sellback", name, tokens, sol: r.out, mine });
    return r.out;
  }

  pushActivity(a: Omit<ActivityItem, "id"> & { mine?: boolean }): void {
    this.activity = [{ ...a, id: `a${this.nextId++}` }, ...this.activity].slice(0, MAX_ACTIVITY);
    this.activityListeners.forEach((l) => l());
  }

  books(now: number): Books {
    const hourMs = 3_600_000;
    const h0 = Math.floor(now / hourMs) * hourMs - 23 * hourMs;
    const hours = Array.from({ length: 24 }, (_, i) => ({ hourStart: h0 + i * hourMs, rounds: 0, sol: 0n }));
    for (const r of this.rounds.values()) {
      const k = Math.floor((r.at - h0) / hourMs);
      if (k >= 0 && k < 24) { hours[k]!.rounds++; hours[k]!.sol += r.total; }
    }
    const s = this.sums;
    return {
      rounds: s.rounds,
      players: this.owners.size,
      solEntered: s.entered,
      solToCurve: s.toCurve,
      platformFees: s.platform,
      hostFees: s.host,
      keeperBounties: s.entered - s.toCurve - s.platform - s.host,
      solSoldBack: s.soldBack,
      solInCurve: this.curve.x - DEMO_LEDGER_CURVE.x,
      ladleHeld: s.bought - s.sold,
      last24h: hours,
    };
  }

  onChange(l: () => void): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  onActivity(l: () => void): () => void { this.activityListeners.add(l); return () => { this.activityListeners.delete(l); }; }
  emit(): void { this.listeners.forEach((l) => l()); }
}

/** Demo Genesis: about one profile every 9 rounds since round 1, from 300; never reaches the cap by itself. */
export function demoGenesisClaimed(round: number): number {
  return Math.min(990, 300 + Math.floor(Math.max(0, round - 1) / 9));
}

export { FIRST_WINDOW, WINDOW_MS };
