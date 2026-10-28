"use client";

/**
 * The home's scroll tour, its driver (v21). One passive scroll listener,
 * batched to one rAF, turns the scroll position into the tour position
 * (`tourBus.target`, read by the camera rig in useFrame): no React render
 * per scroll frame, no layout read while scrolling (the anchors are
 * measured on load, on resize and when the page's height changes). It also
 * dims the hall for the questions and the footer, keeps the side index on
 * the current stop and, under reduced motion, dips the hall to black for
 * 120 ms while the camera cuts to the next stop.
 */
import { useEffect, useRef } from "react";
import { hall } from "../store";
import { TOUR, tourAt, tourBus, tourMode } from "../tour";
import { TOUR_COPY as T } from "../sections/copy";

const LABELS: Record<string, string> = { how: T.how.index, room: T.room.index, scoop: T.scoop.index, curve: T.curve.index, books: T.books.index, hosts: T.hosts.index, genesis: T.gen.index, questions: T.qa.index };
const STOPS = TOUR.slice(1).map((s) => s.id);

export function TourDriver() {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    hall.set({ tour: true });
    tourBus.on = true;
    const root = document.documentElement;
    root.dataset.tour = "1";
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const veil = document.querySelector<HTMLElement>(".hall-stage .hall-veil");
    let anchors: number[] = [0];
    let raf = 0, dipT = 0, lastAt = -1, lastVeil = -1, dipping = false, first = true;
    const last = TOUR.length - 1;

    const setVeil = (v: number) => {
      if (!veil || Math.abs(v - lastVeil) < 0.004) return;
      lastVeil = v;
      veil.style.opacity = v.toFixed(3);
    };
    const dim = (t: number) => Math.min(1, Math.max(0, t - (last - 1))) * 0.42;

    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const t = tourAt(y, anchors);
      tourBus.target = t;
      const at = Math.round(t);
      if (at !== lastAt) {
        lastAt = at;
        const el = nav.current;
        if (el) {
          el.dataset.on = at >= 1 && at <= last ? "1" : "0";
          el.querySelectorAll<HTMLElement>("a").forEach((a, i) => { if (i + 1 === at) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
        }
      }
      if (mq.matches) {
        // reduced motion: no camera travel; a 120 ms dip to black, the cut, and back
        if (first) { tourBus.cut = at; first = false; }
        if (at !== tourBus.cut && !dipping) {
          dipping = true;
          if (veil) { veil.style.transition = "opacity 120ms linear"; veil.style.opacity = "1"; lastVeil = 1; }
          dipT = window.setTimeout(() => {
            tourBus.cut = Math.round(tourBus.target);
            dipping = false;
            setVeil(dim(tourBus.cut));
          }, 140);
        }
        if (!dipping) setVeil(dim(tourBus.cut));
      } else setVeil(dim(t));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };

    const measure = () => {
      const vh = window.innerHeight;
      const port = tourMode(window.innerWidth, vh) === "port";
      // the band the text is read in: under the top bar, above the conserved rail
      const cs = getComputedStyle(root);
      const topH = parseFloat(cs.getPropertyValue("--top-h")) || 72;
      const railH = document.querySelector<HTMLElement>(".conserved")?.offsetHeight ?? 48;
      const band = vh - topH - railH;
      const max = Math.max(0, root.scrollHeight - vh);
      const a = [0];
      for (const id of STOPS) {
        const el = document.querySelector<HTMLElement>(`[data-tour-stop="${id}"]`);
        if (!el) { a.push(Math.min(max, a[a.length - 1]! + 1)); continue; }
        const r = el.getBoundingClientRect();
        const top = r.top + window.scrollY;
        // the stop is reached when the caption sits where it is read: centred in the band beside the subject (desktop; a caption
        // taller than the band starts just under the top bar), its top just under the subject (portrait)
        let y = port ? top - vh * 0.5 : r.height <= band - 48 ? top + r.height / 2 - (topH + band / 2) : top - (topH + 24);
        y = Math.min(max, Math.max(a[a.length - 1]! + 1, y));
        a.push(y);
      }
      anchors = a;
      tourBus.anchors = a;
      update();
    };

    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    const ro = new ResizeObserver(() => measure());
    const main = document.querySelector("main");
    if (main) ro.observe(main);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(dipT);
      tourBus.on = false;
      tourBus.target = 0;
      delete root.dataset.tour;
      if (veil) { veil.style.removeProperty("opacity"); veil.style.removeProperty("transition"); }
      hall.set({ tour: false });
    };
  }, []);

  const go = (i: number) => (e: React.MouseEvent) => {
    const y = tourBus.anchors[i];
    if (y == null) return;
    e.preventDefault();
    window.scrollTo({ top: y, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
