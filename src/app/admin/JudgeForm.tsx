"use client";
import { useRef, useState } from "react";
import Icon from "@/components/Icon";

// Runs a language model over every blind pair of a study, a few texts per request, until none are left.
export default function JudgeForm({ studies }: { studies: { id: string; name: string }[] }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);

  async function run(form: FormData) {
    setBusy(true);
    stop.current = false;
    const body = { studyId: form.get("studyId"), judge: String(form.get("judge") ?? "").trim(), withImage: form.get("withImage") === "on", limit: 6 };
    try {
      for (;;) {
        if (stop.current) return;
        const r = await fetch("/api/admin/judge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok) { setLog((l) => [...l, j.error]); break; }
        setLog((l) => [...l, `${j.judge}: +${j.made}, ${j.left} left${j.errors?.length ? ` (errors: ${j.errors.join("; ")})` : ""}`]);
        if (j.left === 0 || j.made === 0) break;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={run} className="card">
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <Icon name="users" />
        <span className="h3">Judge with a model</span>
      </div>
      <p className="muted read" style={{ maxWidth: 700 }}>
        A language model judges the same blind pairs as the translators, with its own random letters, and is never told the type. Its answers are stored as the rater <span className="mono">model:&lt;id&gt;</span> and reported apart from people. Use a model that did not write the translations. This spends OpenRouter credit.
      </p>
      <div className="grid2" style={{ marginTop: 12 }}>
        <label className="field"><span>Study</span><select name="studyId">{studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field"><span>Judge model (OpenRouter id)</span><input type="text" name="judge" placeholder="e.g. google/gemini-2.5-pro" required /></label>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 14 }}>
        <label className="chip" style={{ position: "relative" }}><input type="checkbox" name="withImage" defaultChecked /> Show the judge the frame</label>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={busy}>{busy ? "Judging…" : "Judge the open pairs"}</button>
        {busy && <button type="button" className="btn" onClick={() => (stop.current = true)}>Stop</button>}
      </div>
      {log.length > 0 && <pre className="log" style={{ marginTop: 14 }}>{log.slice(-12).join("\n")}</pre>}
    </form>
  );
}
