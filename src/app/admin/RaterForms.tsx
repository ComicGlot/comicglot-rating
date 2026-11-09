"use client";
import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { ROLES } from "@/lib/roles";
import { STEP_LABEL, STEP_ORDER } from "@/lib/steps";
import { createToken, type TokenResult } from "./actions";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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

export function invitation(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `Hello! Here is your access to the ComicGlot rating study.\n\nSite: ${origin}/login\nAccess key: ${token}\n\nPlease keep the key to yourself.`;
}

export function InviteButtons({ token }: { token: string }) {
  return (
    <>
      <CopyButton text={token} label="Key" />
      <CopyButton text={invitation(token)} label="Invitation" />
    </>
  );
}

export function StepBoxes({ name = "steps", checked }: { name?: string; checked: readonly string[] }) {
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

function Result({ r }: { r: TokenResult }) {
  if (!r) return null;
  if ("error" in r) return <div className="callout warn" style={{ marginTop: 12 }}>{r.error}</div>;
  return (
    <div className="callout info" style={{ marginTop: 12, flexDirection: "column", gap: 8 }}>
      <div>New key <span className="code">{r.token}</span></div>
      <div className="row" style={{ gap: 6 }}>
        <CopyButton text={r.token} label="Copy key" />
        <CopyButton text={invitation(r.token)} label="Copy invitation" />
      </div>
    </div>
  );
}

export function CreateTokenForm({ studies }: { studies: { id: string; name: string }[] }) {
  const [res, action, pending] = useActionState(createToken, null);
  const [role, setRole] = useState<keyof typeof ROLES>("translator");
  const [uses, setUses] = useState("one");
  const [custom, setCustom] = useState(false);
  return (
    <form action={action} className="card">
      <div className="row between" style={{ marginBottom: 16 }}>
        <span className="h3">New access key</span>
        <div className="seg">
          {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => (
            <button type="button" key={r} className={r === role ? "on" : ""} onClick={() => setRole(r)}>{ROLES[r].label}</button>
          ))}
        </div>
      </div>
      <input type="hidden" name="role" value={role} />
      <p className="small muted" style={{ marginTop: -6, marginBottom: 14 }}>{ROLES[role].note}.</p>
      <div className="grid2">
        <label className="field"><span>Label (private, e.g. who it is for)</span><input type="text" name="label" placeholder="e.g. translators, first group" /></label>
        <label className="field"><span>Word (blank: a random key)</span><input type="text" name="word" className="mono" placeholder="e.g. HANGUL-2026" /></label>
        <div className="field">
          <span>Who can use it</span>
          <div className="seg">
            {[["one", "One person"], ["n", "Up to N people"], ["any", "Anyone with it"]].map(([v, l]) => (
              <button type="button" key={v} className={uses === v ? "on" : ""} onClick={() => setUses(v)}>{l}</button>
            ))}
          </div>
          <input type="hidden" name="uses" value={uses} />
          {uses === "n" && <input type="number" name="n" min={1} max={500} defaultValue={5} style={{ marginTop: 8, maxWidth: 120 }} />}
        </div>
        <label className="field"><span>Valid for (days, blank: no end)</span><input type="number" name="days" min={1} max={365} placeholder="no end" /></label>
        <label className="field">
          <span>Study</span>
          <select name="studyId" defaultValue="">
            <option value="">Every open study</option>
            {studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="field">
          <label className="check"><input type="checkbox" name="customSteps" checked={custom} onChange={(e) => setCustom(e.target.checked)} /> Choose the steps myself</label>
          {custom ? <StepBoxes checked={ROLES[role].steps} /> : <span className="small muted">Steps: {ROLES[role].steps.length ? ROLES[role].steps.map((s) => STEP_LABEL[s as keyof typeof STEP_LABEL]).join(", ") : "every step of the study"}</span>}
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={pending}>{pending ? "Creating…" : "Create key"}</button>
      </div>
      <Result r={res} />
    </form>
  );
}
