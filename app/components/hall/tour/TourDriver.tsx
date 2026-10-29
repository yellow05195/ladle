"use client";

/**
 * The home's scroll tour, its driver (v21, v21.3). It subscribes to the hall's
 * one scroll reader (scroll.ts): on every scroll event it stores the scroll y
 * and the tour position it maps to on the tour bus (the camera rig follows it
 * in useFrame), dims the hall for the questions and the footer and keeps the
 * side index on the current stop. Writes only; layout is read when the page
 * is measured (load, a width change, the content's height changing), never
 * on a scroll frame.
 *
 * Jumps the reader did not scroll by hand: the side index and the Home and
 * End keys glide the page and the camera together along the path (one ease,
 * one duration) or, when the stop is far, cut behind the veil. A scroll the
 * reader did not make that moves the tour far in one step (a restored scroll,
 * an anchor link, find in page) cuts behind a short dip of the veil. Under
 * reduced motion the camera holds a stop and the veil dips, scrubbed by the
 * scroll itself, while it changes to the next: never a timed flash.
 *
 * fix:scroll:r3: the reader's own scrolling never darkens the hall (the
 * fling's dip is gone, and the veil's cut needs a scroll that was not
 * theirs). The page glides under a mouse wheel and the paging keys
 * (scroll.ts), and the chapters' heights are sized from the path (measure):
 * each leg gets scroll in proportion to how far it moves the picture, so the
 * camera keeps one pace from the first screen to the questions.
 *
 * fix:scroll:r3-2: a jump the reader did not scroll by hand that is not far
 * enough to cut (a link Tab focused and the browser scrolled into view) is
 * glided by the camera along the path, like the side index's.
 */
import { useEffect, useRef } from "react";
import { hall } from "../store";
import { TOUR, TOUR_HOLD, tourAt, tourBus, tourMode, tourSAt, tourStopS } from "../tour";
import { TOUR_COPY as T } from "../sections/copy";
import { innerScroller, isScrollKey, onScrollInput, onScrollY, pageLocked, rescroll, scrollState, smoothScroll } from "./scroll";

const LABELS: Record<string, string> = { how: T.how.index, room: T.room.index, scoop: T.scoop.index, curve: T.curve.index, books: T.books.index, hosts: T.hosts.index, genesis: T.gen.index, questions: T.qa.index };
const STOPS = TOUR.slice(1).map((s) => s.id);
const LAST = TOUR.length - 1;
/**
 * a jump farther than this share of the whole path (its perceptual length, tour.ts) cuts behind the veil; a nearer one
 * glides, 0.5 s plus 3.2 s per whole path (0.6 to 1.6 s)
 */
const JUMP_CUT = 0.31;
/** a scroll the reader did not make that moves the tour farther than this share of the path in one step cuts behind the veil */
const SKIP_CUT = 0.17;

/**
 * fix:scroll:r3, the chapters' heights. Every leg's scroll is sized from how far it moves the picture (tour.ts), so
 * the camera's pace per pixel is the same on every leg; the whole tour keeps about the page's length it had (TOTAL,
 * viewport heights). A leg is never shorter than its captions need (each wholly read, PB_MIN of air after it, PT
 * before the next) nor longer than LEG_MAX viewports. Portrait: the camera holds the first screen's shot while the
 * playbill still covers the hall (HOLD0 of the first leg), then travels; its first three legs are held at their
 * captions' minimum, so its tour is a little longer than before (14.3 viewports, was 13.5) to bring the other legs down
 * to their pace (picture flow per 100 px within 1.5x on every leg, r3/layout.mjs and r3/perf/an3.mjs).
 */
const TOTAL = { desk: 13.3, port: 14.3 };
const LEG_MAX = 4.2;
const PT = { desk: 0.08, port: 0.44 }, PB_MIN = { desk: 0.06, port: 0.04 }, PT1_MIN = { desk: 0.06, port: 0.5 };
const HOLD0 = { desk: 0, port: 0.4 };
/** the cruise pace over the mean pace of a leg (tour.ts tourAt's trapezoid): the first leg's on desktop has no ramp in */
const CRUISE = 1 / (1 - 0.2), CRUISE0 = 1 / (1 - 0.1);

