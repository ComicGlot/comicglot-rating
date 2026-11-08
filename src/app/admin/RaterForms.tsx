"use client";
import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { STEP_LABEL, STEP_ORDER } from "@/lib/steps";
import { createRater, resetCode, type CodeResult } from "./actions";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch {}
      }}
    >
      <Icon name={ok ? "check" : "copy"} size={14} /> {ok ? "Copied" : label}
    </button>
  );
}

function Result({ r }: { r: CodeResult }) {
  if (!r) return null;
  if ("error" in r) return <div className="callout warn" style={{ marginTop: 12 }}>{r.error}</div>;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const message = `Hello! Here is your access to the ComicGlot rating study.\n\nSite: ${origin}/login\nName: ${r.username}\nAccess code: ${r.code}\n\nPlease keep the code to yourself.`;
  return (
    <div className="callout info" style={{ marginTop: 12, flexDirection: "column", gap: 8 }}>
      <div>
        <b>{r.username}</b>: access code <span className="code">{r.code}</span>
        {r.assigned ? ` · ${r.assigned} sets assigned` : ""}
      </div>
      <div className="small">Copy it now; it is not shown again.</div>
      <div className="row" style={{ gap: 6 }}>
        <CopyButton text={r.code} label="Copy code" />
        <CopyButton text={message} label="Copy invitation" />
      </div>
    </div>
  );
}

export function StepBoxes({ name = "steps", checked }: { name?: string; checked: string[] }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      {STEP_ORDER.filter((s) => s !== "review").map((s) => (
        <label key={s} className="chip" style={{ position: "relative" }}>
          <input type="checkbox" name={name} value={s} defaultChecked={checked.includes(s)} />
          {STEP_LABEL[s]}
        </label>
      ))}
    </span>
  );
}

const PRESETS = [
  { label: "Korean reader", steps: ["transcribe"], note: "Korean reader" },
  { label: "Translator", steps: ["compare"], note: "Korean–English translator" },
  { label: "Every step", steps: [] as string[], note: "" },
];

export function CreateRaterForm() {
  const [res, action, pending] = useActionState(createRater, null);
  const [preset, setPreset] = useState(0);
  return (
    <form action={action} className="card" key={preset}>
      <div className="row between" style={{ marginBottom: 16 }}>
        <span className="h3">New rater</span>
        <div className="seg">
          {PRESETS.map((p, i) => (
            <button type="button" key={p.label} className={i === preset ? "on" : ""} onClick={() => setPreset(i)}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="grid2">
        <label className="field"><span>Name (used to sign in)</span><input type="text" name="username" required placeholder="e.g. translator-1" pattern="[A-Za-z0-9._\-]{2,40}" /></label>
        <label className="field"><span>Note (private)</span><input type="text" name="note" defaultValue={PRESETS[preset].note} /></label>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <span>Steps this person does (none ticked: every step of the study)</span>
        <StepBoxes checked={PRESETS[preset].steps} />
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={pending}>{pending ? "Creating…" : "Create and assign the open sets"}</button>
      </div>
      <Result r={res} />
    </form>
  );
}

export function ResetCodeButton({ raterId }: { raterId: string }) {
  const [res, action, pending] = useActionState(resetCode, null);
  return (
    <form action={action} style={{ display: "contents" }}>
      <input type="hidden" name="raterId" value={raterId} />
      <button className="btn sm" disabled={pending}>New code</button>
      {res && <div style={{ flexBasis: "100%" }}><Result r={res} /></div>}
    </form>
  );
}
