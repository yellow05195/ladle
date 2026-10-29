"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { getDataSource } from "../../lib/data";
import type { DataSource, LiveWindow as LiveWindowData } from "../../lib/data/types";
import { mockSource } from "../../lib/data/mock";
import { LAMPORTS_PER_SOL } from "../../lib/format";

interface LiveCtx {
  w: LiveWindowData | null;
  source: DataSource;
  /** the first snapshot failed (chain source not reachable) */
  failed: boolean;
  /** why, in one sentence (chain: configuration, a missing market, the RPC down); null while it reads */
  error: string | null;
  /** Places the viewer's entry; rejects with the reason (refused, sealed, other). */
  enter(amount: bigint): Promise<void>;
  /** Sells the viewer's scoop of round `id` (default: the round in focus) back to the curve. */
  sellBack(id?: string): Promise<void>;
  /** Chain: takes the viewer's stake of round `id` back from a round that will not be drawn; rejects with the reason. */
  refund(id: string): Promise<void>;
  /** The viewer closed their result: the source follows the open round again. */
  release(): void;
  /** The largest entry the 20 % cap allows right now (lamports). */
  maxEntry(): bigint;
}

interface LiveSnap { w: LiveWindowData | null; failed: boolean; error: string | null }

/**
 * v21.3: the live window lives in a small external store, not in the context's value. The context value never changes,
 * so a live tick (about five a second) re-renders only the components that read the window (useLive, useLiveSelect),
 * never the whole tree under the provider, and never the hall's canvas (R3F bridges every context above it and
 * re-renders on any change, which also reset its pixel ratio).
 */
interface LiveStore {
  get(): LiveSnap;
  subscribe(l: () => void): () => void;
  set(p: Partial<LiveSnap>): void;
  source: DataSource;
  actions: Omit<LiveCtx, "w" | "failed" | "error" | "source">;
  /** dev only: a capture script (screenshots/v21/chain) holds a state; the source's snapshots wait */
  forced: boolean;
}

const Ctx = createContext<LiveStore | null>(null);
const EMPTY: LiveSnap = { w: null, failed: false, error: null };

/** One subscription to the data source, shared by the hall, the HUD and the chat. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const source = useMemo(() => getDataSource(), []);
  const store = useMemo<LiveStore>(() => {
    const listeners = new Set<() => void>();
    let snap = EMPTY;
    return {
      get: () => snap,
      subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
      set(p) { snap = { ...snap, ...p }; listeners.forEach((l) => l()); },
      source,
      forced: false,
      actions: {
        enter: async (amount) => {
          if (typeof source.enter !== "function") throw new Error("entries are not open from this page yet");
          await source.enter(amount);
        },
        sellBack: async (id) => { await source.sellBack?.(id); },
        refund: async (id) => {
          if (typeof source.refund !== "function") throw new Error("taking a stake back is not available from this page");
          await source.refund(id);
        },
        release: () => { source.release?.(); },
        maxEntry: () => {
          if (source === mockSource) return mockSource.maxEntryNow();
          const w = snap.w;
          if (!w) return LAMPORTS_PER_SOL / 2n;
          // chain: the program's own limit (the cap of the total after the entry, the floor, the maximum entry)
          if (w.maxEntry !== undefined) return w.maxEntry;
          const byCap = (w.total * w.capBps) / (10_000n - w.capBps);
          return byCap > LAMPORTS_PER_SOL / 2n ? byCap : LAMPORTS_PER_SOL / 2n;
        },
      },
    };
  }, [source]);

  useEffect(() => {
    let unsub = () => {};
    const fail = (e: unknown) => { if (!store.forced) store.set({ failed: true, error: e instanceof Error ? e.message : String(e) }); };
    try {
      // a snapshot after a failure (the RPC came back): the page reads again
      unsub = source.subscribe((w) => { if (!store.forced) store.set(store.get().failed ? { w, failed: false, error: null } : { w }); }, fail);
    } catch (e) {
      console.warn("live source unavailable:", e);
      fail(e);
    }
    source.getLiveWindow().catch(fail);
    return unsub;
  }, [source, store]);

  // dev only: capture scripts hold a chain state (screenshots/v21/chain/shoot-chain.mjs)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const g = window as unknown as { __live?: unknown };
    g.__live = {
      hold: (w: LiveWindowData | null) => { store.forced = !!w; if (w) store.set({ w, failed: false, error: null }); },
      fail: (msg: string) => { store.forced = true; store.set({ w: null, failed: true, error: msg }); },
    };
    return () => { delete g.__live; };
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function useStore(): LiveStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useLive outside LiveProvider");
  return s;
}

/** The live window and the actions; re-renders the caller on every live tick. */
export function useLive(): LiveCtx {
  const store = useStore();
  const { w, failed, error } = useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  return useMemo(() => ({ w, failed, error, source: store.source, ...store.actions }), [w, failed, error, store]);
}

