"use client";

/**
 * The instruments (v21.1, §7.7), free-standing on the right scrim with no
 * plate: the round number and its cream state tag, the countdown (never
 * coloured, never animated per tick: tabular figures hold it still and the
 * progress stem carries the motion), its label, the stem, three facts
 * separated by air, then the curve price as a past price, or the cream
 * receipt after an entry, or the folded result as a plate stub.
 *
 * While the viewer's own round seals, draws or is served and the dial
 * already counts the next round, the receipt heads the column (with its own
 * round's state tag) and the dial is labelled "Next round", so the biggest
 * figure never reads as the viewer's round. 768-1023: a compact top-right
 * block. Carries .hud-pane so name tags never sit under it.
 *
 * v21.4 (perf): the column renders when the round's frame changes (its
 * number, its state, the receipt, the note); the dial, its label, the stem,
 * the facts and the curve price are LiveFigures, each re-rendered by its own
 * slice of the live window, so a tick never re-renders the column.
 */
import type { ReactNode } from "react";
import { useT } from "../../../i18n/client";
import { StateTag } from "../../ui/house";
import { phaseWord, stateWord, useMedia } from "./round";
import { Countdown, CurvePrice, DialLabel, InstrFacts, LiveStem, PotPlayers, useHead } from "./LiveFigures";

export function Instruments({ capBps, transient, stub, stubTop = false, note, folded }: { capBps: bigint; transient: string | null; stub?: ReactNode; /** the receipt is for the focused round, not the one the dial counts: it heads the column */ stubTop?: boolean; note?: ReactNode; folded?: ReactNode }) {
  const t = useT();
  const r = useHead();
  // the pot and the players show once: as a figure at 768-1023 (hall.css), as facts elsewhere; the hidden pair is frozen
  const tablet = useMedia("(min-width: 768px) and (max-width: 1023px)");
  if (!r) return null;
  const cap = String(Number(capBps) / 100);
  const top = !!stub && stubTop;
  return (
    <aside className={`instr hud-pane halo hud-in ${stub ? "has-stub" : ""} ${top ? "stub-top" : ""}`} aria-label={t("h.room.instruments")}>
      {top ? <div className="stub-slot top">{stub}</div> : null}
      {top ? (
        <p className="rno next" aria-live="polite"><span className="label">{t("h.room.nextRound", { n: r.n })}</span><StateTag word={stateWord(t, r.phase, r.halt)} /></p>
      ) : (
        <p className="rno" aria-live="polite"><b>{t("h.room.roundNo", { n: r.n })}</b><StateTag word={stateWord(t, r.phase, r.halt)} /></p>
      )}
      <p className="tablet-head">{top ? t("h.room.nextRound", { n: r.n }) : `${t("h.room.roundNo", { n: r.n })} · ${phaseWord(t, r.phase, r.total, r.halt)}`}</p>
      <div className="dial">
        <Countdown className="num-dial" />
      </div>
      <DialLabel />
      <p className="transient label" aria-live="polite">{transient ?? ""}</p>
      <LiveStem />
      {/* 768-1023: the pot as a figure, as on phones (the fee line in the dock carries the cap) */}
      <div className="tablet-pot">
        <PotPlayers active={tablet} />
      </div>
      <InstrFacts cap={cap} active={!tablet} />
      {note ? <p className="note label" aria-live="polite">{note}</p> : null}
      <CurvePrice />
      {stub && !top ? <div className="stub-slot">{stub}</div> : null}
      {folded}
    </aside>
  );
}
