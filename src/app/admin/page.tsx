import Link from "next/link";
import Icon from "@/components/Icon";
import { db } from "@/lib/db";
import { loadPlan } from "@/lib/flow";
import { ago, minutes } from "@/lib/format";
import { STEP_LABEL, STEP_ORDER, STEP_SHORT } from "@/lib/steps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function Overview() {
  const notPractice = { page: { chapter: { practice: false } } } as const;
  const [studies, raters, judgements, transcribed, typed, confirmed, recent] = await Promise.all([
    db.study.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { chapters: true } } } }),
    db.rater.findMany({ orderBy: { createdAt: "asc" } }),
    db.response.count({ where: { step: "compare", block: notPractice } }),
    db.response.groupBy({ by: ["blockId"], where: { step: "transcribe", block: notPractice } }).then((g) => g.length),
    db.response.count({ where: { step: "types", block: notPractice } }),
    db.pageDone.count({ where: { step: "review", page: { chapter: { practice: false } } } }),
    db.pageDone.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { rater: { select: { username: true } }, page: { select: { index: true, chapter: { select: { title: true } } } } } }),
  ]);
  const blocks = await db.block.count({ where: { page: { chapter: { practice: false, study: { active: true } } } } });

  const people = await Promise.all(
    raters.filter((r) => !r.username.startsWith("model:")).map(async (r) => {
      const plan = await loadPlan(r.id, true);
      const per = STEP_ORDER.map((s) => {
        const t = plan.flatMap((c) => c.todo.filter((x) => x.step === s));
        return { step: s, done: t.filter((x) => x.done).length, all: t.length };
      });
      const all = per.reduce((n, x) => n + x.all, 0), done = per.reduce((n, x) => n + x.done, 0);
      const last = await db.pageDone.findFirst({ where: { raterId: r.id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }).catch(() => null);
      const time = await db.pageDone.aggregate({ where: { raterId: r.id }, _sum: { msSpent: true } });
      return { r, per, all, done, last: last?.updatedAt ?? null, ms: time._sum.msSpent ?? 0 };
    }),
  );
  const studyStats = await Promise.all(
    studies.map(async (st) => ({
      st,
      pages: await db.page.count({ where: { chapter: { studyId: st.id, practice: false } } }),
      blocks: await db.block.count({ where: { page: { chapter: { studyId: st.id, practice: false } } } }),
      cands: await db.candidate.count({ where: { block: { page: { chapter: { studyId: st.id } } } } }),
    })),
  );

  return (
    <>
      <div className="admhead">
        <div>
          <span className="label">Study</span>
          <h1 className="h1" style={{ marginTop: 4 }}>Overview</h1>
          <p className="muted">Practice sets are left out of every number here.</p>
        </div>
        <Link href="/admin/results" className="btn primary"><Icon name="chart" /> Results</Link>
      </div>

      <div className="grid4">
        <div className="stat"><span className="label">Raters</span><div className="v">{people.filter((p) => p.r.active).length}<small> active</small></div><div className="d">{people.filter((p) => p.r.consentAt).length} have accepted the study information</div></div>
        <div className="stat"><span className="label">Translation judgements</span><div className="v">{judgements}</div><div className="d">texts judged, all raters</div></div>
        <div className="stat"><span className="label">Transcriptions</span><div className="v">{transcribed}<small> / {blocks}</small></div><div className="d">texts typed in Korean at least once{typed ? ` · ${typed} type labels` : ""}</div></div>
        <div className="stat"><span className="label">Frames confirmed</span><div className="v">{confirmed}</div><div className="d">across all raters</div></div>
      </div>

      <div className="section">
        <span className="label">Raters</span>
        {people.length === 0 ? (
          <div className="empty">No raters yet. <Link href="/admin/raters" style={{ textDecoration: "underline" }}>Add the first one</Link>.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="t">
              <thead>
                <tr><th>Rater</th>{STEP_ORDER.map((s) => <th key={s}>{STEP_SHORT[s]}</th>)}<th className="r">Time</th><th className="r">Last active</th></tr>
              </thead>
              <tbody>
                {people.map(({ r, per, ms, last }) => (
                  <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <td>
                      <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                        <span className="avatar">{r.username.slice(0, 1)}</span>
                        <div>
                          <div>{r.username} {!r.consentAt && <span className="pill warn">not started</span>}{!r.active && <span className="pill">blocked</span>}</div>
                          <div className="small faint">{r.note || (r.steps.length ? r.steps.map((x) => STEP_SHORT[x as keyof typeof STEP_SHORT]).join(", ") : "all steps")}</div>
                        </div>
                      </div>
                    </td>
                    {per.map((x) => (
                      <td key={x.step} title={`${STEP_LABEL[x.step]}: ${x.done} of ${x.all}`}>
                        {x.all ? (
                          <div className="minibar" style={{ minWidth: 90 }}>
                            <div className={`bar${x.done === x.all ? " ok" : ""}`}><i style={{ width: `${(100 * x.done) / x.all}%` }} /></div>
                            <span className="small muted num">{x.done}/{x.all}</span>
                          </div>
                        ) : <span className="faint">–</span>}
                      </td>
                    ))}
                    <td className="r num">{minutes(ms)}</td>
                    <td className="r muted">{ago(last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section grid2" style={{ alignItems: "start" }}>
        <div>
          <span className="label" style={{ display: "block", marginBottom: 12 }}>Studies</span>
          <div className="stack" style={{ gap: 8 }}>
            {studyStats.length === 0 && <div className="empty">No study yet. Import one with <span className="code">npm run import -- data/round1/chapters.json</span>.</div>}
            {studyStats.map(({ st, pages, blocks, cands }) => (
              <Link key={st.id} href="/admin/studies" className="card tight" style={{ display: "block" }}>
                <div className="row between">
                  <span className="h3">{st.name}</span>
                  <span className={`pill${st.active ? " ok" : ""}`}>{st.active ? "open" : "closed"}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  {st._count.chapters} sets · {pages} frames · {blocks} texts · {cands} translations · {st.steps.filter((x) => x !== "review").map((x) => STEP_SHORT[x as keyof typeof STEP_SHORT]).join(", ")}
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <span className="label" style={{ display: "block", marginBottom: 12 }}>Recent activity</span>
          <div className="card" style={{ padding: 0 }}>
            {recent.length === 0 ? <div className="muted" style={{ padding: 16 }}>Nothing yet.</div> : (
              <table className="t">
                <tbody>
                  {recent.map((d) => (
                    <tr key={d.id}>
                      <td><b>{d.rater.username}</b> <span className="muted">{d.step === "review" ? "confirmed" : `saved ${STEP_SHORT[d.step as keyof typeof STEP_SHORT]?.toLowerCase() ?? d.step} on`}</span> {d.page.chapter.title}, frame {d.page.index + 1}</td>
                      <td className="r muted small">{ago(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
