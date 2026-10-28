"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getDataSource } from "../../lib/data";
import type { DataSource, LiveWindow as LiveWindowData } from "../../lib/data/types";
import { mockSource } from "../../lib/data/mock";
import { LAMPORTS_PER_SOL } from "../../lib/format";

interface LiveCtx {
  w: LiveWindowData | null;
  source: DataSource;
  /** the first snapshot failed (chain source not reachable) */
  failed: boolean;
  /** Places the viewer's entry; rejects with the reason (refused, sealed, other). */
  enter(amount: bigint): Promise<void>;
  sellBack(): Promise<void>;
  /** The viewer closed their result: the demo follows the open round again. */
  release(): void;
  /** The largest entry the 20 % cap allows right now (lamports). */
  maxEntry(): bigint;
}

const Ctx = createContext<LiveCtx | null>(null);

/** One subscription to the data source, shared by the hall, the HUD and the chat. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const source = useMemo(() => getDataSource(), []);
  const [w, setW] = useState<LiveWindowData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = source.subscribe((snap) => setW(snap));
    } catch (e) {
      console.warn("live source unavailable:", e);
      setFailed(true);
    }
    source.getLiveWindow().catch(() => setFailed(true));
    return unsub;
  }, [source]);

  const value = useMemo<LiveCtx>(
    () => ({
      w,
      source,
      failed,
      enter: async (amount) => {
        if (typeof source.enter !== "function") throw new Error("entries are not open from this page yet");
        await source.enter(amount);
      },
      sellBack: async () => { await source.sellBack?.(); },
      release: () => { if (source === mockSource) mockSource.release(); },
      maxEntry: () => {
        if (source === mockSource) return mockSource.maxEntryNow();
        if (!w) return LAMPORTS_PER_SOL / 2n;
        const byCap = (w.total * w.capBps) / (10_000n - w.capBps);
        return byCap > LAMPORTS_PER_SOL / 2n ? byCap : LAMPORTS_PER_SOL / 2n;
      },
    }),
    [w, source, failed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLive(): LiveCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLive outside LiveProvider");
  return c;
}

/** The live context when there is one (the hall pages), null elsewhere (inner pages, the profile modal on them). */
export function useLiveOptional(): LiveCtx | null {
  return useContext(Ctx);
}
