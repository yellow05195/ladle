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
 *
 * perf v21.4 (F4): the still dissolves only over a warm hall (glReady: the
 * WarmGate sets it once every program is linked under the final environment)
 * and the exit waits for it: past MAX_MS, up to WARM_MS more. At that cap the
 * type lifts and the HUD comes up over the still, which holds under it until
 * the hall can be shown; the camera never pulls back into a hall that is
 * still compiling. The face (the only part that reads the live window) is
 * unmounted with the loader: nothing here re-renders on a data tick after.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "../../config/brand";
import { useT } from "../i18n/client";
import { useLive } from "./live/LiveProvider";
import { hall, progressOf, useHall, type HallState } from "./hall/store";
import { roundNum, sol2 } from "./hall/fmt";
import { play } from "../lib/sfx";

const KEY = "ladle.loaded";
const MIN_MS = 1800;       // the close shot is worth a breath even on a warm cache
const MAX_MS = 6500;       // past this the hall is shown as it is, once warm
const WARM_MS = 3000;      // past MAX_MS, the hall's programs get this long; then the HUD comes up over the still
const FACTS_MS = 400;
const HOLD_MS = 700;       // the full ball, before the pull-back
const EXIT_MS = 1250;
const HUD_MS = 720;        // into the 1200 ms pull-back (CameraRig: out of "emblem")
const W = BRAND.logo.word;
const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);

type Stage = "off" | "show" | "full" | "exit" | "gone";

/** the hall's programs are linked (F1: the WarmGate sets glReady with warm), or there is no live hall to wait for (the poster tier) */
const warmOf = (s: HallState) => s.warm || s.glReady || s.quality === "none";
/** the live canvas can take the still's place: warm, under its environment, the drum on its cradle */
const liveOf = (s: HallState) => s.glReady && s.loaded.env && s.loaded.cradle;

export function Loader({ home }: { home: "home" | "room" }) {
  const [stage, setStage] = useState<Stage>("show");
  const [reduced, setReduced] = useState(false);
  const [factsAt, setFactsAt] = useState(0);
  // F4: the exit came before the hall could be shown: the HUD comes up over the still (`under`), which holds until it can
  const [held, setHeld] = useState(false);
  const [under, setUnder] = useState(false);
  const heldRef = useRef(false);
  heldRef.current = held;
  const t0 = useRef(0);
  const homeRef = useRef(home);
  const onFacts = useCallback(() => setFactsAt((v) => v || performance.now()), []);

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

  // ready: everything loaded and the hall warm, the facts read for a beat, the shot held for a breath; or the cap (past
  // MAX_MS once warm, past MAX_MS + WARM_MS in any case)
  useEffect(() => {
    if (stage !== "show") return;
    const id = window.setInterval(() => {
      const now = performance.now(), el = now - t0.current;
      if (process.env.NODE_ENV !== "production" && /[?&]hold=1/.test(window.location.search)) return;
      const s = hall.get(), warm = warmOf(s);
      const ready = progressOf(s) >= 0.999 && warm && factsAt > 0 && now - factsAt >= FACTS_MS && el >= MIN_MS;
      if (!ready && (el < MAX_MS || (!warm && el < MAX_MS + WARM_MS))) return;
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
        // the hall cannot be shown yet (still compiling, or its environment or cradle late): the lamps come up, the shot
        // stays on the drum under the still until it can (the poster tier has nothing to wait for)
        const s = hall.get();
        if (!liveOf(s) && s.quality !== "none") { setHeld(true); hall.set({ lit: true }); }
        else hall.set({ lit: true, shot: homeRef.current });
      }, reduced ? 200 : HOLD_MS);
      return () => clearTimeout(id);
    }
    if (stage === "exit") {
      // the HUD, the top bar and the name tags come in as the camera lands, not over the close shot (held: over the still,
      // which drops under them)
      const lit = window.setTimeout(() => { document.documentElement.dataset.lit = "1"; if (heldRef.current) setUnder(true); }, reduced ? 0 : HUD_MS);
      return () => { clearTimeout(lit); document.documentElement.dataset.lit = "1"; };
    }
  }, [stage, reduced]);

  // the loader goes once the still has dissolved: EXIT_MS from the exit, or from the release when held
  useEffect(() => {
    if (stage !== "exit" || held) return;
    const id = window.setTimeout(() => setStage("gone"), reduced ? 320 : EXIT_MS);
    return () => clearTimeout(id);
  }, [stage, reduced, held]);

  // held: once the hall can be shown, the still dissolves into it and the camera pulls back to the first screen
  useEffect(() => {
    if (!held) return;
    const go = () => {
      if (!liveOf(hall.get())) return;
      off();
      if (hall.get().shot === "emblem") hall.set({ shot: homeRef.current });
      setHeld(false);
    };
    const off = hall.subscribe(go);
    go();
    return off;
  }, [held]);

  if (stage === "off" || stage === "gone") return null;
  return <LoaderFace stage={stage} reduced={reduced} under={under} onFacts={onFacts} />;
}

/** The loader on screen: the only part that reads the live window and the load state (unmounted with the loader). */
function LoaderFace({ stage, reduced, under, onFacts }: { stage: Stage; reduced: boolean; under: boolean; onFacts: () => void }) {
  const t = useT();
  const { w, failed } = useLive();
  const p = useHall(progressOf);
  const loaded = useHall((s) => s.loaded);
  const live = useHall(liveOf);
  const told = useRef(false);

  useEffect(() => { if ((w || failed) && !told.current) { told.current = true; onFacts(); } }, [w, failed, onFacts]);
  useEffect(() => { if (failed) hall.markLoaded("data"); }, [failed]);

  const fill = stage === "show" ? Math.min(0.96, p) : 1;
  const status = stage !== "show" ? t("h.load.lit") : !loaded.env ? t("h.load.env") : !loaded.cradle ? t("h.load.drum") : !loaded.cast ? t("h.load.cast") : t("h.load.data");
  // chain mode with no round taking entries (none yet, closing, keeper late, RPC lost): say nothing here, the HUD names the halt
  const facts = failed ? t("h.load.failed") : w && !w.halt ? (w.entries.length ? t("h.load.facts", { n: roundNum(w.id), players: w.entries.length, pot: sol2(w.total) }) : t("h.load.factsNone", { n: roundNum(w.id) })) : "";
  const cls = ["lights", live ? "live" : "", stage === "full" ? "full" : "", stage === "exit" ? "exit" : "", reduced ? "reduced" : ""].join(" ");
  const b = W.ball;
  return (
    <div className={cls} aria-hidden="true" data-loader style={under ? UNDER : undefined}>
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

/** held past the cap: the still sits on the hall's stage (z 0, after it in the page), under the HUD and the tour */
const UNDER = { zIndex: 0 } as const;