/** The live window's actions and its source, without the window: the caller never re-renders on a live tick. */
export function useLiveActions(): Omit<LiveCtx, "w" | "failed" | "error"> {
  const store = useStore();
  return useMemo(() => ({ source: store.source, ...store.actions }), [store]);
}

/** Whether the first snapshot failed, and why; re-renders only when either changes, never on a live tick. */
export function useLiveStatus(): { failed: boolean; error: string | null } {
  const store = useStore();
  const failed = useSyncExternalStore(store.subscribe, () => store.get().failed, () => false);
  const error = useSyncExternalStore(store.subscribe, () => store.get().error, () => null);
  return { failed, error };
}

export interface LiveSelectOpts<T> {
  /** false freezes the value (no re-render while off screen); it is read again once true */
  active?: boolean;
  /** v21.4: about one change every `every` ms at most, on a tick (the last value wins: a burst of arrivals is one roll) */
  every?: number;
  /** v21.4: when two values are the same for the caller (default Object.is); an equal value keeps the previous reference */
  equal?: (a: T, b: T) => boolean;
  /** v21.4: what else the selector reads (a round id): a new key reads the value again at once, not at the next tick */
  key?: string | number;
}

/**
 * v21.3: one value derived from the live window; re-renders the caller only when that value changes (compared with
 * Object.is: return a primitive or a stable reference, or pass `equal`). `active: false` freezes it (no re-render while
 * off screen). v21.4 (perf): `every` holds a figure that changes faster than the eye reads it to one change per period.
 */
export function useLiveSelect<T>(sel: (w: LiveWindowData | null) => T, opts: boolean | LiveSelectOpts<T> = true): T {
  const store = useStore();
  const o: LiveSelectOpts<T> = typeof opts === "boolean" ? { active: opts } : opts;
  const active = o.active ?? true;
  const every = o.every ?? 0;
  const selRef = useRef(sel);
  selRef.current = sel;
  const eqRef = useRef(o.equal);
  eqRef.current = o.equal;
  const activeRef = useRef(active);
  activeRef.current = active;
  const keyRef = useRef(o.key);
  keyRef.current = o.key;
  // the value on screen, when it changed and for which key; `stale`: a tick came while frozen, so it is read again once active
  const kept = useRef<{ v: T; at: number; stale: boolean; key: string | number | undefined } | null>(null);
  const same = (v: T): boolean => {
    const k = kept.current;
    return !!k && k.key === keyRef.current && (eqRef.current ? eqRef.current(k.v, v) : Object.is(k.v, v));
  };
  const read = (): boolean => {
    const v = selRef.current(store.get().w);
    if (same(v)) { kept.current!.stale = false; return false; }
    kept.current = { v, at: performance.now(), stale: false, key: keyRef.current };
    return true;
  };
  const get = () => {
    const k = kept.current;
    if (!k || k.key !== keyRef.current || (activeRef.current && k.stale)) read();
    return kept.current!.v;
  };
  const subscribe = useCallback((notify: () => void) => {
    let timer = 0;
    const flush = () => { if (timer) { clearTimeout(timer); timer = 0; } if (read()) notify(); };
    const off = store.subscribe(() => {
      if (!activeRef.current) { if (kept.current) kept.current.stale = true; return; }
      const wait = every > 0 && kept.current ? kept.current.at + every - performance.now() : 0;
      // v21.4 (perf): a held figure changes on a tick (with whatever else changes on it: one commit, not one more per
      // held figure), the first tick at most a quarter period early; the timer only catches the last value when no tick
      // follows the hold (one slot later than the tick would have come)
      if (wait <= every / 4) { flush(); return; }
      if (!timer && !same(selRef.current(store.get().w))) timer = window.setTimeout(flush, wait + (store.get().w?.slotMs ?? 400) + 50);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
    // read() goes through refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, every]);
  return useSyncExternalStore(subscribe, get, () => selRef.current(null));
}

/** v21.3: calls `fn` with every live window, without rendering (mirrors for the 3D scene). */
export function useLiveEffect(fn: (w: LiveWindowData | null) => void): void {
  const store = useStore();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let last: LiveWindowData | null | undefined;
    const run = () => { const w = store.get().w; if (w !== last) { last = w; fnRef.current(w); } };
    run();
    return store.subscribe(run);
  }, [store]);
}

/** The live context when there is one (the hall pages), null elsewhere (inner pages, the profile modal on them). */
export function useLiveOptional(): LiveCtx | null {
  const store = useContext(Ctx);
  const snapNow = useSyncExternalStore(store ? store.subscribe : noopSub, store ? store.get : getEmpty, getEmpty);
  return useMemo(() => (store ? { w: snapNow.w, failed: snapNow.failed, error: snapNow.error, source: store.source, ...store.actions } : null), [store, snapNow]);
}
const noopSub = () => () => {};
const getEmpty = () => EMPTY;
