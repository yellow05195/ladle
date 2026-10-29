/**
 * The keeper loop. Permissionless and bountied: anyone may run it; 10 % of
 * the 1 % platform fee of each window goes to whoever paid its ORAO request
 * (`window.vrf_payer`: the keeper that sealed it), or to the finalizer of a
 * one-entry window, which asks ORAO nothing.
 *
 * Idempotent by construction: every action is a state transition the program
 * only accepts once (open/seal/request/fulfill/refund_window), or a page
 * governed by the cursor rule (replays are no-op successes). A crash at any
 * point is recovered by re-reading the chain on the next tick.
 *
 * Pipelining: the next window opens in the same transaction that seals the
 * previous one (the program only requires the active window to be past
 * Open), while sealed/drawn windows are finalized strictly in
 * `market.next_settle_index` order (the program's cursor rule).
 *
 * Fewest transactions per round (each costs a signature fee):
 *  - 0 entries: seal + open_window(next) + close_window (rent back) in one tx;
 *  - 1 entry:   seal (straight to Drawn, no ORAO request: a lone entry takes
 *               the whole buy) + tally_page + settle_page + open_window(next);
 *  - 2+ entries: seal + request_vrf(fresh salt) + open_window(next), then once
 *               ORAO has answered fulfill + tally_page + settle_page in one tx
 *               up to ONE_TX_SETTLE_MAX entries, pages beyond that.
 * A bundle that fails once is not retried as a bundle: the next attempt is
 * seal alone, and open_window, request_vrf and the pages then go on their
 * own (one failing step, e.g. an ORAO refusal, never holds the seal back).
 * A Sealed window past its VRF timeout gets refund_window, requested or not;
 * every request_vrf attempt uses a new salt (a salt seen in flight may have
 * been used up at ORAO meanwhile).
 *
 * Refunds: the keeper refunds an entry only when its owner already has a
 * quote token account; it never pays that account's rent for someone else
 * (anyone could make it pay ~0.002 SOL per entry). The other owners take
 * their stake back from the app (`PulledClient.refund`, paid by them).
 * `drainRefundAll` refunds them too, creating their account (~0.0015 SOL
 * each, paid by the keeper; the account and its rent are then the player's).
 * The shutdown does not need it: `force_exit` pays such stakes as SOL.
 *
 * Drain (`drain`): no new window; the open one is sealed at its close, every
 * window is finalized, refunded and closed, then `run()` returns.
 *
 * Shutdown (`shutdown`, with the wind-down build deployed): the drain, plus
 * `start_wind_down` for each market, then, once its notice is over (cluster
 * clock, `noticeSecs`), `force_exit` for every entry left (the unsold share
 * sold to the curve or the unrefunded stake, paid to the owner as SOL; the
 * entry's rent too), `close_entry` for finished ones, every round closed,
 * and `close_market`; `run()` returns when every market is closed (or
 * cannot close and holds nothing of anyone's: made before v25, or LADLE
 * still in wallets, which is reported) and no Entry of the program is left.
 * It works program-wide (final review, 2026-10-29): every market of the
 * program is served, the given ones or not (anyone's market blocks the
 * program close as much as ours), and every Entry whose market is gone is
 * closed (`close_market` is permissionless and does not count entries:
 * someone may close a market while entries with only their owner's rent
 * are still open; `close_entry` returns that rent without the market).
 * Finished entries are also closed during the notice, every
 * `fullScanEvery` ticks. Every step is idempotent: a paid-out entry or a
 * closed market is simply gone at the next read.
 * `vrfPerDay`: past that many ORAO requests in 24 h, no new window opens
 * (an alert says so) until the count falls back; sealing, finalizing and
 * refunds go on. The same when MAX_WINDOWS_IN_FLIGHT rounds wait to settle
 * (the program refuses a new round then: one round that cannot finish holds
 * every later one, so they stop taking stakes).
 *
 * Settlement stall: rounds settle strictly in order, so a round at the
 * settlement cursor that could move (Drawn or Tallied, or Sealed with its
 * randomness in or past its refund timeout) but has not for
 * `settleStallMs` raises `settlement_stalled` (log, webhook) and turns
 * /health to 503; so does any action failing 5 times in a row
 * (`action_failing`). A failing final page also makes the keeper re-create
 * the fee accounts before the next attempt (a closed treasury wSOL account
 * fails every finalization until it exists again).
 * Page sizes fit a legacy transaction (TALLY_PAGE_LEGACY / SETTLE_PAGE_LEGACY)
 * and every page transaction requests a measured compute-unit limit.
 *
 * Mainnet plumbing around the loop (none of it changes what is sent):
 *  - a compute-unit price on every transaction (fees.ts: auto or fixed,
 *    capped, doubled after an expiry), with a simulated limit when the
 *    instructions carry none, so the price is paid on what is used;
 *  - the bounty arrives as wrapped SOL in the keeper's ATA: every
 *    `unwrapEveryMs` it is closed and re-created in ONE transaction, which
 *    turns the balance back into SOL and leaves the account in place;
 *  - the keeper's balance is read every minute: below `alertBelowLamports`
 *    a log line and an optional webhook; the same when ticks keep failing;
 *  - every error text is scrubbed before it is logged or posted
 *    (`scrubSecrets`: web3.js puts the RPC URL, key included, in its fetch
 *    errors);
 *  - a priority fee never exceeds `maxFeeLamports` per transaction;
 *  - `health()` for the /health endpoint; `stop()` ends the current tick
 *    and returns from `run()`;
 *  - while the active window is open and nothing else is pending, the loop
 *    ticks every `idleIntervalMs` instead of `intervalMs` (fewer RPC calls)
 *    and goes back to the short interval just before the close slot.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  AccountLayout,
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ESTIMATED_MS_PER_SLOT,
  FULFILL_COMPUTE_UNITS,
  MAX_PAGE,
  MAX_WINDOWS_IN_FLIGHT,
  MAX_TX_COMPUTE_UNITS,
  ONE_TX_SETTLE_MAX,
  OPEN_WINDOW_COMPUTE_UNITS,
  INITIAL_VIRTUAL_Y,
  PulledClient,
  SEAL_COMPUTE_UNITS,
  SETTLE_PAGE_LEGACY,
  TALLY_PAGE_LEGACY,
  TOKEN_PROGRAM_ID,
  WindowState,
  ata,
  computeUnitLimitIx,
  deriveVrfSeed,
  isNativeQuote,
  platformQuoteAta,
  settlePageComputeUnits,
  tallyPageComputeUnits,
  type Entry,
  type Keyed,
  type Market,
  type Window,
} from "@pulled/sdk";
import { Alarm, postWebhook, sol, type AlarmEvent } from "./alerts.ts";
import {
  PriorityFees,
  capPriceForFee,
  computeUnitLimitOf,
  computeUnitPriceIx,
  fitsLegacy,
  isComputeUnitLimitIx,
  limitFromSimulation,
  writableAccounts,
  type FeeOptions,
} from "./fees.ts";
import type { HealthReport } from "./health.ts";
import { scrubSecrets } from "./config.ts";

export interface KeeperOptions {
  connection: Connection;
  keypair: Keypair;
  markets: PublicKey[];
  programId?: PublicKey;
  /** Tick interval in ms (default 2000). */
  intervalMs?: number;
  /** Build and simulate, never send. */
  dryRun?: boolean;
  /**
   * Upper bound on entries per tally/settle page (default: the largest pages
   * that fit a legacy transaction, TALLY_PAGE_LEGACY / SETTLE_PAGE_LEGACY).
   */
  pageSize?: number;
  /**
   * Quote token account receiving the bounty (default: the keeper's ATA, created on demand). A round that
   * asked ORAO pays its bounty only to the ATA of whoever paid the request (this keeper): another account
   * here sends those bounties to the treasury.
   */
  keeperQuoteAccount?: PublicKey;
  /** Full window scan (for Refunding windows below the cursor) every N ticks (default 30). */
  fullScanEvery?: number;
  log?: (line: LogLine) => void;
  /** Cluster name, for alerts and /health only. */
  cluster?: string;
  /** The platform treasury the program was built with (sdk `resolveTreasury`; the devnet key when omitted). */
  treasury?: PublicKey;
  /** Compute-unit price (default: none, as before). */
  fees?: FeeOptions;
  /** Tick interval while only an open window is waiting for its close slot (ms, default 0 = always `intervalMs`). */
  idleIntervalMs?: number;
  /** Unwrap the wrapped-SOL bounty this often (ms, default 0 = never). */
  unwrapEveryMs?: number;
  /** ... when it holds at least this much (lamports, default 0.01 SOL). */
  unwrapMinLamports?: bigint;
  /** Alert when the keeper's SOL balance is below this (lamports, default 0 = off). */
  alertBelowLamports?: bigint;
  /** POST alerts here (Slack/Discord-style JSON), in addition to the log line. */
  alertWebhook?: string;
  /** Repeat an alert that is still on this often (ms, default 3 h; 0 = once). */
  alertRepeatMs?: number;
  /** /health turns unhealthy when no tick succeeded for this long (ms, default max(120 s, 10 ticks, 3 idle ticks)). */
  staleAfterMs?: number;
  /** Open no new window; finish, refund and close what exists, then return from `run()`. */
  drain?: boolean;
  /** Open no new window once this many ORAO requests were sent in the last 24 h (default 0 = no cap). */
  vrfPerDay?: number;
  /** Drain, and refund every stake, creating the owners' missing quote accounts (default false). */
  drainRefundAll?: boolean;
  /** Stop the game (wind-down build): drain, notice, force_exit every entry, close rounds and markets (default false). */
  shutdown?: boolean;
  /** The deployed wind-down build's notice in seconds (default 604800; 600 for a devnet rehearsal build). */
  noticeSecs?: bigint;
  /** The settlement queue stuck this long while its next round could move: alarm and /health 503 (ms, default 10 min). */
  settleStallMs?: number;
  /** Priority fee ceiling per transaction, price x limit (lamports, default 0.0005 SOL). */
  maxFeeLamports?: bigint;
  /** Strings never to log or post (the RPC and webhook URLs): replaced by their host. */
  secrets?: string[];
}

