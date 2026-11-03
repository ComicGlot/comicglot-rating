import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import RateForm from "./RateForm";

export const dynamic = "force-dynamic";

export default async function RatePage() {
  const s = await requireRater();
  const where = { raterId: s.sub, item: { study: { active: true } } };
  const [total, done, next] = await Promise.all([
    db.assignment.count({ where }),
    db.assignment.count({ where: { ...where, judgement: { isNot: null } } }),
    db.assignment.findFirst({
      where: { ...where, judgement: { is: null } },
      orderBy: { position: "asc" },
      include: { item: { include: { candidates: true, study: true } } },
    }),
  ]);

  const header = (
    <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
      <h1>Translation study</h1>
      <form action="/api/logout" method="post"><button className="secondary">Sign out</button></form>
    </div>
  );

  if (!next) {
    return (
      <main>
        {header}
        <div className="card">{total ? "All items are rated. Thank you." : "No items are assigned to you yet."}</div>
      </main>
    );
  }

  // Letters only: the browser never learns which condition produced which text.
  const byId = new Map(next.item.candidates.map((c) => [c.id, c.text]));
  const letters = Object.entries(next.letters as Record<string, string>)
    .map(([letter, id]) => ({ letter, text: byId.get(id) ?? "" }))
    .sort((a, b) => a.letter.localeCompare(b.letter));

  return (
    <main>
      {header}
      <div className="muted">Item {done + 1} of {total}</div>
      <div className="bar"><div style={{ width: `${(100 * done) / Math.max(1, total)}%` }} /></div>
      <RateForm
        key={next.id}
        assignmentId={next.id}
        hasImage={!!next.item.imageMime}
        itemId={next.item.id}
        source={next.item.sourceText}
        context={next.item.context}
        candidates={letters}
        askOwn={next.item.study.askOwnTranslation}
      />
    </main>
  );
}
