"use client";

/**
 * The loading screen, "Lights up" (v21, §9.1; v21.1 §7.25: the progress stem, roman type). First visit of the session on
 * / or /play only. Velvet curtains hung from a brass rod, one warm cone, and
 * the real wordmark (BRAND.logo.word, never typeset) filling from an
 * outline as the hall really loads: the fill's top edge is a soft sine
 * rising with the weighted progress of real promises (fonts, environment,
 * shell, cradle, cast, the first live window), never a timer. At 100 % the
 * saffron ball drops into the d's bowl; that drop is the final beat. Then
 * the stack lifts away, the curtains part and the camera dollies down.
 */
import { useEffect, useRef, useState } from "react";
import { BRAND } from "../../config/brand";
import { useT } from "../i18n/client";
import { useLive } from "./live/LiveProvider";
import { hall, progressOf, useHall } from "./hall/store";
import { lastLocalProfile, scarfIdOf } from "../lib/profile";
import { portraitUrl } from "./hall/pets";
import { roundNum, sol2 } from "./hall/fmt";
import { Stem } from "./ui/house";
import { play } from "../lib/sfx";

const KEY = "ladle.loaded";
const MIN_MS = 900;
const MAX_MS = 2600;
const FACTS_MS = 500;
const W = BRAND.logo.word;
const TOP = 5, H = 86;

type Stage = "off" | "show" | "drop" | "exit" | "open" | "gone";

