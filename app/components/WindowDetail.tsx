"use client";

/**
 * A round's verify page (v21.1, §7.18 and §7.23, /window/[id]). The page
 * head with the round number and the day it was served; 5/7: a definition
 * list on a plate (closed, pot, entries, tokens bought, the seed grouped by
 * 4 with a copy key) beside the page's one main key, "Recompute the draws",
 * which runs
 * the program's law on the seed and the entries in this tab (at once when
 * the address ends in #recompute). Then every entry in ARRIVAL order on
 * zebra bands (one size, one colour) under the key, facing the list, the
 * smallest and the largest together in one style, both sum
 * lines, and the latest rounds. /window/latest moves to the last served
 * round. Demo rounds live in the browser that played them: a demo round
 * this tab has not served (a shared link opened elsewhere) is rebuilt from
 * the demo plan and said to be so.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "../../config/brand";
import { playerColor } from "../lib/colors";
import { useI18n } from "../i18n/client";
import { DATA_SOURCE, getDataSource } from "../lib/data";
import { pseudonym } from "../lib/data/mock";
import { DEMO_CAP_BPS, DEMO_HOST_FEE_BPS, DEMO_MINT, FIRST_WINDOW, WINDOW_MS, plan } from "../lib/data/demo-plan";
import { Ledger } from "../lib/data/momentum";
import type { WindowView } from "../lib/data/types";
import { formatInt, toHex } from "../lib/format";
import { explorerAddress, explorerTx, GITHUB_LAW } from "../lib/links";
import { slotMs } from "../lib/measurements";
import { settle, multiplierOf, splitFees } from "../lib/law-settle";
import { ladle, mult, roundNum, sol3 } from "./hall/fmt";
import { ShareDialog } from "./hall/hud/ShareDialog";
import { HIcon } from "./ui/icons";
import { RecentWindows } from "./RecentWindows";
import { TableWrap } from "./TableWrap";
import { fill, P } from "./hall/sections/copy";
import { Arr, DefList, DemoNote, PageHead, Sec, SecHead, seedGroups } from "./hall/sections/kit";

interface Check { roll: boolean; share: boolean }
type Run = { k: "idle" } | { k: "run" } | { k: "done"; checks: Check[]; sum: bigint; ok: boolean; bad: number };

const SLOT = slotMs();
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * A demo round this tab has not served, rebuilt from the deterministic demo
 * plan: the ledger replayed from round 1 to n with the planned entries, then
 * round n settled with the law. Entries made in another browser are not in
 * it (the page says so). Null outside demo mode or past a day of rounds.
 */
