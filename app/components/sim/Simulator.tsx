"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/client";
import { formatInt, formatMultiplier, formatPct, formatSol, LAMPORTS_PER_SOL } from "../../lib/format";
import { GITHUB_LAW } from "../../lib/links";
import { maxHostFeeBps, platformFeeBps } from "../../lib/measurements";
import type { SimRequest } from "../../lib/sim.worker";

interface Result { id: number; windows: number; mean: number; p10: number; p50: number; p90: number; min: number; max: number; belowProRata: number; hist: { lo: number; hi: number; bins: number[] }; fees: { platform: string; host: string; toCurve: string }; meanEntries: number; ms: number; mults?: Float64Array }

/** Merges the sorted multipliers of several workers into one result: quantiles, the 40-bin histogram over [0, 2), the share below 1. */
function merge(parts: Result[], t0: number): Result {
  const total = parts.reduce((a, p) => a + (p.mults?.length ?? 0), 0);
  const all = new Float64Array(total);
  let k = 0;
  for (const p of parts) { if (p.mults) { all.set(p.mults, k); k += p.mults.length; } }
  all.sort();
  const N = all.length;
  const q = (x: number) => all[Math.min(N - 1, Math.floor(x * N))]!;
  let sum = 0, below = 0;
  const B = 40, bins = new Array<number>(B).fill(0);
  for (let i = 0; i < N; i++) { const v = all[i]!; sum += v; if (v < 1) below++; bins[Math.min(B - 1, Math.max(0, Math.floor((v / 2) * B)))]!++; }
  const first = parts[0]!;
  return { ...first, windows: N, mean: sum / N, p10: q(0.1), p50: q(0.5), p90: q(0.9), min: all[0]!, max: all[N - 1]!, belowProRata: below / N, hist: { lo: 0, hi: 2, bins }, meanEntries: parts.reduce((a, p) => a + p.meanEntries, 0) / parts.length, ms: performance.now() - t0, mults: undefined };
}

const WINDOWS = 20_000;
const HOST_MAX = maxHostFeeBps();
const FEE = platformFeeBps();

/** log slider: position 0..1 → value in [lo, hi] */
const logV = (k: number, lo: number, hi: number) => lo * Math.pow(hi / lo, k);
const logK = (v: number, lo: number, hi: number) => Math.log(v / lo) / Math.log(hi / lo);

/**
 * "See what a draw looks like" (§2.4): three sliders (my stake, the window
 * total, the biggest entry's share) and the entering / integrating switch
 * (a host-fee slider). Every move re-runs 20,000 windows with the real law
 * in a Web Worker, under 80 ms: the giant "×1.000 expected" (always, by the
 * law), the histogram of my multiplier with p10 / median / p90 annotated,
 * "below pro-rata in N % of windows" measured by the run, the honest line.
 */
