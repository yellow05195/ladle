"use client";

/**
 * The home's scroll tour, its chapters (v21, restyled in v21.1 §7.17). Each
 * is a caption that scrolls over the live hall while the camera visits
 * what it talks about (tour.ts): the label ("1 of 8 · How a round plays"),
 * a Display L headline, the lede, one block (the beats with their discs,
 * facts, the ledger plate, the small curve, the swarm, the portraits, the
 * question plates), then one link to the inner page for the long version.
 * No card: type over its own feathered ground (tour.css) with the halo.
 * A chapter that shows demo figures ends with the demo line.
 *
 * Data: the sample, the curve and the books load once the hall is lit and
 * the browser is idle, never on a scroll frame; the curve and the books
 * then refresh only while their chapter is near the viewport.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DATA_SOURCE, getHistorySource } from "../../../lib/data";
import type { Books, CurvePoint, HistorySource, Phase } from "../../../lib/data/types";
import { plan } from "../../../lib/data/demo-plan";
import { playerColor } from "../../../lib/colors";
import { formatInt, formatSol } from "../../../lib/format";
import { listLocalProfiles, scarfIdOf } from "../../../lib/profile";
import { useLiveSelect } from "../../live/LiveProvider";
import { preloadPastScoops, Swarm, SwarmFacts, usePastScoops } from "../../PastDistribution";
import { Faq } from "../../fx/Faq";
import { RollingFigure } from "../../ui/house";
import { roundNum } from "../fmt";
import { portraitUrl, speciesOf } from "../pets";
import { useProfile } from "../profile/ProfileProvider";
import { hall } from "../store";
import { fill, P, TOUR_COPY as T } from "../sections/copy";
import { Arr, commas, DemoNote, Glossary, Head2 } from "../sections/kit";
import { useGenesis } from "../useHistory";
import { whenStill } from "./scroll";

/* ------------------------------ loading, off the scroll frame ------------------------------ */

let idleReady = false;
const idleWaiters = new Set<() => void>();
/** Resolves once the hall is lit and the browser has an idle moment while the page is not scrolling (v21.3). */
function whenIdle(cb: () => void): () => void {
  if (idleReady) { cb(); return () => {}; }
  idleWaiters.add(cb);
  if (idleWaiters.size === 1) {
    const go = () => {
      const fire = () => { idleReady = true; const ws = [...idleWaiters]; idleWaiters.clear(); ws.forEach((w) => w()); };
      whenStill(fire);
    };
    if (hall.get().lit) go();
    else {
      const off = hall.subscribe(() => { if (hall.get().lit) { off(); go(); } });
      // never wait for ever (no WebGL, reduced hall): load after 6 s anyway
      window.setTimeout(() => { if (!idleReady && idleWaiters.size) { off(); go(); } }, 6000);
    }
  }
  return () => { idleWaiters.delete(cb); };
}

function useIdle(): boolean {
  const [on, setOn] = useState(idleReady);
  useEffect(() => whenIdle(() => setOn(true)), []);
  return on;
}

/** True while the element is within `margin` of the viewport (updates both ways). */
function useNear(id: string, margin = "100% 0px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const io = new IntersectionObserver((es) => { for (const e of es) setNear(e.isIntersecting); }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [id, margin]);
  return near;
}

/** A history read: once when idle, then on curve changes only while `live` (the chapter is near). */
function useHistoryRead<T>(get: (src: HistorySource) => Promise<T>, live: boolean, ms: number): T | null {
  const idle = useIdle();
  const [v, setV] = useState<T | null>(null);
  const getRef = useRef(get);
  getRef.current = get;
  const src = useMemo(() => (typeof window === "undefined" ? null : getHistorySource()), []);
  useEffect(() => {
    if (!idle || !src) return;
    let alive = true;
    getRef.current(src).then((x) => { if (alive) setV(x); }).catch(() => {});
    return () => { alive = false; };
  }, [idle, src]);
  useEffect(() => {
    if (!idle || !live || !src?.subscribeCurve) return;
    let alive = true, t = 0;
    const load = () => getRef.current(src).then((x) => { if (alive) setV(x); }).catch(() => {});
    // the first refresh as the chapter comes near waits for an idle moment once the scroll has stopped, off the scroll
    // frame (verify r2: reading the history and re-rendering the chart there cost one 55-90 ms frame on the first scroll)
    const cancelFirst = whenStill(() => { if (alive) void load(); }, 1200);
    // later refreshes wait for the scroll to stop too
    let cancelLater = () => {};
    const off = src.subscribeCurve(() => { if (!t) t = window.setTimeout(() => { t = 0; cancelLater(); cancelLater = whenStill(() => { if (alive) void load(); }, 1200); }, ms); });
    return () => { alive = false; off(); if (t) clearTimeout(t); cancelFirst(); cancelLater(); };
  }, [idle, live, src, ms]);
  return v;
}

