"use client";

/**
 * Past scoops as a beeswarm (v21.1, §7.19): every scoop of the recent
 * served rounds is one cream dot at 85 %, identical in size and colour,
 * placed at its exact value from ×0 to ×2 and dodged to the nearest free
 * height, above or below the axis (a true beeswarm: round dots, never a
 * grid of squares). Nothing is ever dropped: the dot shrinks (6 px down to
 * 2.5 px) until the swarm fits, and the chart grows if even the smallest
 * does not. ×1 is a 2 px --ink-4 line up to its "pro-rata" label; the axis
 * numerals sit under one --grid line.
 * Under it, the smallest and the largest past scoop side by side in the
 * identical style. No colour for any value, no highlight.
 *
 * fix:1 (T5, F14): the chart's lines and dots are drawn into a canvas
 * under the SVG's labels. The SVG's two crispEdges lines (×1 and the axis)
 * cost the GPU process an 80 ms raster flush the first time they were
 * painted, on the first scroll past the chart (scrollY about 2440 on the
 * home's tour): one 83 to 96 ms frame in every run, gone with the lines
 * hidden (screenshots/v21/perf/ver1-f14ab.mjs). The canvas is drawn on the
 * CPU (willReadFrequently: no GPU raster of its own) once per layout, then
 * only composited; its edges snap to the device pixels, as crispEdges did.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDataSource } from "../lib/data";
import { multiplierOf } from "../lib/law-settle";
import { formatMultiplier } from "../lib/format";
import { fill, P } from "./hall/sections/copy";

const H = 220;
/** label row above the plot, axis (rule, ticks, labels) under it */
const TOP = 22, AXIS = 28;

export interface PastScoops { m: number[]; rounds: number; min: number; max: number; median: number; below: number; n: number }

/** The sample, built once per page: the last 48 served rounds. */
let memo: Promise<PastScoops | null> | null = null, memoAt = 0;
function loadPastScoops(): Promise<PastScoops | null> {
  if (memo && Date.now() - memoAt < 120_000) return memo;
  memoAt = Date.now();
  memo = (async () => {
    const source = getDataSource();
    const recent = await source.listRecentWindows().catch(() => []);
    const wins = [...recent];
    const last = recent[0]?.id.match(/^demo-(\d+)$/);
    if (last) {
      const top = Number(last[1]);
      const more = await Promise.all(Array.from({ length: 36 }, (_, k) => source.getWindow(`demo-${top - 12 - k}`).catch(() => null)));
      for (const w of more) if (w) wins.push(w);
    }
    const m: number[] = [];
    for (const w of wins) for (const e of w.entries) m.push(multiplierOf(e.share, e.amount, w.total, w.tokensOut));
    if (!m.length) return null;
    const sorted = [...m].sort((a, b) => a - b);
    return { m: sorted, rounds: wins.length, min: sorted[0]!, max: sorted[sorted.length - 1]!, median: sorted[Math.floor(sorted.length / 2)]!, below: sorted.filter((v) => v < 1).length / sorted.length, n: sorted.length };
  })();
  memo.then((v) => { if (!v) memo = null; }).catch(() => { memo = null; });
  return memo;
}

/** Starts loading the sample without rendering anything (the home's tour calls it when the browser is idle). */
export function preloadPastScoops(): void { void loadPastScoops(); }

/** Every scoop of the recent served rounds (demo: the last 48), as multipliers, with the extremes, the median and the share below ×1. Loads once `when` is true. */
export function usePastScoops(when = true): PastScoops | null {
  const [s, setS] = useState<PastScoops | null>(null);
  useEffect(() => {
    if (!when) return;
    let alive = true;
    loadPastScoops().then((v) => { if (alive && v) setS(v); }).catch(() => {});
    return () => { alive = false; };
  }, [when]);
  return s;
}

/**
 * Beeswarm dodge (circles): values sorted ascending, each dot at its exact
 * x, at the height nearest the axis where it touches no placed dot (centres
 * at least `d` apart). Returns every dot's y offset and the extent used.
 * v21.4: with `fit`, it gives up (null) as soon as the extent plus the dot
 * passes the plot: the extent only grows, so that layout could never fit
 * and the search below would throw it away.
 */
