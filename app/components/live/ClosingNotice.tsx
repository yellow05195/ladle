"use client";

/**
 * The closing banner (v25, shutdown): when the operator stops the game, the
 * wind-down build is deployed and each market's 7-day notice starts
 * (`start_wind_down`). Every page then says so, with the date entries are
 * paid out, in the same cream slip as the demo marker: fixed under the top
 * bar, never dismissable. Chain mode only; one read of the market on mount
 * and every 5 minutes (lib/data/chain.ts readClosingNotice). Nothing shows
 * while no notice runs.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "../../i18n/client";
import { DATA_SOURCE } from "../../lib/data";
import { readClosingNotice, type ClosingNotice as Notice } from "../../lib/data/chain";
import { Arr } from "../ui/house";

const REREAD_MS = 5 * 60_000;

/** "5 November 2026, 14:00 UTC": one time zone for everyone, the one the cluster clock counts in. */
function when(unix: number): string {
  return `${new Date(unix * 1000).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

export function ClosingNotice() {
  const t = useT();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (DATA_SOURCE !== "chain") return;
    let live = true;
    const read = () => { readClosingNotice().then((n) => { if (live) setNotice(n); }).catch(() => { /* the page's own reads say what fails */ }); };
    read();
    const id = window.setInterval(read, REREAD_MS);
    return () => { live = false; window.clearInterval(id); };
  }, []);

  if (!notice) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", zIndex: 56, left: "50%", transform: "translateX(-50%)", top: "calc(var(--top-h, 64px) + 8px)",
        width: "min(640px, calc(100vw - 32px))", padding: "14px 16px 15px", display: "grid", gap: 8,
        background: "var(--ink)", color: "var(--on-cream)", borderRadius: 12,
      }}
    >
      <p style={{ margin: 0, font: "600 15px/1.45 var(--font-sans)" }}>
        {notice.over ? t("closing.over") : t("closing.notice", { date: when(notice.endsAt) })}
      </p>
      <Link href="/security#closing" style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", minHeight: 32, font: "700 15px/1.3 var(--font-sans)", color: "var(--on-cream)", textDecoration: "none" }}>
        {t("closing.more")}<Arr />
      </Link>
    </div>
  );
}
