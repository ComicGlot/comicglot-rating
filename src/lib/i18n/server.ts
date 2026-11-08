import { cookies } from "next/headers";
import { LOCALE_COOKIE, MESSAGES, isLocale, type Locale, type Messages } from "./index";

// The rater's interface language: the one chosen with the language switch, else English.
// The browser's language is deliberately not used: everyone starts in English and switches if they like.
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : "en";
}

export async function getMessages(): Promise<{ locale: Locale; m: Messages }> {
  const locale = await getLocale();
  return { locale, m: MESSAGES[locale] };
}
