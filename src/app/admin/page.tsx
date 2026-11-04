import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPlan } from "@/lib/flow";
import { STEP_LABEL, STEP_ORDER } from "@/lib/steps";
import { assignNew, setRaterSteps, toggleRater, toggleStudy, updateStudy } from "./actions";
import GenerateForm from "./GenerateForm";
import { CreateRaterForm, ResetCodeButton, StepBoxes } from "./RaterForms";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [studies, raters] = await Promise.all([
    db.study.findMany({ orderBy: { createdAt: "asc" }, include: { chapters: { select: { id: true } } } }),
    db.rater.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const counts = await Promise.all(
    studies.map(async (st) => ({
      pages: await db.page.count({ where: { chapter: { studyId: st.id } } }),
      blocks: await db.block.count({ where: { page: { chapter: { studyId: st.id } } } }),
      conds: await db.candidate.groupBy({ by: ["condition"], where: { block: { page: { chapter: { studyId: st.id } } } }, _count: true }),
    })),
  );
  const progress = await Promise.all(
    raters.map(async (r) => {
      const plan = await loadPlan(r.id, true);
      const per = Object.fromEntries(
        STEP_ORDER.map((s) => {
          const t = plan.flatMap((c) => c.todo.filter((x) => x.step === s));
          return [s, t.length ? `${t.filter((x) => x.done).length}/${t.length}` : "—"];
        }),
      );
      return { chapters: plan.length, per };
    }),
  );

  return (
    <main style={{ maxWidth: 1180 }}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <h1>Admin</h1>
        <form action="/api/logout" method="post"><button className="secondary">Sign out</button></form>
      </div>

      <h2>Studies</h2>
      <div className="card">
        {studies.length === 0 && (
          <p className="muted">No study yet. Import one with <span className="code">npm run import -- data/round1.json</span>.</p>
        )}
        {studies.map((st, i) => (
          <div key={st.id} className="study">
            <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
              <div>
                <b>{st.name}</b> <span className="muted">· {st.active ? "open" : "closed"} · {st.chapters.length} chapters · {counts[i].pages} pages · {counts[i].blocks} blocks</span>
                <div className="muted small">
                  Candidates: {counts[i].conds.length ? counts[i].conds.map((c) => `${c.condition} ${c._count}`).join(", ") : "none"}
                </div>
              </div>
              <form action={toggleStudy}>
                <input type="hidden" name="studyId" value={st.id} />
                <button className="secondary">{st.active ? "Close" : "Reopen"}</button>
              </form>
            </div>
            <form action={updateStudy} className="row" style={{ alignItems: "center", gap: 12, marginTop: 6 }}>
              <input type="hidden" name="studyId" value={st.id} />
              <StepBoxes checked={st.steps} />
              <label className="inline"><input type="checkbox" name="askOwn" defaultChecked={st.askOwnTranslation} /> ask for own translation first</label>
              <input type="hidden" name="steps" value="review" />
              <button className="secondary">Save steps</button>
            </form>
          </div>
        ))}
      </div>
      {studies.length > 0 && <GenerateForm studies={studies.map((s) => ({ id: s.id, name: s.name }))} />}

      <h2>Raters</h2>
      <CreateRaterForm />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Steps</th><th>Chapters</th>
              {STEP_ORDER.map((s) => <th key={s}>{STEP_LABEL[s]}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {raters.map((r, i) => (
              <tr key={r.id} className={r.active ? "" : "muted"}>
                <td>{r.username}<div className="muted small">{r.note}</div></td>
                <td>
                  <form action={setRaterSteps} className="row" style={{ gap: 6, alignItems: "center" }}>
                    <input type="hidden" name="raterId" value={r.id} />
                    <StepBoxes checked={r.steps} />
                    <button className="secondary small">Set</button>
                  </form>
                </td>
                <td>{progress[i].chapters}</td>
                {STEP_ORDER.map((s) => <td key={s}>{progress[i].per[s]}</td>)}
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <form action={toggleRater}><input type="hidden" name="raterId" value={r.id} /><button className="secondary">{r.active ? "Block" : "Unblock"}</button></form>
                    <form action={assignNew}><input type="hidden" name="raterId" value={r.id} /><button className="secondary">Assign new chapters</button></form>
                    <ResetCodeButton raterId={r.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Exports (CSV)</h2>
      <div className="card row" style={{ gap: 8 }}>
        {(["types", "transcribe", "compare", "pages"] as const).map((k) => (
          <a key={k} href={`/api/admin/export?kind=${k}`}>
            <button className="secondary">{k === "pages" ? "Pages and time" : STEP_LABEL[k]}</button>
          </a>
        ))}
      </div>
    </main>
  );
}
