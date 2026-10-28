"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Dict, type Locale, type T } from "./index";

interface Ctx { locale: Locale; dict: Dict; t: T }

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: ReactNode }) {
  const value = useMemo<Ctx>(() => ({ locale, dict, t: makeT(dict) }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}

export function useT(): T {
  return useI18n().t;
}