function dodge(xs: number[], d: number, fit?: { D: number; plot: number }): { ys: Float32Array; up: number; down: number } | null {
  const ys = new Float32Array(xs.length);
  const d2 = d * d;
  let up = 0, down = 0, head = 0;
  const cand: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    while (head < i && x - xs[head]! >= d) head++;
    // candidate heights: the axis, and the edges of every neighbour's forbidden band
    cand.length = 0;
    cand.push(0);
    for (let j = head; j < i; j++) {
      const dx = x - xs[j]!;
      const h = Math.sqrt(Math.max(0, d2 - dx * dx));
      cand.push(ys[j]! + h + 1e-3, ys[j]! - h - 1e-3);
    }
    cand.sort((a, b) => Math.abs(a) - Math.abs(b) || (i % 2 ? b - a : a - b));
    let y = 0;
    for (const c of cand) {
      let ok = true;
      for (let j = head; j < i; j++) {
        const dx = x - xs[j]!, dy = c - ys[j]!;
        if (dx * dx + dy * dy < d2 - 1e-6) { ok = false; break; }
      }
      if (ok) { y = c; break; }
    }
    ys[i] = y;
    if (y > up) up = y;
    if (-y > down) down = -y;
    if (fit && up + down + fit.D > fit.plot) return null;
  }
  return { ys, up, down };
}

export interface SwarmGeom { x: (v: number) => number; path: string; total: number; base: number; proX: number; S: number; drawn: number; dots: Float32Array }

/** v21.4: the laid-out swarm per sample (its identity) and per (width, height, dot): a remount or a second chart never lays it out again. */
const geoms = new WeakMap<number[], Map<string, SwarmGeom>>();

/** The swarm's geometry for the sorted multipliers `m` (exported for perf/swarm-ab.mjs). */
export function swarmGeom(m: number[], W: number, height: number, mark: number): SwarmGeom {
  let per = geoms.get(m);
  if (!per) geoms.set(m, (per = new Map()));
  const k = `${W}|${height}|${mark}`;
  const hit = per.get(k);
  if (hit) return hit;
  const pad = 6;
  const x = (v: number) => pad + (Math.min(2, Math.max(0, v)) / 2) * (W - pad * 2);
  const plot = height - TOP - AXIS;
  const xs = m.map(x);
  // the largest dot (mark … 2.5 px across, 1 px apart) whose swarm fits; at the smallest the chart grows instead
  // (v21.4: a size that cannot fit stops at the first dot past the plot; 2.5 px is laid out in full whatever its extent)
  let D = Math.max(2.5, mark);
  let lay = D > 2.5 ? dodge(xs, D + 1, { D, plot }) : null;
  while (!lay && D > 2.5) {
    D = Math.max(2.5, D - 0.5);
    if (D > 2.5) lay = dodge(xs, D + 1, { D, plot });
  }
  if (!lay) lay = dodge(xs, D + 1)!;
  const need = Math.ceil(lay.up + lay.down + D);
  const plotH = Math.max(plot, need);
  const total = TOP + plotH + AXIS;
  // centre the swarm in the plot
  const axisY = TOP + (plotH - need) / 2 + lay.up + D / 2;
  const r = D / 2;
  let path = "";
  // (the dots' centres, x then y: the canvas's; the path is the SVG's of v21.3, kept for perf/swarm-ab.mjs)
  const dots = new Float32Array(xs.length * 2);
  for (let i = 0; i < xs.length; i++) {
    const cx = xs[i]!, cy = axisY - lay.ys[i]!;
    path += `M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r} ${r} 0 1 0 ${D} 0a${r} ${r} 0 1 0 -${D} 0`;
    dots[i * 2] = cx; dots[i * 2 + 1] = cy;
  }
  const base = Math.round(TOP + plotH + 6);
  const proX = Math.round(x(1)) + 0.5;
  const g = { x, path, total, base, proX, S: D, drawn: xs.length, dots };
  // a few sizes per sample (the charts on the page, a resize's last widths), not every width a window drag goes through
  if (per.size >= 8) per.delete(per.keys().next().value!);
  per.set(k, g);
  return g;
}

/**
 * The swarm's plot, on a canvas under the chart's labels, at the screen's pixel ratio, in the SVG's order: the ×1 line
 * (2 px of --ink-4, from the label row to the axis), the dots (the --ink cream at 85 %, over the line), the axis rule
 * (1 px of --grid). The lines' edges on the device pixels (crispEdges).
 */
