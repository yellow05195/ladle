/** Display formats of the hall (v20). SOL: 2 decimals in HUD pills, 3 in receipts and sums. LADLE: whole, with separators. Prices: 4 decimals, SOL per 1M LADLE. */
import { formatInt, formatMultiplier, formatSol } from "../../lib/format";

export const sol2 = (l: bigint) => formatSol(l, 2);
export const sol3 = (l: bigint) => formatSol(l, 3);
/** "0.250000000" → "0.25" */
export const solShort = (l: bigint) => formatSol(l, 3).replace(/\.?0+$/, "") || "0";
export const ladle = (baseUnits: bigint) => formatInt(baseUnits / 1_000_000n);
export const price4 = (p: number) => p.toFixed(4);
export const mult = (m: number) => formatMultiplier(m);
export const roundNum = (id: string) => id.replace(/^demo-/, "");
export const secondsLeft = (slots: number, slotMs: number) => Math.max(0, Math.round((slots * slotMs) / 1000));
