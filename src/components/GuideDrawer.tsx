"use client";
import { useEffect, useState } from "react";
import { STEP_GUIDE, STEP_LABEL, TONE_LABEL, TYPES, type Step } from "@/lib/steps";
import Icon from "./Icon";

const SHORTCUTS: Record<Exclude<Step, "review">, [string, string][]> = {
  types: [["1–9, 0", "choose a type (first ten)"], ["J / K", "next / previous text"], ["Ctrl + Enter", "save the frame"]],
  transcribe: [["Ctrl + Enter", "next text, then save the frame"], ["Alt + ↓ / ↑", "next / previous text"]],
  compare: [["A / B", "choose a version"], ["T", "tie"], ["J / K", "next / previous text"], ["Ctrl + Enter", "save the frame"]],
};

// The rater's reference: what each step asks, the type names, the tone marks and the shortcuts.
export default function GuideDrawer({ steps, initialOpen = false }: { steps: Step[]; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      const t = e.target as HTMLElement;
      if (e.key === "?" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) setOpen((o) => !o);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const shown = steps.filter((s): s is Exclude<Step, "review"> => s !== "review");
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)} title="Guide (?)">
        <Icon name="book" /> Guide
      </button>
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <aside className="drawer" role="dialog" aria-label="Guide">
            <div className="dh">
              <span className="h3">Guide</span>
              <button type="button" className="btn ghost icon" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="db">
              {shown.map((s) => (
                <section key={s} style={{ marginBottom: 24 }}>
                  <span className="label">{STEP_LABEL[s]}</span>
                  <ul>{STEP_GUIDE[s].map((x) => <li key={x}>{x}</li>)}</ul>
                  {s === "compare" && (
                    <div className="typelist" style={{ marginBottom: 12 }}>
                      {(["fine", "added", "overdone"] as const).map((t) => (
                        <div key={t}>
                          <span>{TONE_LABEL[t]}</span>
                          <small>
                            {t === "fine" ? "The tone matches the page." : t === "added" ? "Some tone the page does not show (an extra exclamation, a stutter, a swear word)." : "Clearly too strong: a calm line shouted, a mild word turned rude."}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="row" style={{ gap: 6 }}>
                    {SHORTCUTS[s].map(([k, v]) => (
                      <span key={k} className="small muted"><span className="kbd">{k}</span> {v}</span>
                    ))}
                  </div>
                </section>
              ))}
              {shown.includes("types") && (
                <section>
                  <span className="label">The types</span>
                  <div className="typelist" style={{ marginTop: 8 }}>
                    {TYPES.map(([v, n, d]) => (
                      <div key={v}><span>{n}</span><small>{d}</small></div>
                    ))}
                  </div>
                </section>
              )}
              <p className="small faint" style={{ marginTop: 24 }}>Press <span className="kbd">?</span> to open or close this guide.</p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
