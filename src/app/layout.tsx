import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Manrope, Noto_Sans_KR } from "next/font/google";
import { I18nProvider } from "@/components/I18n";
import { getMessages } from "@/lib/i18n/server";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-manrope", display: "swap" });
// Hangul is not in Manrope; Korean text falls back to Noto Sans KR.
const kr = Noto_Sans_KR({ weight: ["400", "500", "700"], variable: "--font-kr", display: "swap", preload: false });

// The mark: two overlapping speech balloons (see components/Logo.tsx).
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#d9d3ff"><ellipse cx="19.5" cy="11" rx="10" ry="7.6"/><path d="M24.5 16.2L29.5 22L19.8 18.4Z"/></g><g fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"><ellipse cx="12.5" cy="17.5" rx="10.5" ry="8"/><path d="M6.6 23.6L3 30L12 25.3Z"/></g><g fill="#5b47ff"><ellipse cx="12.5" cy="17.5" rx="10.5" ry="8"/><path d="M6.6 23.6L3 30L12 25.3Z"/></g><g stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M7.5 15.5H17.5"/><path d="M9.5 19.6H15.5"/></g></svg>`,
  );

export const metadata: Metadata = {
  title: { default: "ComicGlot rating", template: "%s · ComicGlot rating" },
  robots: { index: false, follow: false },
  icons: { icon: ICON },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

// Applies a theme chosen with the toggle before the first paint (no flash).
const themeScript = `try{var t=localStorage.getItem("cg-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, m } = await getMessages();
  return (
    <html lang={locale} className={`${manrope.variable} ${kr.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <I18nProvider locale={locale} m={m}>{children}</I18nProvider>
      </body>
    </html>
  );
}
