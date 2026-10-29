"use client";

/**
 * The light-mode marker (v25.1): the demo tag's cream handle, in its place right of the wordmark, while the hall
 * is drawn without a graphics card (quality.ts softwareGpu: a browser with its graphics acceleration off, the
 * commonest case, or a blocklisted GPU). The hall then runs its paced low tier, or the poster when even that could
 * not hold. A press opens the slip that says how to get the full hall back. Absent with a GPU, and in demo mode
 * (the demo tag holds the place).
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n/client";
import { DATA_SOURCE } from "../../lib/data";
import { softwareGpu } from "../hall/quality";
import { useHall } from "../hall/store";

export function LightTag() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(16);
  const btn = useRef<HTMLButtonElement>(null);
  const slip = useRef<HTMLDivElement>(null);
  // the tier is set once the GPU has answered (HallCanvas); softwareGpu() is read with it
  const light = useHall((s) => (s.quality === "low" || s.quality === "none") && softwareGpu());

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

  if (DATA_SOURCE === "demo" || !light) return null;
  return (
    <>
      <button ref={btn} type="button" className="demo-tag" aria-expanded={open} aria-controls="light-slip" aria-label={t("h.light.aria")} onClick={() => setOpen((o) => !o)}>
        <span className="dt" aria-hidden="true">{t("h.light.tag")}<i>{t("h.light.sub")}</i></span>
      </button>
      {open ? (
        <div ref={slip} id="light-slip" className="demo-slip" role="note" style={{ left }}>
          <p>{t("h.light.slip")}</p>
        </div>
      ) : null}
    </>
  );
}
