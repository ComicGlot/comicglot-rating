"use client";
import { useActionState, useState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  // Controlled fields: React resets uncontrolled form fields after an action, which would clear the name on a wrong code.
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  return (
    <form action={action} className="card" style={{ maxWidth: 380 }}>
      <label htmlFor="username">Name</label>
      <input id="username" name="username" type="text" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
      <label htmlFor="code">Access code</label>
      <input id="code" name="code" type="password" autoComplete="current-password" required value={code} onChange={(e) => setCode(e.target.value)} />
      {error && <p className="err">{error}</p>}
      <p><button disabled={pending}>Sign in</button></p>
    </form>
  );
}
