/**
 * Chain history (v20, P2): the curve, the activity and the books read from
 * the program's events (getSignaturesForAddress(market) + the sdk's
 * eventsFromLogs: WindowTallied, SoldBack, Sold; Market.curve for the price
 * now, Market.nextSettleIndex for the rounds served).
 *
 * Not written yet: it returns null, and the UI then hides the curve card,
 * the books card and the activity rail and says "History is not read from
 * the chain yet." No placeholder numbers.
 */
import type { HistorySource } from "./types";

export function chainHistorySource(): HistorySource | null {
  return null;
}