function SwarmPlot({ g, W, h }: { g: SwarmGeom; W: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // (development: the geometry, for the looks probe screenshots/v21/perf/fx1-swarm-looks.mjs)
    if (process.env.NODE_ENV !== "production") (c as HTMLCanvasElement & { __geom?: SwarmGeom }).__geom = g;
    const k = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(W * k);
    c.height = Math.round(h * k);
    // (willReadFrequently: a canvas Chrome draws on the CPU, uploaded once, never rastered on the GPU)
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, h);
    const css = getComputedStyle(c);
    const token = (name: string, or: string) => css.getPropertyValue(name).trim() || or;
    // (a CSS coordinate on the device pixels' grid)
    const snap = (v: number) => Math.round(v * k) / k;
    // the ×1 line: the SVG's x = proX - 0.5, 2 px wide, butt ends at TOP and the axis
    const lx = snap(g.proX - 1.5);
    ctx.fillStyle = token("--ink-4", "#6E6053");
    ctx.fillRect(lx, snap(TOP), snap(g.proX + 0.5) - lx, snap(g.base) - snap(TOP));
    const r = g.S / 2, d = g.dots;
    ctx.fillStyle = token("--ink", "#F6EEE3");
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let i = 0; i < d.length; i += 2) { ctx.moveTo(d[i]! + r, d[i + 1]!); ctx.arc(d[i]!, d[i + 1]!, r, 0, Math.PI * 2); }
    ctx.fill();
    ctx.globalAlpha = 1;
    // the axis rule: the SVG's y = base + 0.5, 1 px, the box's whole width
    ctx.fillStyle = token("--grid", "rgba(246, 238, 227, 0.07)");
    ctx.fillRect(0, snap(g.base), W, snap(g.base + 1) - snap(g.base));
  }, [g, W, h]);
  return <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: W, height: h, pointerEvents: "none" }} />;
}

export function Swarm({ s, height = H, mark = 6, brief = false }: { s: PastScoops | null; height?: number; mark?: number; brief?: boolean }) {
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
  const g = useMemo(() => (!s || W < 40 ? null : swarmGeom(s.m, W, height, mark)), [s, W, height, mark]);
  if (process.env.NODE_ENV !== "production" && g && s && g.drawn !== s.n) console.error(`Swarm drew ${g.drawn} of ${s.n} scoops`);
  const h = g?.total ?? height;
  return (
    <div className={`pg-swarm ${brief ? "brief" : ""}`}>
      <div ref={box} className="pg-swarm-box" style={{ height: h }} aria-busy={s ? undefined : true}>
        {g && s ? (
          <>
            <SwarmPlot g={g} W={W} h={h} />
            <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`${P.odds.aria}. ${fill(P.odds.sample, { n: s.n, k: s.rounds })}`} data-dots={g.drawn} data-mark={g.S} style={{ position: "relative" }}>
              <text x={g.proX} y={15} textAnchor="middle" className="lbl">{P.odds.proRata}</text>
              {[0, 0.5, 1, 1.5, 2].map((v) => {
                const tx = Math.round(g.x(v)) + 0.5;
                return <text key={v} x={v === 0 ? 0 : v === 2 ? W : tx} y={g.base + 20} textAnchor={v === 0 ? "start" : v === 2 ? "end" : "middle"} className="ax">{`×${v}`}</text>;
              })}
            </svg>
          </>
        ) : null}
      </div>
      {s && !brief ? <p className="fine">{fill(P.odds.sample, { n: s.n.toLocaleString("en-US"), k: s.rounds })}</p> : null}
    </div>
  );
}

/** The smallest and the largest past scoop side by side in the identical style (one class, one size), then (not `brief`) the share below ×1 and the median. */
export function SwarmFacts({ s, brief = false, tail, size = "m" }: { s: PastScoops | null; brief?: boolean; tail?: ReactNode; size?: "m" | "l" }) {
  if (!s) return null;
  const pct = `${Math.round(s.below * 100)} %`;
  const num = size === "l" ? "num-l" : "num-m";
  return (
    <div className="pg-swarm-facts">
      <div className="pg-facts">
        <div className="pg-fact"><span className={num}>{formatMultiplier(s.min)}</span><span className="label">{P.odds.smallest}</span></div>
        <div className="pg-fact"><span className={num}>{formatMultiplier(s.max)}</span><span className="label">{P.odds.largest}</span></div>
        {tail ? <div className="tail">{tail}</div> : null}
      </div>
      {brief ? null : <p className="body">{fill(P.odds.below, { pct, median: formatMultiplier(s.median) })}</p>}
    </div>
  );
}

/** The beeswarm with its facts under it (/odds). */
export function PastDistribution({ height = H }: { height?: number }) {
  const s = usePastScoops();
  return (
    <div className="pg-col">
      <Swarm s={s} height={height} />
      <SwarmFacts s={s} />
    </div>
  );
}
