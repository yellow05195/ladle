"use client";

/**
 * The shared primitives (v21.1): the progress stem, a fact, the rolling
 * figure, the ladle mark, the round state tag and the link arrow. Keys,
 * wells and plates are plain classes (globals.css) on native elements.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "../../../config/brand";

/**
 * The progress stem: the ladle handle standing for time. A cream fill at
 * elapsed / total whose leading end is the saffron ball, the stem own
 * diameter; with nothing elapsed only the ball shows. Same progressbar role.
 */
export function Stem({ elapsed, total = 92, thin = false, label = "Slots elapsed", className = "" }: { elapsed: number; total?: number; thin?: boolean; label?: string; className?: string }) {
  const lit = Math.max(0, Math.min(total, Math.round(elapsed)));
  return (
    <div className={`stem ${thin ? "thin" : ""} ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={lit} aria-label={label}>
      <i style={{ width: `${(100 * lit) / Math.max(1, total)}%` }} />
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
function digitAdvances(el: HTMLElement): number[] {
  const cs = getComputedStyle(el);
  const key = `${cs.fontStyle}|${cs.fontWeight}|${cs.fontSize}|${cs.fontFamily}|${cs.fontVariationSettings}|${cs.fontFeatureSettings}|${cs.letterSpacing}`;
  const hit = advances.get(key);
  if (hit) return hit;
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;";
  el.appendChild(probe);
  const out: number[] = [];
  for (let d = 0; d < 10; d++) { probe.textContent = String(d); out.push(probe.getBoundingClientRect().width); }
  probe.remove();
  if (document.fonts?.status === "loaded" && out.every((x) => x > 0)) advances.set(key, out);
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
 *   from a dim start (no second glyph ever overlaps it), for figures that
 *   tick several times a second (the countdown);
 * - "swap": plain text, no motion.
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
