import type { Metadata } from "next";
import { BRAND } from "../../../../config/brand";
import { getDict } from "../../../i18n/server";
import { CodeBlock } from "../../../components/CodeBlock";
import { RoomLinkBuilder } from "../../../components/hosts/RoomLinkBuilder";
import { EmbedPreview } from "../../../components/hosts/EmbedPreview";
import { Simulator } from "../../../components/sim/Simulator";
import { Arr, DemoNote, FoundingList, Glossary, Notes, PageHead, Sec, SecHead } from "../../../components/hall/sections/kit";
import { fill, P } from "../../../components/hall/sections/copy";
import { formatSol, LAMPORTS_PER_SOL } from "../../../lib/format";
import { maxHostFeeBps } from "../../../lib/measurements";
import { keeperBountyPct } from "../../../lib/project";
import { splitFees } from "../../../lib/law-settle";
import { GITHUB_PROGRAM_README } from "../../../lib/links";
import { TableWrap } from "../../../components/TableWrap";

export const metadata: Metadata = { title: "Integrate" };

/** Every section title ends with a full stop, as on the other pages. */
const dot = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

/**
 * /integrate (v21.1, §7.23): the streamer program as a house document.
 * Your room (the link builder beside the live embed; the line your players
 * read is the page's one cream plate), the house rules, the host fee line
 * by line for 1 SOL (computed by the sdk, never typed), the commands as
 * tokens, the founding hosts in arrival order, the developer snippets in
 * code wells, the host-side simulator.
 */
export default async function IntegratePage() {
  const { t } = await getDict();
  const host = maxHostFeeBps();
  const bounty = keeperBountyPct();
  const install = `pnpm add ${BRAND.sdkPackage}`;
  // every snippet in short lines (36 columns at most), so a phone shows it whole instead of cutting or wrapping mid-token
  const component = `import { PullWindow }
  from "${BRAND.sdkPackage}/react";

export function Draw() {
  return (
    <PullWindow
      mint="<token mint>"
      host="<integration account>"
      // optional: a wallet
      // adapter in context
      // enables entering;
      // without it the window
      // is read-only
    />
  );
}`;
  const create = `import { createIntegration }
  from "${BRAND.sdkPackage}";

// host_fee_bps is written once at
// creation and cannot be changed
// afterwards. At most ${host.value}.
await createIntegration({
  host: wallet.publicKey,
  hostFeeBps: ${host.value},
});`;

  const ONE = LAMPORTS_PER_SOL;
  const sol = (v: bigint) => formatSol(v, 3);
  const arith = [0, 100, 200, host.value].filter((b, i, a) => a.indexOf(b) === i && b <= host.value).map((bps) => ({ bps, ...splitFees(ONE, BigInt(bps)) }));
  const rules = (["h.int.rule1", "h.int.rule2", "h.int.rule3", "h.int.rule4"] as const).map((k) => t(k));

  return (
    <>
      <PageHead label={P.int.label} title={P.int.title} lede={t("h.host.body")} />

      <Sec id="room" labelledBy="rm-h">
        <div className="pg-split">
          <div className="c7 pg-col">
            <SecHead n={1} id="rm-h">{dot(t("h.int.builder"))}</SecHead>
            <p className="body">{t("h.int.builderIntro")}</p>
            <RoomLinkBuilder maxBps={host.value} />
          </div>
          <figure id="embed" className="c5 pg-col pg-col-r pg-embed-fig">
            <EmbedPreview src="/embed/demo-1100" title={`${BRAND.name} embed`} />
            <figcaption className="label">{P.int.previewNote}</figcaption>
          </figure>
        </div>
      </Sec>

      <Sec id="rules" labelledBy="ru-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={2} id="ru-h">{P.int.rulesTitle}</SecHead>
            <p className="body">{fill(P.int.rulesIntro, { pct: (host.value / 100).toFixed(2) })}</p>
          </div>
          <div className="c8 pg-col pg-col-r"><Notes items={rules} /></div>
        </div>
      </Sec>

      <Sec id="host-fee" labelledBy="hf-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={3} id="hf-h">{P.int.feeTitle}</SecHead>
            <p className="body">{t("h.int.arithIntro")}</p>
            <p className="fine">{t("int.rowBounty")}: {bounty.value}{" %"} · <a className="pg-a" href={GITHUB_PROGRAM_README} target="_blank" rel="noreferrer">{P.sec.toReadme}<Arr c="↗" /></a></p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <TableWrap>
              <table className="pg-table">
                <thead><tr><th>{P.int.colHost}</th><th className="r ph-hide">{P.int.colPlatform}</th><th className="r">{P.int.colToHost}</th><th className="r ph-hide">{P.int.colCurve}</th></tr></thead>
                <tbody>
                  {arith.map((r) => (
                    <tr key={r.bps}>
                      <td><span className="fig">{(r.bps / 100).toFixed(2)}{" %"}</span>{r.bps === 0 ? <span className="nm"> · {P.int.mainRoom}</span> : null}<span className="rest">{fill(P.int.restLine, { p: sol(r.platform), c: sol(r.toCurve) })}</span></td>
                      <td className="r fig ph-hide">{sol(r.platform)} SOL</td><td className="r fig">{sol(r.host)} SOL</td><td className="r fig ph-hide">{sol(r.toCurve)} SOL</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p className="fine">{t("h.int.colSell")} · {t("h.int.sellZero")}</p>
          </div>
        </div>
      </Sec>

      <Sec id="commands" labelledBy="cm-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={4} id="cm-h">{P.int.cmdTitle}</SecHead>
            <p className="body">{t("h.int.cmdsIntro")}</p>
          </div>
          <div className="c8 pg-col pg-col-r"><Glossary rows={P.host.cmds.map((c) => ({ c: c.c, r: c.r }))} /></div>
        </div>
      </Sec>

      <Sec id="founding" labelledBy="fd-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={5} id="fd-h">{P.int.foundTitle}</SecHead>
            <p className="body">{t("h.host.founding")}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <FoundingList />
            <DemoNote />
          </div>
        </div>
      </Sec>

      <Sec id="developers" labelledBy="dv-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={6} id="dv-h">{dot(t("h.int.devTitle"))}</SecHead>
            <p className="body">{t("h.int.devIntro")}</p>
            <div className="pg-rows">
              <div><h3 className="title">{t("int.readonly")}</h3><p className="body">{t("int.readonlyP")}</p></div>
              <div><h3 className="title">{t("int.verify")}</h3><p className="body">{t("int.verifyP")}</p></div>
            </div>
          </div>
          <div className="c8 pg-col pg-col-r pg-codes">
            <span className="label">{t("int.install")}</span>
            <CodeBlock code={install} lang="sh" />
            <span className="label">{t("int.component")}</span>
            <CodeBlock code={component} lang="tsx" />
            <span className="label">createIntegration</span>
            <CodeBlock code={create} lang="ts" />
            <p className="fine">{P.int.sdkNote}</p>
          </div>
        </div>
      </Sec>

      <Sec id="simulator" labelledBy="sm-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={7} id="sm-h">{P.int.simTitle}</SecHead>
            <p className="body">{t("sim.hostIntro")}</p>
          </div>
          <div className="c8 pg-col pg-col-r"><Simulator mode="host" hideSwitch /></div>
        </div>
      </Sec>
    </>
  );
}