export function Simulator({ mode: initialMode = "enter", hideSwitch = false, oneLine }: { mode?: "enter" | "host"; hideSwitch?: boolean; oneLine?: string }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<"enter" | "host">(initialMode);
  const [stakeK, setStakeK] = useState(logK(0.25, 0.01, 5));
  const [totalK, setTotalK] = useState(logK(5, 0.1, 100));
  const [big, setBig] = useState(0.1);
  const [hostBps, setHostBps] = useState(100);
  const [res, setRes] = useState<Result | null>(null);
  const workers = useRef<Worker[]>([]);
  const parts = useRef<Map<number, { t0: number; got: Result[] }>>(new Map());
  const reqId = useRef(0);
  const [moved, setMoved] = useState(false);

  const stake = Math.round(logV(stakeK, 0.01, 5) * 100) / 100;
  const total = Math.max(stake + 0.05, Math.round(logV(totalK, 0.1, 100) * 10) / 10);

  // one worker per core (at most 4): the 20,000 windows are split between them and merged here
  useEffect(() => {
    const n = Math.min(4, Math.max(1, navigator.hardwareConcurrency || 2));
    const ws = Array.from({ length: n }, () => new Worker(new URL("../../lib/sim.worker.ts", import.meta.url)));
    for (const w of ws) {
      w.onmessage = (e: MessageEvent<Result>) => {
        const job = parts.current.get(e.data.id);
        if (!job || e.data.id !== reqId.current) return;
        job.got.push(e.data);
        if (job.got.length === ws.length) { parts.current.delete(e.data.id); setRes(merge(job.got, job.t0)); }
      };
    }
    workers.current = ws;
    return () => { ws.forEach((w) => w.terminate()); workers.current = []; };
  }, []);

  useEffect(() => {
    const ws = workers.current;
    if (!ws.length) return;
    const id = ++reqId.current;
    parts.current.clear();
    parts.current.set(id, { t0: performance.now(), got: [] });
    const per = Math.ceil(WINDOWS / ws.length);
    ws.forEach((w, k) => {
      const req: SimRequest = {
        id,
        stake: BigInt(Math.round(stake * 1e9)).toString(),
        total: BigInt(Math.round(total * 1e9)).toString(),
        biggestShare: big,
        hostFeeBps: String(mode === "host" ? hostBps : 0),
        windows: Math.min(per, WINDOWS - per * k),
        seed: 7 + k,
      };
      w.postMessage(req);
    });
  }, [stake, total, big, hostBps, mode]);

  const hist = useMemo(() => {
    if (!res) return null;
    const max = Math.max(1, ...res.hist.bins);
    return { max, bins: res.hist.bins, lo: res.hist.lo, hi: res.hist.hi };
  }, [res]);

  const hostReceives = res ? BigInt(res.fees.host) : 0n;
  const onTen = (10n * LAMPORTS_PER_SOL * BigInt(hostBps)) / 10_000n;

  return (
    <div className="sim-v21 scroll-mt-20" data-sim>
      <div className="sim-ctl">
        {!hideSwitch ? (
          <div className="sim-modes" role="group" aria-label={t("sim.mode")}>
            <button type="button" className="key sec xs" aria-pressed={mode === "enter"} onClick={() => setMode("enter")}>{t("sim.modeEnter")}</button>
            <button type="button" className="key sec xs" aria-pressed={mode === "host"} onClick={() => setMode("host")}>{t("sim.modeHost")}</button>
          </div>
        ) : null}
        {mode === "enter" ? <Slider label={t("sim.stake")} value={`${formatSol(BigInt(Math.round(stake * 1e9)), 2)} SOL`} k={stakeK} onChange={(k) => { setStakeK(k); setMoved(true); }} lo="0.01 SOL" hi="5 SOL" /> : null}
        <Slider label={t("sim.total")} value={`${total.toFixed(1)} SOL`} k={totalK} onChange={(k) => { setTotalK(k); setMoved(true); }} lo="0.1 SOL" hi="100 SOL" />
        {mode === "enter" ? <Slider label={t("sim.biggest")} value={formatPct(big, 0).replace("%", " %")} k={big / 0.2} onChange={(k) => { setBig(Math.round(k * 20) / 100); setMoved(true); }} lo="0" hi={"20 %"} /> : null}
        {mode === "host" ? (
          <Slider label={t("sim.hostFee")} value={`${hostBps} bps`} k={hostBps / HOST_MAX.value} onChange={(k) => { setHostBps(Math.round(k * HOST_MAX.value)); setMoved(true); }} lo="0" hi={`${HOST_MAX.value} bps`} />
        ) : null}
      </div>
      <div className="sim-out" aria-live="polite" data-sim-result={moved ? "moved" : "initial"}>
        {mode === "enter" ? (
          <>
            <div className="pg-fact"><span className="num-l">×1.000</span><span className="label">{t("sim.expected")}</span></div>
            <p className="fine">{t("sim.expectedSub")}</p>
            <Histogram hist={hist} res={res} labels={{ p10: t("odds.p10"), p50: t("odds.p50"), p90: t("odds.p90"), axis: t("odds.histAxis"), proRata: t("common.proRata") }} />
            <div className="pg-facts">
              <div className="pg-fact"><span className="num-m">{res ? formatMultiplier(res.p10) : "×—"}</span><span className="label">{t("odds.p10")}</span></div>
              <div className="pg-fact"><span className="num-m">{res ? formatMultiplier(res.p50) : "×—"}</span><span className="label">{t("odds.p50")}</span></div>
              <div className="pg-fact"><span className="num-m">{res ? formatMultiplier(res.p90) : "×—"}</span><span className="label">{t("odds.p90")}</span></div>
            </div>
            <p className="ui">{res ? formatPct(res.belowProRata, 0).replace("%", " %") : "—"} {t("sim.below")}</p>
            <p className="fine">{t("sim.belowSub", { n: formatInt(WINDOWS, locale) })}</p>
            {oneLine ? <p className="ui">{oneLine}</p> : null}
          </>
        ) : (
          <>
            <div className="pg-fact"><span className="num-l">{formatSol(hostReceives, 3)}<span className="unit">SOL</span></span><span className="label">{t("sim.hostPerWindow")}</span></div>
            <p className="fine">{t("sim.hostSub", { total: total.toFixed(1), bps: hostBps })}</p>
            <table className="pg-table bare">
              <tbody>
                <Row k={t("int.rowTotal")} v={`${total.toFixed(2)} SOL`} />
                <Row k={t("int.rowPlatform", { bps: formatInt(FEE.value, locale) })} v={res ? `${formatSol(BigInt(res.fees.platform), 3)} SOL` : "—"} />
                <Row k={t("int.rowHost", { bps: hostBps })} v={res ? `${formatSol(hostReceives, 3)} SOL` : "—"} />
                <Row k={t("int.rowCurve")} v={res ? `${formatSol(BigInt(res.fees.toCurve), 3)} SOL` : "—"} />
              </tbody>
            </table>
            <p className="ui">{t("sim.onTen", { sol: formatSol(onTen, 2) })}</p>
            <p className="fine">{t("sim.splitBy")} {t("sim.hostNote")}</p>
          </>
        )}
        <p className="fine">
          {t("sim.honest")} · <a className="pg-a" href={GITHUB_LAW} target="_blank" rel="noreferrer">law.ts<span className="arr" aria-hidden="true">↗</span></a>
          {res ? ` · ${t("sim.ran", { n: formatInt(res.windows, locale), ms: res.ms.toFixed(0) })}` : ""}
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <tr><td className="nm">{k}</td><td className="r fig">{v}</td></tr>;
}

/** A slider (v21.1): a 10 px well track like the progress stem, a 22 px cream disc thumb ringed in the ground, a 44 px hit area, the value as a figure. */
function Slider({ label, value, k, onChange, lo, hi }: { label: string; value: string; k: number; onChange: (k: number) => void; lo: string; hi: string }) {
  return (
    <label className="sim-field">
      <span className="top"><span className="label">{label}</span><span className="num-m">{value}</span></span>
      <span className="sim-range">
        <input type="range" min={0} max={1000} value={Math.round(k * 1000)} onChange={(e) => onChange(Number(e.target.value) / 1000)} aria-label={label} aria-valuetext={value} />
      </span>
      <span className="sim-ends fine"><span>{lo}</span><span>{hi}</span></span>
    </label>
  );
}

/** The histogram of my multiplier (v21.1, §7.19): filled --ink-3 bars on whole pixels with a 2 px radius, all one colour; ×1 a 2 px --ink-4 line with "pro-rata", as on the swarm; the axis numerals in 13 px over one --grid line. Drawn at its measured width, so the type never scales. */
function Histogram({ hist, res, labels }: { hist: { max: number; bins: number[]; lo: number; hi: number } | null; res: Result | null; labels: { p10: string; p50: string; p90: string; axis: string; proRata: string } }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const put = () => setW(Math.round(el.clientWidth));
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 160, mT = 22, mB = 26;
  const h = H - mT - mB;
  const short = res ? { p10: `p10 ${formatMultiplier(res.p10)}`, p50: `median ${formatMultiplier(res.p50)}`, p90: `p90 ${formatMultiplier(res.p90)}` } : null;
  let body: ReactNode = null;
  if (hist && short && W > 40) {
    const n = hist.bins.length;
    const x = (v: number) => ((v - hist.lo) / (hist.hi - hist.lo)) * W;
    const proX = Math.round(x(1)) + 0.5;
    const base = mT + h;
    body = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="sim-hist" role="img" aria-label={`${labels.axis}: ${short.p10} · ${short.p50} · ${short.p90}`}>
        {hist.bins.map((c, i) => {
          const x0 = Math.round((i / n) * W) + 2, x1 = Math.round(((i + 1) / n) * W) - 2;
          const bh = Math.max(1, Math.round((c / hist.max) * h));
          return <rect key={i} x={x0} y={base - bh} width={Math.max(1, x1 - x0)} height={bh} rx={Math.min(2, bh / 2)} fill="var(--ink-3)" />;
        })}
        <text x={proX} y={15} textAnchor="middle" className="lbl">{labels.proRata}</text>
        <line x1={proX - 0.5} x2={proX - 0.5} y1={mT} y2={base} stroke="var(--ink-4)" strokeWidth={2} shapeRendering="crispEdges" />
        <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--grid)" shapeRendering="crispEdges" />
        <text x={0} y={H - 6} className="ax">×{hist.lo.toFixed(0)}</text>
        <text x={proX} y={H - 6} textAnchor="middle" className="ax">×1</text>
        <text x={W} y={H - 6} textAnchor="end" className="ax">×{hist.hi.toFixed(0)}</text>
      </svg>
    );
  }
  return <div ref={box} className="sim-hist-box" style={{ height: H }} aria-busy={body ? undefined : true}>{body}</div>;
}
