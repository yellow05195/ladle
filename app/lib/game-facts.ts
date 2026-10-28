import type { GameFacts } from "../components/game/types";
import { formatInt, formatMultiplier, formatPct } from "./format";
import { g3SmallStats, g4ChosenCap, platformFeeBps, revealLatency, rollMax, slotMs, windowSlots } from "./measurements";

/** The figures the round chat quotes: the sdk law constants and the research measurements, never typed. */
export function gameFacts(): GameFacts {
  const small = g3SmallStats("power").value;
  const slots = windowSlots().value;
  const lat = revealLatency().value;
  return {
    rollMax: formatInt(rollMax().value),
    belowPct: formatPct(small.pBelowOne, 0),
    p50: formatMultiplier(small.p50),
    p90: formatMultiplier(small.p90),
    capPct: formatPct(g4ChosenCap().value, 0),
    slots,
    seconds: Math.round((slots * slotMs().value.ms) / 1000),
    medianS: lat.medianS,
    p99S: lat.p99S,
    feePct: formatPct(platformFeeBps().value / 10_000, 2),
  };
}
