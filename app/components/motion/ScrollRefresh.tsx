"use client";

import { useEffect } from "react";
import { ScrollTrigger, registerGsap } from "../../lib/motion";

/** Recomputes every ScrollTrigger when the page grows (live data, tables, fonts, images). Renders nothing. */
export function ScrollRefresh() {
  useEffect(() => {
    registerGsap();
    let t: ReturnType<typeof setTimeout> | null = null;
    let last = document.body.scrollHeight;
    const ro = new ResizeObserver(() => {
      const h = document.body.scrollHeight;
      if (h === last) return;
      last = h;
      if (t) clearTimeout(t);
      t = setTimeout(() => ScrollTrigger.refresh(), 150);
    });
    ro.observe(document.body);
    document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
    return () => { ro.disconnect(); if (t) clearTimeout(t); };
  }, []);
  return null;
}
