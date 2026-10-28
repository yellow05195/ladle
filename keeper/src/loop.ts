/**
 * The keeper loop. Permissionless and bountied: anyone may run it, the
 * finalizer of each window receives 10 % of the 1 % platform fee.
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
 *  - 2+ entries: seal + request_vrf + open_window(next), then once ORAO has
 *               answered fulfill + tally_page + settle_page in one tx up to
 *               ONE_TX_SETTLE_MAX entries, pages beyond that.
 * Page sizes fit a legacy transaction (TALLY_PAGE_LEGACY / SETTLE_PAGE_LEGACY)
 * and every page transaction requests a measured compute-unit limit.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  FULFILL_COMPUTE_UNITS,
  MAX_PAGE,
  ONE_TX_SETTLE_MAX,
  OPEN_WINDOW_COMPUTE_UNITS,
  PulledClient,
  SEAL_COMPUTE_UNITS,
  SETTLE_PAGE_LEGACY,
  TALLY_PAGE_LEGACY,
  WindowState,
  computeUnitLimitIx,
  deriveVrfSeed,
  settlePageComputeUnits,
  tallyPageComputeUnits,
  type Entry,
  type Keyed,
  type Market,
  type Window,
} from "@pulled/sdk";

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
  /** Quote token account receiving the bounty (default: the keeper's ATA, created on demand). */
  keeperQuoteAccount?: PublicKey;
  /** Full window scan (for Refunding windows below the cursor) every N ticks (default 30). */
  fullScanEvery?: number;
  log?: (line: LogLine) => void;
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
  /** Exponential backoff per (window, action) after a failure. */
  private readonly backoff = new Map<ActionKey, { until: number; n: number }>();
  /** Refunding windows with entries still to refund, discovered by scans. */
  private readonly refundQueue = new Map<string, Set<string>>();
  /** Markets whose fee token accounts (platform, keeper, host ATAs) exist. */
  private readonly feeAccountsReady = new Set<string>();
  private tick = 0;
  private stopped = false;

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
    this.client = new PulledClient({ connection: opts.connection, programId: opts.programId });
  }

  /** Run until `stop()`. */
  async run(): Promise<void> {
    this.info({ action: "start", msg: `keeper ${this.keypair.publicKey.toBase58()} on ${this.markets.length} market(s)${this.dryRun ? " (dry-run)" : ""}` });
    while (!this.stopped) {
      const started = Date.now();
      await this.tickOnce();
      const wait = Math.max(0, this.intervalMs - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  stop(): void { this.stopped = true; }

  /** One pass over every market. Exposed for tests and one-shot runs. */
  async tickOnce(): Promise<void> {
    this.tick++;
    for (const market of this.markets) {
      try {
        await this.serveMarket(market);
      } catch (e) {
        this.error({ action: "tick", market: market.toBase58(), err: errStr(e) });
      }
    }
  }

  /* ------------------------------ per market ------------------------------ */

  private async serveMarket(marketPk: PublicKey): Promise<void> {
    const market = (await this.client.getMarket(marketPk)).account;
    const slot = BigInt(await this.client.getSlot());
    const mk = marketPk.toBase58();

    // 1. the active window: seal at close, open the next one when past Open
    let active: Keyed<Window> | null = null;
    if (market.hasActiveWindow) active = await this.client.getWindowByIndex(marketPk, market.activeWindow);

    if (active && active.account.state === WindowState.Open) {
      if (slot >= active.account.closeSlot) await this.sealAndRequest(marketPk, market, active);
    } else {
      // none, or Sealed/Drawn/Tallied/Settled/Refunding: open the next window now (pipelined)
      await this.guarded(`${mk}:open:${market.windowCount}`, async () => {
        const ixs = await this.client.openWindowInstructions(this.keypair.publicKey, marketPk, market);
        const sig = await this.send(ixs);
        this.info({ action: "open_window", market: mk, index: market.windowCount.toString(), sig });
      });
    }

    // 2. finalization, strictly from the settle cursor upwards
    for (let i = market.nextSettleIndex; i < market.windowCount; i++) {
      const w = await this.client.getWindowByIndex(marketPk, i);
      const done = await this.serveWindow(marketPk, market, w, slot, i === market.nextSettleIndex);
      // a later window cannot finalize before this one: stop at the first one still pending
      if (!done) break;
    }

    // 3. refunds (Refunding windows may sit below the cursor)
    if (this.tick % this.fullScanEvery === 1) await this.scanRefunding(marketPk);
    await this.serveRefunds(marketPk, market);

    // 4. rent recovery for finished entries and windows (full scan, same cadence)
    if (this.tick % this.fullScanEvery === 1) await this.serveCleanup(marketPk, market);
  }

  /** Create the platform / keeper / host quote ATAs once per market (idempotent). */
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
   */
  private async sealAndRequest(marketPk: PublicKey, market: Market, w: Keyed<Window>): Promise<void> {
    const mk = marketPk.toBase58();
    const wk = w.pubkey.toBase58();
    const index = w.account.index.toString();
    const n = w.account.entryCount;
    const isNext = w.account.index === market.nextSettleIndex;
    const isActive = market.hasActiveWindow && market.activeWindow === w.account.index;
    // the next window can only be opened right after sealing the active one
    const openNext = isActive ? await this.client.openWindowInstructions(this.keypair.publicKey, marketPk, market) : [];

    if (n === 0) {
      // empty window: seal needs the cursor; otherwise retry later
      if (!isNext) return;
      await this.guarded(`${wk}:seal`, async () => {
        const ixs = [
          ...this.client.sealInstructions(marketPk, w.pubkey),
          ...openNext,
          // Settled with no entry and no longer active: its rent comes straight back
          ...(isActive ? this.client.closeWindowInstructions(marketPk, market, w.pubkey, w.account) : []),
        ];
        const sig = await this.send(ixs);
        this.info({ action: isActive ? "seal_empty+open+close" : "seal_empty", market: mk, window: wk, index, sig });
      });
      return;
    }

    if (n === 1) {
      // no randomness for a lone entry: seal -> Drawn, then tally + settle right away when it is next
      const settleNow = isNext && (await this.ensureFeeAccounts(marketPk, market));
      await this.guarded(`${wk}:seal`, async () => {
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
      return;
    }

    await this.guarded(`${wk}:seal`, async () => {
      // seal + request_vrf (+ open next) in one transaction: the seed is derivable now that entries are closed
      const seed = deriveVrfSeed(w.pubkey, w.account.closeSlot, n, w.account.entriesCommitment);
      const ixs = [
        ...this.client.sealInstructions(marketPk, w.pubkey),
        ...(await this.client.requestVrfInstructions(this.keypair.publicKey, w.pubkey, seed)),
        ...openNext,
      ];
      const sig = await this.send(ixs);
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
        if (!win.vrfRequested) {
          await this.guarded(`${wk}:request`, async () => {
            const sig = await this.send(await this.client.requestVrfInstructions(this.keypair.publicKey, w.pubkey, win.vrfSeed));
            this.info({ action: "request_vrf", market: mk, window: wk, index, sig });
          });
          return false;
        }
        const randomness = await this.client.getFulfilledRandomness(win);
        if (randomness) {
          const oneTx = isNext && win.entryCount <= ONE_TX_SETTLE_MAX && (await this.ensureFeeAccounts(marketPk, market));
          await this.guarded(`${wk}:fulfill`, async () => {
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
          return false;
        }
        const start = win.vrfRequested ? win.vrfRequestedSlot : win.sealedSlot;
        const deadline = start + market.vrfTimeoutSlots;
        if (slot > deadline && isNext) {
          await this.guarded(`${wk}:refund_window`, async () => {
            const sig = await this.send(this.client.refundWindowInstructions(marketPk, w.pubkey, win));
            this.warn({ action: "refund_window", market: mk, window: wk, index, sig, msg: "VRF timed out" });
            this.refundQueue.set(wk, new Set());
          });
        }
        return false;
      }

      case WindowState.Drawn: {
        const n = win.entryCount;
        let entries: PublicKey[];
        try { entries = await this.client.getPageEntries(w.pubkey, n); } catch (e) {
          this.warn({ action: "entries", market: mk, window: wk, index, err: errStr(e) });
          return false;
        }
        if (isNext && !(await this.ensureFeeAccounts(marketPk, market))) return false;
        if (win.tallyCursor === 0 && isNext && n <= ONE_TX_SETTLE_MAX) {
          // e.g. a one-entry window sealed while an earlier window was pending
          await this.guarded(`${wk}:tally+settle`, async () => {
            const ixs = [
              computeUnitLimitIx(tallyPageComputeUnits(n) + settlePageComputeUnits(n)),
              await this.client.tallyPageIxFor(this.keypair.publicKey, marketPk, market, w.pubkey, win, 0, n, entries, this.keeperQuoteAccount),
              ...this.client.settlePageInstructions(marketPk, w.pubkey, 0, n, entries, { computeUnits: false }),
            ];
            const sig = await this.send(ixs);
            this.info({ action: "tally+settle", market: mk, window: wk, index, sig, msg: `${n} entries` });
          });
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
          if (!ok) return false;
        }
        return false;
      }

      case WindowState.Tallied: {
        let entries: PublicKey[];
        try { entries = await this.client.getPageEntries(w.pubkey, win.entryCount); } catch (e) {
          this.warn({ action: "entries", market: mk, window: wk, index, err: errStr(e) });
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

  private async serveRefunds(marketPk: PublicKey, market: Market): Promise<void> {
    for (const wk of [...this.refundQueue.keys()]) {
      const windowPk = new PublicKey(wk);
      const w = await this.client.getWindow(windowPk);
      if (w.account.market.toBase58() !== marketPk.toBase58()) continue;
      const entries = await this.client.getEntries(windowPk);
      const pending = entries.filter((e) => !e.account.refunded);
      // refunded but still open (e.g. refunded by someone else): give the rent back
      const closable = entries.filter((e) => e.account.refunded);
      for (const batch of chunk(closable, 8)) {
        await this.guarded(`${wk}:close_entry:${batch[0]!.account.index}`, async () => {
          const ixs: TransactionInstruction[] = [];
          for (const e of batch) ixs.push(...this.client.closeEntryInstructions(windowPk, e));
          const sig = await this.send(ixs);
          this.info({ action: "close_entry", market: marketPk.toBase58(), window: wk, index: w.account.index.toString(), sig, msg: batch.map((e: Keyed<Entry>) => e.account.index).join(",") });
        });
      }
      if (pending.length === 0) {
        this.refundQueue.delete(wk);
        this.info({ action: "refunds_complete", market: marketPk.toBase58(), window: wk, index: w.account.index.toString() });
        continue;
      }
      // several refund_entry per transaction (each is small)
      for (const batch of chunk(pending, 6)) {
        await this.guarded(`${wk}:refund_entry:${batch[0]!.account.index}`, async () => {
          const ixs: TransactionInstruction[] = [];
          for (const e of batch) {
            ixs.push(...this.client.refundEntryInstructions(this.keypair.publicKey, marketPk, market, windowPk, w.account, e));
            // stake refunded: the entry's rent goes back to its owner in the same transaction
            ixs.push(...this.client.closeEntryInstructions(windowPk, e));
          }
          const sig = await this.send(ixs);
          this.info({ action: "refund_entry", market: marketPk.toBase58(), window: wk, index: w.account.index.toString(), sig, msg: batch.map((e: Keyed<Entry>) => e.account.index).join(",") });
        });
      }
    }
  }

  /* ------------------------------- cleanup ------------------------------- */

  /**
   * Rent recovery, nobody's funds at stake: `close_entry` for every finished
   * entry (rent to its owner: zero shares right after settle, the rest once
   * claimed or sold back), then `close_window` for finished windows whose
   * entries are all closed (rent to the opener, usually this keeper). Empty
   * rounds therefore cost only transaction fees.
   */
  private async serveCleanup(marketPk: PublicKey, market: Market): Promise<void> {
    const mk = marketPk.toBase58();
    const windows = await this.client.getWindows(marketPk);
    const closable: Keyed<Window>[] = [];
    for (const w of windows) {
      const win = w.account;
      if (win.state !== WindowState.Settled && win.state !== WindowState.Refunding) continue;
      if (market.hasActiveWindow && market.activeWindow === win.index) continue;
      const wk = w.pubkey.toBase58();
      let closed = win.closedEntries;
      if (closed < win.entryCount) {
        const entries = await this.client.getEntries(w.pubkey);
        const done = entries.filter((e) => PulledClient.entryClosable(win, e.account));
        for (const batch of chunk(done, 8)) {
          const ok = await this.guarded(`${wk}:close_entry:${batch[0]!.account.index}`, async () => {
            const ixs: TransactionInstruction[] = [];
            for (const e of batch) ixs.push(...this.client.closeEntryInstructions(w.pubkey, e));
            const sig = await this.send(ixs);
            this.info({ action: "close_entry", market: mk, window: wk, index: win.index.toString(), sig, msg: batch.map((e: Keyed<Entry>) => e.account.index).join(",") });
          });
          if (ok) closed += batch.length;
        }
      }
      if (closed >= win.entryCount) closable.push(w);
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
    try {
      await fn();
      this.backoff.delete(key);
      return true;
    } catch (e) {
      const n = (b?.n ?? 0) + 1;
      const delay = Math.min(60_000, 2_000 * 2 ** (n - 1));
      this.backoff.set(key, { until: Date.now() + delay, n });
      this.warn({ action: key.split(":").slice(1).join(":"), window: key.split(":")[0], err: errStr(e), msg: `retry in ${delay} ms` });
      return false;
    }
  }

  /** Sign and send (or simulate in dry-run). Returns the signature, or "dry-run". */
  private async send(ixs: TransactionInstruction[]): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: this.keypair.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
    if (this.dryRun) {
      const sim = await this.connection.simulateTransaction(tx);
      if (sim.value.err) throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)} ${(sim.value.logs ?? []).slice(-5).join(" | ")}`);
      return "dry-run";
    }
    tx.sign(this.keypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const conf = await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (conf.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(conf.value.err)}`);
    return sig;
  }

  private info(l: Omit<LogLine, "ts" | "level">) { this.log({ ts: new Date().toISOString(), level: "info", dryRun: this.dryRun || undefined, ...l }); }
  private warn(l: Omit<LogLine, "ts" | "level">) { this.log({ ts: new Date().toISOString(), level: "warn", dryRun: this.dryRun || undefined, ...l }); }
  private error(l: Omit<LogLine, "ts" | "level">) { this.log({ ts: new Date().toISOString(), level: "error", dryRun: this.dryRun || undefined, ...l }); }
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
