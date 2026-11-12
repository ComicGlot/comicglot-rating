import { db } from "@/lib/db";
import { baseCondition } from "@/lib/steps";
import ConfirmButton from "@/components/ConfirmButton";
import { clearStudyAnswers, deleteStudy, toggleStudy, updateStudy } from "../actions";
import GenerateForm from "../GenerateForm";
import JudgeForm from "../JudgeForm";
import { StepBoxes } from "../RaterForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Studies" };

export default async function Studies() {
  const studies = await db.study.findMany({ orderBy: { createdAt: "asc" }, include: { chapters: { orderBy: { position: "asc" }, select: { id: true, title: true, practice: true, _count: { select: { pages: true } } } } } });
  const info = await Promise.all(
    studies.map(async (st) => {
      const blocks = await db.block.count({ where: { page: { chapter: { studyId: st.id } } } });
      const conds = await db.candidate.groupBy({ by: ["model", "condition"], where: { block: { page: { chapter: { studyId: st.id } } } }, _count: true });
      const byModel = new Map<string, { cond: string; n: number }[]>();
      for (const c of conds) byModel.set(c.model ?? "(none)", [...(byModel.get(c.model ?? "(none)") ?? []), { cond: baseCondition(c.condition), n: c._count }]);
      return { blocks, byModel: [...byModel.entries()] };
    }),
  );
  return (
    <>
      <div className="admhead">
        <div>
          <span className="label">Manage</span>
          <h1 className="h1" style={{ marginTop: 4 }}>Studies</h1>
          <p className="muted" style={{ maxWidth: 640 }}>A study is one round of frames. Import it with <span className="mono">npm run import -- data/&lt;round&gt;/chapters.json</span>; importing again adds new translations and readings and never changes what raters have seen.</p>
        </div>
      </div>
      {studies.length === 0 && <div className="empty">No study yet.</div>}
      <div className="stack" style={{ gap: 16 }}>
        {studies.map((st, i) => (
          <div key={st.id} className="card">
            <div className="row between">
              <div className="row" style={{ gap: 10 }}>
                <h2 className="h2">{st.name}</h2>
                <span className={`pill${st.active ? " ok" : ""}`}>{st.active ? "open" : "closed"}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <form action={toggleStudy}>
                  <input type="hidden" name="studyId" value={st.id} />
                  <button className="btn sm">{st.active ? "Close the study" : "Reopen"}</button>
                </form>
                <form action={clearStudyAnswers}><input type="hidden" name="studyId" value={st.id} /><ConfirmButton confirm="Delete every answer in it?">Clear answers</ConfirmButton></form>
                <form action={deleteStudy}><input type="hidden" name="studyId" value={st.id} /><ConfirmButton confirm="Delete study, frames and answers?">Delete</ConfirmButton></form>
              </div>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {st.chapters.length} sets · {st.chapters.reduce((n, c) => n + c._count.pages, 0)} frames · {info[i].blocks} texts · {st.chapters.filter((c) => c.practice).length} practice{st.rankModels ? ` · ranking ${st.rankModels} models` : ""}{st.setsPerRater ? ` · ${st.setsPerRater} sets per rater` : ""}
            </div>

            <div className="grid2" style={{ marginTop: 20, alignItems: "start" }}>
              <form action={updateStudy} className="stack" style={{ gap: 14 }}>
                <input type="hidden" name="studyId" value={st.id} />
                <input type="hidden" name="steps" value="review" />
                <div className="field"><span>Steps on every frame</span><StepBoxes checked={st.steps} /></div>
                <label className="check"><input type="checkbox" name="askOwn" defaultChecked={st.askOwnTranslation} /> Ask translators for their own English first</label>
                <div className="grid2" style={{ gap: 12 }}>
                  <label className="field">
                    <span>Rank the versions of N models (blank: pairs)</span>
                    <input type="number" name="rankModels" min={2} max={4} defaultValue={st.rankModels ?? ""} placeholder="pairs" />
                  </label>
                  <label className="field">
                    <span>Each rater&apos;s share in sets (everyone gets all sets; least-covered first)</span>
                    <input type="number" name="setsPerRater" min={1} defaultValue={st.setsPerRater ?? ""} placeholder="none" />
                  </label>
                </div>
                <label className="field">
                  <span>Introduction on the welcome page (blank: the default text)</span>
                  <textarea name="intro" defaultValue={st.intro ?? ""} rows={5} placeholder="Who runs the study, what it is for, payment, contact…" />
                </label>
                <div><button className="btn">Save settings</button></div>
              </form>
              <div>
                <span className="label">Translations by model</span>
                {info[i].byModel.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>None yet.</p>
                ) : (
                  <table className="t" style={{ marginTop: 6 }}>
                    <thead><tr><th>Model</th><th>Conditions</th></tr></thead>
                    <tbody>
                      {info[i].byModel.map(([m, cs]) => (
                        <tr key={m}>
                          <td className="mono small">{m}</td>
                          <td>{cs.map((c) => <span key={c.cond} className="pill" style={{ marginRight: 4 }}>{c.cond} {c.n}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {studies.length > 0 && (
        <div className="section">
          <GenerateForm studies={studies.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
      )}
      {studies.length > 0 && (
        <div className="section">
          <JudgeForm studies={studies.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
      )}
    </>
  );
}
