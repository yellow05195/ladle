"use client";

/**
 * The result sheet (v21.1, §7.12): a charcoal plate on the right, from the
 * top bar to the rail, never crossing the drum (its width is measured
 * against hall.drumRect); 768-1023 a band above the dock; phones a bottom
 * sheet. The viewer's scoop on a cream plate (or the round's single buy for
 * a spectator) with two equal keys side by side, then every player in
 * ARRIVAL order in two columns, all rows identical (the viewer's name only
 * heavier), every value in ink at one size, the smallest and the largest in
 * one style, the sums computed, never typed. No colour on any value; never
 * "play again"; no main key. It folds after the same hold for every result
 * (RoomHud).
 */
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useT } from "../../../i18n/client";
import type { LiveWindow } from "../../../lib/data/types";
import { formatSol } from "../../../lib/format";
import { multiplierOf } from "../../../lib/law-settle";
import { playerColor } from "../../../lib/colors";
import { HIcon } from "../../ui/icons";
import { Arr } from "../../ui/house";
import { useLive } from "../../live/LiveProvider";
import { ladle, mult, roundNum, sol3 } from "../fmt";
import { hallBus, useHall } from "../store";
import { ShareDialog } from "./ShareDialog";

const sol4 = (l: bigint) => formatSol(l, 4);
/** "ff3429a1…b127" → "ff34 29a1 … b127" */
export const seedGroups = (hex: string) => `${hex.slice(0, 4)} ${hex.slice(4, 8)} … ${hex.slice(-4)}`;

export function useResultRows(w: LiveWindow, myScarf?: string) {
  return useMemo(() => {
    const s = w.settlement!;
    const rows = w.entries.map((e) => ({
      e,
      name: e.mine ? hallBus.myName : e.label,
      color: e.mine && myScarf ? myScarf : playerColor(e.label),
      m: e.share !== undefined ? multiplierOf(e.share, e.amount, w.total, s.tokensOut) : 1,
    }));
    const ms = rows.map((r) => r.m);
    const sum = w.entries.reduce((a, e) => a + (e.share ?? 0n), 0n);
    return { rows, min: Math.min(...ms), max: Math.max(...ms), sum };
  }, [w, myScarf]);
}

