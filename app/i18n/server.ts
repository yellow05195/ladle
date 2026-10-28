import { LOCALE, dictionary, makeT, type Dict, type Locale, type T } from "./index";

/** English only: no cookie, no header negotiation. */
export async function getDict(): Promise<{ locale: Locale; dict: Dict; t: T }> {
  return { locale: LOCALE, dict: dictionary, t: makeT(dictionary) };
}
