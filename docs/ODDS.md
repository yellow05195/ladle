# The draw law, its bounds, and the measured distribution

Everything below is either an algebraic fact about the published law or a number measured on 2026-10-23 by a reproducible simulation (`sim/src/g3.ts`, fixed seed, 10,000,000 windows; raw output `research/data/G3-results.json`). No number here is a projection or a promise. Live, on-chain results replace the simulated distribution in the interface as soon as windows settle, with their own dates and transaction links.

## The law

```
roll_i    = floor(10001 × (n_i / 2^21)^3),  n_i = top 21 bits of sha256(seed ‖ owner_i ‖ index_i)   → integer in [0, 10000]
rbar      = Σ stake_j × roll_j / Σ stake_j                                                            (stake-weighted mean roll)
share_i   = tokens_sold × (stake_i / total) × (1 + (roll_i − rbar) / 10000)
```

- **Bounds.** The multiplier `1 + (roll_i − rbar)/10000` is in `[0, 2]`. Your share can be at most twice your pro-rata and at least zero. In practice `rbar` sits around 2,500 (the mean of the `u³` law) so a small entry's multiplier is effectively in `[0.75, 1.75]`.
- **Expectation.** Exactly your pro-rata, whatever your stake size. This is an algebraic property of the linear form (`E[roll_i] = E[rbar]`), measured to within ±0.1 % per stake decile over 10,000,000 windows (`research/G3.md`).
- **Conservation.** `Σ share_i = tokens_sold`, exactly, every window. For someone to take more, someone takes less, inside the same window. The house takes nothing from the draw.
- **Shape.** The cube makes the roll law right-skewed: most rolls are low, a few are high. That is where the "same price, not the same bag" comes from.

## What a small entry's multiplier looks like (simulated, 2026-10-23)

Smallest-stake decile, 50-player log-normal windows (the other compositions are within a few hundredths, see `research/G3.md` §5):

| | value |
|---|---|
| probability of ending **below** pro-rata | **62.5 %** |
| 10th percentile | 0.725× |
| median | 0.885× |
| 90th percentile | 1.475× |
| 99th percentile | 1.745× |
| 99.9th percentile | 1.825× |
| hard maximum | < 2× |
| hard minimum | ≥ 0× (reached only if your roll is 0 while the whole window rolled 10,000; never observed) |

Read it plainly: **most entries end a little below their pro-rata; one in ten ends well above it; the best cases are capped below 2×.** The worst and best are shown at the same size in the interface because they are the same fact seen from two sides.

## Fairness per stake decile (the G3 table)

Mean realised share / pro-rata share, 95 % interval, 2,000,000 windows per composition:

| composition | smallest decile | largest decile | worst deviation |
|---|---|---|---|
| 2 players | 0.9989 ± 0.0012 | 1.0001 ± 0.0001 | 0.106 % |
| 50 players | 1.0000 ± 0.0002 | 1.0001 ± 0.0002 | 0.012 % |
| 1 whale vs 10 small | small 1.0001 ± 0.0001 | whale 0.9999 ± 0.0002 | 0.012 % |
| power-law, 2–200 players | 0.9996 ± 0.0001 | 1.0000 ± 0.0001 | 0.046 % |
| 10 equal | 1.0000 | 1.0000 | 0.000 % |

For comparison, the multiplicative law (`stake × roll / Σ stake × roll`) that was first considered gives the smallest decile 3.66× its pro-rata expectation and the largest 0.81× in two-player windows. It was rejected (`research/G3.md` §3).

## What is NOT in these numbers

- The curve. Your share is in tokens; what you can sell them back for depends on the curve state when you sell. In a window where everyone sells back at once, the total paid out is at most what the curve received (property-tested), i.e. the window total minus fees. The fee is the only systematic cost; the draw itself is zero-sum among entrants.
- Real behaviour. Simulated stakes follow assumed distributions (log-normal, Pareto). The live distribution shown in the interface is measured on real windows and dated.
