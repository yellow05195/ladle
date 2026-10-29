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
 *
 * Chain mode (v21.3; v25: no "take to my wallet", LADLE never leaves the
 * game): the scoop sits in the program until the viewer sells it back, so
 * the keys are the sell back and "Keep LADLE", as in the demo; what is left
 * and what was done come from the live snapshot, so a result reopened later
 * is still current. `LeftStub` sells back, at the price it shows, an older
 * round's scoop still in the program. `BackStub` says
 * when a round of the viewer's was not drawn (its randomness never came) and
 * gives their stake back, in full (the sdk's refund, paid by the viewer).
 */
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import type { T } from "../../../i18n";
import { useT } from "../../../i18n/client";
import type { LiveWindow, ScoopLeft, ScoopOutcome, StakeBack } from "../../../lib/data/types";
import { formatSol } from "../../../lib/format";
import { multiplierOf } from "../../../lib/law-settle";
import { playerColor } from "../../../lib/colors";
import { HIcon } from "../../ui/icons";
import { Arr } from "../../ui/house";
import { useLiveActions, useLiveSelect } from "../../live/LiveProvider";
import { ladle, mult, roundNum, sumDecimals } from "../fmt";
import { hallBus, useHall } from "../store";
import { ShareDialog } from "./ShareDialog";

const sol4 = (l: bigint) => formatSol(l, 4);

/** Why a sell back did not happen, in one line (the wallet said no, the price moved past its bound, or the transaction failed). */
export function txReason(t: T, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel|declin/i.test(msg)) return t("h.reason.declined");
  return /price moved|SlippageExceeded/i.test(msg) ? t("h.rs.priceMoved") : t("h.rs.takeFailed");
}

/**
 * Chain: the viewer's scoops still in the program from rounds not on screen,
 * the newest first, sold back one at a time at the price the line shows (the
 * sale is bound to it: SlippageExceeded past 1 % less). A secondary key, like
 * the folded result's Open: the dock's scoop key stays the one main key on screen.
 */
export function LeftStub({ left, phone = false }: { left: ScoopLeft[]; phone?: boolean }) {
  const t = useT();
  const { sellBack } = useLiveActions();
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const x = left[0]!;
  const vars = { n: roundNum(x.id), tokens: ladle(x.tokens), sol: sol4(x.sellBack) };
  const text = why ?? (left.length > 1 ? t("h.rs.leftMore", { ...vars, k: left.length - 1 }) : t("h.rs.left", vars));
  const sell = () => {
    if (busy) return;
    setBusy(true); setWhy(null);
    void sellBack(x.id).catch((e) => setWhy(txReason(t, e))).finally(() => setBusy(false));
  };
  const key = <button type="button" className={`key sec ${phone ? "xs" : "s"} ${busy ? "busy" : ""}`} onClick={sell} aria-disabled={busy || undefined}>{busy ? t("h.dock.waiting") : t("h.rs.sellShort")}</button>;
  return phone
    ? <div className="pnote" aria-live="polite"><span className="t">{text}</span>{key}</div>
    : <div className="rs-stub" aria-live="polite"><span>{text}</span>{key}</div>;
}

/**
 * Chain: the viewer's stakes in rounds that were not drawn, newest first, taken back one at a time. Shown before the
 * scoops left (SOL waiting in a round matters more), with the same secondary key.
 */
export function BackStub({ back, phone = false }: { back: StakeBack[]; phone?: boolean }) {
  const t = useT();
  const { refund } = useLiveActions();
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const x = back[0]!;
  const vars = { n: roundNum(x.id), sol: sol4(x.amount) };
  const text = why ?? (back.length > 1 ? t("h.rs.backMore", { ...vars, k: back.length - 1 }) : t("h.rs.back", vars));
  const take = () => {
    if (busy) return;
    setBusy(true); setWhy(null);
    void refund(x.id).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setWhy(/reject|denied|cancel|declin/i.test(msg) ? t("h.reason.declined") : t("h.rs.backFailed"));
    }).finally(() => setBusy(false));
  };
  const key = <button type="button" className={`key sec ${phone ? "xs" : "s"} ${busy ? "busy" : ""}`} onClick={take} aria-disabled={busy || undefined}>{busy ? t("h.dock.waiting") : t("h.rs.backKey")}</button>;
  return phone
    ? <div className="pnote" aria-live="polite"><span className="t">{text}</span>{key}</div>
    : <div className="rs-stub" aria-live="polite"><span>{text}</span>{key}</div>;
}

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

