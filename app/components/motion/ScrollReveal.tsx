"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { gsap, registerGsap } from "../../lib/motion";

/**
 * Section entrances (v21, §10): once per element, when a section comes into
 * view its head, its blocks and its step plates rise 8 px and fade in over 600 ms,
 * staggered 40 ms (at most six items per column). Styles are set by script
 * only (no script, nothing is hidden), sections already on screen at load
 * are left alone, and nothing runs under reduced motion. No parallax, no
 * pinning, no scrubbing.
 */
export function ScrollReveal() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    registerGsap();
    const vh = window.innerHeight;
    const groups = new Map<Element, HTMLElement[]>();
    for (const sec of Array.from(document.querySelectorAll<HTMLElement>(".pg-sec"))) {
      if (sec.getBoundingClientRect().top < vh * 0.9) continue;
      const items: HTMLElement[] = [];
      const cols = Array.from(sec.querySelectorAll<HTMLElement>(".pg-split > *"));
      for (const col of cols.length ? cols : [sec.querySelector<HTMLElement>(":scope > .in")].filter((x): x is HTMLElement => !!x)) {
        const kids = (Array.from(col.children) as HTMLElement[]).flatMap((k) => (k.matches(".pg-steps, .pg-notes") ? Array.from(k.querySelectorAll<HTMLElement>(":scope > li")) : [k]));
        items.push(...kids.slice(0, 6));
      }
      if (!items.length) continue;
      gsap.set(items, { opacity: 0, y: 8 });
      groups.set(sec, items);
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const items = groups.get(e.target);
        io.unobserve(e.target);
        if (items) gsap.to(items, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", stagger: 0.04, clearProps: "opacity,transform" });
      }
    }, { rootMargin: "0px 0px -20% 0px" });
    for (const sec of groups.keys()) io.observe(sec);
    return () => { io.disconnect(); for (const items of groups.values()) gsap.set(items, { clearProps: "opacity,transform" }); };
  }, [pathname]);
  return null;
}