/* ------------------------------ the frame ------------------------------ */

/** One stop of the tour: the section, and the caption the camera frames against (`data-tour-stop`). */
export function Chapter({ id, side, label, children, wide = false }: { id: string; side: "left" | "right"; label: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className="tour-ch" data-side={side} aria-labelledby={`${id}-h`}>
      <div className="tour-in">
        <div id={id} className={`tour-cap ${wide ? "wide" : ""}`} data-tour-stop={id}>
          <span className="label">{label}</span>
          {children}
        </div>
      </div>
    </section>
  );
}

/** A figure over its label (§7.17 facts: Figure L, 30 px of air between pairs, no rules). */
function Fact({ v, l }: { v: ReactNode; l: ReactNode }) {
  return <div className="t-fact"><span className="num-l">{v}</span><span className="label">{l}</span></div>;
}

/** The one link that ends a chapter. */
function More({ href, children }: { href: string; children: ReactNode }) {
  return <div className="t-more"><Link href={href} className="act">{children}<Arr /></Link></div>;
}

/**
 * The tour's page furniture that is not a caption. fix:scroll:r3-2: the captions carry their own ground on every screen
 * (tour.css, .tour-cap::before: it scrolls with the text on the compositor); the two side scrims fixed to the viewport
 * that this drew are gone (between two close captions on opposite sides both stood at full and the hall went black).
 * What is left: it marks the footer in view, so the side index steps aside, and fades rows out under the top bar in
 * browsers without scroll-driven animations.
 */
export function TourScrim() {
  useEffect(() => {
    const root = document.documentElement;
    const foot = document.querySelector(".tour-foot");
    const fio = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) root.dataset.tourFoot = "1"; else delete root.dataset.tourFoot; } }, { rootMargin: "0px 0px -30% 0px" });
    if (foot) fio.observe(foot);
    return () => { fio.disconnect(); delete root.dataset.tourFoot; };
  }, []);
  // leaving under the top bar (tour.css): browsers without scroll-driven animations fade each row out with an IntersectionObserver
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: view()")) return;
    const root = document.documentElement;
    const tour = document.querySelector(".tour");
    if (!tour) return;
    root.dataset.goneJs = "";
    const SEL = ".tour-cap > :not(.t-beats, .t-faces, .t-ledger, .pg-qa, .pg-gloss), .tour-cap .t-beats > li, .tour-cap .t-faces > li, .tour-cap .t-ledger > div, .tour-cap .pg-qa > details, .tour-cap .pg-gloss > div";
    let io: IntersectionObserver | null = null, t = 0;
    const build = () => {
      io?.disconnect();
      const topH = parseFloat(getComputedStyle(root).getPropertyValue("--top-h")) || 72;
      const line = window.innerHeight < 780 ? 2 : 38; // the middle of tour.css's fade, under the bar
      io = new IntersectionObserver((es) => {
        for (const e of es) {
          const el = e.target as HTMLElement;
          // gone once its top has risen past the middle of the fade; back when it comes down again
          if (e.boundingClientRect.top < (e.rootBounds?.top ?? 0) && e.intersectionRatio < 1) el.dataset.gone = ""; else delete el.dataset.gone;
        }
      }, { rootMargin: `-${Math.round(topH + line)}px 0px 0px 0px`, threshold: [0, 1] });
      tour.querySelectorAll(SEL).forEach((el) => io!.observe(el));
    };
    build();
    // rows arrive later (the ledger, the faces): observe them as they do
    const mo = new MutationObserver((ms) => {
      if (!ms.some((m) => [...m.addedNodes].some((n) => n instanceof Element && (n.matches(SEL) || !!n.querySelector(SEL))))) return;
      clearTimeout(t); t = window.setTimeout(build, 120);
    });
    mo.observe(tour, { childList: true, subtree: true });
    const onResize = () => { clearTimeout(t); t = window.setTimeout(build, 200); };
    window.addEventListener("resize", onResize);
    return () => { io?.disconnect(); mo.disconnect(); clearTimeout(t); window.removeEventListener("resize", onResize); delete root.dataset.goneJs; };
  }, []);
  return null;
}

/* ------------------------------ the chapters ------------------------------ */

/** Which beat the round on the felt is in: join, seal, draw, serve. */
const BEAT: Record<Phase, number> = { open: 0, sealed: 1, seeded: 2, settled: 3, sold: 3 };

