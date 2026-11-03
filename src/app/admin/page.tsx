import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignActiveStudies, toggleRater, toggleStudy } from "./actions";
import { CreateRaterForm, ResetCodeButton } from "./RaterForms";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [studies, raters] = await Promise.all([
    db.study.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { items: true } } } }),
    db.rater.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const progress = await Promise.all(
    raters.map(async (r) => ({
      id: r.id,
      total: await db.assignment.count({ where: { raterId: r.id } }),
      done: await db.assignment.count({ where: { raterId: r.id, judgement: { isNot: null } } }),
    })),
  );
  const prog = new Map(progress.map((p) => [p.id, p]));

  return (
    <main>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <h1>Admin</h1>
        <div className="row" style={{ gap: 8 }}>
          <a href="/api/admin/export"><button className="secondary">Export judgements (CSV)</button></a>
          <form action="/api/logout" method="post"><button className="secondary">Sign out</button></form>
        </div>
      </div>

      <h2>Studies</h2>
      <div className="card">
        {studies.length === 0 && <p className="muted">No study yet. Import one with <span className="code">npm run import -- data/round1.json</span>.</p>}
        <table>
          <tbody>
            {studies.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s._count.items} items</td>
                <td>{s.active ? "active" : "closed"}</td>
                <td>
                  <form action={toggleStudy}>
                    <input type="hidden" name="studyId" value={s.id} />
                    <button className="secondary">{s.active ? "Close" : "Reopen"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Raters</h2>
      <CreateRaterForm />
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Note</th><th>Progress</th><th>Status</th><th /></tr></thead>
          <tbody>
            {raters.map((r) => {
              const p = prog.get(r.id)!;
              return (
                <tr key={r.id}>
                  <td>{r.username}</td>
                  <td className="muted">{r.note}</td>
                  <td>{p.done} / {p.total}</td>
                  <td>{r.active ? "active" : "blocked"}</td>
                  <td className="row" style={{ gap: 6 }}>
                    <form action={toggleRater}><input type="hidden" name="raterId" value={r.id} /><button className="secondary">{r.active ? "Block" : "Unblock"}</button></form>
                    <form action={assignActiveStudies}><input type="hidden" name="raterId" value={r.id} /><button className="secondary">Assign new items</button></form>
                    <ResetCodeButton raterId={r.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
