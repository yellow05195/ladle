"use client";

/**
 * A code well (v21.1, §7.23): the deepest ground on a cream-plate radius,
 * the system monospace at 14/22 in --ink-2 (the one place monospace is
 * used), and a 36 px copy key at the top right that says "Copied" for
 * 1.2 s. No rule, no border. When the code is wider than the well, the
 * right edge fades (`data-overflow`) until the reader has scrolled to the
 * end, so a cut line never reads as the end of the code; on phones the
 * code wraps instead (site.css).
 */
import { useEffect, useRef, useState } from "react";
import { HIcon } from "./ui/icons";

export function CodeBlock({ code, lang, className = "" }: { code: string; lang?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = pre.current;
    if (!el) return;
    const check = () => {
      const more = el.scrollWidth - el.clientWidth > 1 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      if (more) el.dataset.overflow = ""; else delete el.dataset.overflow;
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, [code]);
  const copy = () => { navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); };
  return (
    <div className={`code-well pg-code ${className}`}>
      <pre ref={pre} data-lang={lang} tabIndex={0}><code>{code}</code></pre>
      <button type="button" className="icon-btn round" aria-label="Copy the code" onClick={copy}><HIcon name={copied ? "check" : "copy"} size={18} /></button>
      {copied ? <span className="label copied" role="status">Copied</span> : null}
    </div>
  );
}