/** The four beats: a 38 px disc and its numeral, the title, one sentence. The beat the live round is in has the cream disc. */
function Beats() {
  // v21.3: re-renders when the beat changes, not on every live tick
  const live = useLiveSelect((w) => (w ? BEAT[w.phase] : -1));
  return (
    <ol className="t-beats">
      {T.how.beats.map((b, i) => (
        <li key={b.t} data-live={i === live ? "" : undefined} aria-current={i === live ? "step" : undefined}>
          <span className={`disc ${i === live ? "on" : ""}`} aria-hidden="true">{i + 1}</span>
          <div className="tx">
            <h3 className="title">{b.t}</h3>
            <p>{b.b}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** How a round plays: the drum. */
export function HowChapter() {
  return (
    <Chapter id="how" side="left" label={T.how.label}>
      <Head2 id="how-h" l1={P.how.l1} l2={P.how.l2} />
      <p className="lede">{P.how.lede}</p>
      <Beats />
      <More href="/odds">{P.how.odds}</More>
    </Chapter>
  );
}

/** The room: everyone on the felt, in arrival order. */
export function RoomChapter() {
  // the round on the felt (the one the camera sees), not the next one filling up; v21.3: re-renders when its count changes
  const key = useLiveSelect((w) => (w ? `${roundNum(w.id)}|${w.entries.length}` : ""));
  const r = key ? { n: key.slice(0, key.indexOf("|")), players: Number(key.slice(key.indexOf("|") + 1)) } : null;
  return (
    <Chapter id="room" side="right" label={T.room.label}>
      <Head2 id="room-h" l1={T.room.l1} l2={T.room.l2} />
      <p className="lede">{T.room.body}</p>
      <div className="t-facts">
        <Fact v={r ? <RollingFigure text={String(r.players)} /> : "·"} l={fill(T.room.players, { n: r?.n ?? "…" })} />
        <Fact v="60" l={T.room.seats} />
      </div>
      <DemoNote />
    </Chapter>
  );
}

/** The scoop: the ladle, and every past scoop. */
export function ScoopChapter() {
  const idle = useIdle();
  useEffect(() => { if (idle) preloadPastScoops(); }, [idle]);
  const s = usePastScoops(idle);
  return (
    <Chapter id="scoop" side="left" label={T.scoop.label}>
      <Head2 id="scoop-h" l1={P.odds.l1} l2={P.odds.l2} />
      <p className="lede">{T.scoop.body}</p>
      <Swarm s={s} height={136} mark={4} brief />
      <SwarmFacts s={s} brief size="l" />
      <More href="/odds">{P.odds.full}</More>
      <DemoNote />
    </Chapter>
  );
}

/**
 * A small step chart of the curve since round 1 (§7.19): the step path in
 * --ink-2, three --grid lines, and the now-dot (a 10 px cream disc ringed
 * in the ground) laid over the chart in HTML so it stays round at any width.
 */
function SmallCurve({ pts }: { pts: CurvePoint[] }) {
  const W = 480, Hh = 96;
  const d = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { lo = Math.min(lo, p.before, p.after); hi = Math.max(hi, p.before, p.after); }
    const pad = (hi - lo) * 0.12 || 0.001;
    lo -= pad; hi += pad;
    const n = pts.length;
    const x = (i: number) => (i / Math.max(1, n)) * (W - 8);
    const y = (v: number) => (1 - (v - lo) / (hi - lo)) * Hh;
    let s = `M0 ${y(pts[0]?.before ?? lo).toFixed(1)}`;
    pts.forEach((p, i) => { s += `H${x(i + 1).toFixed(1)}V${y(p.after).toFixed(1)}`; });
    const last = pts[pts.length - 1];
    return { s, nx: x(n), ny: last ? y(last.after) : Hh / 2 };
  }, [pts]);
  return (
    <div className="t-curve">
      <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" role="img" aria-label={P.curve.aria}>
        {[0.5, Hh / 2, Hh - 0.5].map((y) => <line key={y} x1={0} x2={W} y1={y} y2={y} stroke="var(--grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <path d={d.s} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="now" style={{ left: `${(d.nx / W) * 100}%`, top: `${(d.ny / Hh) * 100}%` }} aria-hidden="true"><i /><b className="label">{P.curve.now}</b></span>
    </div>
  );
}

const getCurve = (src: HistorySource) => src.getCurve();
const getBooks = (src: HistorySource) => src.getBooks();

/** The curve: the floor ticker. */
export function CurveChapter() {
  const near = useNear("curve");
  const pts = useHistoryRead<CurvePoint[]>(getCurve, near, 600);
  const now = pts?.length ? pts[pts.length - 1]!.after : null;
  const rounds = pts ? pts.filter((p) => p.kind === "buy").length : 0;
  return (
    <Chapter id="curve" side="right" label={T.curve.label}>
      <Head2 id="curve-h" l1={T.curve.l1} l2={T.curve.l2} />
      <p className="lede">{T.curve.body}</p>
      {pts?.length ? <SmallCurve pts={pts} /> : <div className="t-curve wait" aria-busy="true" />}
      {now != null ? <div className="t-facts"><Fact v={now.toFixed(4)} l={`${fill(T.curve.nowAfter, { n: formatInt(rounds) })}, ${T.curve.nowUnit}`} /></div> : null}
      <p className="fine">{P.curve.caption}</p>
      <DemoNote />
    </Chapter>
  );
}

/** Open books: the bear host keeps them; three ledger rows straight on the scrim, and the identity. */
export function BooksChapter() {
  const near = useNear("books");
  const b = useHistoryRead<Books>(getBooks, near, 1500);
  const s3 = (v: bigint) => commas(formatSol(v, 3));
  const fees = b ? b.platformFees + b.hostFees + b.keeperBounties : 0n;
  const rows = b ? [
    { k: T.books.entered, v: s3(b.solEntered) },
    { k: T.books.toCurve, v: s3(b.solToCurve) },
    { k: T.books.fees, v: s3(fees) },
  ] : [];
  const adds = b ? b.solEntered === b.solToCurve + fees : false;
  return (
    <Chapter id="books" side="left" label={T.books.label}>
      <Head2 id="books-h" l1={P.books.title} />
      <p className="lede">{T.books.body}</p>
      {b ? (
        <dl className="t-ledger">
          {rows.map((r) => (
            <div key={r.k}><dt>{r.k}</dt><dd><span className="num-m">{r.v}</span><span className="unit">SOL</span></dd></div>
          ))}
        </dl>
      ) : <div className="t-ledger wait" aria-busy="true" />}
      {adds ? <p className="ui t-identity">{T.books.identity}</p> : null}
      <More href="/window/latest#recompute">{T.books.rcp}</More>
      <DemoNote />
    </Chapter>
  );
}

/** Hosts: the stands and the door. */
export function HostsChapter() {
  return (
    <Chapter id="hosts" side="right" label={T.hosts.label}>
      <Head2 id="hosts-h" l1={P.host.l1} l2={P.host.l2} />
      <p className="lede">{P.host.body}</p>
      <Glossary rows={T.hosts.cmds} />
      <div className="t-more two"><Link href="/integrate" className="act">{P.host.integrate}<Arr /></Link><Link href="/integrate#founding" className="act">{T.hosts.foundingLink}<Arr /></Link></div>
    </Chapter>
  );
}

interface Face { name: string; src: string }
function demoRow(k: number): Face[] {
  const out: Face[] = [];
  const seen = new Set<string>();
  for (let n = 1; out.length < k && n < 400; n += 3) {
    for (const e of plan(n).entries) {
      if (seen.has(e.label)) continue;
      seen.add(e.label);
      out.push({ name: e.label, src: portraitUrl(speciesOf(e.owner), scarfIdOf(playerColor(e.label))) });
      if (out.length >= k) break;
    }
  }
  return out;
}

/** Genesis: close on the scarves. */
export function GenesisChapter() {
  const g = useGenesis();
  const { takeSeat } = useProfile();
  const [faces, setFaces] = useState<Face[]>([]);
  useEffect(() => {
    if (DATA_SOURCE !== "demo") return;
    const mine = listLocalProfiles().filter((p) => p.source === "demo").map((p) => ({ name: p.nickname, src: portraitUrl(p.species, scarfIdOf(p.scarf)) }));
    setFaces([...demoRow(6 - Math.min(2, mine.length)), ...mine.slice(0, 2)]);
  }, [g]);
  return (
    <Chapter id="genesis" side="left" label={T.gen.label}>
      <Head2 id="genesis-h" l1={T.gen.l1} l2={T.gen.l2} />
      <p className="lede">{P.gen.note}</p>
      {g ? <div className="t-facts"><Fact v={<>{formatInt(g.claimed)}<span className="unit">{"\u202F/\u00A0"}{formatInt(g.cap)}</span></>} l={P.gen.claimed} /></div> : null}
      {faces.length ? (
        <ol className="t-faces" aria-label={P.gen.aria}>
          {faces.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="face">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} alt="" width={56} height={56} loading="lazy" decoding="async" />
              </span>
              <span className="nm">{f.name}</span>
              <span className="fine">No. {String(i + 1).padStart(4, "0")}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="t-more"><button type="button" className="key sec s" onClick={takeSeat}>{P.gen.make}</button></div>
      <DemoNote />
    </Chapter>
  );
}

/** Questions: the whole room, dimmed, behind five question rows (no plates); every other question is on /about. */
export function QuestionsChapter({ items }: { items: ReadonlyArray<{ q: string; a: string }> }) {
  return (
    <Chapter id="questions" side="right" label={T.qa.label}>
      <Head2 id="questions-h" l1={P.qa.l1} l2={P.qa.l2} />
      <Faq items={items} />
      <More href="/about#questions">{P.qa.more}</More>
    </Chapter>
  );
}
