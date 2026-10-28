"use client";

/**
 * The round as the v21 HUD reads it: which window the instruments follow
 * (the focused round, or the open one next to a served round), its phase
 * word and the label under the numeral. Nothing here changes colour, size
 * or rhythm near the end of a round.
 */
import { useEffect, useState } from "react";
import type { T } from "../../../i18n";
import type { LiveWindow, Phase } from "../../../lib/data/types";
import { roundNum } from "../fmt";

export interface RoundView { id: string; n: string; phase: Phase; left: number; elapsed: number; total: number; players: number; pot: bigint; slotMs: number }

/**
 * The window the instruments follow: the open round. Rounds are pipelined,
 * so while the focused round is sealed, drawing or served, its open sibling
 * is the one taking entries, and the instruments follow it (the focused
 * round gets one line under the facts).
 */
export function roundView(w: LiveWindow): RoundView {
  if (w.phase !== "open" && w.sibling && w.sibling.phase === "open") {
    const s = w.sibling;
    return { id: s.id, n: roundNum(s.id), phase: s.phase, left: s.slotsRemaining, elapsed: w.slotsTotal - s.slotsRemaining, total: w.slotsTotal, players: s.entries, pot: s.total, slotMs: w.slotMs };
  }
  const left = w.phase === "open" ? w.slotsRemaining : 0;
  return { id: w.id, n: roundNum(w.id), phase: w.phase, left, elapsed: w.slotsTotal - left, total: w.slotsTotal, players: w.entries.length, pot: w.total, slotMs: w.slotMs };
}

/** The open round, for the home's playbill (the sibling while the focused one draws). */
export function openView(w: LiveWindow): RoundView {
  return roundView(w);
}

/**
 * The round the viewer can enter right now: the focused one while it is
 * open, else its open sibling. Never while the viewer's own round waits for
 * its seed or is being served (the focus would leave it before its result).
 */
export function entryRound(w: LiveWindow | null, opts: { serving?: boolean } = {}): string | null {
  if (!w) return null;
  if (w.phase === "open") return w.mineIndex === null ? w.id : null;
  if (w.mineIndex !== null && (w.phase === "sealed" || w.phase === "seeded" || opts.serving)) return null;
  if (w.sibling?.phase === "open") return w.sibling.id;
  return null;
}

/** "15 slots left", "1 slot left". */
export const slotsLeft = (t: T, n: number) => (n === 1 ? t("h.slotLeft") : t("h.slotsLeft", { n }));

export function phaseWord(t: T, p: Phase, slots = 92): string {
  if (p === "open") return t("h.ph.open");
  if (p === "sealed") return t("h.ph.sealed", { slots });
  if (p === "seeded") return t("h.ph.drawing");
  return t("h.ph.served");
}

/** The state tag's one word: open / sealed / drawing / served. */
export function stateWord(t: T, p: Phase): string {
  if (p === "open") return t("h.ph.open");
  if (p === "sealed") return t("h.ph.sealedWord");
  if (p === "seeded") return t("h.ph.drawing");
  return t("h.ph.served");
}

export function dialLabel(t: T, r: RoundView): string {
  if (r.phase === "open") {
    const s = Math.round((r.left * r.slotMs) / 1000);
    if (s < 1) return t(r.left === 1 ? "h.dial.shortOne" : "h.dial.short");
    return t(r.left === 1 ? "h.dial.openOne" : "h.dial.open", { s });
  }
  if (r.phase === "sealed") return t("h.dial.sealed");
  if (r.phase === "seeded") return t("h.dial.seeded");
  return t("h.dial.served");
}

/** A media query as state (false on the server and the first render). */
export function useMedia(q: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
}

/** "1.00 %" with a no-break space; "2.00 %" for a host fee in bps. */
export const pctBps = (bps: bigint) => (bps === 0n ? "0 %" : `${(Number(bps) / 100).toFixed(2)} %`);
