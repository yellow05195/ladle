import type { T } from "../../i18n";
import { formatDate, formatInt, formatPct } from "../../lib/format";
import { g3MultAdvantage, g3Tolerance, g3TotalWindows, g4ChosenCap, g4ChosenRow, platformFeeBps, revealLatency, slotMs, windowSlots, type Measured } from "../../lib/measurements";
import { g1Queries, g5PropertyWindows, g7Measurements } from "../../lib/project";
/** A measured figure: the value, plus optional decimals, prefix and suffix. */
export interface Num { value: number; decimals?: number; prefix?: string; suffix?: string }
/** The gate's glyph name, kept as data (v21 /security draws no icon). */
export type IconName = "search" | "seed" | "scale" | "cap" | "ledger" | "clock" | "loop";

export type Verdict = "pass" | "passRedesign" | "passDesignChanged" | "passReference" | "unverified";

export interface Gate { id: string; icon: IconName; name: string; verdict: Verdict; key: string; figLabel: string; num?: Num; value?: string; m: Measured<unknown> }

/** The seven verification gates, from the research files (one builder for /security's cards and the homepage frieze). */
export function buildGates(t: T, locale: string): { gates: Gate[]; verdictText: Record<Verdict, string>; fee: ReturnType<typeof platformFeeBps> } {
  const q = g1Queries();
  const lat = revealLatency();
  const adv = g3MultAdvantage();
  const tol = g3Tolerance();
  const windows = g3TotalWindows();
  const cap = g4ChosenCap();
  const capRow = g4ChosenRow();
  const props = g5PropertyWindows();
  const slot = slotMs();
  const slots = windowSlots();
  const g7 = g7Measurements();
  const fee = platformFeeBps();
  const pct0 = (x: number) => formatPct(x, 0);

  const gates: Gate[] = [
    { id: "G1", icon: "search", name: t("gates.g1"), verdict: "pass", key: t("gates.g1Key"), figLabel: t("gates.g1Fig"), num: { value: q.value }, m: q },
    { id: "G2", icon: "seed", name: t("gates.g2"), verdict: "passDesignChanged", key: t("gates.g2Key", { n: formatInt(lat.value.n, locale), median: lat.value.medianS, p90: lat.value.p90S, p99: lat.value.p99S }), figLabel: t("gates.g2Fig"), num: { value: lat.value.medianS, suffix: " s" }, m: lat },
    { id: "G3", icon: "scale", name: t("gates.g3"), verdict: "passRedesign", key: t("gates.g3Key", { lo: pct0(adv.value.lo), hi: pct0(adv.value.hi), tol: formatPct(tol.value, 1), n: formatInt(windows.value, locale) }), figLabel: t("gates.g3Fig"), value: `±${formatPct(tol.value, 1)}`, m: tol },
    { id: "G4", icon: "cap", name: t("gates.g4"), verdict: "pass", key: t("gates.g4Key", { cap: pct0(cap.value), explained: formatPct(capRow.value.explainedByBiggestWhenCapBinds, 1) }), figLabel: t("gates.g4Fig"), num: { value: capRow.value.explainedByBiggestWhenCapBinds * 100, decimals: 1, suffix: " %" }, m: capRow },
    { id: "G5", icon: "ledger", name: t("gates.g5"), verdict: "passReference", key: t("gates.g5Key", { n: formatInt(props.value, locale) }), figLabel: t("gates.g5Fig"), num: { value: props.value }, m: props },
    { id: "G6", icon: "clock", name: t("gates.g6"), verdict: "pass", key: t("gates.g6Key", { ms: slot.value.ms, from: formatDate(slot.value.from, locale), to: formatDate(slot.value.to, locale), slots: formatInt(slots.value, locale), s: Math.round((slots.value * slot.value.ms) / 1000) }), figLabel: t("gates.g6Fig"), num: { value: slot.value.ms, suffix: " ms" }, m: slot },
    { id: "G7", icon: "loop", name: t("gates.g7"), verdict: "unverified", key: t("gates.g7Key"), figLabel: t("gates.g7Fig"), num: { value: g7.value }, m: g7 },
  ];
  const verdictText: Record<Verdict, string> = { pass: t("gates.pass"), passRedesign: t("gates.passRedesign"), passDesignChanged: t("gates.passDesignChanged"), passReference: t("gates.passReference"), unverified: t("gates.unverified") };
  return { gates, verdictText, fee };
}