function rebuildDemo(id: string): WindowView | null {
  const m = /^demo-(\d+)$/.exec(id);
  const n = m ? Number(m[1]) : NaN;
  if (DATA_SOURCE !== "demo" || !Number.isFinite(n) || n < FIRST_WINDOW || n > FIRST_WINDOW + 4320) return null;
  const now = Date.now();
  const l = new Ledger();
  l.replay(n, (k) => now - (n - k + 1) * WINDOW_MS);
  const r = l.rounds.get(n);
  if (!r) return null;
  const pl = plan(n);
  const inputs = pl.entries.map((e, i) => ({ owner: e.owner, index: i, amount: e.amount }));
  const st = settle(pl.seed, inputs, r.before, DEMO_HOST_FEE_BPS);
  return {
    id: `demo-${n}`, mint: DEMO_MINT, source: "demo", closedAt: new Date(r.closedAt).toISOString(), seedHex: toHex(pl.seed),
    vrfAccount: pl.vrfAccount, settleTx: pl.settleTx, hostFeeBps: DEMO_HOST_FEE_BPS, capBps: DEMO_CAP_BPS, curveBefore: r.before,
    entries: inputs.map((e, i) => ({ ...e, roll: st.rolls[i]!, share: st.shares[i]! })), total: st.total, tokensOut: st.tokensOut,
  };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function WindowDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const source = useMemo(() => getDataSource(), []);
  const [w, setW] = useState<WindowView | null | undefined>(undefined);
  const [run, setRun] = useState<Run>({ k: "idle" });
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);
  const [rebuilt, setRebuilt] = useState(false);
  const auto = useRef(false);

  useEffect(() => {
    setW(undefined);
    setRun({ k: "idle" });
    setRebuilt(false);
    let alive = true;
    source.getWindow(id).then((v) => {
      if (!alive) return;
      if (v || id === "latest") { setW(v); setNow(Date.now()); return; }
      // not served in this tab: a demo round from a shared link is rebuilt from the plan, after a paint
      window.setTimeout(() => {
        if (!alive) return;
        const r = rebuildDemo(id);
        setRebuilt(!!r);
        setW(r);
        setNow(Date.now());
      }, 30);
    }).catch(() => { if (alive) setW(null); });
    return () => { alive = false; };
  }, [source, id]);

  // /window/latest is an address, not a round: move to the round it points at
  useEffect(() => {
    if (id === "latest" && w) router.replace(`/window/${w.id}${typeof window !== "undefined" ? window.location.hash : ""}`);
  }, [id, w, router]);

  const rows = useMemo(() => {
    if (!w) return [];
    return w.entries.map((e) => {
      const name = pseudonym(e.owner);
      return { e, name, color: playerColor(name), m: multiplierOf(e.share, e.amount, w.total, w.tokensOut) };
    });
  }, [w]);

  function recompute() {
    if (!w || run.k === "run") return;
    setRun({ k: "run" });
    setTimeout(() => {
      const out = settle(hexToBytes(w.seedHex), w.entries.map((e) => ({ owner: e.owner, index: e.index, amount: e.amount })), w.curveBefore, w.hostFeeBps);
      const checks = w.entries.map((e, i) => ({ roll: out.rolls[i] === e.roll, share: out.shares[i] === e.share }));
      const sum = out.shares.reduce((a, b) => a + b, 0n);
      const bad = checks.findIndex((c) => !c.roll || !c.share);
      setRun({ k: "done", checks, sum, ok: bad < 0 && sum === w.tokensOut && out.tokensOut === w.tokensOut, bad });
    }, 260);
  }

  // #recompute: run by itself once the round is here, and come into view
  useEffect(() => {
    if (!w || id === "latest" || auto.current) return;
    if (typeof window === "undefined" || window.location.hash !== "#recompute") return;
    auto.current = true;
    requestAnimationFrame(() => document.getElementById("recompute")?.scrollIntoView({ block: "start" }));
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, id]);

  const copySeed = () => {
    if (!w) return;
    navigator.clipboard?.writeText(w.seedHex).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
  };

  if (w === undefined || (id === "latest" && w)) {
    return (
      <>
        <PageHead label={P.win.label} title={`Round No. ${id === "latest" ? "…" : roundNum(id)}`} />
        <Sec><div className="pg-wait" aria-busy="true" /></Sec>
      </>
    );
  }
  if (w === null) {
    return (
      <>
        <PageHead label={P.win.label} title={P.win.none} lede={P.win.noneSub} />
        <Sec labelledBy="rec-h">
          <SecHead id="rec-h">{P.win.recentTitle}</SecHead>
          <RecentWindows limit={8} />
        </Sec>
      </>
    );
  }

  const n = roundNum(w.id);
  const fees = splitFees(w.total, w.hostFeeBps);
  const bounty = w.total - fees.toCurve - fees.platform - fees.host;
  const sumShares = w.entries.reduce((a, e) => a + e.share, 0n);
  const min = Math.min(...rows.map((r) => r.m)), max = Math.max(...rows.map((r) => r.m));
  const slotsAgo = Math.max(0, Math.round((now - Date.parse(w.closedAt)) / SLOT.value.ms));
  const checks = run.k === "done" ? run.checks : null;
  const busy = run.k === "run";

  return (
    <>
      <PageHead label={P.win.label} title={<><span className="pg-ln">Round No. {n}</span> <span className="pg-ln">{fill(P.win.served, { date: day(w.closedAt) })}</span></>} lede={t("h.win.lead")}>
        {rebuilt ? <p className="fine">{P.win.rebuilt}</p> : null}
      </PageHead>

      <Sec id="recompute" labelledBy="rcp-h">
        <h2 id="rcp-h" className="sr-only">{t("h.res.recompute", { n })}</h2>
        <div className="pg-split">
          <div className="c5 pg-col">
            <DefList rows={[
              { k: P.win.closed, v: <span className="ui">{fill(P.win.closedV, { date: day(w.closedAt), n: formatInt(slotsAgo) })}</span> },
              { k: P.win.pot, v: <>{sol3(w.total)}<span className="unit">SOL</span></> },
              { k: P.win.entries, v: <>{w.entries.length}</> },
              { k: P.win.bought, v: <>{ladle(w.tokensOut)}<span className="unit">LADLE</span></> },
              { k: P.win.seed, v: (
                <span className="pg-seed-row">
                  <span className="seed">{seedGroups(w.seedHex, 4, 2)}</span>
                  <button type="button" className="icon-btn round" aria-label={P.win.copy} onClick={copySeed}><HIcon name={copied ? "check" : "copy"} size={18} /></button>
                  {copied ? <span className="label" role="status">{P.win.copied}</span> : null}
                </span>
              ) },
              { k: t("h.rcp.vrf"), v: <a className="pg-a seed" href={explorerAddress(w.vrfAccount)} target="_blank" rel="noreferrer">{w.vrfAccount.slice(0, 4)} {w.vrfAccount.slice(4, 8)} … {w.vrfAccount.slice(-4)}<Arr c="↗" /></a> },
              { k: t("h.rcp.tx"), v: <a className="pg-a seed" href={explorerTx(w.settleTx)} target="_blank" rel="noreferrer">{w.settleTx.slice(0, 4)} {w.settleTx.slice(4, 8)} … {w.settleTx.slice(-4)}<Arr c="↗" /></a> },
            ]} />
            <DemoNote />
          </div>
          <div className="c7 pg-col pg-verify">
            <div className="pg-verify-act">
              <button type="button" className={`key main ${busy ? "busy" : ""}`} onClick={recompute} aria-busy={busy || undefined}>
                {busy ? P.win.running : P.win.run}
              </button>
              <p className="fine">{P.win.runNote} <a className="pg-a" href={GITHUB_LAW} target="_blank" rel="noreferrer">law.ts<Arr c="↗" /></a></p>
            </div>
            <div aria-live="polite" className="pg-verdict">
              {run.k === "done" ? (run.ok
                ? <p className="pg-ok"><HIcon name="check" size={18} />{P.rcp.ok}</p>
                : <p className="pg-ok">{P.rcp.bad}. {fill(P.rcp.badAt, { i: run.bad + 1 })}</p>) : null}
              {run.k === "done" ? <p className="fine">{t("h.rcp.ok", { k: w.entries.length, tokens: ladle(run.sum) })}</p> : null}
            </div>
            <div className="pg-entries">
              <h3 className="title" id="ent-h">{P.win.listTitle}</h3>
              <TableWrap>
                <table className="pg-table" aria-labelledby="ent-h">
                  <thead>
                    <tr><th className="r">{P.win.colN}</th><th>{P.win.colName}</th><th className="r">{P.win.colIn}</th><th className="r">{P.win.colLadle}</th><th className="r">{P.win.colM}</th>{checks ? <th className="r ck">{t("h.win.colCheck")}</th> : null}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const c = checks?.[i];
                      return (
                        <tr key={r.e.index}>
                          <td className="r fig">{r.e.index + 1}</td>
                          <td><span className="pdot" style={{ ["--pc" as string]: r.color }} aria-hidden="true" /><span className="nm pnm">{r.name}</span></td>
                          <td className="r fig">{sol3(r.e.amount)}</td>
                          <td className="r fig">{ladle(r.e.share)}</td>
                          <td className="r fig">{mult(r.m)}</td>
                          {checks ? <td className="r ck">{c && c.roll && c.share ? <span aria-label={t("h.win.match")}><HIcon name="check" size={16} /></span> : t("h.win.mismatch")}</td> : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
              <p className="pg-range">{t("h.res.range", { min: mult(min), max: mult(max) })}</p>
              <p className="fine">
                {t("h.res.sum1", { total: sol3(w.total), toCurve: sol3(fees.toCurve), fee: sol3(fees.platform) })}{fees.host > 0n ? t("h.res.sumHost", { host: sol3(fees.host) }) : ""}{bounty > 0n ? t("h.res.sumBounty", { bounty: sol3(bounty) }) : ""}. {t("h.res.sum2", { tokens: ladle(sumShares) })}
              </p>
              <p className="ui">{BRAND.secondLine}</p>
              <div><button type="button" className="key sec s" onClick={() => setShare(true)}>{fill(P.win.share, { n })}</button></div>
            </div>
          </div>
        </div>
      </Sec>

      <Sec id="recent" labelledBy="rec-h">
        <SecHead id="rec-h">{P.win.recentTitle}</SecHead>
        <RecentWindows limit={8} current={w.id} />
      </Sec>

      {share ? <ShareDialog n={n} id={w.id} players={w.entries.length} tiles={rows.map((r) => ({ name: r.name, m: r.m, mine: false }))} mine={null} seed8={w.seedHex.slice(0, 8)} demo={w.source === "demo"} onClose={() => setShare(false)} /> : null}
    </>
  );
}
