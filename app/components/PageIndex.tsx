"use client";

/**
 * The side index of a long inner page (v21.1, §7.17, as on the home tour):
 * one 8 px dot per section at the right edge, the current one a 10 px cream
 * disc, its name on a small plate on hover or focus. Desktop only (1100 px
 * and up); hidden above the first section and once the footer is in view.
 * The current section is read by an IntersectionObserver, never on scroll.
 */
import { useEffect, useRef } from "react";

export function PageIndex({ items, label }: { items: ReadonlyArray<{ id: string; label: string }>; label: string }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const links = [...el.querySelectorAll<HTMLAnchorElement>("a")];
    const secs = items.map((it) => document.getElementById(it.id)).filter((x): x is HTMLElement => !!x);
    const seen = new Map<Element, boolean>();
    let foot = false;
    const paint = () => {
      // the current section: the last one whose top has passed the middle band
      let cur = -1;
      secs.forEach((s, i) => { if (seen.get(s)) cur = cur < 0 ? i : cur; });
      links.forEach((a, i) => { if (i === cur) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); });
      el.dataset.on = cur >= 0 && !foot ? "1" : "0";
    };
    const io = new IntersectionObserver((es) => { for (const e of es) seen.set(e.target, e.isIntersecting); paint(); }, { rootMargin: "-45% 0px -50% 0px" });
    secs.forEach((s) => io.observe(s));
    const footEl = document.querySelector("footer");
    const fio = new IntersectionObserver((es) => { for (const e of es) foot = e.isIntersecting; paint(); }, { rootMargin: "0px 0px -20% 0px" });
    if (footEl) fio.observe(footEl);
    return () => { io.disconnect(); fio.disconnect(); };
  }, [items]);
  return (
    <nav ref={nav} className="pg-index" aria-label={label} data-on="0">
      <ol>
        {items.map((it) => (
          <li key={it.id}><a href={`#${it.id}`}><span className="tick" aria-hidden="true" /><span className="lbl">{it.label}</span></a></li>
        ))}
      </ol>
    </nav>
  );
}
