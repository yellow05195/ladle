"use client";

/**
 * The instruments (v21.1, §7.7), free-standing on the right scrim with no
 * plate: the round number and its cream state tag, the countdown (never
 * coloured), its label, the progress stem, three facts separated by air,
 * then the curve price as a past price, or the cream receipt after an entry,
 * or the folded result as a plate stub. 768-1023: a compact top-right block.
 * Carries .hud-pane so name tags never sit under it.
 */
import type { ReactNode } from "react";
import { useT } from "../../../i18n/client";
import type { LiveWindow } from "../../../lib/data/types";
import { Fact, RollingFigure, StateTag, Stem } from "../../ui/house";
import { price4, sol2 } from "../fmt";
import { useCurve } from "../useHistory";
import { dialLabel, phaseWord, roundView, stateWord } from "./round";

export function Instruments({ w, transient, stub, note, folded }: { w: LiveWindow; transient: string | null; stub?: ReactNode; note?: ReactNode; folded?: ReactNode }) {
  const t = useT();
  const r = roundView(w);
  const pts = useCurve();
  const now = pts?.length ? pts[pts.length - 1]!.after : null;
  const potText = sol2(r.pot);
  const cap = String(Number(w.capBps) / 100);
  return (
    <aside className={`instr hud-pane halo hud-in ${stub ? "has-stub" : ""}`} aria-label={t("h.room.instruments")}>
      <p className="rno" aria-live="polite"><b>{t("h.room.roundNo", { n: r.n })}</b><StateTag word={stateWord(t, r.phase)} /></p>
      <p className="tablet-head">{t("h.room.roundNo", { n: r.n })} · {phaseWord(t, r.phase, r.total)}</p>
      <div className="dial">
        {/* the countdown ticks about 4 times a second: each changed digit fades in, it never rolls */}
        <RollingFigure text={String(r.left)} className="num-dial" mode="fade" />
      </div>
      <p className="dial-label label">{dialLabel(t, r)}</p>
      <p className="transient label" aria-live="polite">{transient ?? ""}</p>
      <Stem elapsed={r.elapsed} total={r.total} />
      <p className="tablet-line fine">{t(r.players === 1 ? "h.room.tabletLineOne" : "h.room.tabletLine", { pot: sol2(r.pot), players: r.players, cap: `${cap} %` })}</p>
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
      {stub ? <div className="stub-slot">{stub}</div> : null}
      {folded}
    </aside>
  );
}
