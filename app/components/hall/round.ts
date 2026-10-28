/**
 * What the hall needs to know about a round (v19, kept in v20), from either the live
 * window (the data source's snapshots) or a settled round (WindowView).
 * Entries stay in ARRIVAL order everywhere; nothing here sorts by result.
 */
import type { LiveWindow, Phase, WindowView } from "../../lib/data/types";
import { pseudonym } from "../../lib/data/mock";
import { multiplierOf } from "../../lib/law-settle";

export interface SquareEntry { key: string; label: string; mine: boolean; amount: bigint; /** share ÷ pro-rata, once split (display only) */ m: number | null }
export interface SquareRound { id: string; n: string; phase: Phase; entries: SquareEntry[]; total: bigint }

export function fromLiveWindow(w: LiveWindow): SquareRound {
  const s = w.settlement;
  const split = (w.phase === "settled" || w.phase === "sold") && !!s;
  return {
    id: w.id,
    n: w.id.replace(/^demo-/, ""),
    phase: w.phase,
    total: w.total,
    entries: w.entries.map((e) => ({
      key: `${w.id}:${e.index}`,
      label: e.mine ? "you" : e.label,
      mine: e.mine,
      amount: e.amount,
      m: split && e.share !== undefined ? multiplierOf(e.share, e.amount, w.total, s!.tokensOut) : null,
    })),
  };
}

export function fromWindowView(v: WindowView, phase: Phase = "settled"): SquareRound {
  const split = phase === "settled" || phase === "sold";
  return {
    id: v.id,
    n: v.id.replace(/^demo-/, ""),
    phase,
    total: v.total,
    entries: v.entries.map((e) => ({ key: `${v.id}:${e.index}`, label: pseudonym(e.owner), mine: false, amount: e.amount, m: split ? multiplierOf(e.share, e.amount, v.total, v.tokensOut) : null })),
  };
}
