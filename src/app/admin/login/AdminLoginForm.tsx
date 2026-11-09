"use client";
import { useActionState, useState } from "react";
import { adminLogin } from "@/app/login/actions";

const ERR = { missing: "Enter the name and the password.", wrong: "Name or password not recognised." };

export default function AdminLoginForm() {
  const [error, action, pending] = useActionState(adminLogin, null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <label className="field"><span>Name</span><input name="username" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} /></label>
      <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <div className="callout warn" role="alert">{ERR[error]}</div>}
      <button className="btn primary" disabled={pending} style={{ width: "100%", marginTop: 4 }}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
