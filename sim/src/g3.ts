/**
 * GATE G3 - is the expectation really fair?
 *
 * For each window composition family, simulate N windows, and for every entry
 * record  ratio = realised share / pro-rata share  under two laws:
 *
 *   MULT   share_i = a_i r_i / sum(a_j r_j)            (the brief's first draft)
 *   LINEAR share_i = (a_i/A) * (1 + (r_i - rbar)/ROLL_MAX)   (the law we ship)
 *
 * Results are binned by decile of relative stake (a_i / A). A law passes if no
 * decile deviates from 1.000 by more than 0.5% (tolerance from the brief).
 *
 * Usage: node --experimental-strip-types sim/src/g3.ts [windowsPerFamily] [rollExp]
 * Default 2,000,000 windows per family x 5 families = 10,000,000 windows.
 * Fixed PRNG seed: results are reproducible bit for bit.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { Acc, FAMILIES, ROLL_MAX, decileEdges, decileOf, makeRng, rollOf } from "./common.ts";

const WINDOWS_PER_FAMILY = Number(process.argv[2] ?? 2_000_000);
const K = Number(process.argv[3] ?? 3);
const TOLERANCE = 0.005;
const CALIB = 100_000;
const HIST_BINS = 200; // ratio histogram on [0, 2), width 0.01

const t0 = Date.now();
const amounts = new Float64Array(512);
const rolls = new Float64Array(512);

type LawResult = { deciles: { mean: number; ci95: number; n: number; lo: number; hi: number }[]; worstDev: number; pass: boolean };
const out: Record<string, { label: string; windows: number; entries: number; edges: number[]; mult: LawResult; linear: LawResult; smallHist: number[]; zeroWeightWindows: number; smallStats: Record<string, number> }> = {};

for (const fam of FAMILIES) {
  const rng = makeRng(0x5eed_0000 + fam.key.length * 7919);

  // 1. calibration pass: decile edges of relative stake for this family
  const sample: number[] = [];
  for (let w = 0; w < CALIB; w++) {
    const n = fam.draw(rng, amounts);
    let A = 0; for (let i = 0; i < n; i++) A += amounts[i]!;
    for (let i = 0; i < n; i++) sample.push(amounts[i]! / A);
  }
  const sorted = Float64Array.from(sample).sort();
  // Families with few distinct stake classes (whale, equal) are binned by class, not by decile.
  const uniq = Array.from(new Set(Array.from(sorted).map((x) => Math.round(x * 1e9) / 1e9))).sort((x, y) => x - y);
  const edges = uniq.length <= 10
    ? [...uniq.slice(1).map((x, i) => (uniq[i]! + x) / 2), ...new Array(10 - uniq.length).fill(Number.POSITIVE_INFINITY).slice(0, 10 - uniq.length), Number.POSITIVE_INFINITY].slice(0, 10)
    : decileEdges(sorted);

  // 2. main pass
  const accM = Array.from({ length: 10 }, () => new Acc());
  const accL = Array.from({ length: 10 }, () => new Acc());
  const smallHist = new Array<number>(HIST_BINS).fill(0);
  const smallAcc = new Acc();
  let below = 0, smallN = 0;
  let entries = 0;
  let zeroWeightWindows = 0;

  for (let w = 0; w < WINDOWS_PER_FAMILY; w++) {
    const n = fam.draw(rng, amounts);
    let A = 0, W = 0;
    for (let i = 0; i < n; i++) {
      const r = rollOf(rng(), K);
      rolls[i] = r;
      A += amounts[i]!;
      W += amounts[i]! * r;
    }
    const rbar = W / A;
    for (let i = 0; i < n; i++) {
      const p = amounts[i]! / A;
      const d = decileOf(p, edges);
      const ratioL = 1 + (rolls[i]! - rbar) / ROLL_MAX;      // LINEAR
      // MULT is undefined when every roll is 0 (zero total weight): the window would be unsettleable
      if (rbar > 0) accM[d]!.add(rolls[i]! / rbar); else zeroWeightWindows += i === 0 ? 1 : 0;
      accL[d]!.add(ratioL);
      if (d === 0) {
        smallAcc.add(ratioL); smallN++;
        if (ratioL < 1) below++;
        const b = Math.min(HIST_BINS - 1, Math.max(0, Math.floor(ratioL * 100)));
        smallHist[b]!++;
      }
    }
    entries += n;
  }

  const pack = (acc: Acc[]): LawResult => {
    const deciles = acc.map((a, i) => ({
      mean: a.mean, ci95: a.ci95, n: a.n,
      lo: i === 0 ? 0 : edges[i - 1]!, hi: edges[i]!,
    }));
    const used = deciles.filter((d) => d.n > 0);
    const worstDev = Math.max(...used.map((d) => Math.abs(d.mean - 1)));
    // "systematically" off by more than the tolerance: the 95% CI must lie entirely beyond it
    const systematic = used.some((d) => Math.abs(d.mean - 1) - d.ci95 > TOLERANCE);
    return { deciles, worstDev, pass: !systematic };
  };

  // percentiles of the small-player multiplier from the histogram
  const pct = (q: number) => {
    let c = 0; const target = q * smallN;
    for (let b = 0; b < HIST_BINS; b++) { c += smallHist[b]!; if (c >= target) return (b + 0.5) / 100; }
    return 2;
  };
  out[fam.key] = {
    label: fam.label, windows: WINDOWS_PER_FAMILY, entries, edges,
    mult: pack(accM), linear: pack(accL), smallHist, zeroWeightWindows,
    smallStats: {
      n: smallN, mean: smallAcc.mean, sd: Math.sqrt(smallAcc.variance),
      pBelowOne: below / smallN, p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), p999: pct(0.999),
    },
  };
  const m = out[fam.key]!;
  console.log(`${fam.key.padEnd(7)} MULT worst ${(m.mult.worstDev * 100).toFixed(3)}% ${m.mult.pass ? "PASS" : "FAIL"} | LINEAR worst ${(m.linear.worstDev * 100).toFixed(4)}% ${m.linear.pass ? "PASS" : "FAIL"} | ${entries} entries | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const result = {
  gate: "G3",
  date: new Date().toISOString(),
  windowsPerFamily: WINDOWS_PER_FAMILY,
  totalWindows: WINDOWS_PER_FAMILY * FAMILIES.length,
  rollExp: K, rollMax: ROLL_MAX, tolerance: TOLERANCE,
  prngSeed: "sfc32, seed 0x5eed0000 + 7919*len(key) per family",
  elapsedSeconds: (Date.now() - t0) / 1000,
  families: out,
  verdict: {
    mult: Object.values(out).every((f) => f.mult.pass) ? "PASS" : "FAIL",
    linear: Object.values(out).every((f) => f.linear.pass) ? "PASS" : "FAIL",
  },
};
mkdirSync("research/data", { recursive: true });
writeFileSync(`research/data/G3-results${K === 3 ? "" : `-k${K}`}.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.verdict), `${result.elapsedSeconds.toFixed(0)}s`);
