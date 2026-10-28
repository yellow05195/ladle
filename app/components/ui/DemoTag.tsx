"use client";

/**
 * The demo marker (v21.1, §7.9): a cream handle tag (the d's handle lying
 * down, its round end punched so the hall shows through) in the top bar,
 * 22 px right of the wordmark, on every route while the data source is the
 * demo. A press opens the cream slip that says what "demo" means. Never
 * hidden, never dismissable; absent in chain mode.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n/client";
import { DATA_SOURCE } from "../../lib/data";
import { Arr } from "./house";

export function DemoTag() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(16);
  const btn = useRef<HTMLButtonElement>(null);
  const slip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setLeft(Math.max(8, Math.min(window.innerWidth - 8 - Math.min(300, window.innerWidth - 16), r.left)));
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const down = (e: MouseEvent) => { const n = e.target as Node; if (!slip.current?.contains(n) && !btn.current?.contains(n)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", down); };
  }, [open]);

  if (DATA_SOURCE !== "demo") return null;
  return (
    <>
      <button ref={btn} type="button" className="demo-tag" aria-expanded={open} aria-controls="demo-slip" aria-label={t("h.demo.aria")} onClick={() => setOpen((o) => !o)}>
        <span className="dt" aria-hidden="true">{t("h.demo.tag")}<i>{t("h.chat.simulated")}</i></span>
      </button>
      {open ? (
        <div ref={slip} id="demo-slip" className="demo-slip" role="note" style={{ left }}>
          <p>{t("h.demo.slip")}</p>
          <Link href="/about#solana" onClick={() => setOpen(false)}>{t("h.demo.slipLink")}<Arr /></Link>
        </div>
      ) : null}
    </>
  );
}
