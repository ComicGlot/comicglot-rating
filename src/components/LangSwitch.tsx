"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, LOCALES, MESSAGES, type Locale } from "@/lib/i18n";
import { useI18n } from "./I18n";

// Changes the interface language only; translations are always into English.
export default function LangSwitch() {
  const { locale, m } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="lang" title={m.common.language}>
      <span className="sr">{m.common.language}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c1.8 1.8 2.6 3.8 2.6 6S9.8 12.2 8 14M8 2C6.2 3.8 5.4 5.8 5.4 8S6.2 12.2 8 14" />
      </svg>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as Locale;
          document.cookie = `${LOCALE_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
          document.documentElement.lang = v;
          start(() => router.refresh());
        }}
      >
        {LOCALES.map((l) => <option key={l} value={l}>{MESSAGES[l].langName}</option>)}
      </select>
    </label>
  );
}
