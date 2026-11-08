import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Manrope, Noto_Sans_KR } from "next/font/google";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-manrope", display: "swap" });
// Hangul is not in Manrope; Korean text falls back to Noto Sans KR.
const kr = Noto_Sans_KR({ weight: ["400", "500", "700"], variable: "--font-kr", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "ComicGlot rating", template: "%s · ComicGlot rating" },
  robots: { index: false, follow: false },
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2348bdff'/%3E%3Cstop offset='1' stop-color='%237e4dda'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='14' fill='url(%23g)'/%3E%3C/svg%3E" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

// Applies a theme chosen with the toggle before the first paint (no flash).
const themeScript = `try{var t=localStorage.getItem("cg-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${kr.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
