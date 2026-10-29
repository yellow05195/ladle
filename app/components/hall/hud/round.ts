"use client";

/**
 * The round as the v21 HUD reads it: which window the instruments follow
 * (the focused round, or the open one next to a served round), its phase
 * word and the label under the numeral. Nothing here changes colour, size
 * or rhythm near the end of a round.
 *
 * v21.3 chain mode: when no round takes entries (`LiveWindow.halt`: none
 * opened yet, a round closed but not sealed, no next round), the words say
 * so and no round is offered for entry.
 */
import { useEffect, useState } from "react";
import type { T } from "../../../i18n";
import type { Halt, LiveWindow, Phase } from "../../../lib/data/types";
import { roundNum } from "../fmt";

export interface RoundView {
  id: string; n: string; phase: Phase; left: number; elapsed: number; total: number; players: number; pot: bigint; slotMs: number;
  /** chain: no round opened yet, or this round's slots ran out and the keeper has not sealed it */
  halt: Halt | null;
}

/** The halt that concerns round `id`: no round yet, the page lost the RPC, or this round closed and not sealed. */
const haltFor = (w: LiveWindow, id: string): Halt | null => (w.halt && (w.halt.kind === "none" || w.halt.kind === "offline" || w.halt.kind === "paused" || (w.halt.kind === "closing" && w.halt.round === id)) ? w.halt : null);
/** The state tag's word for a halt. */
const haltWord = (t: T, h: Halt) => t(h.kind === "none" ? "h.ph.notOpen" : h.kind === "offline" ? "h.ph.offline" : h.kind === "paused" ? "h.ph.paused" : "h.ph.closed");

/**
 * The window the instruments follow: the open round. Rounds are pipelined,
 * so while the focused round is sealed, drawing or served, its open sibling
 * is the one taking entries, and the instruments follow it (the focused
 * round gets one line under the facts).
 */
export function roundView(w: LiveWindow): RoundView {
  if (w.phase !== "open" && w.sibling && w.sibling.phase === "open") {
    const s = w.sibling;
    return { id: s.id, n: roundNum(s.id), phase: s.phase, left: s.slotsRemaining, elapsed: w.slotsTotal - s.slotsRemaining, total: w.slotsTotal, players: s.entries, pot: s.total, slotMs: w.slotMs, halt: haltFor(w, s.id) };
  }
  // chain: the round that closed without a seal may be the sibling (the viewer's own result in focus): the instruments follow it
  if (w.phase !== "open" && w.sibling && w.halt?.kind === "closing" && w.halt.round === w.sibling.id) {
    const s = w.sibling;
    return { id: s.id, n: roundNum(s.id), phase: s.phase, left: 0, elapsed: w.slotsTotal, total: w.slotsTotal, players: s.entries, pot: s.total, slotMs: w.slotMs, halt: w.halt };
  }
  const left = w.phase === "open" ? w.slotsRemaining : 0;
  return { id: w.id, n: roundNum(w.id), phase: w.phase, left, elapsed: w.slotsTotal - left, total: w.slotsTotal, players: w.entries.length, pot: w.total, slotMs: w.slotMs, halt: haltFor(w, w.id) };
}

/** The open round, for the home's playbill (the sibling while the focused one draws). */
export function openView(w: LiveWindow): RoundView {
  return roundView(w);
}

/*
 * v21.4 (perf): the slices of the round in view that the HUD's widgets subscribe to (LiveProvider's useLiveSelect). The
 * data source ticks every slot and every arrival (5 to 9 times a second); each widget re-renders only when what it
 * shows changes, never the whole HUD.
 */

