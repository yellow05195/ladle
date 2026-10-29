"use client";

/**
 * The HUD's live figures (v21.4, perf). The data source ticks every slot and
 * every arrival, 5 to 9 times a second; each figure here subscribes to its
 * own slice of the live window (LiveProvider's useLiveSelect) and re-renders
 * alone when that slice changes, never the playbill, the room or the hall
 * around it. The countdown and the stem follow every slot (one commit per
 * slot; the stem's 400 ms glide restarts before it ends: one continuous
 * motion); the facts that move with arrivals (players, pot) change about
 * every FACT_MS at most, on a tick, one roll then a breath. `active: false`
 * freezes a figure (the playbill once scrolled away; a line hidden at this
 * width).
 * The markup is the one each place had: a figure renders its Fact, its span
 * or its stem, nothing around it.
 */
import { memo } from "react";
import { useT } from "../../../i18n/client";
import { useLiveSelect } from "../../live/LiveProvider";
import { useCurve } from "../useHistory";
import { Fact, RollingFigure, Stem } from "../../ui/house";
import { price4, sol2 } from "../fmt";
import { FACT_MS, dialLabel, elapsedOf, haltLine, leftOf, phaseWord, playersOf, potOf, sameDial, sameHead, sameShort, slotsLeft, totalOf, viewOf, type RoundView } from "./round";

/** The round in view for a head (number, state word): changes once per round and phase. */
export const useHead = (active = true) => useLiveSelect(viewOf, { active, equal: sameHead });

/** The slots left as a figure that swaps every slot (tabular figures hold it still; the stem carries the motion). */
export const Countdown = memo(function Countdown({ className = "", active = true }: { className?: string; active?: boolean }) {
  const left = useLiveSelect(leftOf, active);
  return <RollingFigure text={String(left)} className={className} mode="swap" />;
});

/** The playbill's "N slots left" fact. */
export const LeftFact = memo(function LeftFact({ active = true }: { active?: boolean }) {
  const t = useT();
  const left = useLiveSelect(leftOf, active);
  return <Fact value={<RollingFigure text={String(left)} mode="swap" />} label={t(left === 1 ? "h.pb.slot" : "h.pb.slots")} />;
});

/** The players fact. */
export const PlayersFact = memo(function PlayersFact({ active = true }: { active?: boolean }) {
  const t = useT();
  const players = useLiveSelect(playersOf, { active, every: FACT_MS });
  return <Fact value={<RollingFigure text={String(players)} />} label={t(players === 1 ? "h.fact.playersOne" : "h.fact.players")} />;
});

/** The pot fact, SOL. */
export const PotFact = memo(function PotFact({ active = true }: { active?: boolean }) {
  const t = useT();
  const pot = useLiveSelect(potOf, { active, every: FACT_MS });
  return <Fact value={<RollingFigure text={sol2(pot)} />} unit="SOL" label={t("h.fact.pot")} />;
});

/** The progress stem of the round in view. */
export const LiveStem = memo(function LiveStem({ active = true, thin = false, className = "" }: { active?: boolean; thin?: boolean; className?: string }) {
  const elapsed = useLiveSelect(elapsedOf, active);
  const total = useLiveSelect(totalOf, active);
  return <Stem elapsed={elapsed} total={total} thin={thin} className={className} />;
});

/** The playbill's one-line short form (narrow screens): the round, the slots left, the players and the pot, or the halt. */
export const ShortLine = memo(function ShortLine({ wide, active = true }: { wide: boolean; active?: boolean }) {
  const t = useT();
  const r = useLiveSelect(viewOf, { active, equal: sameShort });
  if (!r) return null;
  return (
    <p className="pb-short fine hud-in">{r.halt ? haltLine(t, r.halt, r.slotMs, r.total) : t(wide ? (r.players === 1 ? "h.pb.shortOne" : "h.pb.short") : (r.players === 1 ? "h.pb.shortPhoneOne" : "h.pb.shortPhone"), { n: r.n, left: slotsLeft(t, r.left), players: r.players, pot: sol2(r.pot) })}</p>
  );
});

const openKey = (r: RoundView | null) => (r ? `${r.n}|${r.phase}|${r.total}|${r.halt?.kind ?? ""}|${r.phase === "open" && !r.halt ? r.left : ""}` : "");
const sameOpen = (a: RoundView | null, b: RoundView | null) => openKey(a) === openKey(b);
/** The live round in one line, over the result sheet while it hides the instruments ("Round No. N · open · 12 slots left"). */
export const OpenLine = memo(function OpenLine() {
  const t = useT();
  const r = useLiveSelect(viewOf, { equal: sameOpen });
  if (!r) return null;
  return <>{r.phase === "open" && !r.halt ? t("h.room.openLine", { n: r.n, phase: phaseWord(t, r.phase, r.total), left: slotsLeft(t, r.left) }) : `${t("h.room.roundNo", { n: r.n })} · ${phaseWord(t, r.phase, r.total, r.halt)}`}</>;
});

/** The instruments' label under the dial ("about 12 s left", "sealed" ...): changes with the whole seconds. */
export const DialLabel = memo(function DialLabel() {
  const t = useT();
  const r = useLiveSelect(viewOf, { equal: sameDial });
  return <p className="dial-label label">{r ? dialLabel(t, r) : ""}</p>;
});

/** The pot as a figure and the players under it (the instruments at 768-1023, the phone strip's right cell). */
export const PotPlayers = memo(function PotPlayers({ active = true }: { active?: boolean }) {
  const t = useT();
  const pot = useLiveSelect(potOf, { active, every: FACT_MS });
  const players = useLiveSelect(playersOf, { active, every: FACT_MS });
  return (
    <>
      <span className="num-m"><RollingFigure text={sol2(pot)} /><span className="unit">SOL</span></span>
      <span className="label">{t(players === 1 ? "h.room.phonePotOne" : "h.room.phonePot", { players })}</span>
    </>
  );
});

/** The instruments' three facts: the pot, the players and the cap (the row widens for a long pot). */
export const InstrFacts = memo(function InstrFacts({ cap, active = true }: { cap: string; active?: boolean }) {
  const t = useT();
  const pot = useLiveSelect(potOf, { active, every: FACT_MS });
  const players = useLiveSelect(playersOf, { active, every: FACT_MS });
  const potText = sol2(pot);
  return (
    <div className={`facts ${potText.length >= 5 ? "pot-row" : ""}`}>
      <Fact value={<RollingFigure text={potText} />} unit="SOL" label={t("h.fact.pot")} />
      <Fact value={<RollingFigure text={String(players)} />} label={t(players === 1 ? "h.fact.playersOne" : "h.fact.players")} />
      <Fact value={cap} unit="%" label={t("h.fact.cap")} />
    </div>
  );
});

/** The phone strip's centre cell: the countdown and its short label. */
export const StripCount = memo(function StripCount() {
  const t = useT();
  const left = useLiveSelect(leftOf);
  return <><RollingFigure text={String(left)} className="num-dial" mode="swap" /><span className="label">{t(left === 1 ? "h.dial.shortOne" : "h.dial.short")}</span></>;
});

/** The curve's price as a past price (it changes when a round is served or sold back, never on a tick). */
export const CurvePrice = memo(function CurvePrice() {
  const t = useT();
  const pts = useCurve();
  const now = pts?.length ? pts[pts.length - 1]!.after : null;
  if (now === null) return null;
  return (
    <div className="curve">
      <span className="num-m">{price4(now)}</span>
      <span className="label">{t("h.curve.label")}</span>
      <span className="label">{t("h.curve.past")}</span>
    </div>
  );
});
