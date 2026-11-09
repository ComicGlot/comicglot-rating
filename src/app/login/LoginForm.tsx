"use client";
import { useActionState, useState } from "react";
import { useI18n } from "@/components/I18n";
import { enter } from "./actions";

export default function LoginForm() {
  const { m } = useI18n();
  const [error, action, pending] = useActionState(enter, null);
  // Controlled: React resets uncontrolled fields after an action, which would clear a mistyped key.
  const [key, setKey] = useState("");
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <label className="field">
        <span>{m.login.key}</span>
        <input
          name="key" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus required
          className="mono" style={{ letterSpacing: "0.08em", fontSize: 18, textAlign: "center" }}
          value={key} onChange={(e) => setKey(e.target.value)}
        />
      </label>
      {error && <div className="callout warn" role="alert">{m.login[error]}</div>}
      <button className="btn primary" disabled={pending} style={{ width: "100%", marginTop: 4 }}>
        {pending ? m.login.signingIn : m.login.signIn}
      </button>
    </form>
  );
}
