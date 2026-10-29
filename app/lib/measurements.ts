/**
 * Every measured figure the UI shows is built here from the research JSON.
 * Components never type a number by hand: they receive a `Measured<T>` and
 * print its value, its date and a link to its source.
 */
import g3 from "../../research/data/G3-results.json";
import g4 from "../../research/data/G4-results.json";
import { PLATFORM_FEE_BPS, MAX_HOST_FEE_BPS, ROLL_MAX, ROLL_EXP } from "@pulled/sdk/law";
import { GITHUB_G3, GITHUB_G4, GITHUB_G3_DATA, GITHUB_G4_DATA, GITHUB_LAW, programLink } from "./links";
import g6 from "../../research/data/G6-slot-samples-summary.json";
import orao from "../../research/data/orao-summary.json";
import { GITHUB_G2, GITHUB_G6, GITHUB_G6_DATA, GITHUB_ORAO_DATA, EXPLORER_ADDRESS } from "./links";
import { MARKET_ENV, VRF_TIMEOUT_SLOTS_ENV, WINDOW_SLOTS_ENV } from "./data/cluster";

export interface Measured<T> {
  value: T;
  /** ISO date of the measurement (or of the law commit for constants). */
  measuredAt: string;
  /** Short human source, e.g. "G3 simulation, 10,000,000 windows". */
  source: string;
  href: string;
}

export type G3Family = keyof typeof g3.families;
export const G3_FAMILIES = Object.keys(g3.families) as G3Family[];

export interface DecileRow {
  decile: number; // 1-based
  mean: number;
  ci95: number;
  n: number;
  lo: number;
  hi: number | null;
}

export interface SmallStats {
  n: number;
  mean: number;
  sd: number;
  pBelowOne: number;
  p10: number;
  p50: number;
  p90: number;
  p99: number;
  p999: number;
}

const g3Source = (fam: G3Family) =>
  `G3 simulation, family "${g3.families[fam].label}", ${g3.families[fam].windows.toLocaleString("en-US")} windows`;

export const G3_DATE = g3.date;
export const G4_DATE = g4.date;

export function g3TotalWindows(): Measured<number> {
  return { value: g3.totalWindows, measuredAt: g3.date, source: "G3 simulation", href: GITHUB_G3 };
}

export function g3FamilyLabel(fam: G3Family): string {
  return g3.families[fam].label;
}

/**
 * Per stake-class expectation under the published (linear) law.
 * Classes with n == 0 are skipped: the whale family has two classes, the equal family one.
 */
export function g3Deciles(fam: G3Family): Measured<DecileRow[]> {
  const rows = g3.families[fam].linear.deciles
    .map((d, i) => ({ decile: i + 1, mean: d.mean, ci95: d.ci95, n: d.n, lo: d.lo, hi: d.hi }))
    .filter((d): d is DecileRow => d.n > 0 && d.mean !== null && d.ci95 !== null && d.lo !== null);
  return { value: rows, measuredAt: g3.date, source: g3Source(fam), href: GITHUB_G3_DATA };
}

/** Same, for the rejected multiplicative law (shown only to explain why it was rejected). */
export function g3RejectedDeciles(fam: G3Family): Measured<DecileRow[]> {
  const rows = g3.families[fam].mult.deciles
    .map((d, i) => ({ decile: i + 1, mean: d.mean, ci95: d.ci95, n: d.n, lo: d.lo, hi: d.hi }))
    .filter((d): d is DecileRow => d.n > 0 && d.mean !== null && d.ci95 !== null && d.lo !== null);
  return { value: rows, measuredAt: g3.date, source: g3Source(fam), href: GITHUB_G3_DATA };
}

export function g3WorstDeviation(fam: G3Family): Measured<number> {
  return { value: g3.families[fam].linear.worstDev, measuredAt: g3.date, source: g3Source(fam), href: GITHUB_G3_DATA };
}

export function g3Tolerance(): Measured<number> {
  return { value: g3.tolerance, measuredAt: g3.date, source: "G3 acceptance criterion", href: GITHUB_G3 };
}

export function g3Verdict(): Measured<{ linear: string; mult: string }> {
  return { value: g3.verdict, measuredAt: g3.date, source: "G3 verdict", href: GITHUB_G3 };
}

/** Multiplier statistics of the smallest stake class (the small player). */
export function g3SmallStats(fam: G3Family): Measured<SmallStats> {
  return { value: g3.families[fam].smallStats, measuredAt: g3.date, source: g3Source(fam), href: GITHUB_G3_DATA };
}

/** Histogram of the small player's multiplier, 200 bins over [0, 2). */
export function g3SmallHist(fam: G3Family): Measured<{ bins: number[]; lo: number; hi: number }> {
  return {
    value: { bins: g3.families[fam].smallHist, lo: 0, hi: 2 },
    measuredAt: g3.date,
    source: g3Source(fam),
    href: GITHUB_G3_DATA,
  };
}

