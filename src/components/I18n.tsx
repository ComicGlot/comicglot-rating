"use client";
import { createContext, useContext } from "react";
import type { Locale, Messages } from "@/lib/i18n";

const Ctx = createContext<{ locale: Locale; m: Messages } | null>(null);

export function I18nProvider({ locale, m, children }: { locale: Locale; m: Messages; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, m }}>{children}</Ctx.Provider>;
}

export function useI18n(): { locale: Locale; m: Messages } {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