export interface LogLine {
  ts: string;
  level: "info" | "warn" | "error";
  market?: string;
  window?: string;
  index?: string;
  action: string;
  sig?: string;
  msg?: string;
  err?: string;
  dryRun?: boolean;
}

const defaultLog = (l: LogLine) => process.stdout.write(JSON.stringify(l) + "\n");

type ActionKey = string;

export class Keeper {
  readonly client: PulledClient;
  readonly connection: Connection;
  readonly keypair: Keypair;
  readonly markets: PublicKey[];
  readonly intervalMs: number;
  readonly dryRun: boolean;
  readonly tallyPage: number;
  readonly settlePage: number;
  readonly keeperQuoteAccount: PublicKey | undefined;
  readonly fullScanEvery: number;
  private readonly log: (line: LogLine) => void;
  /** Exponential backoff per (window, action) after a failure (`at`: the last failure). */
  private readonly backoff = new Map<ActionKey, { until: number; n: number; at: number }>();
  /** Refunding windows with entries still to refund, discovered by scans. */
  private readonly refundQueue = new Map<string, Set<string>>();
  /** Queued windows whose remaining stakes wait for their owners (no quote account): looked at on full scans only. */
  private readonly refundWaiting = new Set<string>();
  /** Markets whose fee token accounts (platform, keeper, host ATAs) exist. */
  private readonly feeAccountsReady = new Set<string>();
  private tick = 0;
  private stopped = false;
  private wake: (() => void) | null = null;

  readonly cluster: string;
  readonly fees: PriorityFees;
  readonly idleIntervalMs: number;
  readonly unwrapEveryMs: number;
  readonly unwrapMinLamports: bigint;
  readonly alertBelowLamports: bigint;
  readonly alertWebhook: string;
  readonly staleAfterMs: number;
  private readonly lowBalance: Alarm;
  private readonly ticksFailing: Alarm;
  private readonly vrfFailing: Alarm;
  private readonly vrfBudget: Alarm;
  private readonly settlementStalled: Alarm;
  private readonly actionFailing: Alarm;
  private readonly roundsPaused: Alarm;
  readonly drain: boolean;
  readonly drainRefundAll: boolean;
  readonly shutdown: boolean;
  readonly noticeSecs: bigint;
  /** Shutdown: markets closed (or found gone). */
  private readonly closedMarkets = new Set<string>();
  /** Shutdown: the notice end last announced per market. */
  private readonly noticeAnnounced = new Map<string, bigint>();
  /** Shutdown: markets reported as left open (nothing of anyone's in them, but they cannot close). */
  private readonly leftOpen = new Set<string>();
  /** Shutdown: markets still before the end of their notice at their last visit (the orphan sweep waits for none). */
  private readonly inNotice = new Set<string>();
  /** Shutdown: entries of the program whose market is gone, at the last sweep (-1: no sweep yet, or it failed). */
  private orphansLeft = -1;
  /** Shutdown: such entries that `close_entry` refuses (none can be, by construction), reported once each. */
  private readonly orphansStuck = new Set<string>();
  readonly vrfPerDay: number;
  readonly settleStallMs: number;
  readonly maxFeeLamports: bigint;
  private readonly secrets: string[];
  /** Per market: the settlement cursor, and since when its round could move but has not (ms; 0 = it cannot move yet). */
  private readonly cursorWatch = new Map<string, { index: bigint; since: number; what: string }>();
  /** Markets whose rounds stopped opening because MAX_WINDOWS_IN_FLIGHT wait to settle. */
  private readonly paused = new Set<string>();
  /** When each ORAO request of the last 24 h landed (ms). */
  private vrfSent: number[] = [];
  /** Drain: true once a tick found nothing left to do. */
  private drained = false;
  /** Guarded actions run so far (an idle tick runs none). */
  private actions = 0;
  /** A served market is quoted in native SOL: the bounty is wrapped SOL. */
  private nativeQuote = false;
  private nextUnwrapAt = 0;
  private nextBalanceAt = 0;
  private balance: bigint | null = null;
  private readonly startedAt = Date.now();
  private lastTickAt = 0;
  private lastOkTickAt = 0;
  private lastTickError = "";
  private warnedTooLarge = false;

  constructor(opts: KeeperOptions) {
    this.connection = opts.connection;
    this.keypair = opts.keypair;
    this.markets = opts.markets;
    this.intervalMs = opts.intervalMs ?? 2000;
    this.dryRun = opts.dryRun ?? false;
    const cap = Math.min(MAX_PAGE, Math.max(1, opts.pageSize ?? MAX_PAGE));
    this.tallyPage = Math.min(TALLY_PAGE_LEGACY, cap);
    this.settlePage = Math.min(SETTLE_PAGE_LEGACY, cap);
    this.keeperQuoteAccount = opts.keeperQuoteAccount;
    this.fullScanEvery = opts.fullScanEvery ?? 30;
    this.log = opts.log ?? defaultLog;
    this.client = new PulledClient({ connection: opts.connection, programId: opts.programId, treasury: opts.treasury });
    this.cluster = opts.cluster ?? "unknown";
    this.fees = new PriorityFees(opts.connection, opts.fees ?? { price: 0, min: 0, max: 0 });
    this.idleIntervalMs = opts.idleIntervalMs ?? 0;
    this.unwrapEveryMs = opts.unwrapEveryMs ?? 0;
    this.unwrapMinLamports = opts.unwrapMinLamports ?? 10_000_000n;
    this.alertBelowLamports = opts.alertBelowLamports ?? 0n;
    this.alertWebhook = opts.alertWebhook ?? "";
    const repeat = opts.alertRepeatMs ?? 3 * 3_600_000;
    this.lowBalance = new Alarm("low_balance", repeat);
    this.ticksFailing = new Alarm("ticks_failing", repeat);
    this.vrfFailing = new Alarm("vrf_request_failing", repeat);
    this.vrfBudget = new Alarm("vrf_budget", repeat);
    this.settlementStalled = new Alarm("settlement_stalled", repeat);
    this.actionFailing = new Alarm("action_failing", repeat);
    this.roundsPaused = new Alarm("rounds_paused", repeat);
    this.drainRefundAll = opts.drainRefundAll ?? false;
    this.shutdown = opts.shutdown ?? false;
    this.noticeSecs = opts.noticeSecs ?? 604_800n;
    this.drain = (opts.drain ?? false) || this.drainRefundAll || this.shutdown;
    this.vrfPerDay = opts.vrfPerDay ?? 0;
    this.settleStallMs = opts.settleStallMs ?? 10 * 60_000;
    this.maxFeeLamports = opts.maxFeeLamports ?? 500_000n;
    this.secrets = (opts.secrets ?? []).filter(Boolean);
    this.staleAfterMs = opts.staleAfterMs ?? Math.max(120_000, 10 * this.intervalMs, 3 * this.idleIntervalMs);
  }

