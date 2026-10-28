import type { Metadata } from "next";
import { getDict } from "../../../i18n/server";
import { PastDistribution } from "../../../components/PastDistribution";
import { Simulator } from "../../../components/sim/Simulator";
import { Arr, DemoNote, Glossary, PageHead, Sec, SecHead, Steps } from "../../../components/hall/sections/kit";
import { fill, P } from "../../../components/hall/sections/copy";
import { formatInt, formatPct } from "../../../lib/format";
import { g3Deciles, g3Tolerance, g3TotalWindows, rollMax, slotMs } from "../../../lib/measurements";
import { GITHUB_G3 } from "../../../lib/links";
import { TableWrap } from "../../../components/TableWrap";

export const metadata: Metadata = { title: "Odds" };

/**
 * /odds (v21.1, §7.23, mockup s7): the page head; the law's three clauses
 * as plates (the page opens on them, with no section disc above their own
 * cream discs) beside the page's one cream plate, the plain-words summary;
 * every past scoop as a beeswarm with the smallest and the largest at the
 * same size; the practice simulator; the measured deciles on a zebra
 * table; the words we use. Measured, never promised; no result is ever
 * coloured.
 */
export default async function OddsPage() {
  const { t, locale } = await getDict();
  const max = rollMax();
  const deciles = g3Deciles("power");
  const tol = g3Tolerance();
  const total = g3TotalWindows();
  const slot = slotMs();
  const o = P.oddsPage;
  const clauses = [t("odds.p1", { max: formatInt(max.value, locale) }), t("odds.p2"), t("odds.p3")];
  const glossary = (["window", "slot", "seed", "roll", "prorata", "curve", "keeper"] as const).map((k) => ({ c: t(`glossary.${k}`), r: t(`glossary.${k}Def`, { ms: slot.value.ms, max: formatInt(max.value, locale) }) }));

  return (
    <>
      <PageHead label={o.label} title={o.title} lede={o.lede} />

      <Sec id="law" labelledBy="law-h">
        <div className="pg-split">
          <div className="c7 pg-col">
            <h2 id="law-h" className="sr-only">{o.lawTitle}</h2>
            <Steps cream rows={clauses.map((b, i) => ({ t: o.clauses[i]!, b }))} />
          </div>
          <div className="c5 pg-col">
            <div className="plate-cream pg-cream">
              <span className="label">{o.summaryLabel}</span>
              <p>{o.summary}</p>
            </div>
            <p className="body"><span className="tok">{P.odds.plainCmd}</span> {P.odds.plain}</p>
          </div>
        </div>
      </Sec>

      <Sec id="past" labelledBy="past-h">
        <SecHead n={1} id="past-h">{o.swarmTitle}</SecHead>
        <div className="plate pg-chart">
          <PastDistribution />
        </div>
        <DemoNote />
      </Sec>

      <Sec id="simulator" labelledBy="sim-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={2} id="sim-h">{o.simTitle}</SecHead>
            <p className="body">{o.simBody}</p>
          </div>
          <div className="c8 pg-col pg-col-r"><Simulator /></div>
        </div>
      </Sec>

      <Sec id="tables" labelledBy="tbl-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={3} id="tbl-h">{o.tableTitle}</SecHead>
            <p className="body">{fill(o.tableBody, { n: formatInt(total.value, locale), tol: formatPct(tol.value, 1).replace("%", " %") })}</p>
            <div><a className="act" href={GITHUB_G3} target="_blank" rel="noreferrer">{t("odds.readG3")}<Arr c="↗" /></a></div>
          </div>
          <div className="c8 pg-col pg-col-r">
            <TableWrap>
              <table className="pg-table">
                <thead><tr><th>{o.colDecile}</th><th className="r">{o.colMean}</th><th className="r ph-hide">{o.colCi}</th><th className="r">{o.colN}</th></tr></thead>
                <tbody>
                  {deciles.value.map((r) => (
                    <tr key={r.decile}><td className="fig">{r.decile}</td><td className="r fig">×{r.mean.toFixed(4)}<span className="ph-only ci fine">± {r.ci95.toFixed(4)}</span></td><td className="r fig ph-hide">± {r.ci95.toFixed(4)}</td><td className="r fig"><span className="ph-hide">{formatInt(r.n, locale)}</span><span className="ph-only">{(r.n / 1e6).toFixed(1)} M</span></td></tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        </div>
      </Sec>

      <Sec id="glossary" labelledBy="gl-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={4} id="gl-h">{o.wordsTitle}</SecHead>
            <p className="body">{o.wordsIntro}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <Glossary rows={glossary} words />
          </div>
        </div>
      </Sec>
    </>
  );
}
