import type { DataSource, HistorySource } from "./types";
import { mockHistory, mockSource } from "./mock";
import { chainSource } from "./chain";
import { chainHistorySource } from "./chain-history";

export const DATA_SOURCE: "demo" | "chain" = process.env.NEXT_PUBLIC_DATA_SOURCE === "chain" ? "chain" : "demo";

/** Set NEXT_PUBLIC_DATA_SOURCE=chain to use the Solana source. */
export function getDataSource(): DataSource {
  return DATA_SOURCE === "chain" ? chainSource : mockSource;
}

/** The curve, activity, books and Genesis count; null when the chain history is not read yet. */
export function getHistorySource(): HistorySource | null {
  return DATA_SOURCE === "chain" ? chainHistorySource() : mockHistory;
}

export type { DataSource, LiveWindow, WindowView, EntryView, DistributionBucket, PastDistribution, HistorySource, CurvePoint, ActivityItem, Books, GenesisCount } from "./types";
