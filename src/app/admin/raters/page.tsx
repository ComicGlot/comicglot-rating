import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { STEP_SHORT } from "@/lib/steps";
import { assignNew, setRaterSteps, toggleRater } from "../actions";
import { CreateRaterForm, ResetCodeButton, StepBoxes } from "../RaterForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Raters" };

export default async function Raters() {
  const raters = await db.rater.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { assignments: true, responses: true } } },
  });
  return (
    <>
      <div className="admhead">
        <div>
          <span className="label">Manage</span>
          <h1 className="h1" style={{ marginTop: 4 }}>Raters</h1>
          <p className="muted" style={{ maxWidth: 620 }}>Each person signs in with a name and a one-time access code. Keep real names and contact details outside the app; the note is for your eyes only.</p>
        </div>
      </div>
      <CreateRaterForm />
      <div className="section">
        <span className="label">{raters.length} rater{raters.length === 1 ? "" : "s"}</span>
        <div className="stack" style={{ gap: 8 }}>
          {raters.map((r) => (
            <div key={r.id} className="card tight" style={{ opacity: r.active ? 1 : 0.6 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span className="avatar" style={{ width: 36, height: 36 }}>{r.username.slice(0, 1)}</span>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="h3">{r.username}</span>
                      {r.username.startsWith("model:") && <span className="pill violet">model judge</span>}
                      {!r.active && <span className="pill">blocked</span>}
                      {r.consentAt ? <span className="pill ok">started {ago(r.consentAt)}</span> : <span className="pill warn">not signed in yet</span>}
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {r.note || "no note"} · {r._count.assignments} sets · {r._count.responses} answers · {r.steps.length ? r.steps.map((x) => STEP_SHORT[x as keyof typeof STEP_SHORT]).join(", ") : "every step"}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  <form action={assignNew}><input type="hidden" name="raterId" value={r.id} /><button className="btn sm" title="Give this rater sets imported after they were created">Assign new sets</button></form>
                  {!r.username.startsWith("model:") && <ResetCodeButton raterId={r.id} />}
                  <form action={toggleRater}><input type="hidden" name="raterId" value={r.id} /><button className={`btn sm${r.active ? " danger" : ""}`}>{r.active ? "Block" : "Unblock"}</button></form>
                </div>
              </div>
              <details className="more" style={{ marginTop: 10 }}>
                <summary className="small">Change steps</summary>
                <form action={setRaterSteps} className="row" style={{ gap: 8, marginTop: 10 }}>
                  <input type="hidden" name="raterId" value={r.id} />
                  <StepBoxes checked={r.steps} />
                  <button className="btn sm">Save</button>
                </form>
              </details>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
