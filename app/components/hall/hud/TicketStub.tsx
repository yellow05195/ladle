"use client";

/**
 * The entry receipt (v21.1, §7.6): a cream "yours" plate under the
 * instruments while entered, with the real fee split of the entry
 * (lib/law-settle splitFees). No paper, no perforation, no dot leaders.
 * Once the round seals it carries its round's state tag (sealed, drawing,
 * served). Phones: a 40 px cream strip from the start (the page never grows
 * under it); a tap opens the full receipt as an overlay above the strip, and
 * it folds again on a tap or after 5 s.
 */
import { useEffect, useState } from "react";
import { useT } from "../../../i18n/client";
import type { EntryView } from "../../../lib/data/types";
import { formatSol } from "../../../lib/format";
import { splitFees } from "../../../lib/law-settle";
import { pctBps } from "./round";

const sol4 = (l: bigint) => formatSol(l, 4);

export function TicketStub({ n, entry, hostBps, phone = false, state }: { n: string; entry: EntryView; hostBps: bigint; genesis?: number | null; phone?: boolean; /** the round's state word once it no longer takes entries */ state?: string }) {
  const t = useT();
  const f = splitFees(entry.amount, hostBps);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!phone || !open) return;
    const id = window.setTimeout(() => setOpen(false), 5000);
    return () => clearTimeout(id);
  }, [phone, open]);
  const plate = (
    <section className={`stub plate-cream ${phone ? "over" : ""}`} aria-label={t("h.stub.aria", { n })} onClick={phone ? () => setOpen(false) : undefined}>
      <div className="hd">
        <b>{t("h.stub.admit")}</b>
        {state ? <span className="st">{state}</span> : <span>{t("h.room.roundNo", { n })}</span>}
      </div>
      {state ? <p className="rn">{t("h.room.roundNo", { n })}</p> : null}
      <dl>
        <div><dt>{t("h.stub.put")}</dt><dd>{sol4(entry.amount)} SOL</dd></div>
        <div><dt>{t("h.stub.fee")}</dt><dd>{sol4(f.platform)} SOL</dd></div>
        <div><dt>{t("h.stub.host", { pct: pctBps(hostBps) })}</dt><dd>{sol4(f.host)} SOL</dd></div>
        <div><dt>{t("h.stub.curve")}</dt><dd>{sol4(f.toCurve)} SOL</dd></div>
      </dl>
      <p className="ft">{t("h.stub.same")}</p>
    </section>
  );
  if (!phone) return plate;
  return (
    <div className="stub-wrap">
      {open ? plate : null}
      <button type="button" className="stub-strip" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="t">{t("h.stub.strip", { n, sol: sol4(entry.amount) })}</span>
        {state ? <span className="st">{state}</span> : null}
      </button>
    </div>
  );
}