/** The round in view, or null before the first snapshot (compare it with one of the `same*` below). */
export const viewOf = (w: LiveWindow | null): RoundView | null => (w ? roundView(w) : null);
const headKey = (r: RoundView | null) => (r ? `${r.n}|${r.phase}|${r.total}|${r.halt?.kind ?? ""}` : "");
/** The same round head: its number and its state word (rno, StateTag, phaseWord). */
export const sameHead = (a: RoundView | null, b: RoundView | null) => headKey(a) === headKey(b);
const haltKey = (r: RoundView | null) => (r?.halt ? `${r.halt.kind}|${r.halt.round ?? ""}|${r.halt.late}|${r.halt.stalled ? 1 : 0}|${r.slotMs}` : "");
/** The same dial label (dialLabel: the phase, the halt, the whole seconds left). */
export const sameDial = (a: RoundView | null, b: RoundView | null) => {
  const k = (r: RoundView | null) => (r ? `${headKey(r)}|${r.halt?.stalled ? 1 : 0}|${r.phase === "open" ? `${Math.round((r.left * r.slotMs) / 1000)}|${r.left === 1 ? 1 : 0}` : ""}` : "");
  return k(a) === k(b);
};
/** The same one-line short form (the playbill's on narrow screens: the round, the slots left, the players, the pot, or the halt). */
export const sameShort = (a: RoundView | null, b: RoundView | null) => {
  const k = (r: RoundView | null) => (r ? `${headKey(r)}|${r.left}|${r.players}|${r.pot}|${haltKey(r)}` : "");
  return k(a) === k(b);
};
/** The slots left in the round in view (the countdown: every slot). */
export const leftOf = (w: LiveWindow | null) => (w ? roundView(w).left : 0);
/** The slots elapsed in the round in view (the stem). */
export const elapsedOf = (w: LiveWindow | null) => (w ? roundView(w).elapsed : 0);
/** The slots in a round (the stem's length). */
export const totalOf = (w: LiveWindow | null) => (w ? roundView(w).total : 92);
/** The players in the round in view. */
export const playersOf = (w: LiveWindow | null) => (w ? roundView(w).players : 0);
/** The pot of the round in view, lamports (a bigint: Object.is compares it by value). */
export const potOf = (w: LiveWindow | null) => (w ? roundView(w).pot : 0n);
/** How long a fact that moves with arrivals (players, pot) holds still at least: one roll, then a breath (ms). */
export const FACT_MS = 500;

/**
 * The round the viewer can enter right now: the focused one while it is
 * open, else its open sibling. Never while the viewer's own round waits for
 * its seed or is being served (the focus would leave it before its result).
 */
export function entryRound(w: LiveWindow | null, opts: { serving?: boolean } = {}): string | null {
  // chain: no round takes entries right now (the program would refuse)
  if (!w || w.halt) return null;
  if (w.phase === "open") return w.mineIndex === null ? w.id : null;
  if (w.mineIndex !== null && (w.phase === "sealed" || w.phase === "seeded" || opts.serving)) return null;
  if (w.sibling?.phase === "open") return w.sibling.id;
  return null;
}

/** "15 slots left", "1 slot left". */
export const slotsLeft = (t: T, n: number) => (n === 1 ? t("h.slotLeft") : t("h.slotsLeft", { n }));

export function phaseWord(t: T, p: Phase, slots = 92, halt: Halt | null = null): string {
  if (halt) return haltWord(t, halt);
  if (p === "open") return t("h.ph.open");
  if (p === "sealed") return t("h.ph.sealed", { slots });
  if (p === "seeded") return t("h.ph.drawing");
  return t("h.ph.served");
}

/** The state tag's one word: open / sealed / drawing / served (chain: closed, not open). */
export function stateWord(t: T, p: Phase, halt: Halt | null = null): string {
  if (halt) return haltWord(t, halt);
  if (p === "open") return t("h.ph.open");
  if (p === "sealed") return t("h.ph.sealedWord");
  if (p === "seeded") return t("h.ph.drawing");
  return t("h.ph.served");
}

export function dialLabel(t: T, r: RoundView): string {
  if (r.halt) return t(r.halt.kind === "none" ? "h.dial.none" : r.halt.kind === "offline" ? "h.dial.offline" : r.halt.kind === "paused" ? "h.dial.paused" : r.halt.stalled ? "h.dial.closedLate" : "h.dial.closed");
  if (r.phase === "open") {
    const s = Math.round((r.left * r.slotMs) / 1000);
    if (s < 1) return t(r.left === 1 ? "h.dial.shortOne" : "h.dial.short");
    return t(r.left === 1 ? "h.dial.openOne" : "h.dial.open", { s });
  }
  if (r.phase === "sealed") return t("h.dial.sealed");
  if (r.phase === "seeded") return t("h.dial.seeded");
  return t("h.dial.served");
}

/** The one line a halted market gets (chain): what is true, and whether the keeper is late. */
export function haltLine(t: T, h: Halt, slotMs: number, slots: number): string {
  const n = h.round ? roundNum(h.round) : "";
  const s = Math.max(1, Math.round((h.late * slotMs) / 1000));
  if (h.kind === "none") return t("h.halt.none");
  if (h.kind === "offline") return t("h.halt.offline", { s });
  if (h.kind === "paused") return t("h.halt.paused", { n });
  if (h.kind === "closing") return h.stalled ? t("h.halt.closingLate", { n, s }) : t("h.halt.closing", { n, slots });
  return h.stalled ? t("h.halt.betweenLate", { s }) : t("h.halt.between", { n });
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
