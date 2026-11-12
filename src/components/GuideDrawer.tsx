"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmt } from "@/lib/i18n";
import { TONE, TYPES, type Step } from "@/lib/steps";
import Icon from "./Icon";
import { useI18n } from "./I18n";

// The rater's reference: what each step asks, the tone marks, the type names and the shortcuts.
// Rendered at the end of <body>: the top bar uses backdrop-filter, which would otherwise become the
// containing block of this fixed panel and squeeze it into the bar.
export default function GuideDrawer({ steps, ranking = false }: { steps: Step[]; ranking?: boolean }) {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      const t = e.target as HTMLElement;
      if (e.key === "?" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) setOpen((o) => !o);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const shown = steps.filter((s): s is Exclude<Step, "review"> => s !== "review");

  const panel = (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={m.guide.title}>
        <div className="dh">
          <span className="h3">{m.guide.title}</span>
          <button type="button" className="btn ghost icon" onClick={() => setOpen(false)} aria-label={m.common.close}><Icon name="x" /></button>
        </div>
        <div className="db">
          {shown.map((s) => (
            <section key={s} style={{ marginBottom: 28 }}>
              <span className="label">{s === "compare" && ranking ? m.ranking.label : m.steps[s].label}</span>
              <ul>{(s === "compare" && ranking ? m.ranking.guide : m.steps[s].guide).map((x) => <li key={x}>{x}</li>)}</ul>
              {s === "compare" && !ranking && (
                <>
                  <span className="label">{m.guide.toneTitle}</span>
                  <div className="typelist" style={{ margin: "8px 0 12px" }}>
                    {TONE.map((t) => (
                      <div key={t}><span>{m.tone[t]}</span><small>{m.tone[`${t}Help`]}</small></div>
                    ))}
                  </div>
                </>
              )}
              <div className="row" style={{ gap: 10 }}>
                {(s === "compare" && ranking ? m.ranking.shortcuts : m.guide.shortcuts[s]).map(([k, v]) => (
                  <span key={k} className="small muted"><span className="kbd">{k}</span> {v}</span>
                ))}
              </div>
            </section>
          ))}
          {shown.includes("types") && (
            <section>
              <span className="label">{m.guide.typesTitle}</span>
              <div className="typelist" style={{ marginTop: 8 }}>
                {TYPES.map(([v]) => (
                  <div key={v}><span>{m.types[v][0]}</span><small>{m.types[v][1]}</small></div>
                ))}
              </div>
            </section>
          )}
          <p className="small faint" style={{ marginTop: 24 }}>
            {fmt(m.guide.toggle, { key: "?" })}
          </p>
        </div>
      </aside>
    </>
  );

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)} title={`${m.guide.title} (?)`}>
        <Icon name="book" /> {m.common.guide}
      </button>
      {open && mounted && createPortal(panel, document.body)}
    </>
  );
}
