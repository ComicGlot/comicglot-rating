"use client";
import { useActionState } from "react";
import { STEP_LABEL, STEP_ORDER } from "@/lib/steps";
import { createRater, resetCode, type CodeResult } from "./actions";

function Result({ r }: { r: CodeResult }) {
  if (!r) return null;
  if ("error" in r) return <p className="err">{r.error}</p>;
  return (
    <p>
      <b>{r.username}</b>: access code <span className="code">{r.code}</span>
      {r.assigned ? ` (${r.assigned} chapters assigned)` : ""}. Copy it now; it is not shown again.
    </p>
  );
}

export function StepBoxes({ name = "steps", checked }: { name?: string; checked: string[] }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      {STEP_ORDER.filter((s) => s !== "review").map((s) => (
        <label key={s} className="inline">
          <input type="checkbox" name={name} value={s} defaultChecked={checked.includes(s)} /> {STEP_LABEL[s]}
        </label>
      ))}
    </span>
  );
}

export function CreateRaterForm() {
  const [res, action, pending] = useActionState(createRater, null);
  return (
    <form action={action} className="card">
      <h2 style={{ marginTop: 0 }}>New rater</h2>
      <div className="row">
        <div className="grow"><label>Name (login)</label><input type="text" name="username" required /></div>
        <div className="grow"><label>Note (private)</label><input type="text" name="note" /></div>
      </div>
      <label>Steps this person does (none ticked means every step of the study)</label>
      <StepBoxes checked={[]} />
      <p><button disabled={pending}>Create and assign the active chapters</button></p>
      <Result r={res} />
    </form>
  );
}

export function ResetCodeButton({ raterId }: { raterId: string }) {
  const [res, action, pending] = useActionState(resetCode, null);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="raterId" value={raterId} />
      <button className="secondary" disabled={pending}>New code</button>
      <Result r={res} />
    </form>
  );
}
