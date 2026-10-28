"use client";

/**
 * The ruled table's scroll box (v21). Tables are laid out to fit their
 * column (stacked rows on phones, site.css); this is only the fallback: when
 * a table is still wider than its column, `data-over` fades its right edge
 * over 24 px until the reader has scrolled to the end.
 */
import { useEffect, useRef, type ReactNode } from "react";

export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const more = el.scrollWidth - el.clientWidth > 1 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      if (more) el.dataset.over = ""; else delete el.dataset.over;
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, []);
  return <div ref={ref} className={`pg-table-wrap ${className}`}>{children}</div>;
}