  /** Run until `stop()`. */
  async run(): Promise<void> {
    this.info({ action: "start", msg: `keeper ${this.keypair.publicKey.toBase58()} on ${this.markets.length} market(s)${this.dryRun ? " (dry-run)" : ""}` });
    while (!this.stopped) {
      const started = Date.now();
      const idleFor = await this.tickOnce();
      if (this.stopped) break;
      if (this.drained) {
        this.info({ action: "drained", msg: this.shutdown
          ? "shutdown: every entry paid out, every round and market closed (see market_left_open lines if any)"
          : "drain: no window holds a stake the keeper can move; every closable window is closed" });
        break;
      }
      // idle: sleep longer, but wake up an interval before the window closes
      const target = idleFor !== null && this.idleIntervalMs > 0
        ? Math.min(this.idleIntervalMs, Math.max(this.intervalMs, idleFor - this.intervalMs))
        : this.intervalMs;
      await this.sleep(Math.max(0, target - (Date.now() - started)));
    }
    this.info({ action: "stopped" });
  }

  /** Finish the current tick, then return from `run()`. */
  stop(): void {
    this.stopped = true;
    this.wake?.();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.wake = null; resolve(); }, ms);
      this.wake = () => { clearTimeout(t); this.wake = null; resolve(); };
    });
  }

  /**
   * One pass over every market. Exposed for tests and one-shot runs.
   * Returns how long (ms) nothing needs doing, or null when the keeper is busy.
   */
  async tickOnce(): Promise<number | null> {
    this.tick++;
    const actionsBefore = this.actions;
    let ok = true;
    let idleFor: number | null = Infinity;
    if (this.shutdown && !this.stopped) {
      try { await this.discoverMarkets(); } catch (e) { this.warn({ action: "market_scan", err: this.errStr(e), msg: "the program's markets could not be listed: serving the known ones" }); }
    }
    for (const market of this.markets) {
      if (this.stopped) break;
      if (this.closedMarkets.has(market.toBase58())) continue;
      try {
        const hint = await this.serveMarket(market);
        idleFor = hint === null || idleFor === null ? null : Math.min(idleFor, hint);
      } catch (e) {
        ok = false;
        idleFor = null;
        this.lastTickError = this.errStr(e);
        this.error({ action: "tick", market: market.toBase58(), err: this.lastTickError });
      }
    }
    // shutdown: entries of markets already closed (by anyone), once no notice is still running
    if (this.shutdown && !this.stopped && this.inNotice.size === 0) {
      try { await this.serveOrphans(); } catch (e) {
        ok = false;
        idleFor = null;
        this.orphansLeft = -1;
        this.lastTickError = this.errStr(e);
        this.error({ action: "orphan_entries", err: this.lastTickError });
      }
    }
    const now = Date.now();
    this.lastTickAt = now;
    if (ok) this.lastOkTickAt = now;
    if (!this.stopped) {
      try { await this.housekeeping(now); } catch (e) { this.warn({ action: "housekeeping", err: this.errStr(e) }); }
    }
    if (this.drain && ok && this.actions === actionsBefore && !this.stopped) {
      let done = true;
      for (const market of this.markets) done = done && (await this.nothingLeft(market));
      // shutdown: and no entry of the program left whose market is gone
      if (this.shutdown) done = done && this.inNotice.size === 0 && this.orphansLeft === 0;
      this.drained = done;
    }
    if (this.actions !== actionsBefore || this.refundQueue.size > this.refundWaiting.size || idleFor === Infinity) return null;
    return idleFor;
  }

  /**
   * Drain: every window of the market is Settled, or Refunding with only
   * stakes the owners take back themselves, and none is left to close (the
   * active one never can be).
   */
  private async nothingLeft(marketPk: PublicKey): Promise<boolean> {
    if (this.shutdown) return this.shutdownDone(marketPk);
    const market = (await this.client.getMarket(marketPk)).account;
    for (const w of await this.client.getWindows(marketPk)) {
      const s = w.account.state;
      if (s === WindowState.Refunding) {
        // refund-all leaves nothing to the owners: every stake must be back
        const left = w.account.refundedEntries < w.account.entryCount;
        if (left && (this.drainRefundAll || !this.refundWaiting.has(w.pubkey.toBase58()))) return false;
      } else if (s !== WindowState.Settled) return false;
      if (PulledClient.isWindowClosable(market, w.account)) return false;
    }
    return true;
  }

  /**
   * Whether a new window may open: not draining, fewer than
   * MAX_WINDOWS_IN_FLIGHT rounds waiting to settle (the program refuses
   * more), and under the daily ORAO budget.
   */
  private mayOpen(market: Market, mk: string, now = Date.now()): boolean {
    if (this.drain) return false;
    const pending = market.windowCount - market.nextSettleIndex;
    if (pending >= MAX_WINDOWS_IN_FLIGHT) {
      if (!this.paused.has(mk)) {
        this.paused.add(mk);
        this.warn({ action: "rounds_paused", market: mk, msg: `${pending} rounds wait to settle behind round ${market.nextSettleIndex}: no new round opens (MAX_WINDOWS_IN_FLIGHT) until it finishes or refunds` });
      }
      return false;
    }
    if (this.vrfPerDay <= 0) return true;
    this.vrfSent = this.vrfSent.filter((t) => now - t < 86_400_000);
    const over = this.vrfSent.length >= this.vrfPerDay;
    this.raise(this.vrfBudget, over, now,
      `${this.vrfSent.length} ORAO requests in 24 h (cap ${this.vrfPerDay}): no new round opens until the count falls back (KEEPER_VRF_PER_DAY)`,
      "ORAO requests back under the daily cap: rounds open again");
    return !over;
  }

  /** The first market whose settlement cursor could move but has not for `settleStallMs`, described; else null. */
  private stalled(now = Date.now()): string | null {
    for (const [mk, c] of this.cursorWatch) {
      if (c.since > 0 && now - c.since > this.settleStallMs) {
        return `market ${mk}: round ${c.index} (${c.what}) has not moved for ${Math.round((now - c.since) / 60_000)} min`;
      }
    }
    return null;
  }

  /** Actions that failed 5 times or more in a row, as "action (n)". */
  private failingActions(): string[] {
    return [...this.backoff].filter(([, b]) => b.n >= 5).map(([key, b]) => `${key.split(":").slice(1).join(":")} on ${key.split(":")[0]} (${b.n})`);
  }

  /** Balance check and alerts (every minute), bounty unwrap (every `unwrapEveryMs`). */
  private async housekeeping(now: number): Promise<void> {
    const sinceOk = now - (this.lastOkTickAt || this.startedAt);
    this.raise(this.ticksFailing, sinceOk > 5 * 60_000, now,
      `keeper ticks have failed for ${Math.round(sinceOk / 60_000)} min: ${this.lastTickError}`, "keeper ticks succeed again");

    const stall = this.stalled(now);
    this.raise(this.settlementStalled, stall !== null, now,
      `settlement stalled: ${stall}. Every later round waits behind it (docs/DEPLOY.md, "A round that does not settle")`,
      "settlement moves again");
    this.raise(this.roundsPaused, this.paused.size > 0, now,
      `no new round opens: ${MAX_WINDOWS_IN_FLIGHT} rounds wait to settle on ${[...this.paused].join(", ")} (docs/DEPLOY.md, "A round that does not settle")`,
      "rounds open again");
    // an action nobody retried for 10 min was given up (its window moved on or closed): forget it
    for (const [key, b] of this.backoff) if (now - b.at > 10 * 60_000) this.backoff.delete(key);
    const failing = this.failingActions();
    this.raise(this.actionFailing, failing.length > 0, now,
      `failing 5+ times in a row: ${failing.join("; ")}`, "no action keeps failing");

    if (now >= this.nextBalanceAt) {
      this.nextBalanceAt = now + 60_000;
      this.balance = BigInt(await this.connection.getBalance(this.keypair.publicKey, "confirmed"));
      if (this.alertBelowLamports > 0n) {
        // back to normal only with 25 % of headroom, so a balance hovering at the line does not flap
        const low = this.lowBalance.active ? this.balance < (this.alertBelowLamports * 5n) / 4n : this.balance < this.alertBelowLamports;
        this.raise(this.lowBalance, low, now,
          `keeper ${this.keypair.publicKey.toBase58()} has ${sol(this.balance)} SOL on ${this.cluster}, below ${sol(this.alertBelowLamports)} SOL: top it up`,
          `keeper balance back to ${sol(this.balance)} SOL`);
      }
    }

    if (this.unwrapEveryMs > 0 && now >= this.nextUnwrapAt && this.nativeQuote && !this.keeperQuoteAccount) {
      this.nextUnwrapAt = now + this.unwrapEveryMs;
      await this.serveUnwrap();
    }
  }

  /* ------------------------------ per market ------------------------------ */

  /** Returns how long (ms) this market needs nothing, or null when it has work pending. */
  private async serveMarket(marketPk: PublicKey): Promise<number | null> {
    if (this.shutdown && !(await this.client.getMarketOrNull(marketPk))) {
      // closed by this keeper or by anyone else: what may be left of it (entries holding only
      // their owners' rent) is closed by the program-wide sweep (serveOrphans)
      if (!this.closedMarkets.has(marketPk.toBase58())) this.info({ action: "market_closed", market: marketPk.toBase58() });
      this.closedMarkets.add(marketPk.toBase58());
      this.inNotice.delete(marketPk.toBase58());
      return Infinity;
    }
    const market = (await this.client.getMarket(marketPk)).account;
    const slot = BigInt(await this.client.getSlot());
    const mk = marketPk.toBase58();
    if (isNativeQuote(market)) this.nativeQuote = true;
    // the queue moved since rounds paused (whoever opened the next one): not paused any more
    if (market.windowCount - market.nextSettleIndex < MAX_WINDOWS_IN_FLIGHT && this.paused.delete(mk)) {
      this.info({ action: "rounds_paused", market: mk, msg: "cleared: the settlement queue moved, rounds open again" });
    }

    // 1. the active window: seal at close, open the next one when past Open
    let active: Keyed<Window> | null = null;
    if (market.hasActiveWindow) active = await this.client.getWindowByIndex(marketPk, market.activeWindow);

    if (active && active.account.state === WindowState.Open) {
      if (slot >= active.account.closeSlot) {
        const before = this.actions;
        await this.sealAndRequest(marketPk, market, active);
        // the market and that window changed (an empty one is even closed): read them afresh next tick
        if (this.actions !== before) return null;
      }
    } else if (this.mayOpen(market, mk)) {
      // none, or Sealed/Drawn/Tallied/Settled/Refunding: open the next window now (pipelined)
      await this.guarded(`${mk}:open:${market.windowCount}`, async () => {
        const ixs = await this.client.openWindowInstructions(this.keypair.publicKey, marketPk, market);
        const sig = await this.send(ixs);
        this.info({ action: "open_window", market: mk, index: market.windowCount.toString(), sig });
      });
    }

    // 2. finalization, strictly from the settle cursor upwards
    let cursorWhat: string | null = null;
    for (let i = market.nextSettleIndex; i < market.windowCount; i++) {
      const w = await this.client.getWindowByIndex(marketPk, i);
      if (i === market.nextSettleIndex) cursorWhat = await this.movable(market, w.account, slot);
      const done = await this.serveWindow(marketPk, market, w, slot, i === market.nextSettleIndex);
      // a later window cannot finalize before this one: stop at the first one still pending
      if (!done) break;
    }
    this.watchCursor(mk, market.nextSettleIndex, cursorWhat);

    // 3. refunds (Refunding windows may sit below the cursor)
    const fullScan = this.tick % this.fullScanEvery === 1 || this.drain;
    if (fullScan) await this.scanRefunding(marketPk);
    await this.serveRefunds(marketPk, market, fullScan);

    // 4. rent recovery for finished entries and windows (full scan, same cadence; every tick while draining)
    if (fullScan) {
      await this.serveCleanup(marketPk, market);
      await this.checkFeeAccounts(marketPk, market);
    }

    // 5. shutdown: the notice, then every entry paid out and the market closed
    if (this.shutdown) return this.serveShutdown(marketPk, market);

    // 6. idle until the close slot when the open window is the only thing left
    if (!active || active.account.state !== WindowState.Open || market.nextSettleIndex !== active.account.index) return null;
    const slotsLeft = active.account.closeSlot - slot;
    // a slot estimate on the short side (slots got faster over time): wake up early rather than late
    return slotsLeft > 0n ? Number(slotsLeft) * ESTIMATED_MS_PER_SLOT * 0.7 : null;
  }

  /**
   * Why the round at the settlement cursor could move now (it waits on
   * nothing but a transaction), or null when it is waiting for its close,
   * for ORAO or for its refund timeout.
   */
  private async movable(market: Market, w: Window, slot: bigint): Promise<string | null> {
    switch (w.state) {
      case WindowState.Open: return slot >= w.closeSlot ? "open past its close slot" : null;
      case WindowState.Drawn: return "drawn, not finalized";
      case WindowState.Tallied: return "tallied, not settled";
      case WindowState.Sealed: {
        const start = w.vrfRequested ? w.vrfRequestedSlot : w.sealedSlot;
        if (slot > start + market.vrfTimeoutSlots) return "sealed past its refund timeout";
        try { if (await this.client.getFulfilledRandomness(w)) return "sealed, ORAO answered, not fulfilled"; } catch { /* the next tick reads it again */ }
        return null;
      }
      default: return null;
    }
  }

  /** Track how long the cursor's round could move without moving (`stalled`). */
  private watchCursor(mk: string, index: bigint, what: string | null, now = Date.now()): void {
    const prev = this.cursorWatch.get(mk);
    if (!what) { this.cursorWatch.set(mk, { index, since: 0, what: "" }); return; }
    if (prev && prev.index === index && prev.since > 0) { prev.what = what; return; }
    this.cursorWatch.set(mk, { index, since: now, what });
  }

  /**
   * The fee accounts were created once, but their owners may close them (the
   * treasury unwrapping its wrapped SOL): forget them when one is gone, so
   * the next finalization re-creates it first.
   */
  private async checkFeeAccounts(marketPk: PublicKey, market: Market): Promise<void> {
    const mk = marketPk.toBase58();
    if (!this.feeAccountsReady.has(mk)) return;
    const keys = [platformQuoteAta(market.quoteMint, market.quoteProgram, this.client.treasury)];
    if (!this.keeperQuoteAccount) keys.push(ata(market.quoteMint, this.keypair.publicKey, market.quoteProgram));
    // not the host's (final review): without it the round keeps the host fee in its buy, and paying its
    // rent let a host close it and keep the rent, round after round
    const infos = await this.connection.getMultipleAccountsInfo(keys, "confirmed");
    const missing = keys.filter((_, i) => !infos[i]);
    if (missing.length) {
      this.feeAccountsReady.delete(mk);
      this.info({ action: "fee_accounts_missing", market: mk, msg: `${missing.map((k) => k.toBase58()).join(",")}: re-created before the next finalization` });
    }
  }

  /** Create the platform and keeper quote ATAs once per market (idempotent; never a host's). */
  private async ensureFeeAccounts(marketPk: PublicKey, market: Market): Promise<boolean> {
    const mk = marketPk.toBase58();
    if (this.feeAccountsReady.has(mk)) return true;
    return this.guarded(`${mk}:fee_accounts`, async () => {
      const sig = await this.send(await this.client.feeAccountsInstructions(this.keypair.publicKey, market, this.keeperQuoteAccount));
      this.feeAccountsReady.add(mk);
      this.info({ action: "fee_accounts", market: mk, sig });
    });
  }

  /**
   * Close the active window at its close slot and open the next one in the
   * same transaction. See the header for what rides along per entry count.
   * Once that bundle has failed, the window is sealed alone: whatever else
   * failed (open_window, request_vrf, a page) goes on its own afterwards.
   */
  private async sealAndRequest(marketPk: PublicKey, market: Market, w: Keyed<Window>): Promise<void> {
    const mk = marketPk.toBase58();
    const wk = w.pubkey.toBase58();
    const index = w.account.index.toString();
    const n = w.account.entryCount;
    const isNext = w.account.index === market.nextSettleIndex;
    const isActive = market.hasActiveWindow && market.activeWindow === w.account.index;

    if (this.backoff.has(`${wk}:seal`)) {
      // the bundle failed: seal alone (an empty window needs the settle cursor)
      if (n === 0 && !isNext) return;
      await this.guarded(`${wk}:seal_only`, async () => {
        const sig = await this.send(this.client.sealInstructions(marketPk, w.pubkey));
        this.info({ action: "seal", market: mk, window: wk, index, sig, msg: `${n} entries, alone after a failed bundle` });
      });
      return;
    }
    // the next window can only be opened right after sealing the active one
    const openNext = isActive && this.mayOpen(market, mk) ? await this.client.openWindowInstructions(this.keypair.publicKey, marketPk, market) : [];

    if (n === 0) {
      // empty window: seal needs the cursor; otherwise retry later
      if (!isNext) return;
      await this.guarded(`${wk}:seal`, async () => {
        const ixs = [
          ...this.client.sealInstructions(marketPk, w.pubkey),
          ...openNext,
          // Settled with no entry and no longer active (the next one opened here): its rent comes straight back
          ...(isActive && openNext.length ? this.client.closeWindowInstructions(marketPk, market, w.pubkey, w.account) : []),
        ];
        const sig = await this.send(ixs);
        this.info({ action: isActive && openNext.length ? "seal_empty+open+close" : "seal_empty", market: mk, window: wk, index, sig });
      });
      return;
    }

    if (n === 1) {
      // no randomness for a lone entry: seal -> Drawn, then tally + settle right away when it is next
      const settleNow = isNext && (await this.ensureFeeAccounts(marketPk, market));
      const sealed = await this.guarded(`${wk}:seal`, async () => {
        const ixs: TransactionInstruction[] = [];
        let units = SEAL_COMPUTE_UNITS + (openNext.length ? OPEN_WINDOW_COMPUTE_UNITS : 0);
        ixs.push(...this.client.sealInstructions(marketPk, w.pubkey));
        if (settleNow) {
          const entries = await this.client.getPageEntries(w.pubkey, 1);
          const drawn: Window = { ...w.account, state: WindowState.Drawn };
          ixs.push(await this.client.tallyPageIxFor(this.keypair.publicKey, marketPk, market, w.pubkey, drawn, 0, 1, entries, this.keeperQuoteAccount));
          ixs.push(...this.client.settlePageInstructions(marketPk, w.pubkey, 0, 1, entries, { computeUnits: false }));
          units += tallyPageComputeUnits(1) + settlePageComputeUnits(1);
        }
        ixs.push(...openNext);
        const sig = await this.send([computeUnitLimitIx(units), ...ixs]);
        this.info({ action: settleNow ? "seal+settle(1 entry, no VRF)" : "seal(1 entry, no VRF)", market: mk, window: wk, index, sig });
      });
      if (!sealed && settleNow) this.feeAccountsReady.delete(mk);
      return;
    }

    await this.guarded(`${wk}:seal`, async () => {
      // seal + request_vrf (+ open next) in one transaction: the seal seed is derivable now that entries are closed
      const sealSeed = deriveVrfSeed(w.pubkey, w.account.closeSlot, n, w.account.entriesCommitment);
      const ixs = [
        ...this.client.sealInstructions(marketPk, w.pubkey),
        ...(await this.client.requestVrfInstructions(this.keypair.publicKey, w.pubkey, sealSeed)),
        ...openNext,
      ];
      const sig = await this.send(ixs);
      this.vrfSent.push(Date.now());
      this.info({ action: openNext.length ? "seal+request_vrf+open" : "seal+request_vrf", market: mk, window: wk, index, sig });
    });
  }

  /**
   * Drive one window towards Settled/Refunding. Returns true when the window
   * no longer blocks the settle cursor (Settled or Refunding).
   */
  private async serveWindow(marketPk: PublicKey, market: Market, w: Keyed<Window>, slot: bigint, isNext: boolean): Promise<boolean> {
    const mk = marketPk.toBase58();
    const wk = w.pubkey.toBase58();
    const index = w.account.index.toString();
    const win = w.account;

    switch (win.state) {
      case WindowState.Open:
        // handled by serveMarket when it is the active window; an Open window
        // below the active one cannot exist (open_window requires the previous past Open)
        if (slot >= win.closeSlot) await this.sealAndRequest(marketPk, market, w);
        return false;

      case WindowState.Sealed: {
        const start = win.vrfRequested ? win.vrfRequestedSlot : win.sealedSlot;
        const deadline = start + market.vrfTimeoutSlots;
        const refund = async () => {
          await this.guarded(`${wk}:refund_window`, async () => {
            const sig = await this.send(this.client.refundWindowInstructions(marketPk, w.pubkey, win));
            this.warn({ action: "refund_window", market: mk, window: wk, index, sig, msg: win.vrfRequested ? "VRF timed out" : "no VRF request landed before the timeout" });
            this.refundQueue.set(wk, new Set());
          });
        };
        if (!win.vrfRequested) {
          // past the timeout a refund, whatever keeps the request from landing
          if (slot > deadline) {
            if (isNext) await refund();
            return false;
          }
          // a new salt every attempt: a salt seen in flight may have been used up at ORAO
          const key = `${wk}:request`;
          const ok = await this.guarded(key, async () => {
            const sig = await this.send(await this.client.requestVrfInstructions(this.keypair.publicKey, w.pubkey, win.vrfSeed));
            this.vrfSent.push(Date.now());
            this.info({ action: "request_vrf", market: mk, window: wk, index, sig });
          });
          const fails = this.backoff.get(key)?.n ?? 0;
          if (ok || fails >= 5) {
            this.raise(this.vrfFailing, fails >= 5, Date.now(),
              `request_vrf for round ${index} failed ${fails} times in a row (ORAO refusing, or someone using up each salt): it refunds after slot ${deadline}`,
              "request_vrf lands again");
          }
          return false;
        }
        const randomness = await this.client.getFulfilledRandomness(win);
        if (randomness) {
          const oneTx = isNext && win.entryCount <= ONE_TX_SETTLE_MAX && (await this.ensureFeeAccounts(marketPk, market));
          const fulfilled = await this.guarded(`${wk}:fulfill`, async () => {
            if (!oneTx) {
              const sig = await this.send(this.client.fulfillInstructions(w.pubkey, win));
              this.info({ action: "fulfill", market: mk, window: wk, index, sig });
              return;
            }
            // small window: fulfill + tally + settle in one transaction
            const n = win.entryCount;
            const entries = await this.client.getPageEntries(w.pubkey, n);
            const drawn: Window = { ...win, state: WindowState.Drawn };
            const ixs = [
              computeUnitLimitIx(FULFILL_COMPUTE_UNITS + tallyPageComputeUnits(n) + settlePageComputeUnits(n)),
              ...this.client.fulfillInstructions(w.pubkey, win),
              await this.client.tallyPageIxFor(this.keypair.publicKey, marketPk, market, w.pubkey, drawn, 0, n, entries, this.keeperQuoteAccount),
              ...this.client.settlePageInstructions(marketPk, w.pubkey, 0, n, entries, { computeUnits: false }),
            ];
            const sig = await this.send(ixs);
            this.info({ action: "fulfill+tally+settle", market: mk, window: wk, index, sig, msg: `${n} entries` });
          });
          // a final page that fails may be a fee account someone closed: re-create them before the next attempt
          if (!fulfilled && oneTx) this.feeAccountsReady.delete(mk);
          return false;
        }
        if (slot > deadline && isNext) await refund();
        return false;
      }

      case WindowState.Drawn: {
        const n = win.entryCount;
        let entries: PublicKey[];
        try { entries = await this.client.getPageEntries(w.pubkey, n); } catch (e) {
          this.warn({ action: "entries", market: mk, window: wk, index, err: this.errStr(e) });
          return false;
        }
        if (isNext && !(await this.ensureFeeAccounts(marketPk, market))) return false;
        if (win.tallyCursor === 0 && isNext && n <= ONE_TX_SETTLE_MAX) {
          // e.g. a one-entry window sealed while an earlier window was pending
          const settled = await this.guarded(`${wk}:tally+settle`, async () => {
            const ixs = [
              computeUnitLimitIx(tallyPageComputeUnits(n) + settlePageComputeUnits(n)),
              await this.client.tallyPageIxFor(this.keypair.publicKey, marketPk, market, w.pubkey, win, 0, n, entries, this.keeperQuoteAccount),
              ...this.client.settlePageInstructions(marketPk, w.pubkey, 0, n, entries, { computeUnits: false }),
            ];
            const sig = await this.send(ixs);
            this.info({ action: "tally+settle", market: mk, window: wk, index, sig, msg: `${n} entries` });
          });
          if (!settled) this.feeAccountsReady.delete(mk);
          return false;
        }
        const pages = PulledClient.pages(win.tallyCursor, n, this.tallyPage);
        for (const [from, to] of pages) {
          const final = to === n;
          if (final && !isNext) return false; // the finalizing page needs the cursor
          const ok = await this.guarded(`${wk}:tally:${from}`, async () => {
            const ixs = await this.client.tallyPageInstructions(
              this.keypair.publicKey, marketPk, market, w.pubkey, win, from, to, entries.slice(from, to),
              { keeperQuoteAccount: this.keeperQuoteAccount },
            );
            const sig = await this.send(ixs);
            this.info({ action: final ? "tally_page(final)" : "tally_page", market: mk, window: wk, index, sig, msg: `[${from},${to})` });
          });
          if (!ok) {
            if (final) this.feeAccountsReady.delete(mk);
            return false;
          }
        }
        return false;
      }

      case WindowState.Tallied: {
        let entries: PublicKey[];
        try { entries = await this.client.getPageEntries(w.pubkey, win.entryCount); } catch (e) {
          this.warn({ action: "entries", market: mk, window: wk, index, err: this.errStr(e) });
          return false;
        }
        const pages = PulledClient.pages(win.settleCursor, win.entryCount, this.settlePage);
        for (const [from, to] of pages) {
          const ok = await this.guarded(`${wk}:settle:${from}`, async () => {
            const sig = await this.send(this.client.settlePageInstructions(marketPk, w.pubkey, from, to, entries.slice(from, to)));
            this.info({ action: to === win.entryCount ? "settle_page(final)" : "settle_page", market: mk, window: wk, index, sig, msg: `[${from},${to})` });
          });
          if (!ok) return false;
        }
        return false;
      }

      case WindowState.Settled:
        return true;

      case WindowState.Refunding:
        if (!this.refundQueue.has(wk)) this.refundQueue.set(wk, new Set());
        return true;
    }
  }

  /* ------------------------------- refunds ------------------------------- */

  private async scanRefunding(marketPk: PublicKey): Promise<void> {
    const windows = await this.client.getWindows(marketPk);
    for (const w of windows) {
      if (w.account.state === WindowState.Refunding && !this.refundQueue.has(w.pubkey.toBase58())) {
        this.refundQueue.set(w.pubkey.toBase58(), new Set());
      }
    }
  }

  private async serveRefunds(marketPk: PublicKey, market: Market, fullScan: boolean): Promise<void> {
    for (const wk of [...this.refundQueue.keys()]) {
      // stakes waiting for their owners: looked at again on full scans only
      if (this.refundWaiting.has(wk) && !fullScan) continue;
      const windowPk = new PublicKey(wk);
      let w: Keyed<Window>;
      try { w = await this.client.getWindow(windowPk); } catch (e) {
        // every stake back and the window closed (by this keeper's cleanup or anyone): nothing left here
        if (/not found/.test(this.errStr(e))) { this.refundQueue.delete(wk); this.refundWaiting.delete(wk); continue; }
        throw e;
      }
      if (w.account.market.toBase58() !== marketPk.toBase58()) continue;
      const entries = await this.client.getEntries(windowPk);
      const pending = entries.filter((e) => !e.account.refunded);
      // refunded but still open (e.g. refunded by someone else): give the rent back
      const closable = entries.filter((e) => e.account.refunded);
      for (const batch of chunk(closable, 8)) {
        await this.guarded(`${wk}:close_entry:${batch[0]!.account.index}`, async () => {
          const ixs: TransactionInstruction[] = [];
          for (const e of batch) ixs.push(...this.client.closeEntryInstructions(e));
          const sig = await this.send(ixs);
          this.info({ action: "close_entry", market: marketPk.toBase58(), window: wk, index: w.account.index.toString(), sig, msg: batch.map((e: Keyed<Entry>) => e.account.index).join(",") });
        });
      }
      if (pending.length === 0) {
        this.refundQueue.delete(wk);
        this.refundWaiting.delete(wk);
        this.info({ action: "refunds_complete", market: marketPk.toBase58(), window: wk, index: w.account.index.toString() });
        continue;
      }
      // only owners who have a quote account: creating one would cost the keeper its rent per entry
      const ready = await this.withQuoteAccount(market, pending);
      if (this.drainRefundAll && ready.length < pending.length) {
        // shutdown: the others too, their account created on the way (its rent then belongs to the player)
        const have = new Set(ready.map((e) => e.pubkey.toBase58()));
        const missing = pending.filter((e) => !have.has(e.pubkey.toBase58()));
        for (const batch of chunk(missing, 3)) {
          await this.guarded(`${wk}:refund_all:${batch[0]!.account.index}`, async () => {
            const ixs: TransactionInstruction[] = [];
            for (const e of batch) {
              ixs.push(...this.client.refundEntryInstructions(this.keypair.publicKey, marketPk, market, windowPk, w.account, e, true));
              ixs.push(...this.client.closeEntryInstructions(e));
            }
            const sig = await this.send(ixs);
            this.info({ action: "refund_entry(created account)", market: marketPk.toBase58(), window: wk, index: w.account.index.toString(), sig, msg: batch.map((e: Keyed<Entry>) => e.account.index).join(",") });
          });
        }
      }
      const waiting = this.drainRefundAll ? 0 : pending.length - ready.length;
      if (waiting > 0 && !this.refundWaiting.has(wk)) {
        this.info({ action: "refunds_left_to_owners", market: marketPk.toBase58(), window: wk, index: w.account.index.toString(), msg: `${waiting} stake(s) whose owner has no quote account: they take it back from the app${this.shutdown ? ", or force_exit pays it out as SOL after the notice" : ""}` });
      }
      if (ready.length === 0) { if (!this.drainRefundAll) this.refundWaiting.add(wk); continue; }
      this.refundWaiting.delete(wk);
      // several refund_entry per transaction (each is small); 6 fill a legacy transaction, 5 leave room for the priority fee
      for (const batch of chunk(ready, this.fees.enabled ? 5 : 6)) {
        await this.guarded(`${wk}:refund_entry:${batch[0]!.account.index}`, async () => {
          const ixs: TransactionInstruction[] = [];
          for (const e of batch) {
            ixs.push(...this.client.refundEntryInstructions(this.keypair.publicKey, marketPk, market, windowPk, w.account, e, false));
            // stake refunded: the entry's rent goes back to its owner in the same transaction
            ixs.push(...this.client.closeEntryInstructions(e));
          }
          const sig = await this.send(ixs);
          this.info({ action: "refund_entry", market: marketPk.toBase58(), window: wk, index: w.account.index.toString(), sig, msg: batch.map((e: Keyed<Entry>) => e.account.index).join(",") });
        });
      }
    }
  }

  /** The entries whose owner's quote ATA exists (a refund can land without creating it). */
  private async withQuoteAccount(market: Market, entries: Keyed<Entry>[]): Promise<Keyed<Entry>[]> {
    const out: Keyed<Entry>[] = [];
    for (const part of chunk(entries, 100)) {
      const keys = part.map((e) => ata(market.quoteMint, e.account.owner, market.quoteProgram));
      const infos = await this.connection.getMultipleAccountsInfo(keys, "confirmed");
      part.forEach((e, i) => { if (infos[i]) out.push(e); });
    }
    return out;
  }

  /* ------------------------------- shutdown ------------------------------- */

  /**
   * Shutdown, after the drain steps of the tick (rounds finished, refunded,
   * closed): start the market's notice, wait for it, then pay out every
   * entry left (`force_exit`; `close_entry` for those holding only their
   * rent) and close the market once no entry is left. Entries whose round is
   * still in flight wait for the drain to finish it. Returns how long (ms)
   * nothing needs doing (the notice), or null when work was done or is
   * pending.
   */
  private async serveShutdown(marketPk: PublicKey, market: Market): Promise<number | null> {
    const mk = marketPk.toBase58();
    if (market.noticeStart === 0n) {
      this.inNotice.add(mk);
      await this.guarded(`${mk}:start_wind_down`, async () => {
        const sig = await this.send(this.client.startWindDownInstructions(marketPk));
        this.info({ action: "start_wind_down", market: mk, sig, msg: `notice started: every entry left is paid out to its owner ${this.noticeSecs} s from now` });
      });
      return null;
    }
    const end = market.noticeStart + this.noticeSecs;
    const now = await this.client.getClusterTime();
    if (now < end) {
      this.inNotice.add(mk);
      if (this.noticeAnnounced.get(mk) !== end) {
        this.noticeAnnounced.set(mk, end);
        this.info({ action: "notice", market: mk, msg: `notice running: entries left are paid out from ${new Date(Number(end) * 1000).toISOString()} (cluster clock)` });
      }
      // finished entries (sold out or refunded, not closed) get their owners' rent back now, every
      // `fullScanEvery` ticks: fewer left for anyone to strand by closing the market early
      if (this.tick % this.fullScanEvery === 1) {
        const before = this.actions;
        await this.closeFinished(mk, (await this.client.getEntriesByMarket(marketPk)).filter((e) => PulledClient.isEntryClosable(e.account)));
        if (this.actions !== before) return null;
      }
      return Number(end - now) * 1000;
    }
    this.inNotice.delete(mk);

    const entries = await this.client.getEntriesByMarket(marketPk);
    const windows = new Map((await this.client.getWindows(marketPk)).map((w) => [w.pubkey.toBase58(), w] as const));
    const finished: Keyed<Entry>[] = [];
    const payable: { e: Keyed<Entry>; w: Keyed<Window> | null }[] = [];
    for (const e of entries) {
      const a = e.account;
      if (PulledClient.isEntryClosable(a)) { finished.push(e); continue; }
      if (a.settled) {
        // its whole round settled, not only its own page (Entry::window_settled)
        if (a.windowIndex < market.nextSettleIndex) payable.push({ e, w: null });
        continue;
      }
      const w = windows.get(a.window.toBase58()) ?? null;
      if (w && w.account.state === WindowState.Refunding) payable.push({ e, w });
      // otherwise its round is still in flight: the drain finishes it first
    }
    await this.closeFinished(mk, finished);
    // 3 per transaction (~46k compute units each); a batch that keeps failing goes one by one
    for (const batch of chunk(payable, 3)) {
      const one = async (part: typeof batch) => {
        const ixs = part.flatMap(({ e, w }) => this.client.forceExitInstructions(this.keypair.publicKey, market, e, w));
        const sig = await this.send(ixs);
        this.info({ action: "force_exit", market: mk, sig, msg: part.map(({ e }) => `${e.account.windowIndex}/${e.account.index} -> ${e.account.owner.toBase58()}`).join(", ") });
      };
      const ok = await this.guarded(`${batch[0]!.e.pubkey.toBase58()}:force_exit`, () => one(batch));
      if (!ok && batch.length > 1) {
        for (const item of batch) await this.guarded(`${item.e.pubkey.toBase58()}:force_exit:1`, () => one([item]));
      }
    }
    if (entries.length === 0 && PulledClient.isMarketClosable(market, now, this.noticeSecs)) {
      await this.guarded(`${mk}:close_market`, async () => {
        const sig = await this.send(this.client.closeMarketInstructions(this.keypair.publicKey, marketPk, market));
        this.closedMarkets.add(mk);
        this.info({ action: "close_market", market: mk, sig, msg: `market closed: its rents and what the curve's rounding left in the vault go to its creator ${market.creator.toBase58()}` });
      });
    }
    return null;
  }

  /** `close_entry` for finished entries, 8 per transaction: each one's rent to its owner. */
  private async closeFinished(mk: string, finished: Keyed<Entry>[]): Promise<void> {
    for (const batch of chunk(finished, 8)) {
      await this.guarded(`${batch[0]!.pubkey.toBase58()}:close_entry`, async () => {
        const ixs: TransactionInstruction[] = [];
        for (const e of batch) ixs.push(...this.client.closeEntryInstructions(e));
        const sig = await this.send(ixs);
        this.info({ action: "close_entry", market: mk, sig, msg: batch.map((e) => `${e.account.windowIndex}/${e.account.index}`).join(",") });
      });
    }
  }

  /**
   * Shutdown: serve every market of the program, not only the given ones
   * (a market anyone created blocks the program close as much as ours; the
   * wind-down build refuses new ones, so the list only shrinks). A market
   * of a layout the SDK cannot read is left out (report.ts lists it).
   */
  private async discoverMarkets(): Promise<void> {
    const known = new Set(this.markets.map((m) => m.toBase58()));
    for (const { pubkey: key } of await this.client.getAllMarkets()) {
      if (known.has(key.toBase58())) continue;
      this.markets.push(key);
      known.add(key.toBase58());
      this.info({ action: "market_found", market: key.toBase58(), msg: "a market of the program: served by the shutdown too (its players are paid out like ours)" });
    }
  }

  /**
   * Shutdown, program-wide: every Entry whose market is gone. `close_market`
   * (permissionless) checks rounds and LADLE, not entries, so whoever sends
   * it first may leave entries behind; by construction they hold only their
   * owner's rent (every round closed: each stake refunded or settled; no
   * LADLE out: each share sold back), and `close_entry` returns it without
   * the market. One that `close_entry` would refuse is reported (it cannot
   * exist). Sets `orphansLeft` (the drain is over only at 0).
   */
  private async serveOrphans(): Promise<void> {
    const live = new Set((await this.client.getAccountKeys("Market")).map((m) => m.toBase58()));
    const orphans = (await this.client.getAllEntries()).filter((e) => !live.has(e.account.market.toBase58()));
    this.orphansLeft = orphans.length;
    if (!orphans.length) return;
    const closable = orphans.filter((e) => PulledClient.isEntryClosable(e.account));
    for (const e of orphans) {
      if (PulledClient.isEntryClosable(e.account) || this.orphansStuck.has(e.pubkey.toBase58())) continue;
      this.orphansStuck.add(e.pubkey.toBase58());
      this.warn({ action: "orphan_entry_stuck", market: e.account.market.toBase58(), msg: `entry ${e.pubkey.toBase58()} of a closed market still holds a share or a stake: close_entry refuses it (this should not exist; the program close stays blocked)` });
    }
    const byMarket = new Map<string, Keyed<Entry>[]>();
    for (const e of closable) {
      const m = e.account.market.toBase58();
      byMarket.set(m, [...(byMarket.get(m) ?? []), e]);
    }
    for (const [m, list] of byMarket) await this.closeFinished(m, list);
  }

  /**
   * Shutdown: done with a market when it is closed, or when nothing of
   * anyone's is left in it but it can never close (made before v25, so its
   * rounds were not counted; or LADLE still in wallets after the notice):
   * that is reported, since closing the program leaves its accounts.
   */
  private async shutdownDone(marketPk: PublicKey): Promise<boolean> {
    const mk = marketPk.toBase58();
    if (this.closedMarkets.has(mk)) return true;
    const keyed = await this.client.getMarketOrNull(marketPk);
    if (!keyed) { this.closedMarkets.add(mk); return true; }
    const m = keyed.account;
    if (m.noticeStart === 0n) return false;
    const now = await this.client.getClusterTime();
    if (now < m.noticeStart + this.noticeSecs) return false;
    if ((await this.client.getEntriesByMarket(marketPk)).length > 0) return false;
    if ((await this.client.getWindows(marketPk)).length > 0) return false;
    if (PulledClient.isMarketClosable(m, now, this.noticeSecs)) return false;
    if (!this.leftOpen.has(mk)) {
      this.leftOpen.add(mk);
      const why = !m.countsWindows ? "it was created before v25 (its rounds were not counted)" : `${Number(INITIAL_VIRTUAL_Y - m.curve.y) / 1e6} LADLE are still in wallets (sold out of the vault by a pre-v25 claim)`;
      this.warn({ action: "market_left_open", market: mk, msg: `no entry or round is left, but the market cannot close: ${why}. Closing the program leaves its accounts (its creator's rent and the quote in its vault)` });
    }
    return true;
  }

  /* ------------------------------- cleanup ------------------------------- */

  /**
   * Rent recovery, nobody's funds at stake. `close_window` for every window
   * the program lets go (`isWindowClosable`: Settled as soon as it is not the
   * active one, Refunding once every stake is back), rent to the opener,
   * usually this keeper: players sell back from their Entry alone, so no
   * player can hold the keeper's rent. Just before, `close_entry` for the
   * window's entries that are already finished (a zero share, a refunded
   * stake, a share sold back through another client; rent to their owners),
   * since the keeper no longer looks once the window is gone. Entries with a
   * share left are closed by their owner's last sale (or, at shutdown, by
   * `force_exit`). Empty rounds therefore cost only transaction fees.
   */
  private async serveCleanup(marketPk: PublicKey, market: Market): Promise<void> {
    const mk = marketPk.toBase58();
    const closable = (await this.client.getWindows(marketPk)).filter((w) => PulledClient.isWindowClosable(market, w.account));
    for (const w of closable) {
      const wk = w.pubkey.toBase58();
      const done = (await this.client.getEntries(w.pubkey)).filter((e) => PulledClient.isEntryClosable(e.account));
      for (const batch of chunk(done, 8)) {
        await this.guarded(`${wk}:close_entry:${batch[0]!.account.index}`, async () => {
          const ixs: TransactionInstruction[] = [];
          for (const e of batch) ixs.push(...this.client.closeEntryInstructions(e));
          const sig = await this.send(ixs);
          this.info({ action: "close_entry", market: mk, window: wk, index: w.account.index.toString(), sig, msg: batch.map((e: Keyed<Entry>) => e.account.index).join(",") });
        });
      }
    }
    // several close_window per transaction (each ~21k compute units, 2 new accounts)
    for (const batch of chunk(closable, 6)) {
      const ok = await this.guarded(`${batch[0]!.pubkey.toBase58()}:close_window`, async () => {
        const ixs: TransactionInstruction[] = [];
        for (const w of batch) ixs.push(...this.client.closeWindowInstructions(marketPk, market, w.pubkey, w.account));
        const sig = await this.send(ixs);
        this.info({ action: "close_window", market: mk, sig, msg: batch.map((w) => w.account.index.toString()).join(",") });
      });
      // a batch that keeps failing must not hold the others back: try them one by one
      if (!ok && batch.length > 1) {
        for (const w of batch) {
          await this.guarded(`${w.pubkey.toBase58()}:close_window`, async () => {
            const sig = await this.send(this.client.closeWindowInstructions(marketPk, market, w.pubkey, w.account));
            this.info({ action: "close_window", market: mk, window: w.pubkey.toBase58(), index: w.account.index.toString(), sig });
          });
        }
      }
    }
  }

  /* ------------------------------ plumbing ------------------------------ */

  /** Run `fn` unless it is backing off; on failure, back off exponentially (2 s .. 60 s). */
  private async guarded(key: ActionKey, fn: () => Promise<void>): Promise<boolean> {
    const b = this.backoff.get(key);
    if (b && Date.now() < b.until) return false;
    this.actions++;
    try {
      await fn();
      this.backoff.delete(key);
      return true;
    } catch (e) {
      const n = (b?.n ?? 0) + 1;
      const delay = Math.min(60_000, 2_000 * 2 ** (n - 1));
      const now = Date.now();
      this.backoff.set(key, { until: now + delay, n, at: now });
      this.warn({ action: key.split(":").slice(1).join(":"), window: key.split(":")[0], err: this.errStr(e), msg: `retry in ${delay} ms` });
      return false;
    }
  }

  /** Sign and send (or simulate in dry-run). Returns the signature, or "dry-run". */
  private async send(ixs: TransactionInstruction[]): Promise<string> {
    const priced = await this.budget(ixs);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: this.keypair.publicKey, blockhash, lastValidBlockHeight }).add(...priced);
    if (this.dryRun) {
      const sim = await this.connection.simulateTransaction(tx);
      if (sim.value.err) throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)} ${(sim.value.logs ?? []).slice(-5).join(" | ")}`);
      return "dry-run";
    }
    tx.sign(this.keypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    let conf;
    try {
      conf = await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    } catch (e) {
      // not landed before its blockhash expired: the next attempt pays a higher price
      if (e instanceof TransactionExpiredBlockheightExceededError) this.fees.expired();
      throw e;
    }
    if (conf.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(conf.value.err)}`);
    this.fees.landed();
    return sig;
  }

  /**
   * Prepend the compute-unit price, and a limit when the instructions carry
   * none (the price is charged on the limit: simulate, then ask for what is
   * used plus a margin). A transaction that would no longer fit goes as it was.
   */
  private async budget(ixs: TransactionInstruction[]): Promise<TransactionInstruction[]> {
    if (!this.fees.enabled) return ixs;
    const asked = await this.fees.price(writableAccounts(ixs));
    if (asked <= 0) return ixs;
    const given = computeUnitLimitOf(ixs);
    const units = given ?? limitFromSimulation(await this.simulateUnits(ixs));
    const limit = given === null ? [computeUnitLimitIx(units)] : [];
    // the per-transaction ceiling: price x limit never above maxFeeLamports, whatever the price settings
    const price = capPriceForFee(asked, units, this.maxFeeLamports);
    if (price <= 0) return ixs;
    const out = [...limit, computeUnitPriceIx(price), ...ixs];
    if (fitsLegacy(out, this.keypair.publicKey)) return out;
    if (!this.warnedTooLarge) {
      this.warnedTooLarge = true;
      this.warn({ action: "priority_fee", msg: "a transaction has no room for the compute-budget instructions: sent without a priority fee" });
    }
    return ixs;
  }

  /** Compute units the instructions use, from a simulation under the maximum limit. */
  private async simulateUnits(ixs: TransactionInstruction[]): Promise<number> {
    const tx = new Transaction({ feePayer: this.keypair.publicKey }).add(computeUnitLimitIx(MAX_TX_COMPUTE_UNITS), ...ixs);
    const sim = await this.connection.simulateTransaction(tx);
    if (sim.value.err) throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)} ${(sim.value.logs ?? []).slice(-5).join(" | ")}`);
    return sim.value.unitsConsumed ?? 200_000;
  }

  /* ---------------------------- bounty, alerts ---------------------------- */

  /**
   * The bounty is paid in wrapped SOL into the keeper's ATA. Close it (all its
   * lamports, rent included, go to the keeper as SOL) and re-create it in the
   * same transaction, so the next finalizing page still finds it.
   */
  private async serveUnwrap(): Promise<void> {
    const owner = this.keypair.publicKey;
    const wsol = ata(NATIVE_MINT, owner, TOKEN_PROGRAM_ID);
    const info = await this.connection.getAccountInfo(wsol, "confirmed");
    if (!info || !info.owner.equals(TOKEN_PROGRAM_ID)) return;
    const amount = AccountLayout.decode(info.data).amount;
    if (amount < this.unwrapMinLamports) return;
    await this.guarded(`${wsol.toBase58()}:unwrap`, async () => {
      const sig = await this.send(unwrapInstructions(owner, wsol));
      this.info({ action: "unwrap", sig, msg: `${sol(amount)} SOL of bounty unwrapped to SOL` });
    });
  }

  /** Log every alarm change; POST it when a webhook is set. */
  private raise(alarm: Alarm, active: boolean, now: number, text: string, clearText: string): void {
    const ev: AlarmEvent | null = alarm.update(active, now);
    if (!ev) return;
    const msg = this.scrub(ev === "clear" ? clearText : text);
    if (ev === "clear") this.info({ action: alarm.name, msg: `cleared: ${msg}` });
    else this.warn({ action: alarm.name, msg });
    if (!this.alertWebhook) return;
    const payload = {
      level: ev === "clear" ? "info" as const : "warn" as const,
      alarm: alarm.name, event: ev, text: `[ladle keeper, ${this.cluster}] ${msg}`,
      keeper: this.keypair.publicKey.toBase58(), cluster: this.cluster, ts: new Date(now).toISOString(),
      balanceSol: this.balance === null ? null : Number(this.balance) / 1e9,
    };
    void postWebhook(this.alertWebhook, payload).then((err) => { if (err) this.warn({ action: "webhook", err: this.scrub(err) }); });
  }

  /** For GET /health: ok while ticks succeed and the balance is above the alert line. */
  health(now = Date.now()): HealthReport {
    const reasons: string[] = [];
    if (this.stopped) reasons.push("stopping");
    if (this.lastOkTickAt === 0) {
      if (now - this.startedAt > this.staleAfterMs) reasons.push("no successful tick since start");
      else reasons.push("starting");
    } else if (now - this.lastOkTickAt > this.staleAfterMs) {
      reasons.push(`no successful tick for ${Math.round((now - this.lastOkTickAt) / 1000)} s`);
    }
    if (this.lowBalance.active) reasons.push(`balance below ${sol(this.alertBelowLamports)} SOL`);
    const stall = this.stalled(now);
    if (stall) reasons.push(`settlement stalled: ${stall}`);
    if (this.paused.size) reasons.push(`no new round opens: ${MAX_WINDOWS_IN_FLIGHT} rounds wait to settle`);
    const failing = this.failingActions();
    if (failing.length) reasons.push(`failing 5+ times in a row: ${failing.join("; ")}`);
    return {
      ok: reasons.length === 0,
      reasons,
      keeper: this.keypair.publicKey.toBase58(),
      cluster: this.cluster,
      markets: this.markets.map((m) => m.toBase58()),
      dryRun: this.dryRun,
      ticks: this.tick,
      lastTickAgoMs: this.lastTickAt ? now - this.lastTickAt : null,
      lastOkTickAgoMs: this.lastOkTickAt ? now - this.lastOkTickAt : null,
      balanceSol: this.balance === null ? null : Number(this.balance) / 1e9,
      priorityBoost: this.fees.currentBoost,
    };
  }

  /** An error's text, scrubbed of the RPC and webhook URLs and of any key (`scrubSecrets`). */
  private errStr(e: unknown): string { return this.scrub(errStr(e)); }
  private scrub(text: string): string { return scrubSecrets(text, this.secrets); }

  private info(l: Omit<LogLine, "ts" | "level">) { this.emit("info", l); }
  private warn(l: Omit<LogLine, "ts" | "level">) { this.emit("warn", l); }
  private error(l: Omit<LogLine, "ts" | "level">) { this.emit("error", l); }
  /** Every line goes out scrubbed: `err` and `msg` may quote an RPC error, which carries the URL. */
  private emit(level: LogLine["level"], l: Omit<LogLine, "ts" | "level">) {
    const clean = { ...l, ...(l.err !== undefined ? { err: this.scrub(l.err) } : {}), ...(l.msg !== undefined ? { msg: this.scrub(l.msg) } : {}) };
    this.log({ ts: new Date().toISOString(), level, dryRun: this.dryRun || undefined, ...clean });
  }
}

/**
 * Wrapped SOL back to SOL without losing the account: close the wSOL ATA
 * (every lamport to `owner`), then re-create it empty, in one transaction.
 * The token program leaves a closed account system-owned and empty within
 * the transaction, so the idempotent create really creates it again.
 */
export function unwrapInstructions(owner: PublicKey, wsolAta: PublicKey): TransactionInstruction[] {
  return [
    createCloseAccountInstruction(wsolAta, owner, owner, [], TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(owner, wsolAta, owner, NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
  ];
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function errStr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
