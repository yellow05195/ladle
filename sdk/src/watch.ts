/**
 * Live view of a market: websocket subscriptions (accountSubscribe on the
 * market and its active window, logsSubscribe on the program for events)
 * with a polling fallback when the websocket is silent or unavailable.
 */
import type { Connection, PublicKey } from "@solana/web3.js";
import { decodeMarket, decodeWindow } from "./accounts.ts";
import { eventsFromLogs } from "./events.ts";
import { windowPda } from "./pda.ts";
import type { Entry, Keyed, Market, PulledEvent, Window } from "./types.ts";

export interface LiveState {
  market: Keyed<Market>;
  /** The market's active window (any state), or null before the first open_window. */
  window: Keyed<Window> | null;
  /** Entries of `window`, sorted by index. */
  entries: Keyed<Entry>[];
  /** Latest slot seen (from RPC polling or account-change contexts). */
  slot: number;
  /** Events of the last update that concerned this market/window (empty on polls). */
  events: PulledEvent[];
  /** "ws" when the last update came from a subscription, "poll" otherwise. */
  source: "ws" | "poll";
  updatedAt: number;
}

export interface WatchOptions {
  /** Poll interval in ms (default 4000). Polling always runs for the slot; data is re-read when the websocket is silent. */
  pollMs?: number;
  /** Consider the websocket silent after this many ms without a notification (default 3 * pollMs). */
  silentAfterMs?: number;
  /** Set false to disable websockets entirely (pure polling). */
  websocket?: boolean;
  onError?: (err: unknown) => void;
}

/** What `watch` needs from the client (kept as an interface to avoid a cycle). */
export interface WatchReader {
  connection: Connection;
  programId: PublicKey;
  getMarket(market: PublicKey): Promise<Keyed<Market>>;
  getWindow(window: PublicKey): Promise<Keyed<Window>>;
  getEntries(window: PublicKey): Promise<Keyed<Entry>[]>;
}

export function watchMarket(
  reader: WatchReader,
  market: PublicKey,
  cb: (state: LiveState) => void,
  opts: WatchOptions = {},
): () => void {
  const pollMs = opts.pollMs ?? 4000;
  const silentAfterMs = opts.silentAfterMs ?? pollMs * 3;
  const useWs = opts.websocket ?? true;
  const { connection, programId } = reader;
  const onError = opts.onError ?? (() => {});

  let stopped = false;
  let state: LiveState | null = null;
  let lastWs = 0;
  let marketSub: number | null = null;
  let windowSub: number | null = null;
  let logsSub: number | null = null;
  let watchedWindow: string | null = null;
  let refreshing: Promise<void> | null = null;
  let refreshQueued = false;

  const emit = (patch: Partial<LiveState>) => {
    if (stopped || !state) return;
    state = { ...state, ...patch, updatedAt: Date.now() };
    cb(state);
  };

  const activeWindowKey = (m: Market): PublicKey | null =>
    m.hasActiveWindow ? windowPda(market, m.activeWindow, programId)[0] : null;

  /** Full re-read (market, window, entries). Coalesces concurrent calls. */
  const refresh = (source: "ws" | "poll", events: PulledEvent[] = []): Promise<void> => {
    if (refreshing) { refreshQueued = true; return refreshing; }
    refreshing = (async () => {
      try {
        const m = await reader.getMarket(market);
        const wk = activeWindowKey(m.account);
        const w = wk ? await reader.getWindow(wk) : null;
        const entries = wk ? await reader.getEntries(wk) : [];
        if (stopped) return;
        const slot = state?.slot ?? 0;
        state = { market: m, window: w, entries, slot, events, source, updatedAt: Date.now() };
        cb(state);
        if (useWs) subscribeWindow(wk);
      } catch (e) {
        onError(e);
      } finally {
        refreshing = null;
        if (refreshQueued) { refreshQueued = false; void refresh(source); }
      }
    })();
    return refreshing;
  };

  const subscribeWindow = (wk: PublicKey | null) => {
    const key = wk?.toBase58() ?? null;
    if (key === watchedWindow) return;
    if (windowSub !== null) { void connection.removeAccountChangeListener(windowSub).catch(onError); windowSub = null; }
    watchedWindow = key;
    if (!wk) return;
    windowSub = connection.onAccountChange(wk, (info, ctx) => {
      lastWs = Date.now();
      try {
        const w = decodeWindow(new Uint8Array(info.data));
        const prevCount = state?.window?.account.entryCount ?? 0;
        emit({ window: { pubkey: wk, account: w }, slot: ctx.slot, source: "ws", events: [] });
        // new entries, or rolls/shares written by a page: re-read the entries
        if (w.entryCount !== prevCount || w.tallyCursor > 0 || w.settleCursor > 0) void refreshEntries(wk);
      } catch (e) { onError(e); }
    }, "confirmed");
  };

  const refreshEntries = async (wk: PublicKey) => {
    try {
      const entries = await reader.getEntries(wk);
      if (!stopped && watchedWindow === wk.toBase58()) emit({ entries, source: "ws" });
    } catch (e) { onError(e); }
  };

  // --- websocket subscriptions
  if (useWs) {
    try {
      marketSub = connection.onAccountChange(market, (info, ctx) => {
        lastWs = Date.now();
        try {
          const m = decodeMarket(new Uint8Array(info.data));
          const wk = activeWindowKey(m);
          const changed = (wk?.toBase58() ?? null) !== watchedWindow;
          emit({ market: { pubkey: market, account: m }, slot: ctx.slot, source: "ws", events: [] });
          if (changed) void refresh("ws");
        } catch (e) { onError(e); }
      }, "confirmed");
      logsSub = connection.onLogs(programId, (logs, ctx) => {
        lastWs = Date.now();
        if (logs.err) return;
        const events = eventsFromLogs(logs.logs, programId);
        const wk = watchedWindow;
        const mine = events.filter((e) =>
          ("market" in e && e.market.equals(market)) || ("window" in e && wk !== null && e.window.toBase58() === wk),
        );
        if (mine.length === 0) return;
        emit({ events: mine, slot: ctx.slot, source: "ws" });
        // anything that touches entries or opens a window: re-read
        if (mine.some((e) => e.name === "Entered" || e.name === "EntrySettled" || e.name === "WindowOpened" || e.name === "EntryRefunded")) {
          void refresh("ws", mine);
        }
      }, "confirmed");
    } catch (e) { onError(e); }
  }

  // --- polling: slot every tick, full data when the websocket is silent
  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      const slot = await connection.getSlot("confirmed");
      if (state && slot !== state.slot) emit({ slot, source: state.source });
    } catch (e) { onError(e); }
    const silent = !useWs || Date.now() - lastWs > silentAfterMs;
    if (silent) await refresh("poll");
  }, pollMs);

  void refresh("poll");

  return () => {
    stopped = true;
    clearInterval(timer);
    if (marketSub !== null) void connection.removeAccountChangeListener(marketSub).catch(() => {});
    if (windowSub !== null) void connection.removeAccountChangeListener(windowSub).catch(() => {});
    if (logsSub !== null) void connection.removeOnLogsListener(logsSub).catch(() => {});
  };
}
