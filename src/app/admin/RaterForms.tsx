"use client";
import { useActionState } from "react";
import { createRater, resetCode, type CreateRaterResult } from "./actions";

function Result({ r }: { r: CreateRaterResult }) {
  if (!r) return null;
  if ("error" in r) return <p className="err">{r.error}</p>;
  return (
    <p>
      <b>{r.username}</b>: access code <span className="code">{r.code}</span>
      {r.assigned ? ` (${r.assigned} items assigned)` : ""}. Copy it now; it is not shown again.
    </p>
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
      <p><button disabled={pending}>Create and assign active studies</button></p>
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
