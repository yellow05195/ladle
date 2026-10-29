import type { Metadata } from "next";
import { getDict } from "../../../i18n/server";
import { formatDate, formatInt, formatPct } from "../../../lib/format";
import { g3SmallStats, maxHostFeeBps, platformFeeBps, revealLatency, roundSlots, roundTimeoutSlots, slotMs } from "../../../lib/measurements";
import { categoryChangePct, g5PropertyWindows, hostTests, playersLosingPct, keeperBountyPct, programInstructions, SECURITY_HREF, timelockHours } from "../../../lib/project";
import { GITHUB_MECHANICS, GITHUB_PROGRAM_README, GITHUB_PROPS, GITHUB_RISKS, GITHUB_SECURITY } from "../../../lib/links";
import { buildGates } from "../../../components/project/gates";
import { CodeBlock } from "../../../components/CodeBlock";
import { Arr, DefList, Notes, PageHead, Sec, SecHead, Steps } from "../../../components/hall/sections/kit";
import { P } from "../../../components/hall/sections/copy";
import { TableWrap } from "../../../components/TableWrap";
import { PageIndex } from "../../../components/PageIndex";
import { HallWindow, Peek, Presenter } from "../../../components/site/Deco";

export const metadata: Metadata = { title: "Security" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (s: string) => s.replace("%", " %");
/** Every section title ends with a full stop, as on the other pages. */
const dot = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

/**
 * /security (v21.1, §7.23): SECURITY.md as a house document in eleven
 * numbered sections. Status as a definition list, what nobody can do, the
 * round's four instructions as step plates, the randomness and where the
 * trust lies (the formula in a code well), the accounting invariants, the
 * two fees as figures, the update authority, the seven checks with their
 * verdicts in plain words, the risks, the architecture and the known
 * limits. Nothing coloured, "not deployed" stated plainly.
 */
export default async function SecurityPage() {
  const { t, locale } = await getDict();
  const fee = platformFeeBps();
  const host = maxHostFeeBps();
  // the market's settings (NEXT_PUBLIC_LADLE_*_SLOTS; the demo's ~20 s rounds without them): a mainnet round is not the demo's
  const timeout = roundTimeoutSlots();
  const slot = slotMs();
  const lat = revealLatency();
  const tl = timelockHours();
  const ins = programInstructions();
  const tests = hostTests();
  const props = g5PropertyWindows();
  const bounty = keeperBountyPct();
  const small = g3SmallStats("power");
  const change = categoryChangePct();
  const losing = playersLosingPct();
  const slots = roundSlots();
  const windowS = Math.round((slots.value * slot.value.ms) / 1000);
  const timeoutMin = ((timeout.value * slot.value.ms) / 60000).toFixed(1);
  const { gates, verdictText } = buildGates(t, locale);

  const status = [
    { k: t("status.program"), v: t("status.programValue", { n: tests.value }), href: GITHUB_PROGRAM_README, to: P.sec.toReadme },
    { k: t("status.tests"), v: t("status.testsValue", { n: formatInt(props.value, locale) }), href: GITHUB_PROPS, to: P.sec.toProps },
    { k: t("status.audit"), v: t("status.auditValue"), href: GITHUB_SECURITY, to: "SECURITY.md" },
    { k: t("status.deploy"), v: t("status.deployValue"), href: GITHUB_SECURITY, to: "SECURITY.md" },
    { k: t("status.legal"), v: t("status.legalValue"), href: GITHUB_RISKS, to: "RISKS.md" },
  ];
  const cannot = ([1, 2, 3, 4, 5, 6, 7] as const).map((i) => t(`cannot.i${i}`));
  const steps = [
    { t: t("how.t1"), b: t("steps.openBody"), note: t("how.r1", { slots: formatInt(slots.value, locale), s: windowS }) },
    { t: t("how.t2"), b: t("steps.sealedBody"), note: t("how.r2", { median: lat.value.medianS, p99: lat.value.p99S }) },
    { t: t("how.t3"), b: t("steps.drawnBody"), note: t("how.r3") },
    { t: t("how.t4"), b: t("steps.settledBody"), note: t("how.r4") },
  ];
  const attackers = ([1, 2, 3, 4, 5] as const).map((i) => ({ who: t(`sec.a${i}`), controls: t(`sec.a${i}c`), fails: t(`sec.a${i}f`) }));
  const invariants = [...([1, 2, 3, 4, 5] as const).map((i) => t(`sec.inv${i}`)), t("sec.token2022")];
  const limits = ([1, 2, 3, 4, 5, 6] as const).map((i) => t(`sec.lim${i}`, { tests: tests.value, slots: formatInt(timeout.value, locale), median: lat.value.medianS, p90: lat.value.p90S, p99: lat.value.p99S }));
  const risks = [
    t("risks.r1"),
    t("risks.r2", { pct: pct(formatPct(small.value.pBelowOne, 0)) }),
    t("risks.r3", { fee: pct(formatPct(fee.value / 10000, 2)) }),
    t("risks.r4"),
    t("risks.r5"),
    t("risks.r6", { change: `${change.value > 0 ? "+" : "−"}${Math.abs(change.value).toFixed(1)} %`, losing: `${losing.value} %` }),
  ];
  const arch = [
    { t: t("arch.program"), b: t("arch.programBody", { n: formatInt(ins.value, locale) }) },
    { t: t("arch.oracle"), b: t("arch.oracleBody") },
    { t: t("arch.keeper"), b: t("arch.keeperBody", { pct: bounty.value }) },
    { t: t("arch.sdk"), b: t("arch.sdkBody", { bps: formatInt(host.value, locale) }) },
    { t: t("arch.indexer"), b: t("arch.indexerBody") },
  ];
  const reviewed = formatDate(tests.measuredAt, locale);
  const index = [
    { id: "status", label: P.sec.statusTitle }, { id: "cannot", label: P.sec.cannotTitle }, { id: "steps", label: P.sec.stepsTitle },
    { id: "randomness", label: t("sec.randTitle") }, { id: "invariants", label: t("sec.invTitle") }, { id: "fees", label: t("trust.feesTitle") },
    { id: "authority", label: t("about.authority") }, { id: "checks", label: t("checks.title") }, { id: "risks", label: t("risks.title") },
    { id: "architecture", label: t("arch.title") }, { id: "limits", label: t("sec.limTitle") },
  ];
  // laid out in short lines (36 columns at most), so it reads whole in the well on a phone as on a desktop;
  // the domain tags are the program's (programs/ladle/src/state.rs VRF_SEED_DOMAIN, VRF_REQUEST_DOMAIN)
  const formula = [
    `seal = sha256("ladle:vrf:v1"`,
    `    ‖ window ‖ close_slot`,
    `    ‖ entry_count`,
    `    ‖ entries_commitment)`,
    `vrf_seed = sha256("ladle:vrf:req"`,
    `    ‖ seal ‖ salt)`,
    `seed = ORAO's answer to vrf_seed`,
    `roll_i = sha256(seed ‖ owner_i`,
    `    ‖ index_i)`,
    `  → floor(10001 · u³)`,
  ].join("\n");

  return (
    <>
      <PageHead label={P.sec.label} title={P.sec.title} lede={t("sec.lead")} />
      <PageIndex label={P.sec.indexLabel} items={index} />

      <Sec id="status" labelledBy="st-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={1} id="st-h">{P.sec.statusTitle}</SecHead>
            <p className="body">{t("h.sec.statusIntro").replace(/.$/, "")}, as of {reviewed}.</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <Peek pets={[["polar", "sky"], ["panda", "tomato"]]} size={92}>
              <DefList text rows={status.map((s) => ({ key: s.k, k: s.k, v: <span className="pg-dd-row"><span>{s.v}</span><a className="pg-a" href={s.href} target="_blank" rel="noreferrer">{s.to}<Arr c="↗" /></a></span> }))} />
            </Peek>
          </div>
        </div>
      </Sec>

      <Sec id="cannot" labelledBy="cn-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={2} id="cn-h">{P.sec.cannotTitle}</SecHead>
            <p className="body">{t("sec.cannotIntro", { n: ins.value })}</p>
            <p className="fine">{cap(t("cannot.authority"))}: {t("cannot.authorityStatus", { h: tl.value })} · <a className="pg-a" href={SECURITY_HREF} target="_blank" rel="noreferrer">SECURITY.md<Arr c="↗" /></a></p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <Notes items={cannot.map((c) => <b key={c}>{cap(c)}.</b>)} />
          </div>
        </div>
      </Sec>

      <Sec id="steps" labelledBy="sp-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={3} id="sp-h">{P.sec.stepsTitle}</SecHead>
            <p className="body">{t("how.sub2")}</p>
            <p className="fine"><a className="pg-a" href={GITHUB_MECHANICS} target="_blank" rel="noreferrer">docs/MECHANICS.md<Arr c="↗" /></a></p>
          </div>
          <div className="c8 pg-col pg-col-r"><Steps rows={steps} /></div>
        </div>
      </Sec>

      <Sec id="randomness" labelledBy="rd-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={4} id="rd-h">{dot(t("sec.randTitle"))}</SecHead>
            <p className="body">{t("sec.randIntro")}</p>
            <div className="pg-facts">
              <div className="pg-fact"><span className="num-m">{lat.value.medianS}<span className="unit">s</span></span><span className="label">{t("arrives.median")}</span></div>
              <div className="pg-fact"><span className="num-m">{lat.value.p99S}<span className="unit">s</span></span><span className="label">{t("arrives.p99")}</span></div>
            </div>
            <p className="fine">{t("about.refundP", { slots: formatInt(timeout.value, locale), min: timeoutMin })}</p>
            <HallWindow src="seal" />
          </div>
          <div className="c8 pg-col pg-col-r">
            <CodeBlock code={formula} />
            <TableWrap>
              <table className="pg-table pg-wrap-cells pg-stack">
                <thead><tr><th>{t("sec.attacker")}</th><th>{t("sec.controls")}</th><th>{t("sec.whyFails")}</th></tr></thead>
                <tbody>{attackers.map((a) => <tr key={a.who}><td>{cap(a.who)}</td><td data-label={t("sec.controls")}>{a.controls}</td><td data-label={t("sec.whyFails")}>{a.fails}</td></tr>)}</tbody>
              </table>
            </TableWrap>
            <p className="fine">{t("sec.residual")}</p>
          </div>
        </div>
      </Sec>

      <Sec id="invariants" labelledBy="iv-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={5} id="iv-h">{dot(t("sec.invTitle"))}</SecHead>
            <p className="body">{t("sec.invIntro")}</p>
          </div>
          <div className="c8 pg-col pg-col-r"><Notes items={invariants} /></div>
        </div>
      </Sec>

      <Sec id="fees" labelledBy="fe-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={6} id="fe-h">{dot(t("trust.feesTitle"))}</SecHead>
            <p className="body">{t("about.feesP", { bps: formatInt(fee.value, locale), pct: pct(formatPct(fee.value / 10000, 2)), host: formatInt(host.value, locale) })}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <div className="plate pg-facts">
              <div className="pg-fact"><span className="num-l">{(fee.value / 100).toFixed(2)}<span className="unit">%</span></span><span className="label">{P.sec.entry}</span></div>
              <div className="pg-fact"><span className="num-l">0</span><span className="label">{P.sec.sell}</span></div>
              <div className="pg-fact"><span className="num-l">{(host.value / 100).toFixed(2)}<span className="unit">%</span></span><span className="label">{P.sec.hostMax}</span></div>
            </div>
          </div>
        </div>
      </Sec>

      <Sec id="authority" labelledBy="au-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={7} id="au-h">{dot(t("about.authority"))}</SecHead>
            <p className="body">{t("sec.authIntro")}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <Notes items={[
              <><b>{t("about.optA")}</b> {t("sec.optAWhy")}</>,
              <><b>{t("about.optB")}</b> {t("sec.optBWhy")}</>,
            ]} />
            <p className="ui">{t("sec.noThird")}</p>
            <p className="ui" id="closing">{t("sec.closing")}</p>
          </div>
        </div>
      </Sec>

      <Sec id="checks" labelledBy="ck-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={8} id="ck-h">{dot(t("checks.title"))}</SecHead>
            <p className="body">{t("checks.sub")}</p>
            <Presenter pet={["bee", "mint"]} flip />
          </div>
          <div className="c8 pg-col pg-col-r">
            <ol className="pg-checks">
              {gates.map((g) => (
                <li key={g.id}>
                  <span className="tok" aria-hidden="true">{g.id}</span>
                  <div className="tx">
                    <h3 className="title">{cap(g.name)}</h3>
                    <p className="body">{g.key}</p>
                    <a className="pg-a" href={g.m.href} target="_blank" rel="noreferrer">{g.m.href.split("/").slice(-2).join("/")}<Arr c="↗" /></a>
                  </div>
                  <span className="label v">{verdictText[g.verdict]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Sec>

      <Sec id="risks" labelledBy="rk-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={9} id="rk-h">{dot(t("risks.title"))}</SecHead>
            <p className="body">{t("risks.sub", { date: reviewed })}</p>
          </div>
          <div className="c8 pg-col pg-col-r"><Notes items={risks} /></div>
        </div>
      </Sec>

      <Sec id="architecture" labelledBy="ar-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={10} id="ar-h">{dot(t("arch.title"))}</SecHead>
          </div>
          <div className="c8 pg-col pg-col-r">
            <div className="plate pg-rows in-plate">{arch.map((a) => <div key={a.t}><h3 className="pg-h3">{a.t}</h3><p className="body">{a.b}</p></div>)}</div>
          </div>
        </div>
      </Sec>

      <Sec id="limits" labelledBy="lm-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={11} id="lm-h">{dot(t("sec.limTitle"))}</SecHead>
            <p className="body">{t("sec.limIntro")}</p>
          </div>
          <div className="c8 pg-col pg-col-r"><Notes items={limits} /></div>
        </div>
      </Sec>
    </>
  );
}
