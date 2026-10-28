import type { Metadata } from "next";
import Link from "next/link";
import { getDict } from "../../../i18n/server";
import { Arr, PageHead, Sec, SecHead } from "../../../components/hall/sections/kit";
import { P } from "../../../components/hall/sections/copy";
import { Faq } from "../../../components/fx/Faq";
import { formatInt } from "../../../lib/format";
import { maxHostFeeBps, platformFeeBps } from "../../../lib/measurements";

export const metadata: Metadata = { title: "About" };

/**
 * /about (v21.1, §7.23): what Ladle is in three short clauses on the
 * ground, what the house takes as the page's one cream plate, then
 * #solana (where the demo slip points): the program, the seed, the curve,
 * the keepers and where things stand today, on one plate; then
 * #questions, every question the home's tour shortens to five, as rows.
 */
export default async function AboutPage() {
  const { t, locale } = await getDict();
  const a = P.about;
  const fee = platformFeeBps();
  const host = maxHostFeeBps();
  const questions = [
    ...([2, 1, 3, 4] as const).map((i) => ({ q: t(`h.faq.r${i}q`), a: t(`h.faq.r${i}a`) })),
    ...([1, 2, 3, 4, 5, 6] as const).map((i) => ({ q: t(`faq.q${i}`), a: t(`faq.a${i}`, { bps: formatInt(fee.value, locale), host: formatInt(host.value, locale) }) })),
  ];
  return (
    <>
      <PageHead label={a.label} title={a.title} lede={a.lede} />

      <Sec id="what" labelledBy="wh-h">
        <div className="pg-split">
          <div className="c7 pg-col">
            <SecHead n={1} id="wh-h">{a.gameTitle}</SecHead>
            <div className="pg-rows">
              {([1, 2, 3] as const).map((i) => (
                <div key={i}><h3 className="pg-h3">{t(`project.s${i}`)}</h3><p className="body">{t(`project.p${i}`)}</p></div>
              ))}
            </div>
          </div>
          <div className="c5 pg-col pg-col-r">
            <div className="plate-cream pg-cream">
              <span className="label">{a.houseT}</span>
              <p>{a.houseB}</p>
            </div>
          </div>
        </div>
      </Sec>

      <Sec id="solana" labelledBy="sol-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={2} id="sol-h">{a.solTitle}</SecHead>
            <div><Link className="act" href="/security">{a.status}<Arr /></Link></div>
          </div>
          <div className="c8 pg-col pg-col-r">
            <div className="plate pg-rows in-plate">
              {a.rows.map((r) => <div key={r.t}><h3 className="pg-h3">{r.t}</h3><p className="body">{r.b}</p></div>)}
            </div>
          </div>
        </div>
      </Sec>

      <Sec id="questions" labelledBy="qa-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={3} id="qa-h">{a.qaTitle}</SecHead>
            <p className="body">{a.qaIntro}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <Faq items={questions} id="faq-all" />
          </div>
        </div>
      </Sec>
    </>
  );
}