export function Loader({ home }: { home: "home" | "room" }) {
  const t = useT();
  const { w, failed } = useLive();
  const p = useHall(progressOf);
  const loaded = useHall((s) => s.loaded);
  const [stage, setStage] = useState<Stage>("show");
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState(0);
  const [factsAt, setFactsAt] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [peek, setPeek] = useState<string>(() => portraitUrl("fox", "saffron"));
  const [peekFail, setPeekFail] = useState(false);
  const t0 = useRef(0);
  const wordRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef(home);
  const target = useRef(0);
  target.current = p;

  // first visit of the session only (the head script hides the server markup on repeat visits)
  useEffect(() => {
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY); } catch { seen = false; }
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(rm);
    const home0 = homeRef.current;
    if (seen) { setStage("off"); hall.set({ lit: true, shot: hall.get().shot === "emblem" ? home0 : hall.get().shot }); document.documentElement.dataset.lit = "1"; return; }
    t0.current = performance.now();
    document.documentElement.dataset.lit = "0";
    hall.set({ shot: rm ? home0 : "emblem", lit: false });
    document.fonts?.ready.then(() => hall.markLoaded("fonts")).catch(() => hall.markLoaded("fonts"));
    const prof = lastLocalProfile();
    if (prof) setPeek(portraitUrl(prof.species, scarfIdOf(prof.scarf)));
  }, []);

  // the word's box, for the 3D emblem shot to sit where the word is
  useEffect(() => {
    if (stage !== "show") return;
    const put = () => { const r = wordRef.current?.getBoundingClientRect(); if (r) hall.set({ emblem: { cy: r.top + r.height / 2, h: r.height * 1.3 } }); };
    put();
    window.addEventListener("resize", put);
    return () => window.removeEventListener("resize", put);
  }, [stage]);

  // the fill eases toward the real progress; the surface drifts (one rAF loop while the loader shows)
  useEffect(() => {
    // only while filling: once the ball drops the word stays full (a late progress value never drains it)
    if (stage !== "show") return;
    let raf = 0;
    const step = (now: number) => {
      setShown((s) => { const d = target.current - s; return Math.abs(d) < 0.002 ? target.current : s + d * 0.16; });
      setPhase(now / 260);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  useEffect(() => { if ((w || failed) && !factsAt) setFactsAt(performance.now()); }, [w, failed, factsAt]);
  useEffect(() => { if (failed) hall.markLoaded("data"); }, [failed]);

  // full: the ball drops (280 ms in, 80 ms squash, 120 ms settle), a 600 ms hold, then the exit
  useEffect(() => {
    if (stage !== "show") return;
    const id = window.setInterval(() => {
      const now = performance.now(), el = now - t0.current;
      if (process.env.NODE_ENV !== "production" && /[?&]hold=1/.test(window.location.search)) return;
      const ready = target.current >= 0.999 && shown >= 0.995 && factsAt && now - factsAt >= FACTS_MS && el >= MIN_MS;
      if (!ready && el < MAX_MS) return;
      clearInterval(id);
      setShown(1);
      setStage("drop");
      if (!reduced) window.setTimeout(() => play("tok"), 260);
    }, 50);
    return () => clearInterval(id);
  }, [stage, factsAt, reduced, shown]);

  useEffect(() => {
    if (stage !== "drop") return;
    const hold = reduced ? 300 : 480 + 600;
    const id = window.setTimeout(() => {
      try { sessionStorage.setItem(KEY, "1"); } catch { /* storage refused: the loader plays again next time */ }
      if (reduced) {
        setStage("open");
        hall.set({ lit: true, shot: homeRef.current });
        document.documentElement.dataset.lit = "1";
        window.setTimeout(() => setStage("gone"), 320);
        return;
      }
      setStage("exit");
      window.setTimeout(() => {
        setStage("open");
        hall.set({ lit: true, shot: homeRef.current });
        document.documentElement.dataset.lit = "1";
        window.setTimeout(() => setStage("gone"), 1000);
      }, 320);
    }, hold);
    return () => clearTimeout(id);
  }, [stage, reduced]);

  if (stage === "off" || stage === "gone") return null;
  const fill = stage === "show" ? shown : 1;
  const lit = Math.round(fill * 92);
  const status = !loaded.env ? t("h.load.env") : !loaded.cradle ? t("h.load.drum") : !loaded.cast ? t("h.load.cast") : t("h.load.data");
  const facts = failed ? t("h.load.failed") : w ? (w.entries.length ? t("h.load.facts", { n: roundNum(w.id), players: w.entries.length, pot: sol2(w.total) }) : t("h.load.factsNone", { n: roundNum(w.id) })) : "";
  // the soup's surface: y = top + (1 - p)·h + 3·sin(x/12 + t)
  const y0 = TOP + (1 - fill) * H;
  let d = `M-4 ${H + 20}`;
  for (let x = -4; x <= W.w + 4; x += 4) d += `L${x} ${(y0 + (fill >= 1 ? 0 : 3 * Math.sin(x / 12 + phase))).toFixed(2)}`;
  d += `L${W.w + 4} ${H + 20}Z`;
  const cls = ["lights", stage === "exit" ? "exit" : "", stage === "open" ? (reduced ? "fade" : "exit open") : "", reduced ? "reduced" : ""].join(" ");
  return (
    <div className={cls} aria-hidden="true" data-loader>
      <div className="cone" />
      <div className="rod" />
      <div className="curtain l"><span className="rings" aria-hidden="true"><i /><i /><i /></span></div>
      <div className="curtain r"><span className="rings" aria-hidden="true"><i /><i /><i /></span></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!peekFail ? <img className={`peek ${reduced || p >= 0.3 || stage !== "show" ? "on" : ""}`} src={peek} alt="" width={120} height={120} onError={() => setPeekFail(true)} /> : null}
      <div className="stack">
        <div ref={wordRef} className="word">
          <svg viewBox={W.viewBox} aria-hidden="true">
            <defs>
              <mask id="ldl-soup" maskUnits="userSpaceOnUse" x="-10" y="-50" width={W.w + 20} height={W.h + 70}>
                <path d={d} fill="#fff" />
              </mask>
            </defs>
            <path d={W.ink} fill="none" stroke="var(--ink)" strokeWidth={1.5} opacity={0.55} />
            <path d={W.ink} fill="var(--ink)" mask="url(#ldl-soup)" />
            {stage !== "show" ? (
              <g className={`ball-drop ${reduced ? "still" : ""}`}>
                <circle cx={W.ball.cx} cy={W.ball.cy} r={W.ball.r} fill="var(--saffron)" />
              </g>
            ) : null}
          </svg>
        </div>
        <div className="stem-row">
          <Stem elapsed={lit} label="Loading" />
          <span className="count"><span className="num-m">{lit}</span><small>/ 92</small></span>
        </div>
        <p className="status lede">{status}</p>
        <p className="facts-line label">{facts}</p>
      </div>
    </div>
  );
}
