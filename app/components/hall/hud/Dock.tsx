"use client";

/**
 * The dock (v21.1, §7.5): one charcoal plate at the bottom centre, between
 * the chat plate and the instruments, clear of the drum. The stake wells and
 * the one main key, the fee line written out, and a reason line when the
 * action is disabled or failed. The watching, entered, sealed and seeded
 * states are one line each, in the dock, never over the drum. Its resting
 * state is the same whatever the last result was. Phones: no plate.
 * Chain mode (v21.3): when no round takes entries (`w.halt`), one line says
 * what is true (no round yet, closed and not sealed, the keeper late) and
 * there is no scoop key.
 * v21.4 (perf): the cap moves with every arrival, so the dock reads it from
 * the live window itself (and only while the stake wells show); the rest of
 * the room no longer re-renders on a tick.
 */
import { useT } from "../../../i18n/client";
import type { LiveWindow } from "../../../lib/data/types";
import { useLiveActions, useLiveSelect } from "../../live/LiveProvider";
import { roundNum, solShort } from "../fmt";
import { haltLine, pctBps } from "./round";
import { StakeSelector } from "./StakeSelector";

export type DockState = "watching" | "open" | "entered" | "mineSealed" | "mineSeeded" | "halt" | "sealed" | "seeded" | "none";

/**
 * v21 r1: `canEnter` is true whenever some round takes entries (the focused
 * one, or its open sibling while the focused one draws: see round.ts
 * entryRound). The sealed and seeded lines show only when no round is open.
 */
export function dockState(w: LiveWindow | null, seated: boolean, canEnter: boolean): DockState {
  if (!w) return "none";
  if (!seated) return "watching";
  if (w.phase === "open" && w.mineIndex !== null) return "entered";
  if (canEnter) return "open";
  // chain: no round takes entries; the viewer's own drawing round keeps its line, unless it is the one the keeper left unsealed
  const ownDrawing = w.mineIndex !== null && (w.phase === "sealed" || w.phase === "seeded");
  if (w.halt && (!ownDrawing || w.halt.round === w.id)) return "halt";
  if (w.mineIndex !== null && w.phase === "sealed") return "mineSealed";
  if (w.mineIndex !== null && w.phase === "seeded") return "mineSeeded";
  if (w.phase === "sealed") return "sealed";
  if (w.phase === "seeded") return "seeded";
  return "none";
}

export function Dock({ w, state, amount, setAmount, busy, reason, setReason, onScoop, onSeat, host, phone = false }: {
  w: LiveWindow; state: DockState; amount: bigint; setAmount: (a: bigint) => void; busy: boolean;
  reason: string | null; setReason: (r: string | null) => void; onScoop: () => void; onSeat: () => void; host?: string | null; phone?: boolean;
}) {
  const t = useT();
  // the largest entry the cap allows right now (a bigint: compared by value, so a tick that leaves it renders nothing)
  const { maxEntry } = useLiveActions();
  const max = useLiveSelect(() => maxEntry(), state === "open");
  const hostFee = w.hostFeeBps > 0n && host ? t("h.dock.hostFee", { pct: pctBps(w.hostFeeBps), host }) : t("h.dock.hostNone");
  const short = t("h.dock.finePhone", { host: hostFee });
  // desktop: the long fee line, and the short one for the narrowed dock beside the result sheet (CSS picks)
  const fine = phone ? short : <><span className="fl">{t("h.dock.fine", { host: hostFee })}</span><span className="fs">{short}</span></>;
  const mine = w.mineIndex !== null ? w.entries[w.mineIndex] : undefined;
  const over = amount > max;
  const Cls = phone ? "pdock" : "dock hud-pane hud-in";
  if (state === "none") return null;
  const halted = w.halt ? haltLine(t, w.halt, w.slotMs, w.slotsTotal) : null;
  if (state === "watching") {
    return (
      <section className={Cls} aria-label={t("h.dock.aria")}>
        <div className="line watch">
          <p role={halted ? "status" : undefined}>{halted ?? t("h.dock.watching")}</p>
          {phone ? null : <button type="button" className="key main" onClick={onSeat}>{t("h.dock.seat")}</button>}
        </div>
        {/* phones hide the watching line: a halt still says what is true above the key */}
        {phone && halted ? <p className="line soft" role="status">{halted}</p> : null}
        {phone ? <button type="button" className="key main wide" onClick={onSeat}>{t("h.dock.seat")}</button> : null}
        <p className="fine">{fine}</p>
      </section>
    );
  }
  const line = (text: string, soft = false, dot = false) => (
    <section className={Cls} aria-label={t("h.dock.aria")}>
      <p className={`line ${soft ? "soft" : ""}`} role="status">{dot ? <span className="me-dot" aria-hidden="true" /> : null}<span>{text}</span></p>
    </section>
  );
  if (state === "entered" && mine) return line(t("h.dock.entered", { sol: solShort(mine.amount), slots: w.slotsTotal }), false, true);
  if (state === "mineSealed") return line(t("h.dock.mineSealed", { n: roundNum(w.id), slots: w.slotsTotal }), false, true);
  if (state === "mineSeeded") return line(t("h.dock.mineSeeded", { n: roundNum(w.id) }), true, true);
  if (state === "halt" && halted) return line(halted, !w.halt?.stalled);
  if (state === "sealed") return line(t("h.dock.sealed", { slots: w.slotsTotal }));
  if (state === "seeded") return line(t("h.dock.seeded"), true);
  const disabled = busy || over || amount <= 0n;
  const amt = solShort(amount);
  return (
    <section className={Cls} aria-label={t("h.dock.aria")}>
      <div className="row1">
        <StakeSelector value={amount} onChange={(a) => { setAmount(a); setReason(null); }} max={max} onHint={(h) => setReason(h)} />
        <button type="button" className={`key main ${busy ? "busy" : ""} ${phone ? "wide" : ""}`} aria-disabled={disabled || undefined} aria-describedby="dock-reason" data-enter
          aria-label={busy ? undefined : t("h.dock.scoop", { amount: amt })} onClick={() => { if (!disabled) onScoop(); }}>
          {busy ? t("h.dock.waiting") : <>{t("h.dock.scoopLabel")}<span className="sub" aria-hidden="true">· {amt}<span className="sol"> SOL</span></span></>}
        </button>
      </div>
      <p className="fine">{fine}</p>
      <p id="dock-reason" className="reason" aria-live="polite">{reason ?? ""}</p>
    </section>
  );
}
