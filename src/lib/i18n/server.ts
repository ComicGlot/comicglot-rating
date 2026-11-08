import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, LOCALES, MESSAGES, isLocale, type Locale, type Messages } from "./index";

// The rater's interface language: the cookie set by the language switch, else the browser's first
// supported language, else English.
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if ((LOCALES as readonly string[]).includes(code)) return code as Locale;
  }
  return "en";
}

export async function getMessages(): Promise<{ locale: Locale; m: Messages }> {
  const locale = await getLocale();
  return { locale, m: MESSAGES[locale] };
}
