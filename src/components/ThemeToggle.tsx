"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";

// Light or dark for this browser; the default follows the system setting.
export default function ThemeToggle({ labels }: { labels?: [string, string] }) {
  const [light, dark_] = labels ?? ["Light theme", "Dark theme"];
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  if (dark === null) return <span className="btn ghost icon" aria-hidden="true" />;
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cg-theme", next); } catch {}
    setDark(!dark);
  };
  return (
    <button type="button" className="btn ghost icon" onClick={flip} title={dark ? light : dark_} aria-label={dark ? light : dark_}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
