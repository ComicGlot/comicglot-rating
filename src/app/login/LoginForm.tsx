"use client";
import { useActionState, useState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  // Controlled fields: React resets uncontrolled form fields after an action, which would clear the name on a wrong code.
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <label className="field">
        <span>Name</span>
        <input name="username" type="text" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label className="field">
        <span>Access code</span>
        <input name="code" type="password" autoComplete="current-password" required value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      {error && <div className="callout warn" role="alert">{error}</div>}
      <button className="btn primary" disabled={pending} style={{ width: "100%", marginTop: 4 }}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
