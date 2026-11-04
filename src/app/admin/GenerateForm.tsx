"use client";
import { useRef, useState } from "react";

const CONDS = [
  ["true_class", "with the type's guide"],
  ["no_class", "no type (default guide)"],
  ["no_context", "type's guide, no previous lines"],
  ["wrong_class", "a mismatched type's guide"],
] as const;

// Fills one condition for a study through OpenRouter, a few blocks per request, until none are left.
export default function GenerateForm({ studies }: { studies: { id: string; name: string }[] }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);

  async function run(form: FormData) {
    setBusy(true);
    stop.current = false;
    const body = {
      studyId: form.get("studyId"),
      model: String(form.get("model") ?? "").trim(),
      withPage: form.get("withPage") === "on",
      limit: 8,
    };
    const conds = form.getAll("cond").map(String);
    try {
      for (const condition of conds) {
        for (;;) {
          if (stop.current) return;
          const r = await fetch("/api/admin/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, condition }) });
          const j = await r.json();
          if (!r.ok) { setLog((l) => [...l, `${condition}: ${j.error}`]); break; }
          setLog((l) => [...l, `${j.condition}: +${j.made}, ${j.left} left${j.errors?.length ? ` (errors: ${j.errors.join("; ")})` : ""}`]);
          if (j.left === 0 || j.made === 0) break;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={run} className="card">
      <h2 style={{ marginTop: 0 }}>Translate with another model</h2>
      <p className="muted">
        Uses the pipeline&apos;s prompt and the study&apos;s style guides through OpenRouter. Candidates of one model are compared with
        each other, so choose at least two conditions.
      </p>
      <div className="row">
        <div className="grow">
          <label>Study</label>
          <select name="studyId">{studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        <div className="grow">
          <label>OpenRouter model id</label>
          <input type="text" name="model" placeholder="e.g. openai/gpt-4o" required />
        </div>
      </div>
      <div className="row" style={{ gap: 12, marginTop: 8 }}>
        {CONDS.map(([v, l], i) => (
          <label key={v} className="inline"><input type="checkbox" name="cond" value={v} defaultChecked={i < 2} /> {l}</label>
        ))}
        <label className="inline"><input type="checkbox" name="withPage" /> send the page image too</label>
      </div>
      <p className="row" style={{ gap: 8 }}>
        <button disabled={busy}>{busy ? "Translating…" : "Translate missing blocks"}</button>
        {busy && <button type="button" className="secondary" onClick={() => (stop.current = true)}>Stop</button>}
      </p>
      {log.length > 0 && <pre className="log">{log.slice(-12).join("\n")}</pre>}
    </form>
  );
}
