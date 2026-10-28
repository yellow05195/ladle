/**
 * Facts about the project that have no research JSON behind them: counts
 * stated in the research reports, the program README, SECURITY.md and
 * docs/RISKS.md. Each carries its date and its source, like every other
 * figure (Measured<T>), so that the homepage prints nothing it cannot cite.
 * Verdicts are kept as written: UNVERIFIED stays UNVERIFIED.
 */
import type { Measured } from "./measurements";
import { GITHUB_G1, GITHUB_G5, GITHUB_G7, GITHUB_PROGRAM_README, GITHUB_PROPS, GITHUB_RISKS, GITHUB_SECURITY } from "./links";

const DATE = "2026-10-23";

/** G1: the prior-art search, 46 queries. */
export function g1Queries(): Measured<number> {
  return { value: 46, measuredAt: DATE, source: "G1 prior-art search, 46 queries", href: GITHUB_G1 };
}

/** G5: adversarial windows of the property test, lamport-exact. */
export function g5PropertyWindows(): Measured<number> {
  return { value: 10_000, measuredAt: DATE, source: "tests/props, 10,000 adversarial windows", href: GITHUB_PROPS };
}

/** G7: measurements of re-entry after a bad draw. None. */
export function g7Measurements(): Measured<number> {
  return { value: 0, measuredAt: DATE, source: "G7, protocol written, not run", href: GITHUB_G7 };
}

/** The program: instructions, none of them administrative. */
export function programInstructions(): Measured<number> {
  return { value: 14, measuredAt: DATE, source: "programs/pulled/README.md", href: GITHUB_PROGRAM_README };
}

/** Host tests run with cargo test. */
export function hostTests(): Measured<number> {
  return { value: 21, measuredAt: DATE, source: "cargo test, host", href: GITHUB_PROGRAM_README };
}

/** Keeper bounty, share of the platform fee. */
export function keeperBountyPct(): Measured<number> {
  return { value: 10, measuredAt: DATE, source: "programs/pulled/README.md", href: GITHUB_PROGRAM_README };
}

/** Update authority: the timelock option, hours. */
export function timelockHours(): Measured<number> {
  return { value: 72, measuredAt: DATE, source: "SECURITY.md", href: GITHUB_SECURITY };
}

/** The category (G7, Bitquery): monthly change of the Solana gacha category, July 2026. */
export function categoryChangePct(): Measured<number> {
  return { value: -17.5, measuredAt: "2026-07-31", source: "G7, Solana gacha category, July 2026", href: GITHUB_G7 };
}

/** The category (G7, Bitquery): share of measured players losing money. */
export function playersLosingPct(): Measured<number> {
  return { value: 78, measuredAt: DATE, source: "G7, Bitquery, 17,544 wallets", href: GITHUB_G7 };
}

export const RISKS_HREF = GITHUB_RISKS;
export const SECURITY_HREF = GITHUB_SECURITY;
