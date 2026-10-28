"use client";

/**
 * The latest rounds as one zebra table on a plate (v21.1, §7.18), newest
 * first: round, players, pot, the scoops from the smallest to the largest
 * (same type, no colour), and the way to recompute it.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/client";
import { getDataSource } from "../lib/data";
import type { WindowView } from "../lib/data/types";
import { multiplierOf } from "../lib/law-settle";
import { mult, roundNum, sol3 } from "./hall/fmt";
import { TableWrap } from "./TableWrap";
import { Arr } from "./hall/sections/kit";

export function RecentWindows({ limit = 12, current }: { limit?: number; current?: string }) {
  const { t } = useI18n();
  const source = useMemo(() => getDataSource(), []);
  const [rows, setRows] = useState<WindowView[] | null>(null);
  useEffect(() => { source.listRecentWindows().then(setRows).catch(() => setRows([])); }, [source]);
  if (!rows) return <div className="pg-wait" style={{ height: 160 }} aria-busy="true" />;
  if (!rows.length) return <div className="pg-col pg-gap-s"><p className="ui">{t("recent.emptyTitle")}</p><p className="fine">{t("recent.emptySub")}</p></div>;
  return (
    <TableWrap>
      <table className="pg-table">
        <thead>
          <tr>
            <th>{t("h.win.colRound")}</th>
            <th className="r ph-hide">{t("h.win.colPlayers")}</th>
            <th className="r">{t("h.win.colPot")}<span className="ph-only">, SOL</span></th>
            <th className="r">{t("h.win.colRange")}</th>
            <th className="r"><span className="sr-only">{t("h.act.recompute")}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((w) => {
            let lo = Infinity, hi = -Infinity;
            for (const e of w.entries) {
              const m = multiplierOf(e.share, e.amount, w.total, w.tokensOut);
              if (m < lo) lo = m;
              if (m > hi) hi = m;
            }
            const n = roundNum(w.id);
            return (
              <tr key={w.id} aria-current={w.id === current ? "page" : undefined}>
                <td><Link href={`/window/${w.id}`} className="act">No. {n}</Link></td>
                <td className="r fig ph-hide">{w.entries.length}</td>
                <td className="r fig">{sol3(w.total)}<span className="ph-hide"> SOL</span></td>
                <td className="r fig"><span className="ph-hide">{t("h.win.rangeV", { min: mult(lo), max: mult(hi) })}</span><span className="ph-only">{mult(lo)}<span className="sub">{mult(hi)}</span></span></td>
                <td className="r"><Link href={`/window/${w.id}#recompute`} className="act">{t("h.act.recompute")}<Arr /></Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
