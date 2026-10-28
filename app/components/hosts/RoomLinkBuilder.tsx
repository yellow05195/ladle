"use client";

/**
 * The room link builder (v21.1, /integrate): a handle and a host fee in,
 * and everything a host shares comes out, following them: the line players
 * read at the top of the room (a cream plate: it is yours), the host room
 * link, the main-room link (no host fee, credit only), what one entry
 * splits into (computed by the sdk's splitFees), and the embed snippet.
 * Nothing is sent anywhere. The handle is a well; the fee options are the
 * stake wells (a radiogroup with arrow keys); "available" is never green.
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { BRAND } from "../../../config/brand";
import { useT } from "../../i18n/client";
import { formatSol, LAMPORTS_PER_SOL } from "../../lib/format";
import { splitFees } from "../../lib/law-settle";
import { checkNickname, cleanNickname } from "../../lib/profile";
import { CodeBlock } from "../CodeBlock";
import { P } from "../hall/sections/copy";

const FEES = [0, 50, 100, 200, 300];
const TOTAL = "Total";
/** The decimals that show every line of the split exactly (at least four, as on the entry receipt), so the lines add up to the entry on screen too. */
function exactDecimals(vs: bigint[]): number {
  let d = 4;
  for (const v of vs) d = Math.max(d, (formatSol(v, 9).split(".")[1] ?? "").replace(/0+$/, "").length);
  return Math.min(9, d);
}
const ENTRY = LAMPORTS_PER_SOL / 4n;

function CopyLine({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1600); } catch { setDone(false); }
  };
  return (
    <span className="pg-copy-line">
      <span className="url" title={value}>{value}</span>
      <button type="button" className="key sec s" onClick={copy} aria-label={`${t("h.int.copy")} · ${label}`}>{done ? t("h.int.copied") : t("h.int.copy")}</button>
    </span>
  );
}

export function RoomLinkBuilder({ maxBps }: { maxBps: number }) {
  const t = useT();
  const [raw, setRaw] = useState("");
  const [bps, setBps] = useState(100);
  const group = useRef<HTMLDivElement>(null);
  const handle = cleanNickname(raw);
  const state = handle ? checkNickname(handle) : "empty";
  const shown = state === "ok" ? handle : "yourname";
  const pct = (b: number) => (b / 100).toFixed(2);
  const split = splitFees(ENTRY, BigInt(bps));
  const dec = exactDecimals([split.platform, split.host, split.toCurve]);
  const sol4 = (v: bigint) => formatSol(v, dec);
  const opts = FEES.filter((b) => b <= maxBps);
  const bad = state === "short" || state === "chars" || state === "reserved";
  const hint = state === "short" ? t("h.prof.short") : state === "chars" ? t("h.prof.chars") : state === "reserved" ? t("h.prof.reserved") : t("h.int.handleHelp");
  const room = `${BRAND.domain}/h/${shown}`;
  const main = `https://${BRAND.domain}/play?host=${shown}`;
  const iframe = `<iframe
  src="https://${BRAND.domain}/embed/<mint>?host=${shown}"
  width="420" height="640"
  style="border:0"
  title="${BRAND.name}, ${shown}'s room"
  loading="lazy"
></iframe>`;
  // the fee options: arrow keys move the choice, Home and End jump to the ends
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = opts.indexOf(bps);
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(opts.length - 1, i + 1) : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? opts.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setBps(opts[to]!);
    group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[to]?.focus();
  };
  return (
    <div className="pg-builder">
      <div className="pg-builder-in">
        <label className="ufield">
          <span className="label">{t("h.int.handle")}</span>
          <span className={`well ${bad ? "bad" : ""}`}>
            <span className="pre" aria-hidden="true">@</span>
            <input value={raw} maxLength={16} autoComplete="off" spellCheck={false} placeholder="yourname" onChange={(e) => setRaw(cleanNickname(e.target.value))} aria-describedby="handle-help" aria-invalid={bad || undefined} />
            {state === "ok" ? <span className="avail">{t("h.prof.okChain")}</span> : null}
          </span>
          <span id="handle-help" className={bad ? "reason bad" : "label"} aria-live="polite">{hint}</span>
        </label>
        <div className="ufield">
          <span id="fee-label" className="label">{t("h.int.fee")}</span>
          <div ref={group} className="stakes pg-fee-opts" role="radiogroup" aria-labelledby="fee-label" onKeyDown={onKey}>
            {opts.map((b) => (
              <button key={b} type="button" role="radio" className="stake" aria-checked={bps === b} tabIndex={bps === b ? 0 : -1} onClick={() => setBps(b)}>{pct(b)}</button>
            ))}
          </div>
          <span className="label">{t("h.int.feeHelp")}</span>
        </div>
      </div>
      <div className="plate-cream pg-cream">
        <span className="label">{P.int.roomLabel}</span>
        <p>{t("h.host.room", { host: shown, h: pct(bps) })}</p>
      </div>
      <dl className="pg-out">
        <div><dt className="title">{t("h.int.roomTitle")}</dt><dd><CopyLine value={room} label={t("h.int.roomTitle")} /><span className="fine">{t("h.int.roomNote")}</span></dd></div>
        <div><dt className="title">{t("h.int.mainTitle")}</dt><dd><CopyLine value={main} label={t("h.int.mainTitle")} /><span className="fine">{t("h.host.mainNoFee")} {t("h.host.credit")}</span></dd></div>
        <div><dt className="title">{t("h.int.onEntry", { sol: "0.25" })}</dt><dd>
          <table className="pg-table bare">
            <tbody>
              <tr><td className="nm">{t("h.int.colPlatform")}</td><td className="r fig">{sol4(split.platform)} SOL</td></tr>
              <tr><td className="nm">{t("h.int.fee")} {pct(bps)}{" %"}</td><td className="r fig">{sol4(split.host)} SOL</td></tr>
              <tr><td className="nm">{t("h.int.colCurve")}</td><td className="r fig">{sol4(split.toCurve)} SOL</td></tr>
              <tr className="tot"><td>{TOTAL}</td><td className="r fig">{sol4(split.platform + split.host + split.toCurve)} SOL</td></tr>
              <tr><td className="nm">{t("h.int.colSell")}</td><td className="r fig">{t("h.int.sellZero")}</td></tr>
            </tbody>
          </table>
        </dd></div>
        <div><dt className="title">{t("h.int.embedTitle")}</dt><dd><CodeBlock code={iframe} lang="html" /></dd></div>
      </dl>
    </div>
  );
}
