"use client";
import { useRef, useState } from "react";
import Icon from "@/components/Icon";

const CONDS = [
  ["true_class", "With the type's guide"],
  ["no_class", "No type (default guide)"],
  ["no_context", "Type's guide, no previous lines"],
  ["wrong_class", "A mismatched type's guide"],
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
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <Icon name="sparkle" />
        <span className="h3">Translate with another model</span>
      </div>
      <p className="muted read" style={{ maxWidth: 700 }}>
        Sends every text of a study through OpenRouter with the pipeline&apos;s own prompt and the study&apos;s style guides. Translations of one model are compared only with each other, so choose at least two conditions. This spends OpenRouter credit.
      </p>
      <div className="grid2" style={{ marginTop: 12 }}>
        <label className="field"><span>Study</span><select name="studyId">{studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field"><span>OpenRouter model id</span><input type="text" name="model" placeholder="e.g. anthropic/claude-sonnet-4.5" required /></label>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 14 }}>
        {CONDS.map(([v, l], i) => (
          <label key={v} className="chip" style={{ position: "relative" }}><input type="checkbox" name="cond" value={v} defaultChecked={i < 2} /> {l}</label>
        ))}
        <label className="chip" style={{ position: "relative" }}><input type="checkbox" name="withPage" /> Send the frame image too</label>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={busy}>{busy ? "Translating…" : "Translate missing texts"}</button>
        {busy && <button type="button" className="btn" onClick={() => (stop.current = true)}>Stop</button>}
      </div>
      {log.length > 0 && <pre className="log" style={{ marginTop: 14 }}>{log.slice(-12).join("\n")}</pre>}
    </form>
  );
}