/** v21.4 (perf): chain only, what is left of round `id` and what the viewer did with it, as the live snapshot says (re-read on a tick, re-rendered only when it changes) */
const scoopLeftOf = (x: LiveWindow | null, id: string): ScoopLeft | null => x?.scoopsLeft?.find((y) => y.id === id) ?? null;
const sameScoop = (a: ScoopLeft | null, b: ScoopLeft | null) => a === b || (!!a && !!b && a.id === b.id && a.tokens === b.tokens && a.sellBack === b.sellBack);
const outcomeOf = (x: LiveWindow | null, id: string): ScoopOutcome | null => x?.outcomes?.[id] ?? null;
const sameOutcome = (a: ScoopOutcome | null, b: ScoopOutcome | null) => a === b || (!!a && !!b && a.kind === b.kind && a.tokens === b.tokens && a.sol === b.sol);

export function ResultSheet({ w, myScarf, live, head, onClose }: { w: LiveWindow; myScarf?: string; live: boolean; head?: ReactNode; onClose: () => void }) {
  const t = useT();
  const { sellBack } = useLiveActions();
  const [share, setShare] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [selling, setSelling] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const s = w.settlement!;
  const n = roundNum(w.id);
  const { rows, min, max, sum } = useResultRows(w, myScarf);
  const mine = w.mineIndex !== null ? rows[w.mineIndex] : undefined;
  // chain: what is still in the program for this round, and what the viewer did with it, from the live snapshot
  const chain = w.source === "chain";
  const left = useLiveSelect((x) => (chain ? scoopLeftOf(x, w.id) : null), { active: chain, key: w.id, equal: sameScoop });
  const done = useLiveSelect((x) => (chain ? outcomeOf(x, w.id) : null), { active: chain, key: w.id, equal: sameOutcome });
  const sold = w.phase === "sold" || done?.kind === "sold";
  const soldFor = w.soldFor ?? (done?.kind === "sold" ? done.sol : null);
  const taken = done?.kind === "taken";
  const bounty = w.total - s.toCurve - s.platformFee - s.hostFee;
  // the "In: total = parts" line adds up on screen: the fewest decimals (3 to 9) at which the shown parts sum to the shown total
  // (formatSol truncates, so at 3 decimals 2.734 = 2.706 + 0.027 could be printed; verify pass)
  const sumDec = sumDecimals(w.total, [s.toCurve, s.platformFee, s.hostFee, bounty > 0n ? bounty : 0n]);
  const solX = (v: bigint) => formatSol(v, sumDec);
  const feePct = `${(Number(s.platformFee) / Math.max(1, Number(w.total)) * 100).toFixed(2)} %`;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !share) onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose, share]);

  const doSell = () => { setSelling(true); void sellBack().finally(() => { setSelling(false); setConfirm(false); }); };
  const doSellChain = () => {
    if (selling) return;
    setSelling(true); setWhy(null);
    void sellBack(w.id).catch((e) => setWhy(txReason(t, e))).finally(() => { setSelling(false); setConfirm(false); });
  };

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

  // chain: sell back (with its confirm) and keep, as in the demo, while the scoop is in the program (it never leaves for a wallet)
  const chainKeys = !left || sold || taken ? null : confirm ? (
    <div className="confirm" role="group" aria-label={t("h.rs.sell")}>
      <p>{t("h.rs.confirmLine", { tokens: ladle(left.tokens), sol: sol4(left.sellBack) })}</p>
      <div className="pair">
        <button type="button" className={`key char s ${selling ? "busy" : ""}`} onClick={doSellChain} aria-disabled={selling || undefined}>{selling ? t("h.rs.selling") : t("h.rs.confirm")}</button>
        <button type="button" className="key char s" onClick={() => setConfirm(false)} disabled={selling}>{t("h.rs.cancel")}</button>
      </div>
    </div>
  ) : (
    <>
      <div className="pair">
        <button type="button" className="key char s" onClick={() => { setWhy(null); setConfirm(true); }} aria-label={t("h.rs.sell")}>
          <span className="lg" aria-hidden="true">{t("h.rs.sell")}</span><span className="sm" aria-hidden="true">{t("h.rs.sellShort")}</span>
        </button>
        <button type="button" className="key char s" onClick={onClose}>{t("h.rs.keep")}</button>
      </div>
      <p className="sub note" aria-live="polite">{why ?? t("h.rs.keepNote")}</p>
    </>
  );
  const scoopKeys = chain ? chainKeys : sold || !live ? null : confirm ? (
    <div className="confirm" role="group" aria-label={t("h.rs.sell")}>
      <p>{t("h.rs.confirmLine", { tokens: ladle(s.myShare ?? 0n), sol: sol4(s.mySellBack ?? 0n) })}</p>
      <div className="pair">
        <button type="button" className={`key char s ${selling ? "busy" : ""}`} onClick={doSell} aria-disabled={selling || undefined}>{selling ? t("h.rs.selling") : t("h.rs.confirm")}</button>
        <button type="button" className="key char s" onClick={() => setConfirm(false)}>{t("h.rs.cancel")}</button>
      </div>
    </div>
  ) : (
    <div className="pair">
      {/* phones: the short label keeps both keys on one line, side by side and the same size */}
      <button type="button" className="key char s" onClick={() => setConfirm(true)} aria-label={t("h.rs.sell")} aria-disabled={s.mySellBack === null || undefined} disabled={s.mySellBack === null}>
        <span className="lg" aria-hidden="true">{t("h.rs.sell")}</span><span className="sm" aria-hidden="true">{t("h.rs.sellShort")}</span>
      </button>
      <button type="button" className="key char s" onClick={onClose}>{t("h.rs.keep")}</button>
    </div>
  );

  return (
    <section className={`rsheet hud-pane ${share ? "sharing" : ""} ${mine ? "" : "watched"}`} aria-labelledby="rs-title">
      <button type="button" className="icon-btn round x" aria-label={t("h.rs.close")} onClick={onClose}><HIcon name="close" /></button>
      <div className="rhd">
        <h2 id="rs-title" className="display-m">{t("h.rs.title", { n })}</h2>
        <p className="label">{t(w.entries.length === 1 ? "h.rs.playersOne" : "h.rs.players", { players: w.entries.length })}</p>
        {/* the live round while this sheet hides the instruments: the countdown stays in sight */}
        {head ? <p className="label live">{head}</p> : null}
      </div>
      {mine && s.myShare !== null && s.myMultiplier !== null ? (
        <div className={`mine plate-cream ${confirm ? "confirming" : ""}`}>
          <span className="label">{t("h.rs.yours")}</span>
          <p className="num-l">{ladle(s.myShare)}<span className="unit">LADLE</span></p>
          {sold && soldFor !== null ? (
            <p className="sold">{t("h.rs.soldShort", { sol: sol4(soldFor) })} <span className="sub">· {mult(s.myMultiplier)}</span></p>
          ) : chain ? (
            <p className="sub">{taken ? t("h.rs.inWallet", { m: mult(s.myMultiplier) }) : left ? t("h.rs.subLine", { m: mult(s.myMultiplier), sol: sol4(left.sellBack) }) : t("h.rs.kept", { m: mult(s.myMultiplier) })}</p>
          ) : (
            <p className="sub">{live ? t("h.rs.subLine", { m: mult(s.myMultiplier), sol: sol4(s.mySellBack ?? 0n) }) : t("h.rs.kept", { m: mult(s.myMultiplier) })}</p>
          )}
          {scoopKeys}
        </div>
      ) : (
        <div className="spect">
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
          {t("h.rs.sum1", { total: solX(w.total), toCurve: solX(s.toCurve), fee: solX(s.platformFee), pct: feePct })}
          {s.hostFee > 0n ? t("h.rs.sumHost", { host: solX(s.hostFee) }) : ""}
          {bounty > 0n ? t("h.rs.sumBounty", { bounty: solX(bounty) }) : ""}
          {" "}{t("h.rs.sum2", { tokens: ladle(sum) })}
        </p>
        {!w.seedHex && w.entries.length === 1 ? <p className="seedline"><span className="seed">{t("h.rs.noDraw")}</span></p> : null}
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
