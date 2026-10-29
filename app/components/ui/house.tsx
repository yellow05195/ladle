"use client";

/**
 * The shared primitives (v21.1): the progress stem, a fact, the rolling
 * figure, the ladle mark, the round state tag and the link arrow. Keys,
 * wells and plates are plain classes (globals.css) on native elements.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "../../../config/brand";

/** v21.4 (perf): the fill glides on the compositor (transform), not by its width */
const GLIDE = "transform 400ms linear";
/**
 * The fill's offset (v21.4): the fill is the stem's whole length, moved left and clipped by the stem, its right end (the
 * ball) at max(h, p W) as the width and min-width fill had it. Before the stem is measured: the same within a few px.
 */
const offset = (p: number, size: { w: number; h: number } | null) => (size && size.w > 0
  ? `translateX(${(Math.max(size.h, p * size.w) - size.w).toFixed(2)}px)`
  : `translateX(calc(${((p - 1) * 100).toFixed(3)}% + ${(1 - p).toFixed(4)} * var(--h)))`);

/**
 * The progress stem: the ladle handle standing for time. A cream fill at
 * elapsed / total whose leading end is the saffron ball, the stem own
 * diameter; with nothing elapsed only the ball shows. Same progressbar role.
 * v21.4 (perf): the fill moves by transform. A slot is shorter than a glide,
 * so the stem glides nearly all the time; a width transition laid out and
 * painted the page on every frame of it.
 */
export function Stem({ elapsed, total = 92, thin = false, label = "Slots elapsed", className = "", instant = false }: { elapsed: number; total?: number; thin?: boolean; label?: string; className?: string; /** no transition at all (the loader: the counter beside it must agree with it every frame) */ instant?: boolean }) {
  const lit = Math.max(0, Math.min(total, Math.round(elapsed)));
  const p = lit / Math.max(1, total);
  const box = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);
  const prev = useRef(lit);
  // the stem's length and thickness, measured when its size changes (never on a tick); a resize moves the ball at once
  const size = useRef<{ w: number; h: number } | null>(null);
  const pNow = useRef(p);
  pNow.current = p;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let id = 0;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      if (size.current && size.current.w === r.width && size.current.h === r.height) return;
      size.current = { w: r.width, h: r.height };
      const f = fill.current;
      if (!f) return;
      f.style.transition = "none";
      f.style.transform = offset(pNow.current, size.current);
      void getComputedStyle(f).transform;
      cancelAnimationFrame(id);
      id = requestAnimationFrame(() => { f.style.transition = instant ? "none" : GLIDE; });
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(id); };
  }, [instant]);
  // forward ticks glide (400 ms linear); a new round (the fill shrinks) jumps, so the ball never runs backward
  useLayoutEffect(() => {
    const el = fill.current;
    const back = lit < prev.current;
    prev.current = lit;
    if (!el || instant || !back) return;
    el.style.transition = "none";
    void el.offsetWidth;
    const id = requestAnimationFrame(() => { el.style.transition = GLIDE; });
    return () => cancelAnimationFrame(id);
  }, [lit, instant]);
  return (
    <div ref={box} className={`stem ${thin ? "thin" : ""} ${className}`} style={{ overflow: "hidden" }} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={lit} aria-label={label}>
      <i ref={fill} style={{ width: "100%", transform: offset(p, size.current), transition: instant ? "none" : GLIDE, willChange: "transform" }} />
    </div>
  );
}
/** The v21 name, kept for callers being migrated: it draws the stem. */
export const Ruler = Stem;

/** A figure over its label. */
export function Fact({ value, unit, label, size = "m", className = "" }: { value: ReactNode; unit?: string; label: ReactNode; size?: "m" | "l"; className?: string }) {
  return (
    <div className={`fact ${className}`}>
      <span className={size === "l" ? "num-l" : "num-m"}>{value}{unit ? <span className="unit">{unit}</span> : null}</span>
      <span className="label">{label}</span>
    </div>
  );
}

/** The round state as a cream tag: open / sealed / drawing / served (the word crossfades). */
export function StateTag({ word }: { word: string }) {
  return <span key={word} className="state">{word}</span>;
}

/** The arrow after a navigation link: ink-3, 5 px after the word, it moves 2 px on hover. */
export function Arr({ ch = "→" }: { ch?: string }) {
  return <span className="arr" aria-hidden="true">{ch}</span>;
}

