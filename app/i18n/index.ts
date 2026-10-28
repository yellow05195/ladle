/**
 * The site's strings. English only (the French side was removed at the
 * owner's request): one dictionary, `en.ts`, and `t(key, vars)` to read it.
 * `locale` stays in the API as the constant "en" so number and date
 * formatting keeps one entry point.
 */
import { en, type Key } from "./en";

export type Locale = "en";
export type Dict = Record<Key, string>;
export type { Key };

export const LOCALE: Locale = "en";

export type Vars = Record<string, string | number>;

/** Interpolates `{name}` placeholders. Numbers are passed as pre-formatted strings by callers. */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type T = (key: Key, vars?: Vars) => string;

export function makeT(dict: Dict): T {
  return (key, vars) => format(dict[key] ?? key, vars);
}

export const dictionary: Dict = en;
