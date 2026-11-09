import Link from "next/link";
import ConfirmButton from "@/components/ConfirmButton";
import { ROLES, isRole } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { STEP_SHORT } from "@/lib/steps";
import { assignNew, clearRaterAnswers, deleteRater, deleteTesters, setRaterSteps, toggleRater } from "../actions";
import { CopyButton, StepBoxes } from "../RaterForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Raters" };

export default async function Raters() {
  const raters = await db.rater.findMany({
    orderBy: { createdAt: "asc" },
    include: { token: { select: { token: true } }, _count: { select: { assignments: true, responses: true } } },
  });
  const testers = raters.filter((r) => r.role === "tester").length;
  return (
    <>
      <div className="admhead">
        <div>
          <span className="label">Manage</span>
          <h1 className="h1" style={{ marginTop: 4 }}>Raters</h1>
          <p className="muted" style={{ maxWidth: 640 }}>
            People join by typing an <Link href="/admin/tokens">access key</Link>. Keep real names and contact details outside the app; the label is for your eyes only.
            Deleting a rater removes every answer they gave.
          </p>
        </div>
        {testers > 0 && (
          <form action={deleteTesters}>
            <ConfirmButton confirm={`Delete ${testers} tester${testers === 1 ? "" : "s"} and their answers?`}>Delete all testers</ConfirmButton>
          </form>
        )}
      </div>
      <span className="label">{raters.length} rater{raters.length === 1 ? "" : "s"}</span>
      {raters.length === 0 && <div className="empty">Nobody has signed in yet.</div>}
      <div className="stack" style={{ gap: 8 }}>
        {raters.map((r) => {
          const model = r.username.startsWith("model:");
          return (
            <div key={r.id} className="card tight" style={{ opacity: r.active ? 1 : 0.6 }}>
              <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span className="avatar" style={{ width: 36, height: 36 }}>{r.username.slice(0, 1)}</span>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="h3">{r.username}</span>
                      {model ? <span className="pill violet">model judge</span> : <span className={`pill${r.role === "tester" ? " warn" : " violet"}`}>{isRole(r.role) ? ROLES[r.role].label : r.role}</span>}
                      {!r.active && <span className="pill">blocked</span>}
                      {r.consentAt ? <span className="pill ok">started {ago(r.consentAt)}</span> : !model && <span className="pill">not started</span>}
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {r.note || "no label"} · {r._count.assignments} sets · {r._count.responses} answers ·{" "}
                      {r.steps.length ? r.steps.map((x) => STEP_SHORT[x as keyof typeof STEP_SHORT]).join(", ") : "every step"}
                      {r.accessKey && <> · key <span className="mono">{r.accessKey}</span></>}
                      {r.token && r.token.token !== r.accessKey && <> · from <span className="mono">{r.token.token}</span></>}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  {r.accessKey && <CopyButton text={r.accessKey} label="Key" />}
                  <form action={assignNew}><input type="hidden" name="raterId" value={r.id} /><button className="btn sm" title="Give this rater sets imported after they joined">Assign new sets</button></form>
                  <form action={toggleRater}><input type="hidden" name="raterId" value={r.id} /><button className="btn sm">{r.active ? "Block" : "Unblock"}</button></form>
                  <form action={clearRaterAnswers}><input type="hidden" name="raterId" value={r.id} /><ConfirmButton confirm={`Delete ${r._count.responses} answers?`}>Clear answers</ConfirmButton></form>
                  <form action={deleteRater}><input type="hidden" name="raterId" value={r.id} /><ConfirmButton confirm="Delete rater and answers?">Delete</ConfirmButton></form>
                </div>
              </div>
              {!model && (
                <details className="more" style={{ marginTop: 10 }}>
                  <summary className="small">Change role or steps</summary>
                  <form action={setRaterSteps} className="row" style={{ gap: 8, marginTop: 10 }}>
                    <input type="hidden" name="raterId" value={r.id} />
                    <select name="role" defaultValue={r.role}>
                      {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => <option key={k} value={k}>{ROLES[k].label}</option>)}
                    </select>
                    <StepBoxes checked={r.steps} />
                    <button className="btn sm">Save</button>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
