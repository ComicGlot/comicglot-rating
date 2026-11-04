import Link from "next/link";
import { requireRater } from "@/lib/auth";
import { loadPlan } from "@/lib/flow";
import { STEP_LABEL } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function RateHome() {
  const s = await requireRater();
  const plan = await loadPlan(s.sub);
  const total = plan.reduce((n, c) => n + c.todo.length, 0);
  const done = plan.reduce((n, c) => n + c.todo.filter((t) => t.done).length, 0);
  return (
    <main>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <h1>Hello, {s.username}</h1>
        <form action="/api/logout" method="post"><button className="secondary">Sign out</button></form>
      </div>
      {plan.length === 0 ? (
        <div className="card">No chapters are assigned to you yet.</div>
      ) : (
        <>
          <div className="bar"><div style={{ width: `${(100 * done) / Math.max(1, total)}%` }} /></div>
          <div className="card">
            <table>
              <thead><tr><th>Chapter</th><th>Pages</th><th>Your steps</th><th>Progress</th></tr></thead>
              <tbody>
                {plan.map((c) => {
                  const d = c.todo.filter((t) => t.done).length;
                  return (
                    <tr key={c.chapter.id}>
                      <td>
                        {c.chapter.title}
                        <div className="chips">
                          {c.pages.map((pg) => {
                            const t = c.todo.filter((x) => x.pageId === pg.id);
                            if (!t.length) return null;
                            const open = t.find((x) => !x.done) ?? t[t.length - 1];
                            const all = t.every((x) => x.done);
                            return (
                              <Link key={pg.id} href={`/rate/work?page=${pg.id}&step=${open.step}`} className={`chip${all ? " done" : ""}`} title={all ? "Confirmed" : `Next: ${STEP_LABEL[open.step]}`}>
                                {pg.index + 1}
                              </Link>
                            );
                          })}
                        </div>
                      </td>
                      <td>{c.pages.length}</td>
                      <td className="muted">{c.steps.map((x) => STEP_LABEL[x]).join(" → ")}</td>
                      <td>{d} / {c.todo.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            {done < total ? <Link href="/rate/work"><button>{done ? "Continue" : "Start"}</button></Link> : <b>Everything is done. Thank you.</b>}
          </p>
        </>
      )}
    </main>
  );
}
