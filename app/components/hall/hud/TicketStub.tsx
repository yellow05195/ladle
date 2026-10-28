"use client";

/**
 * The entry receipt (v21.1, §7.6): a cream "yours" plate under the
 * instruments while entered, with the real fee split of the entry
 * (lib/law-settle splitFees). No paper, no perforation, no dot leaders.
 * It enters like a sheet; on phones it folds to a 40 px cream strip after 4 s
 * (a tap opens it again).
 */
import { useEffect, useState } from "react";
import { useT } from "../../../i18n/client";
import type { EntryView } from "../../../lib/data/types";
import { formatSol } from "../../../lib/format";
import { splitFees } from "../../../lib/law-settle";
import { pctBps } from "./round";

const sol4 = (l: bigint) => formatSol(l, 4);

export function TicketStub({ n, entry, hostBps, phone = false }: { n: string; entry: EntryView; hostBps: bigint; genesis?: number | null; phone?: boolean }) {
  const t = useT();
  const f = splitFees(entry.amount, hostBps);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!phone) return;
    const id = window.setTimeout(() => setFolded(true), 4000);
    return () => clearTimeout(id);
  }, [phone]);
  if (phone && folded) {
    return <button type="button" className="stub-strip" aria-expanded={false} onClick={() => setFolded(false)}>{t("h.stub.strip", { n, sol: sol4(entry.amount) })}</button>;
  }
  return (
    <section className="stub plate-cream" aria-label={t("h.stub.aria", { n })} onClick={phone ? () => setFolded(true) : undefined}>
      <div className="hd"><b>{t("h.stub.admit")}</b><span>{t("h.room.roundNo", { n })}</span></div>
      <dl>
        <div><dt>{t("h.stub.put")}</dt><dd>{sol4(entry.amount)} SOL</dd></div>
        <div><dt>{t("h.stub.fee")}</dt><dd>{sol4(f.platform)} SOL</dd></div>
        <div><dt>{t("h.stub.host", { pct: pctBps(hostBps) })}</dt><dd>{sol4(f.host)} SOL</dd></div>
        <div><dt>{t("h.stub.curve")}</dt><dd>{sol4(f.toCurve)} SOL</dd></div>
      </dl>
      <p className="ft">{t("h.stub.same")}</p>
    </section>
  );
}
