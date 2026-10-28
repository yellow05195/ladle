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
 */
import type { ReactNode } from "react";
import { useT } from "../../../i18n/client";
import type { LiveWindow } from "../../../lib/data/types";
import { Fact, RollingFigure, StateTag, Stem } from "../../ui/house";
import { price4, sol2 } from "../fmt";
import { useCurve } from "../useHistory";
import { dialLabel, phaseWord, roundView, stateWord } from "./round";

export function Instruments({ w, transient, stub, stubTop = false, note, folded }: { w: LiveWindow; transient: string | null; stub?: ReactNode; /** the receipt is for the focused round, not the one the dial counts: it heads the column */ stubTop?: boolean; note?: ReactNode; folded?: ReactNode }) {
  const t = useT();
  const r = roundView(w);
  const pts = useCurve();
  const now = pts?.length ? pts[pts.length - 1]!.after : null;
  const potText = sol2(r.pot);
  const cap = String(Number(w.capBps) / 100);
  const top = !!stub && stubTop;
  const playersLabel = t(r.players === 1 ? "h.room.phonePotOne" : "h.room.phonePot", { players: r.players });
  return (
    <aside className={`instr hud-pane halo hud-in ${stub ? "has-stub" : ""} ${top ? "stub-top" : ""}`} aria-label={t("h.room.instruments")}>
      {top ? <div className="stub-slot top">{stub}</div> : null}
      {top ? (
        <p className="rno next" aria-live="polite"><span className="label">{t("h.room.nextRound", { n: r.n })}</span><StateTag word={stateWord(t, r.phase)} /></p>
      ) : (
        <p className="rno" aria-live="polite"><b>{t("h.room.roundNo", { n: r.n })}</b><StateTag word={stateWord(t, r.phase)} /></p>
      )}
      <p className="tablet-head">{top ? t("h.room.nextRound", { n: r.n }) : `${t("h.room.roundNo", { n: r.n })} · ${phaseWord(t, r.phase, r.total)}`}</p>
      <div className="dial">
        <RollingFigure text={String(r.left)} className="num-dial" mode="swap" />
      </div>
      <p className="dial-label label">{dialLabel(t, r)}</p>
      <p className="transient label" aria-live="polite">{transient ?? ""}</p>
      <Stem elapsed={r.elapsed} total={r.total} />
      {/* 768-1023: the pot as a figure, as on phones (the fee line in the dock carries the cap) */}
      <div className="tablet-pot">
        <span className="num-m"><RollingFigure text={potText} /><span className="unit">SOL</span></span>
        <span className="label">{playersLabel}</span>
      </div>
      <div className={`facts ${potText.length >= 5 ? "pot-row" : ""}`}>
        <Fact value={<RollingFigure text={potText} />} unit="SOL" label={t("h.fact.pot")} />
        <Fact value={<RollingFigure text={String(r.players)} />} label={t(r.players === 1 ? "h.fact.playersOne" : "h.fact.players")} />
        <Fact value={cap} unit="%" label={t("h.fact.cap")} />
      </div>
      {note ? <p className="note label" aria-live="polite">{note}</p> : null}
      {now !== null ? (
        <div className="curve">
          <span className="num-m">{price4(now)}</span>
          <span className="label">{t("h.curve.label")}</span>
          <span className="label">{t("h.curve.past")}</span>
        </div>
      ) : null}
      {stub && !top ? <div className="stub-slot">{stub}</div> : null}
      {folded}
    </aside>
  );
}
