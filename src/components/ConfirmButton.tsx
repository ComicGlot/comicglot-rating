"use client";
import { useEffect, useState } from "react";

// A submit button that needs two clicks: the first arms it ("Click again to delete"), the second submits.
// It disarms itself after a few seconds, so a stray click never deletes anything.
export default function ConfirmButton({ children, confirm = "Click again to confirm", className = "btn sm danger" }: { children: React.ReactNode; confirm?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type={armed ? "submit" : "button"}
      className={armed ? `${className} armed` : className}
      onClick={(e) => { if (!armed) { e.preventDefault(); setArmed(true); } }}
      aria-live="polite"
    >
      {armed ? confirm : children}
    </button>
  );
}