export function ResultSheet({ w, myScarf, live, head, onClose }: { w: LiveWindow; myScarf?: string; live: boolean; head?: ReactNode; onClose: () => void }) {
  const t = useT();
  const { sellBack } = useLive();
  const [share, setShare] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [selling, setSelling] = useState(false);
  const s = w.settlement!;
  const n = roundNum(w.id);
  const { rows, min, max, sum } = useResultRows(w, myScarf);
  const mine = w.mineIndex !== null ? rows[w.mineIndex] : undefined;
  const sold = w.phase === "sold";
  const bounty = w.total - s.toCurve - s.platformFee - s.hostFee;
  const feePct = `${(Number(s.platformFee) / Math.max(1, Number(w.total)) * 100).toFixed(2)} %`;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !share) onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose, share]);

  const doSell = () => { setSelling(true); void sellBack().finally(() => { setSelling(false); setConfirm(false); }); };

  // §7.12: 440 wide at most, and never over the drum (it may enter the clear zone's padding)
  const drumRight = useHall((h) => (h.drumRect ? Math.round((h.drumRect.x + h.drumRect.w) / 8) * 8 : null));
  // measured once the camera has settled (a debounce), so the sheet never pulses while the drum glides aside
  useLayoutEffect(() => {
    const root = document.documentElement;
    let id = 0;
    const put = () => {
      const W = window.innerWidth;
      if (W < 1024) { root.style.removeProperty("--rs-w"); return; }
      const cs = getComputedStyle(root);
      const right = (parseFloat(cs.getPropertyValue("--gutter")) || 40) - (parseFloat(cs.getPropertyValue("--plate-in")) || 16);
      const room = drumRight !== null ? W - right - drumRight - 16 : 440;
      root.style.setProperty("--rs-w", `${Math.round(Math.max(360, Math.min(440, room)))}px`);
    };
    id = window.setTimeout(put, 900);
    const on = () => { clearTimeout(id); id = window.setTimeout(put, 120); };
    window.addEventListener("resize", on);
    return () => { clearTimeout(id); window.removeEventListener("resize", on); };
  }, [drumRight]);
  useEffect(() => () => { document.documentElement.style.removeProperty("--rs-w"); }, []);

  const scoopKeys = sold || !live ? null : confirm ? (
    <div className="confirm" role="group" aria-label={t("h.rs.sell")}>
      <p>{t("h.rs.confirmLine", { tokens: ladle(s.myShare ?? 0n), sol: sol4(s.mySellBack ?? 0n) })}</p>
      <div className="pair">
        <button type="button" className={`key char s ${selling ? "busy" : ""}`} onClick={doSell} aria-disabled={selling || undefined}>{selling ? t("h.rs.selling") : t("h.rs.confirm")}</button>
        <button type="button" className="key char s" onClick={() => setConfirm(false)}>{t("h.rs.cancel")}</button>
      </div>
    </div>
  ) : (
    <div className="pair">
      <button type="button" className="key char s" onClick={() => setConfirm(true)} aria-disabled={s.mySellBack === null || undefined} disabled={s.mySellBack === null}>{t("h.rs.sell")}</button>
      <button type="button" className="key char s" onClick={onClose}>{t("h.rs.keep")}</button>
    </div>
  );

  return (
    <section className="rsheet hud-pane" aria-labelledby="rs-title">
      <button type="button" className="icon-btn round x" aria-label={t("h.rs.close")} onClick={onClose}><HIcon name="close" /></button>
      <div className="rhd">
        <h2 id="rs-title" className="display-m">{t("h.rs.title", { n })}</h2>
        <p className="label">{t(w.entries.length === 1 ? "h.rs.playersOne" : "h.rs.players", { players: w.entries.length })}</p>
        {head ? <p className="sr-only">{head}</p> : null}
      </div>
      {mine && s.myShare !== null && s.myMultiplier !== null ? (
        <div className="mine plate-cream">
          <span className="label">{t("h.rs.yours")}</span>
          <p className="num-l">{ladle(s.myShare)}<span className="unit">LADLE</span></p>
          {sold && w.soldFor !== null ? (
            <p className="sold">{t("h.rs.soldShort", { sol: sol4(w.soldFor) })} <span className="sub">· {mult(s.myMultiplier)}</span></p>
          ) : (
            <p className="sub">{live ? t("h.rs.subLine", { m: mult(s.myMultiplier), sol: sol4(s.mySellBack ?? 0n) }) : t("h.rs.kept", { m: mult(s.myMultiplier) })}</p>
          )}
          {scoopKeys}
        </div>
      ) : (
        <div className="spect">
          <p className="title">{t("h.rs.spect", { players: w.entries.length })}</p>
          <div className="fact"><span className="num-m">{ladle(sum)}<span className="unit">LADLE</span></span><span className="label">{t("h.rs.single")}</span></div>
        </div>
      )}
      <div className="lhead">
        <p className="title">{t("h.rs.order")}</p>
        <button type="button" className="act sm" onClick={() => setShare(true)} aria-label={t("h.rs.share", { n })}>{t("h.rs.shareShort")}<Arr /></button>
      </div>
      <ol className={`rlist ${rows.length >= 15 ? "long" : ""}`} style={{ ["--rows" as string]: Math.ceil(rows.length / 2) }}>
        {rows.map((r) => (
          <li key={r.e.index}>
            <i className="pdot" style={{ ["--pc" as string]: r.color }} aria-hidden="true" />
            <span className={`n ${r.e.mine ? "me" : ""}`} title={r.name}>{r.name}</span>
            <span className="v">{ladle(r.e.share ?? 0n)}</span>
            <span className="v m">{mult(r.m)}</span>
          </li>
        ))}
      </ol>
      <div className="sums">
        <p className="ext">{t("h.rs.extremes", { min: mult(min), max: mult(max) })}</p>
        <p className="fine">
          {t("h.rs.sum1", { total: sol3(w.total), toCurve: sol3(s.toCurve), fee: sol3(s.platformFee), pct: feePct })}
          {s.hostFee > 0n ? t("h.rs.sumHost", { host: sol3(s.hostFee) }) : ""}
          {bounty > 0n ? t("h.rs.sumBounty", { bounty: sol3(bounty) }) : ""}
          {" "}{t("h.rs.sum2", { tokens: ladle(sum) })}
        </p>
        {w.seedHex ? (
          <p className="seedline">
            <span className="seed">{t("h.rs.seed", { seed: seedGroups(w.seedHex) })} ·</span>
            <Link className="act sm" href={`/window/${w.id}#recompute`}>{t("h.rs.recompute")}<Arr /></Link>
          </p>
        ) : null}
      </div>
      {share ? <ShareDialog n={n} id={w.id} players={w.entries.length} tiles={rows.map((r) => ({ name: r.name, m: r.m, mine: r.e.mine, tokens: ladle(r.e.share ?? 0n), color: r.color }))} mine={mine ? mine.m : null} myTokens={mine && s.myShare !== null ? ladle(s.myShare) : null} myName={mine ? mine.name : null} sum={ladle(sum)} seed8={(w.seedHex ?? "").slice(0, 8)} demo={w.source === "demo"} onClose={() => setShare(false)} /> : null}
    </section>
  );
}