/** How much the rejected multiplicative law favoured the smallest stakes, across families where it deviates: lo..hi as fractions. */
export function g3MultAdvantage(): Measured<{ lo: number; hi: number }> {
  let lo = Infinity, hi = -Infinity;
  for (const f of Object.values(g3.families)) {
    const first = f.mult?.deciles?.[0];
    if (!first || first.mean === null) continue;
    const d = first.mean - 1;
    if (d <= g3.tolerance) continue;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return { value: { lo, hi }, measuredAt: g3.date, source: `G3 simulation, multiplicative law, ${g3.totalWindows.toLocaleString("en-US")} windows`, href: GITHUB_G3_DATA };
}

/* ------------------------------- G4 ------------------------------- */

export interface CapRow {
  cap: number;
  windows: number;
  explainedByBiggest: number;
  explainedByBiggestWhenCapBinds: number;
  explainedAnalyticWorstCase: number;
  windowsWhereCapBinds: number;
  truncatedShare: number;
  meanPmaxAtClose: number;
}

const g4Source = `G4 simulation, ${g4.windowsPerCap.toLocaleString("en-US")} windows per cap`;

export function g4ChosenCap(): Measured<number> {
  return { value: g4.chosenCap, measuredAt: g4.date, source: g4Source, href: GITHUB_G4 };
}

export function g4Rows(): Measured<CapRow[]> {
  return { value: g4.results as CapRow[], measuredAt: g4.date, source: g4Source, href: GITHUB_G4_DATA };
}

export function g4ChosenRow(): Measured<CapRow> {
  const row = (g4.results as CapRow[]).find((r) => r.cap === g4.chosenCap)!;
  return { value: row, measuredAt: g4.date, source: g4Source, href: GITHUB_G4_DATA };
}

/** The acceptance criterion of G4: at most this share of a small player's variance explained by the biggest entry. */
export function g4Criterion(): Measured<number> {
  // Parsed from the criterion sentence stored in the JSON ("at most N%").
  const m = /at most (\d+(?:\.\d+)?)%/.exec(g4.criterion);
  const pct = m ? Number(m[1]) / 100 : NaN;
  return { value: pct, measuredAt: g4.date, source: `G4 criterion: "${g4.criterion}"`, href: GITHUB_G4 };
}

/* ---------------------------- law constants ---------------------------- */

const LAW_SOURCE = "sdk/src/law.ts, mirrored on-chain";

export function platformFeeBps(): Measured<number> {
  return { value: Number(PLATFORM_FEE_BPS), measuredAt: g3.date, source: LAW_SOURCE, href: programLink() };
}
export function maxHostFeeBps(): Measured<number> {
  return { value: Number(MAX_HOST_FEE_BPS), measuredAt: g3.date, source: LAW_SOURCE, href: GITHUB_LAW };
}
export function rollMax(): Measured<number> {
  return { value: Number(ROLL_MAX), measuredAt: g3.date, source: LAW_SOURCE, href: GITHUB_LAW };
}
export function rollExp(): Measured<number> {
  return { value: ROLL_EXP, measuredAt: g3.date, source: LAW_SOURCE, href: GITHUB_LAW };
}

/**
 * Shape of the roll law, computed from the formula (not a measurement).
 * roll = floor((ROLL_MAX+1) * u^exp), so P(roll <= r) = ((r+1) / (ROLL_MAX+1))^(1/exp) and
 * P(lo <= roll <= hi) = ((hi+1) / (ROLL_MAX+1))^(1/exp) - (lo / (ROLL_MAX+1))^(1/exp).
 * Bins are integer ranges, `hi` inclusive; the last bin ends at ROLL_MAX.
 */
export function rollShape(bins = 20): Array<{ lo: number; hi: number; p: number }> {
  const n = Number(ROLL_MAX) + 1;
  const width = Math.floor(n / bins);
  const out: Array<{ lo: number; hi: number; p: number }> = [];
  for (let i = 0; i < bins; i++) {
    const lo = i * width;
    const hi = i === bins - 1 ? Number(ROLL_MAX) : (i + 1) * width - 1;
    out.push({ lo, hi, p: Math.pow((hi + 1) / n, 1 / ROLL_EXP) - Math.pow(lo / n, 1 / ROLL_EXP) });
  }
  return out;
}

/* ---------------------------- G6: slot time ---------------------------- */


/** First day of the 200 ms-target regime (G6 §4: the regime switch is dated 2026-10-09/10). */
const G6_REGIME_FROM = "2026-10-10";

export interface SlotTime {
  /** ms per slot, slot-weighted mean over the regime days. */
  ms: number;
  /** +- half the daily range over those days. */
  sd: number;
  from: string;
  to: string;
  slots: number;
  days: number;
}

/** 1 slot in ms, measured on mainnet over the current regime. Use for every "~ N s (estimate)". */
export function slotMs(): Measured<SlotTime> {
  const days = g6.daily.filter((d) => d.day >= G6_REGIME_FROM);
  let slots = 0, weighted = 0, lo = Infinity, hi = -Infinity;
  for (const d of days) {
    slots += d.slots;
    weighted += d.ms_per_slot * d.slots;
    lo = Math.min(lo, d.ms_per_slot);
    hi = Math.max(hi, d.ms_per_slot);
  }
  const ms = Math.round(weighted / slots);
  return {
    value: { ms, sd: Math.ceil((hi - lo) / 2), from: days[0]!.day, to: days[days.length - 1]!.day, slots, days: days.length },
    measuredAt: g6.summary.measured_to,
    source: `G6 slot samples, mainnet, ${days[0]!.day} to ${days[days.length - 1]!.day}`,
    href: GITHUB_G6_DATA,
  };
}

/**
 * G6 §6 recommendation for a ~20 s window: 92 slots. The demo's round
 * length only: a page that states the round length uses roundSlots(), and a
 * mainnet build stops on any other call (next.config.ts, launch gate).
 */
export function windowSlots(): Measured<number> {
  const s = slotMs();
  const target = 20_000;
  return { value: Math.round(target / s.value.ms), measuredAt: s.measuredAt, source: "G6 recommended window_slots for ~20 s", href: GITHUB_G6 };
}

/** Where a market setting can be read on chain: the market's explorer page, else the research note. */
const marketHref = (fallback: string) => (MARKET_ENV ? EXPLORER_ADDRESS.replace("{address}", MARKET_ENV) : fallback);

/**
 * The round length the pages state: the deployed market's window_slots,
 * given to the build as NEXT_PUBLIC_LADLE_WINDOW_SLOTS (written by
 * scripts/mainnet-up.ps1 and devnet-up.ps1 from config/deployments; a mainnet
 * build requires it), else the demo's G6 value (~20 s, windowSlots()).
 */
export function roundSlots(): Measured<number> {
  if (WINDOW_SLOTS_ENV == null) return windowSlots();
  return { value: WINDOW_SLOTS_ENV, measuredAt: slotMs().measuredAt, source: "the market's window_slots", href: marketHref(GITHUB_G6) };
}

/** The refund delay the pages state: the market's vrf_timeout_slots (NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS), else G2's recommendation. */
export function roundTimeoutSlots(): Measured<number> {
  if (VRF_TIMEOUT_SLOTS_ENV == null) return vrfTimeoutSlots();
  return { value: VRF_TIMEOUT_SLOTS_ENV, measuredAt: orao.generated_at, source: "the market's vrf_timeout_slots", href: marketHref(GITHUB_G2) };
}

/* ---------------------------- G2: reveal latency ---------------------------- */

export interface Latency {
  n: number;
  medianS: number;
  p90S: number;
  p95S: number;
  p99S: number;
  maxS: number;
  minS: number;
  medianSlots: number;
  p90Slots: number;
  p99Slots: number;
  maxSlots: number;
  firstMedianS: number;
  unfulfilled: number;
  from: string;
  to: string;
}

/** ORAO VRF request -> usable value (3-of-3 quorum), mainnet. */
export function revealLatency(): Measured<Latency> {
  const t = orao.time_delta_last_fulfill_s, s = orao.slot_delta_last_fulfill;
  return {
    value: {
      n: t.n,
      medianS: t.median, p90S: t.p90, p95S: t.p95, p99S: t.p99, maxS: t.max, minS: t.min,
      medianSlots: s.median, p90Slots: s.p90, p99Slots: s.p99, maxSlots: s.max,
      firstMedianS: orao.time_delta_first_fulfill_s.median,
      unfulfilled: orao.requests_without_fulfill_in_window,
      from: orao.time_range.from, to: orao.time_range.to,
    },
    measuredAt: orao.generated_at,
    source: `G2, ORAO VRF on mainnet, ${t.n} requests, ${orao.time_range.from.slice(0, 10)} to ${orao.time_range.to.slice(0, 10)}`,
    href: GITHUB_ORAO_DATA,
  };
}

/** Slots after seal without a seed before anyone can trigger the refund (G2 §9: vrf_timeout_slots ≈ 900). Pages state roundTimeoutSlots(). */
export function vrfTimeoutSlots(): Measured<number> {
  const m = /vrf_timeout_slots[^0-9]{0,12}(\d{3,4})/.exec(G2_TIMEOUT_SENTENCE);
  return { value: m ? Number(m[1]) : NaN, measuredAt: orao.generated_at, source: "G2 recommendation, vrf_timeout_slots", href: GITHUB_G2 };
}
// Quoted from research/G2.md §1 so the number is parsed, not typed, in the same way as the other constants.
const G2_TIMEOUT_SENTENCE = "size the loop at ≈ p99: >= 540 slots (~2 min) per window with vrf_timeout_slots ≈ 900";
