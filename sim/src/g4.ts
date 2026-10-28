/**
 * GATE G4 - concentration inside a window.
 *
 * Under the linear law a small player's multiplier is
 *     m_i = 1 + (r_i - rbar) / ROLL_MAX,   rbar = sum(p_j r_j)
 * so the biggest entry (stake fraction p_max) moves rbar by p_max * r_max / ROLL_MAX.
 * We measure, by Monte Carlo, the share of a small player's multiplier variance
 * that is explained by the biggest entry's roll:
 *     explained = Var(E[m_i | r_max]) / Var(m_i) = Var(p_max * r_max / ROLL_MAX) / Var(m_i)
 * for different per-entry caps (fraction of the window total), on power-law
 * windows where whales are common. We also report the distribution of p_max at
 * close when the on-chain entry rule is enforced sequentially:
 *     a_i <= max(FLOOR, cap * (A_before + a_i))   (first entrant limited by FLOOR)
 *
 * Usage: node --experimental-strip-types sim/src/g4.ts [windows]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { Acc, ROLL_MAX, makeRng, pareto, rollOf } from "./common.ts";

const WINDOWS = Number(process.argv[2] ?? 500_000);
const CAPS = [1.0, 0.5, 0.33, 0.25, 0.2, 0.15, 0.1, 0.05]; // 1.0 = no cap
const FLOOR = 1; // absolute floor in "typical stake" units (stake ~ Pareto, min 1)
const t0 = Date.now();

const rng = makeRng(0x6a7e_4444);
const a = new Float64Array(512);
const r = new Float64Array(512);

const results = CAPS.map((cap) => {
  const small = new Acc();      // m_i of the smallest-decile players
  const whaleTerm = new Acc();  // p_max * r_max / ROLL_MAX (the biggest entry's push on rbar)
  const pmax = new Acc();
  const pmaxHist = new Array<number>(20).fill(0);
  // worst case: windows where the biggest entry is at (or near) the cap
  const smallWorst = new Acc();
  const whaleWorst = new Acc();
  let truncated = 0, attempts = 0;
  for (let w = 0; w < WINDOWS; w++) {
    const n = 5 + Math.floor(rng() * 96); // 5..100 entrants
    let A = 0, W = 0;
    for (let i = 0; i < n; i++) {
      let want = pareto(rng, 1.5);
      attempts++;
      if (cap < 1) {
        // sequential enforcement: a <= max(FLOOR, cap*(A+a))  <=> a <= max(FLOOR, cap*A/(1-cap))
        const lim = Math.max(FLOOR, (cap * A) / (1 - cap));
        if (want > lim) { want = lim; truncated++; }
      }
      a[i] = want;
      r[i] = rollOf(rng(), 3);
      A += want; W += want * r[i]!;
    }
    const rbar = W / A;
    let imax = 0;
    for (let i = 1; i < n; i++) if (a[i]! > a[imax]!) imax = i;
    const p = a[imax]! / A;
    pmax.add(p);
    pmaxHist[Math.min(19, Math.floor(p * 20))]!++;
    whaleTerm.add((p * r[imax]!) / ROLL_MAX);
    const atCap = cap < 1 ? p >= cap * 0.9 : p >= 0.45;
    if (atCap) whaleWorst.add((p * r[imax]!) / ROLL_MAX);
    // "small player": any entry with p_i < 2% of the window, excluding the whale
    for (let i = 0; i < n; i++) {
      if (i === imax) continue;
      if (a[i]! / A < 0.02) {
        const m = 1 + (r[i]! - rbar) / ROLL_MAX;
        small.add(m);
        if (atCap) smallWorst.add(m);
      }
    }
  }
  const explained = whaleTerm.variance / small.variance;
  const explainedWorst = whaleWorst.n > 100 ? whaleWorst.variance / smallWorst.variance : NaN;
  // analytic worst case for a small player facing one entry exactly at the cap, everyone else tiny:
  // Var(m) ~ sigma^2 (1 + cap^2) / R^2, whale term ~ cap^2 sigma^2 / R^2  =>  cap^2 / (1 + cap^2)
  const explainedAnalytic = (cap * cap) / (1 + cap * cap);
  const row = {
    cap, windows: WINDOWS, smallN: small.n,
    smallVariance: small.variance, smallSd: Math.sqrt(small.variance),
    whaleTermVariance: whaleTerm.variance,
    explainedByBiggest: explained,
    explainedByBiggestWhenCapBinds: explainedWorst, windowsWhereCapBinds: whaleWorst.n,
    explainedAnalyticWorstCase: explainedAnalytic,
    meanPmaxAtClose: pmax.mean,
    pmaxHist, truncatedShare: truncated / attempts,
  };
  console.log(`cap ${cap === 1 ? "none" : (cap * 100).toFixed(0) + "%"}: biggest entry explains ${(explained * 100).toFixed(2)}% avg, ${(explainedWorst * 100).toFixed(2)}% when the cap binds (n=${whaleWorst.n}), analytic worst ${(explainedAnalytic * 100).toFixed(2)}% | mean p_max at close ${(pmax.mean * 100).toFixed(1)}% | entries truncated ${(row.truncatedShare * 100).toFixed(1)}%`);
  return row;
});

const out = {
  gate: "G4", date: new Date().toISOString(), windowsPerCap: WINDOWS, rollExp: 3,
  method: "power-law stakes (Pareto 1.5), 5-100 entrants, sequential per-entry cap a <= max(FLOOR, cap*(A_before+a)); explained = Var(p_max*r_max/ROLL_MAX)/Var(m_small)",
  criterion: "choose the loosest cap for which the biggest entry explains at most 5% of a small player's outcome variance IN THE WORST CASE (window where the cap binds), analytic bound cap^2/(1+cap^2)",
  results, elapsedSeconds: (Date.now() - t0) / 1000,
};
const chosen = results.filter((x) => x.cap < 1 && x.explainedAnalyticWorstCase <= 0.05 && (isNaN(x.explainedByBiggestWhenCapBinds) || x.explainedByBiggestWhenCapBinds <= 0.05)).sort((x, y) => y.cap - x.cap)[0];
(out as any).chosenCap = chosen?.cap ?? null;
mkdirSync("research/data", { recursive: true });
writeFileSync("research/data/G4-results.json", JSON.stringify(out, null, 1));
console.log("chosen cap:", chosen?.cap, `${out.elapsedSeconds.toFixed(0)}s`);
