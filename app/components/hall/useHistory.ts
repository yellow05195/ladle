"use client";

/** The history source as hooks (v20): the curve, the books, the Genesis count, the live activity. Null source: nothing (the UI hides the cards). */
import { useEffect, useState } from "react";
import { getHistorySource } from "../../lib/data";
import type { ActivityItem, Books, CurvePoint, GenesisCount, HistorySource } from "../../lib/data/types";

export function useHistorySource(): HistorySource | null {
  // read after mount, so the server HTML and the first client render agree
  const [src, setSrc] = useState<HistorySource | null>(null);
  useEffect(() => { setSrc(getHistorySource()); }, []);
  return src;
}

function useCurveTick(src: HistorySource | null, ms = 600): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!src?.subscribeCurve) return;
    let t = 0;
    const off = src.subscribeCurve(() => { if (!t) t = window.setTimeout(() => { t = 0; setTick((x) => x + 1); }, ms); });
    return () => { off(); if (t) clearTimeout(t); };
  }, [src, ms]);
  return tick;
}

export function useCurve(): CurvePoint[] | null {
  const src = useHistorySource();
  const tick = useCurveTick(src);
  const [pts, setPts] = useState<CurvePoint[] | null>(null);
  useEffect(() => { let a = true; src?.getCurve().then((p) => { if (a) setPts(p); }).catch(() => {}); return () => { a = false; }; }, [src, tick]);
  return pts;
}

export function useBooks(): Books | null {
  const src = useHistorySource();
  const tick = useCurveTick(src, 1500);
  const [b, setB] = useState<Books | null>(null);
  useEffect(() => { let a = true; src?.getBooks().then((x) => { if (a) setB(x); }).catch(() => {}); return () => { a = false; }; }, [src, tick]);
  return b;
}

export function useGenesis(): GenesisCount | null {
  const src = useHistorySource();
  const tick = useCurveTick(src, 3000);
  const [g, setG] = useState<GenesisCount | null>(null);
  useEffect(() => {
    let a = true;
    const load = () => src?.getGenesis().then((x) => { if (a) setG(x); }).catch(() => {});
    load();
    window.addEventListener("ladle:profile", load);
    return () => { a = false; window.removeEventListener("ladle:profile", load); };
  }, [src, tick]);
  return g;
}

export function useActivity(): ActivityItem[] | null {
  const src = useHistorySource();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => { if (!src) return; return src.subscribeActivity((x) => setItems(x.slice())); }, [src]);
  return items;
}