/** The advance of each digit 0-9 per (font, size, axes), measured once in the DOM (canvas ignores font-variation-settings). */
const advances = new Map<string, number[]>();
/** v21.4: measured while the webfont is still loading (the fallback's advances): shared until a font load ends, then measured again */
const early = new Map<string, number[]>();
let earlyHooked = false;
function digitAdvances(el: HTMLElement): number[] {
  const cs = getComputedStyle(el);
  const key = `${cs.fontStyle}|${cs.fontWeight}|${cs.fontSize}|${cs.fontFamily}|${cs.fontVariationSettings}|${cs.fontFeatureSettings}|${cs.letterSpacing}`;
  const hit = advances.get(key);
  if (hit) return hit;
  const loaded = document.fonts?.status === "loaded";
  const was = loaded ? undefined : early.get(key);
  if (was) return was;
  // v21.4: the ten digits side by side in one probe, read after one layout (was one layout per digit); each in its
  // own inline-block, so no digit is shaped (kerned) with its neighbour
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;";
  for (let d = 0; d < 10; d++) {
    const c = document.createElement("span");
    c.style.display = "inline-block";
    c.textContent = String(d);
    probe.appendChild(c);
  }
  el.appendChild(probe);
  const out = Array.from(probe.children, (c) => c.getBoundingClientRect().width);
  probe.remove();
  if (out.every((x) => x > 0)) {
    if (loaded) advances.set(key, out);
    else {
      early.set(key, out);
      if (!earlyHooked && document.fonts) { earlyHooked = true; document.fonts.addEventListener("loadingdone", () => early.clear()); }
    }
  }
  return out;
}

export type FigureMode = "roll" | "fade" | "swap";

/**
 * §8.25, revised in v21 r1. Each digit column is as wide as the digit it
 * shows (measured advances; with tabular figures every column is one width) and clipped
 * to its own line box. Three motions:
 * - "roll": a 0-9 strip moved by translateY, right to left; the duration
 *   follows the rhythm of the value (at most 180 ms, at most half the time
 *   since the last change), so the figure rests more than it moves;
 * - "fade": the changed digit is swapped and rises into place in 120 ms
 *   from a dim start (no second glyph ever overlaps it); kept for figures that
 *   change at most a couple of times a second;
 * - "swap": plain text, no motion: the countdown (it ticks about 4 times a
 *   second; tabular figures hold it still and the progress stem carries the
 *   motion, so the biggest figure on screen never blinks).
 * The value is read from an sr-only span.
 */
export function RollingFigure({ text, className = "", mode = "roll" }: { text: string; className?: string; mode?: FigureMode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [adv, setAdv] = useState<number[] | null>(null);
  const [st, setSt] = useState(() => ({ text, prev: text, gen: 0, at: 0, dur: 240 }));
  if (st.text !== text) {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const gap = st.at ? now - st.at : 1e9;
    setSt({ text, prev: st.text, gen: st.gen + 1, at: now, dur: Math.max(0, Math.min(180, Math.round(0.5 * gap))) });
  }
  useLayoutEffect(() => {
    if (mode !== "roll") return;
    const el = ref.current;
    if (!el) return;
    setAdv(digitAdvances(el));
    let alive = true;
    document.fonts?.ready.then(() => { if (alive && ref.current) setAdv(digitAdvances(ref.current)); }).catch(() => {});
    return () => { alive = false; };
  }, [mode]);
  if (mode === "swap") return <span className={`rfig ${className}`}>{text}</span>;
  const chars = text.split("");
  const prev = st.prev.split("");
  const digits = chars.filter((c) => c >= "0" && c <= "9").length;
  const dur = st.dur < 60 ? 0 : st.dur;
  let k = 0;
  return (
    <span ref={ref} className={`rfig ${className}`}>
      <span className="sr-only">{text}</span>
      <span className="rfig-box" aria-hidden="true">
        {chars.map((ch, i) => {
          const pos = chars.length - i;
          if (ch < "0" || ch > "9") return <span key={`c${pos}`} className="rfig-ch">{ch}</span>;
          const fromRight = digits - 1 - k++;
          if (mode === "fade") {
            const was = prev[prev.length - pos];
            const changed = st.gen > 0 && was !== ch;
            return (
              <span key={`d${pos}`} className="rfig-fcol">
                <span className="rfig-ghost">{ch}</span>
                <span key={`i${ch}`} className={`rfig-f ${changed ? "in" : ""}`}>{ch}</span>
              </span>
            );
          }
          const d = Number(ch);
          return (
            <span key={`d${pos}`} className="rfig-col" style={{ width: adv ? `${adv[d]}px` : undefined, transitionDuration: `${dur}ms` }}>
              <span className="rfig-ghost">{ch}</span>
              <span className="rfig-strip" style={{ transform: `translateY(${-d * 10}%)`, transitionDuration: `${dur}ms`, transitionDelay: dur ? `${fromRight * 20}ms` : "0ms" }}>
                {"0123456789".split("").map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/**
 * The ladle mark inline (§6): cream ink, the ball in saffron. Decorative.
 * `size` is the drawn height; the box is cropped to the symbol itself
 * (its 100 box holds it 80 high), so it sits on a text line like a glyph.
 */
export function Mark({ size = 16, className = "" }: { size?: number; className?: string }) {
  const m = BRAND.logo.mark;
  const s = Math.max(12, size);
  return (
    <svg className={className} width={Math.round((s * 64) / 84 * 10) / 10} height={s} viewBox="20 10 64 84" aria-hidden="true" focusable="false">
      <path d={m.ink} fill="var(--ink)" fillRule="nonzero" />
      <circle cx={m.ball.cx} cy={m.ball.cy} r={m.ball.r} fill="var(--saffron)" />
    </svg>
  );
}
