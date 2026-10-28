"use client";

/**
 * The loading screen, "Close on the drum" (v21.2). First visit of the session
 * on / or /play only. The loader is the hall itself: the camera waits close on
 * the brass drum, the house lamps down, while the rest of the room loads. A
 * still of that same shot (public/loader/) holds the first frames until the
 * live canvas is lit and dressed, then dissolves into it. The logo's ball,
 * the d's bowl, fills with saffron as the hall really loads (weighted
 * promises: fonts, environment, shell, cradle, cast, the first live window;
 * never a timer). Full: the ball sets, a tok, then the type lifts away, the
 * lamps come up and the camera pulls back to the first screen.
 */
import { useEffect, useRef, useState } from "react";
import { BRAND } from "../../config/brand";
import { useT } from "../i18n/client";
import { useLive } from "./live/LiveProvider";
import { hall, progressOf, useHall } from "./hall/store";
import { roundNum, sol2 } from "./hall/fmt";
import { play } from "../lib/sfx";

const KEY = "ladle.loaded";
const MIN_MS = 1800;       // the close shot is worth a breath even on a warm cache
const MAX_MS = 6500;       // past this the hall is shown as it is
const FACTS_MS = 400;
const HOLD_MS = 700;       // the full ball, before the pull-back
const EXIT_MS = 1250;
const HUD_MS = 720;        // into the 1200 ms pull-back (CameraRig: out of "emblem")
const W = BRAND.logo.word;
const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);

type Stage = "off" | "show" | "full" | "exit" | "gone";

export function Loader({ home }: { home: "home" | "room" }) {
  const t = useT();
  const { w, failed } = useLive();
  const p = useHall(progressOf);
  const loaded = useHall((s) => s.loaded);
  const live = useHall((s) => s.glReady && s.loaded.env && s.loaded.cradle);
  const [stage, setStage] = useState<Stage>("show");
  const [reduced, setReduced] = useState(false);
  const [factsAt, setFactsAt] = useState(0);
  const t0 = useRef(0);
  const homeRef = useRef(home);
  const target = useRef(0);
  target.current = p;

  // first visit of the session only (the head script hides the server markup on repeat visits)
  useEffect(() => {
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY); } catch { seen = false; }
    const home0 = homeRef.current;
    if (seen) { setStage("off"); hall.set({ lit: true, shot: hall.get().shot === "emblem" ? home0 : hall.get().shot }); document.documentElement.dataset.lit = "1"; return; }
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    t0.current = performance.now();
    document.documentElement.dataset.lit = "0";
    // the camera waits close on the drum (shots.ts "emblem"), lamps down
    hall.set({ shot: "emblem", emblem: null, lit: false });
    document.fonts?.ready.then(() => hall.markLoaded("fonts")).catch(() => hall.markLoaded("fonts"));
  }, []);

  // the page holds still under the loader (the tour reads the scroll position)
  useEffect(() => {
    if (stage !== "show" && stage !== "full") return;
    const stop = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => { if (SCROLL_KEYS.has(e.key)) e.preventDefault(); };
    window.addEventListener("wheel", stop, { passive: false });
    window.addEventListener("touchmove", stop, { passive: false });
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("wheel", stop); window.removeEventListener("touchmove", stop); window.removeEventListener("keydown", key); };
  }, [stage]);

  useEffect(() => { if ((w || failed) && !factsAt) setFactsAt(performance.now()); }, [w, failed, factsAt]);
  useEffect(() => { if (failed) hall.markLoaded("data"); }, [failed]);

  // ready: everything loaded, the facts read for a beat, the shot held for a breath; or the cap
  useEffect(() => {
    if (stage !== "show") return;
    const id = window.setInterval(() => {
      const now = performance.now(), el = now - t0.current;
      if (process.env.NODE_ENV !== "production" && /[?&]hold=1/.test(window.location.search)) return;
      const ready = target.current >= 0.999 && factsAt > 0 && now - factsAt >= FACTS_MS && el >= MIN_MS;
      if (!ready && el < MAX_MS) return;
      clearInterval(id);
      setStage("full");
      if (!reduced) play("tok");
    }, 50);
    return () => clearInterval(id);
  }, [stage, factsAt, reduced]);

  useEffect(() => {
    if (stage === "full") {
      const id = window.setTimeout(() => {
        try { sessionStorage.setItem(KEY, "1"); } catch { /* storage refused: the loader plays again next time */ }
        setStage("exit");
        hall.set({ lit: true, shot: homeRef.current });
      }, reduced ? 200 : HOLD_MS);
      return () => clearTimeout(id);
    }
    if (stage === "exit") {
      // the HUD, the top bar and the name tags come in as the camera lands, not over the close shot
      const lit = window.setTimeout(() => { document.documentElement.dataset.lit = "1"; }, reduced ? 0 : HUD_MS);
      const id = window.setTimeout(() => setStage("gone"), reduced ? 320 : EXIT_MS);
      return () => { clearTimeout(lit); clearTimeout(id); document.documentElement.dataset.lit = "1"; };
    }
  }, [stage, reduced]);

  if (stage === "off" || stage === "gone") return null;
  const fill = stage === "show" ? Math.min(0.96, p) : 1;
  const status = stage !== "show" ? t("h.load.lit") : !loaded.env ? t("h.load.env") : !loaded.cradle ? t("h.load.drum") : !loaded.cast ? t("h.load.cast") : t("h.load.data");
  const facts = failed ? t("h.load.failed") : w ? (w.entries.length ? t("h.load.facts", { n: roundNum(w.id), players: w.entries.length, pot: sol2(w.total) }) : t("h.load.factsNone", { n: roundNum(w.id) })) : "";
  const cls = ["lights", live ? "live" : "", stage === "full" ? "full" : "", stage === "exit" ? "exit" : "", reduced ? "reduced" : ""].join(" ");
  const b = W.ball;
  return (
    <div className={cls} aria-hidden="true" data-loader>
      <picture className="still">
        <source media="(max-width: 767px)" srcSet="/loader/still-tall.webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/loader/still-wide.webp" alt="" decoding="async" fetchPriority="high" />
      </picture>
      <div className="shade" />
      <div className="stack">
        <div className="word">
          <svg viewBox={W.viewBox} aria-hidden="true">
            <defs>
              <clipPath id="ldl-bowl"><circle cx={b.cx} cy={b.cy} r={b.r} /></clipPath>
            </defs>
            <path d={W.ink} fill="var(--ink)" />
            {/* the d's bowl is the ball: saffron rises in it with the load, then it sets */}
            <circle className="socket" cx={b.cx} cy={b.cy} r={b.r - 1.25} />
            <g clipPath="url(#ldl-bowl)">
              <rect className="soup" x={b.cx - b.r} y={b.cy - b.r} width={b.r * 2} height={b.r * 2} style={{ transform: `scaleY(${fill})` }} />
            </g>
          </svg>
        </div>
        <p className="status lede">{status}</p>
        <p className="facts-line label">{facts}</p>
      </div>
    </div>
  );
}