const ease = (k: number) => k * k * (3 - 2 * k);
/** v25.1: a page's move: a cubic ease in and out (no jolt at either end) */
const easePage = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function TourDriver() {
  const nav = useRef<HTMLElement>(null);
  const jumpRef = useRef<(y: number) => void>(() => {});
  useEffect(() => {
    hall.set({ tour: true });
    tourBus.on = true;
    const root = document.documentElement;
    root.dataset.tour = "1";
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const veil = document.querySelector<HTMLElement>(".hall-stage .hall-veil");
    let anchors: number[] = [0];
    let holds: number[] = [0];
    let lastAt = -1, lastVeil = -1, measured = false, alive = true;
    /** the veil is in a timed move (a jump's dip): the scroll leaves it alone */
    let veilBusy = 0;
    /** the page is gliding to a jump's stop */
    let glide = 0;
    let jumpId = 0;
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => { timers.push(window.setTimeout(() => { if (alive) f(); }, ms)); };
    const mode = () => tourMode(scrollState.vw || window.innerWidth, scrollState.vh || window.innerHeight);
    const sAt = (q: number) => tourSAt(q, mode());
    const pathLen = () => { const S = tourStopS(mode()); return S[S.length - 1]! || 1; };

    // v25.1, paging: on a landscape screen, one turn of the wheel (or a swipe of a trackpad, or a paging key) takes the
    // page and the camera to the next chapter (or back to the one before) in one eased move; what the reader sends while
    // it travels is spent on it (no queue, no drift, the camera never left between two stops). Portrait screens (a finger,
    // captions taller than the screen) and reduced motion keep the page's own scroll. fix:scroll:r3's glide stays for
    // those landscape cases paging leaves alone (none today).
    const pagingOn = () => !mq.matches && mode() === "desk";
    let paging = pagingOn();
    let offGlide = smoothScroll(!mq.matches && !paging);
    const onMq = () => { paging = pagingOn(); offGlide(); offGlide = smoothScroll(!mq.matches && !paging); };
    mq.addEventListener?.("change", onMq);

    const setVeil = (v: number) => {
      if (!veil || veilBusy || Math.abs(v - lastVeil) < 0.004) return;
      lastVeil = v;
      veil.style.opacity = v.toFixed(3);
    };
    /** a timed veil move (ms), then the scroll owns it again */
    const veilTo = (v: number, ms: number, curve: string, then?: () => void) => {
      if (!veil) { then?.(); return; }
      const id = ++veilBusy;
      veil.style.transition = `opacity ${ms}ms ${curve}`;
      veil.style.opacity = v.toFixed(3);
      lastVeil = v;
      later(ms + 20, () => { if (veilBusy !== id) return; veil.style.transition = ""; veilBusy = 0; then?.(); });
    };
    /** the hall dims for the questions and the footer */
    const dim = (t: number) => Math.min(1, Math.max(0, t - (LAST - 1))) * 0.42;
    /** reduced motion: the stop on screen (it changes halfway through a leg's travel) and the veil's scrubbed dip around that point */
    const reducedAt = (t: number) => {
      const i = Math.floor(t), f = t - i;
      const stop = f < 0.5 ? i : i + 1;
      const d = Math.abs(f - 0.5);
      const dip = f > 0 && f < 1 ? 0.92 * (1 - Math.min(1, Math.max(0, (d - 0.06) / 0.3))) : 0;
      return { stop: Math.min(LAST, stop), veil: Math.max(dim(stop), dip) };
    };

    /** quiet: a measure, not a scroll (the anchors moved under the camera: it follows them, no cut) */
    let lastY = scrollState.y;
    const onY = (y: number, quiet = false) => {
      tourBus.y = y;
      const prev = tourBus.target;
      const t = tourAt(y, anchors, holds);
      tourBus.target = t;
      const step = Math.abs(y - lastY);
      lastY = y;
      // a scroll the reader did not make that moves the tour far in one step (a restored scroll, an anchor link): one
      // cut behind a short dip, never a run through every stop. fix:scroll:r3: never the reader's own scrolling, at any
      // speed (a fling, a Page Down, a slow frame that bunches a fast scroll into one step): it rides the path.
      // fix:scroll:r3-2: a nearer one (a link Tab focused, scrolled into view by the browser: 600 to 3300 px at once) is a
      // jump too: the camera rides the path there from its own pace (the side index's glide, the page already there)
      // instead of the follow's 0.3 s whip through a leg or two
      if (!quiet && !scrollState.reader && !glide && !veilBusy && !mq.matches && tourBus.fly >= 1) {
        const dS = Math.abs(sAt(t) - sAt(prev)) / pathLen();
        if (dS > JUMP_CUT || (dS > SKIP_CUT && !hall.get().lit)) {
          tourBus.snap = true;
          tourBus.jump = null;
          if (hall.get().lit && veil) {
            veil.style.transition = "none";
            veil.style.opacity = "0.9";
            lastVeil = 0.9;
            void veil.offsetWidth;
            veilTo(dim(t), 320, "cubic-bezier(0.2, 0, 0, 1)");
          }
        } else if (dS > SKIP_CUT || (step > 0.6 * (scrollState.vh || window.innerHeight) && Math.abs(t - tourBus.t) > 0.02)) {
          const d = Math.abs(sAt(t) - sAt(tourBus.t)) / pathLen();
          tourBus.jump = { id: ++jumpId, to: t, t0: performance.now(), dur: Math.min(1.6, Math.max(0.6, 0.5 + d * 3.2)) };
        }
      }
      const at = Math.round(t);
      if (at !== lastAt) {
        lastAt = at;
        const el = nav.current;
        if (el) {
          el.dataset.on = at >= 1 && at <= LAST ? "1" : "0";
          el.querySelectorAll<HTMLElement>("a").forEach((a, i) => { if (i + 1 === at) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
        }
      }
      if (mq.matches) {
        const r = reducedAt(t);
        tourBus.cut = r.stop;
        setVeil(r.veil);
      } else setVeil(dim(t));
    };

    // where each stop is reached: the caption sits where it is read
    let mw = 0, mh = 0;
    /** fix:scroll:r3: the sizes written last (px): the first chapter's top padding, every chapter's bottom padding */
    const written: number[] = [];
    const secs: HTMLElement[] = [];
    const caps: HTMLElement[] = [];
    for (const id of STOPS) {
      const el = document.querySelector<HTMLElement>(`[data-tour-stop="${id}"]`);
      const sec = el?.closest<HTMLElement>(".tour-ch");
      if (el && sec) { caps.push(el); secs.push(sec); }
    }
    const sized = caps.length === STOPS.length;
    const measure = () => {
      const vw = window.innerWidth, vh0 = window.innerHeight;
      // a phone's toolbar showing or hiding changes the height only, by less than a fifth: the anchors stay
      const vh = mw === vw && mh && Math.abs(vh0 - mh) < 0.2 * mh ? mh : vh0;
      mw = vw; mh = vh;
      const md = tourMode(vw, vh), port = md === "port";
      // the band the text is read in: under the top bar, above the conserved rail
      const cs = getComputedStyle(root);
      const topH = parseFloat(cs.getPropertyValue("--top-h")) || 72;
      const railH = document.querySelector<HTMLElement>(".conserved")?.offsetHeight ?? 48;
      const band = vh - topH - railH;
      // a caption's anchor from its top: desktop, centred in the band beside the subject (a caption taller than the band
      // starts just under the top bar); portrait, its top just under the subject, at half the height
      const offOf = (h: number) => (port ? -vh * 0.5 : h <= band - 48 ? h / 2 - (topH + band / 2) : -(topH + 24));
      // portrait: the camera stays on the subject while the caption is read, until its last line has risen to 60 % of
      // the band (then the hall shows below it and the camera travels there); desktop: the usual hold
      const readOf = (h: number) => (port ? Math.max(0, h + vh * 0.5 - (topH + band * 0.6)) : 0);
      if (sized) {
        // fix:scroll:r3: size every leg from the path (see TOTAL), then write the paddings that make the anchors land there
        const S = tourStopS(md), n = S.length - 1;
        const c = [0, ...caps.map((el) => el.offsetHeight)];
        const off = c.map((h, i) => (i ? offOf(h) : 0)), rd = c.map((h, i) => (i ? readOf(h) : 0));
        const sy = window.scrollY;
        const B0 = secs[0]!.getBoundingClientRect().top + sy;
        const pt = PT[md] * vh, pbMin = PB_MIN[md] * vh, pt1Min = PT1_MIN[md] * vh, hold0 = HOLD0[md], max = LEG_MAX * vh;
        const legAt = (i: number, k: number) => {
          const dS = S[i + 1]! - S[i]!;
          let L: number;
          if (i === 0) L = (k * dS * (port ? 1 : CRUISE0 / CRUISE)) / (1 - TOUR_HOLD - hold0);
          else {
            const travel = k * dS, h = rd[i]!;
            L = (travel + h) / (1 - TOUR_HOLD);
            if (h < TOUR_HOLD * L) L = travel / (1 - 2 * TOUR_HOLD);
            else if (h > 0.32 * L) L = travel / (1 - 0.32 - TOUR_HOLD);
          }
          const lo = i === 0 ? B0 + pt1Min + off[1]! : c[i]! + pbMin + pt + off[i + 1]! - off[i]!;
          return Math.min(Math.max(lo, max), Math.max(lo, L));
        };
        const total = TOTAL[md] * vh;
        let lo = 0, hi = 50 * vh;
        for (let it = 0; it < 40; it++) {
          const k = (lo + hi) / 2;
          let sum = 0;
          for (let i = 0; i < n; i++) sum += legAt(i, k);
          if (sum > total) hi = k; else lo = k;
        }
        const L = Array.from({ length: n }, (_, i) => legAt(i, lo));
        const want = [Math.max(pt1Min, L[0]! - B0 - off[1]!)];
        for (let i = 1; i < n; i++) want.push(Math.max(pbMin, L[i]! - c[i]! - pt - off[i + 1]! + off[i]!));
        let changed = false;
        want.forEach((v, i) => {
          if (written[i] !== undefined && Math.abs(written[i]! - v) < 1.5) return;
          written[i] = v;
          changed = true;
          if (i === 0) secs[0]!.style.setProperty("--pt", `${Math.round(v)}px`);
          else secs[i - 1]!.style.setProperty("--pb", `${Math.round(v)}px`);
        });
        if (changed) for (const s of secs.slice(1)) s.style.setProperty("--pt", `${Math.round(pt)}px`);
        if (root.dataset.legs !== md) root.dataset.legs = md;
      }
      const sy = window.scrollY;
      const maxY = () => Math.max(0, root.scrollHeight - vh0);
      const a = [0], hd = [0];
      for (const id of STOPS) {
        const el = document.querySelector<HTMLElement>(`[data-tour-stop="${id}"]`);
        if (!el) { a.push(Math.min(maxY(), a[a.length - 1]! + 1)); hd.push(0); continue; }
        const r = el.getBoundingClientRect();
        let y = r.top + sy + offOf(r.height);
        // fix:scroll:r3: the last stop is never cut short by the page's end: the questions' chapter gets the room it needs
        if (sized && id === STOPS[STOPS.length - 1] && y > maxY()) {
          const lastSec = secs[secs.length - 1]!, need = Math.ceil(y - maxY()) + 2;
          const cur = parseFloat(lastSec.style.getPropertyValue("--pb")) || parseFloat(getComputedStyle(lastSec.querySelector(".tour-in") ?? lastSec).paddingBottom) || 0;
          lastSec.style.setProperty("--pb", `${Math.round(cur + need)}px`);
        }
        y = Math.min(maxY(), Math.max(a[a.length - 1]! + 1, y));
        a.push(y);
        hd.push(readOf(r.height));
      }
      // fix:scroll:r3: portrait, the first leg's hold (the playbill still over the hall)
      hd[0] = HOLD0[tourMode(vw, vh)] * a[1]!;
      anchors = a;
      holds = hd;
      tourBus.anchors = a;
      tourBus.holds = hd;
      onY(scrollState.y, true);
      // the first measure: the camera starts where the page is (a reload mid-page), never a glide from the top
      if (!measured) { measured = true; tourBus.snap = true; }
    };
    let mt = 0;
    const remeasure = () => { if (!mt) mt = requestAnimationFrame(() => { mt = 0; if (alive) measure(); }); };

    const offY = onScrollY((y) => onY(y, !measured));
    measure();
    document.fonts?.ready.then(() => { if (alive) measure(); }).catch(() => {});
    const ro = new ResizeObserver(remeasure);
    const main = document.querySelector("main");
    if (main) ro.observe(main);
    window.addEventListener("resize", remeasure);

    // a jump: the page and the camera glide there together (an ease in and out, longer for farther stops), or cut behind
    // the veil when it is far; the reader's own wheel, finger or key interrupts it where it is
    let raf = 0;
    const stopGlide = () => { if (raf) cancelAnimationFrame(raf); raf = 0; glide = 0; };
    const jump = (y1: number, page = false) => {
      stopGlide();
      const y0 = scrollState.y;
      if (Math.abs(y1 - y0) < 2) return;
      if (mq.matches) { window.scrollTo(0, y1); return; }
      const t1 = tourAt(y1, anchors, holds);
      const d = Math.abs(sAt(t1) - sAt(tourBus.t)) / pathLen();
      if (d > JUMP_CUT && !page) {
        tourBus.jump = null;
        veilTo(1, 200, "cubic-bezier(0.4, 0, 1, 1)", () => {
          tourBus.snap = true;
          window.scrollTo(0, y1);
          rescroll();
          requestAnimationFrame(() => requestAnimationFrame(() => veilTo(dim(tourBus.target), 320, "cubic-bezier(0, 0, 0.2, 1)")));
        });
        return;
      }
      // (a page: never under 0.85 s, the move reads as one deliberate step; never over 1.5 s, the reader waits on it)
      const dur = page ? Math.min(1.5, Math.max(0.85, 0.7 + d * 2.4)) : Math.min(1.6, Math.max(0.6, 0.5 + d * 3.2));
      const t0 = performance.now();
      tourBus.jump = { id: ++jumpId, to: t1, t0, dur };
      glide = 1;
      const step = () => {
        raf = 0;
        if (!alive || !glide) return;
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        window.scrollTo(0, Math.round(y0 + (y1 - y0) * (page ? easePage(k) : ease(k))));
        if (k < 1) raf = requestAnimationFrame(step);
        else { glide = 0; landedAt = performance.now(); }
      };
      raf = requestAnimationFrame(step);
    };
    jumpRef.current = jump;

    // v25.1, paging: where a page can stop: every chapter's anchor, and the page's end when the questions leave room below
    const stops = () => {
      const maxY = Math.max(0, root.scrollHeight - window.innerHeight);
      const s = anchors.filter((v) => v <= maxY + 1);
      if (maxY - (s[s.length - 1] ?? 0) > 0.25 * window.innerHeight) s.push(maxY);
      return s;
    };
    /** one gesture, one page: a trackpad's swipe (and its momentum) is one stream of events; a mouse wheel's notches are each their own */
    let gesture = false, lastWheelAt = -1e9, landedAt = -1e9;
    const pageStep = (dir: number) => {
      const y = scrollState.y, s = stops();
      const to = dir > 0 ? s.find((v) => v > y + 4) : [...s].reverse().find((v) => v < y - 4);
      if (to === undefined) return false;
      gesture = true;
      jump(to, true);
      return true;
    };
    const onPageWheel = (e: WheelEvent) => {
      if (!paging || !e.cancelable || e.defaultPrevented || e.ctrlKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaY === 0) return;
      if (innerScroller(e.target, e.deltaY) || pageLocked()) return;
      e.preventDefault();
      const now = performance.now(), quiet = now - lastWheelAt;
      lastWheelAt = now;
      // (under the loader the page holds still; a page in flight, and the tail of the gesture that started it, are spent on it)
      if (!hall.get().lit || glide) return;
      if (gesture && (scrollState.notch ? now - landedAt < 120 : quiet < 200)) return;
      gesture = false;
      pageStep(Math.sign(e.deltaY));
    };
    window.addEventListener("wheel", onPageWheel, { passive: false });
    const onResizePaging = () => { const p = pagingOn(); if (p !== paging) onMq(); };
    window.addEventListener("resize", onResizePaging);

    const offIn = onScrollInput((kind, e) => {
      // paging: the wheel is spent on the page in flight (onPageWheel), and the paging keys turn the page
      if (paging && kind === "wheel") return;
      if (paging && kind === "key") {
        const k = e as KeyboardEvent, el = k.target as HTMLElement | null;
        const dir = k.key === "PageDown" || k.key === "ArrowDown" || ((k.key === " " || k.key === "Spacebar") && !k.shiftKey) ? 1
          : k.key === "PageUp" || k.key === "ArrowUp" || ((k.key === " " || k.key === "Spacebar") && k.shiftKey) ? -1 : 0;
        const own = el && el !== document.body && el !== document.documentElement && (el.isContentEditable || el.closest?.("input, textarea, select, button, a, summary, dialog, [role=dialog], [role=button], [role=slider], [role=listbox], [role=menu], [role=tab], [contenteditable]"));
        if (dir && !own && !k.altKey && !k.ctrlKey && !k.metaKey && !innerScroller(el, dir) && !pageLocked()) {
          k.preventDefault();
          if (hall.get().lit && !glide) pageStep(dir);
          return;
        }
      }
      if (glide || tourBus.jump) {
        // the reader takes over: the page stays where it is and the camera follows the scroll again (fix:scroll:r3-2: not
        // for a key that only moves the focus, Tab: its own scroll, if any, starts the next jump from where the camera is)
        if (kind !== "key" || (!isJumpKey(e as KeyboardEvent) && isScrollKey(e as KeyboardEvent))) { stopGlide(); tourBus.jump = null; }
      }
      if (kind !== "key") return;
      const k = e as KeyboardEvent;
      // (never under the loader, which holds the page still)
      if (!isJumpKey(k) || !hall.get().lit) return;
      const el = k.target as HTMLElement | null;
      if (el && (el.isContentEditable || el.closest?.("input, textarea, select, dialog, [role=dialog], [contenteditable]"))) return;
      // Home and End: the whole tour, one jump (a cut behind the veil when it is far), not a run through every stop
      k.preventDefault();
      jump(k.key === "Home" ? 0 : Math.max(0, root.scrollHeight - window.innerHeight));
    });

    return () => {
      alive = false;
      window.removeEventListener("wheel", onPageWheel);
      window.removeEventListener("resize", onResizePaging);
      offY();
      offIn();
      offGlide();
      mq.removeEventListener?.("change", onMq);
      stopGlide();
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
      if (mt) cancelAnimationFrame(mt);
      timers.forEach(clearTimeout);
      tourBus.on = false;
      tourBus.target = 0;
      tourBus.y = 0;
      tourBus.jump = null;
      tourBus.anchors = [0];
      tourBus.holds = [0];
      delete root.dataset.tour;
      delete root.dataset.legs;
      for (const s of secs) { s.style.removeProperty("--pt"); s.style.removeProperty("--pb"); }
      if (veil) { veil.style.removeProperty("opacity"); veil.style.removeProperty("transition"); }
      hall.set({ tour: false });
    };
  }, []);

  const go = (i: number) => (e: React.MouseEvent) => {
    const y = tourBus.anchors[i];
    if (y == null) return;
    e.preventDefault();
    jumpRef.current(y);
  };

  return (
    <nav ref={nav} className="tour-index" aria-label={T.label} data-on="0">
      <ol>
        {STOPS.map((id, i) => (
          <li key={id}><a href={`#${id}`} onClick={go(i + 1)}><span className="tick" aria-hidden="true" /><span className="lbl">{LABELS[id]}</span></a></li>
        ))}
      </ol>
    </nav>
  );
}

function isJumpKey(e: KeyboardEvent): boolean {
  return (e.key === "Home" || e.key === "End") && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}
