// Interface languages. Only the interface changes; translations are always judged into English.
import de from "./de";
import en from "./en";
import fr from "./fr";
import ru from "./ru";
import uk from "./uk";

type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof en>;

export const LOCALES = ["en", "fr", "de", "ru", "uk"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "cg_lang";

export const MESSAGES: Record<Locale, Messages> = { en, fr, de, ru, uk };

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

// "Text {n} of {total}" with { n: 2, total: 5 }
export function fmt(s: string, vars: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Plural forms keyed by Intl.PluralRules categories (one, few, many, other); "other" is the fallback.
export type Plural = { [k: string]: string };
export function plural(locale: Locale, forms: Plural, n: number, vars: Record<string, string | number> = {}): string {
  const cat = new Intl.PluralRules(locale).select(n);
  return fmt(forms[cat] ?? forms.other, { n, ...vars });
}
