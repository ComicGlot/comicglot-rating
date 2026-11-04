import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeePage, loadPlan, nextTask, setsFor } from "@/lib/flow";
import { STEP_HELP, STEP_LABEL, STEP_ORDER, type Step } from "@/lib/steps";
import Workbench, { type WBBlock } from "./Workbench";

export const dynamic = "force-dynamic";

export default async function Work({ searchParams }: { searchParams: Promise<{ page?: string; step?: string }> }) {
  const s = await requireRater();
  const q = await searchParams;
  let pageId = q.page, step = q.step as Step | undefined;
  if (!pageId || !step) {
    const t = await nextTask(s.sub);
    if (!t) redirect("/rate");
    pageId = t.pageId;
    step = t.step;
  }
  if (!STEP_ORDER.includes(step) || !(await canSeePage(s.sub, pageId))) redirect("/rate");

  const page = await db.page.findUniqueOrThrow({
    where: { id: pageId },
    include: {
      chapter: { include: { study: true } },
      blocks: { orderBy: { order: "asc" }, include: { candidates: true } },
    },
  });
  const plan = (await loadPlan(s.sub)).find((c) => c.chapter.id === page.chapterId)!;
  if (!plan.steps.includes(step)) redirect("/rate");
  const pageTodo = plan.todo.filter((t) => t.pageId === page.id);
  const responses = await db.response.findMany({ where: { raterId: s.sub, block: { pageId: page.id } } });
  const pageDone = await db.pageDone.findMany({ where: { raterId: s.sub, pageId: page.id } });

  const blocks: WBBlock[] = page.blocks.map((b) => {
    const r = Object.fromEntries(responses.filter((x) => x.blockId === b.id).map((x) => [x.step, x.data as Record<string, unknown>]));
    const base: WBBlock = { id: b.id, order: b.order, box: [b.x0, b.y0, b.x1, b.y1], responses: r };
    if (step === "compare") {
      // The client sees set numbers and letters only, never conditions or models.
      const text = new Map(b.candidates.map((c) => [c.id, c.text]));
      const sets = setsFor(s.sub, b.id, b.candidates);
      if (sets.length) {
        base.source = b.sourceText;
        base.sets = sets.map((x) => Object.entries(x.letters).map(([letter, id]) => ({ letter, text: text.get(id) ?? "" })));
      }
    }
    return base;
  });

  const typesDone = pageDone.find((d) => d.step === "types");
  const doneTasks = plan.todo.filter((t) => t.done).length;
  return (
    <main style={{ maxWidth: 1280 }}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <Link href="/rate" className="muted">← Overview</Link>
          <h1 style={{ marginTop: 4 }}>{page.chapter.title}: page {page.index + 1} of {plan.pages.length}</h1>
        </div>
        <div className="muted">{doneTasks} of {plan.todo.length} tasks done in this chapter</div>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        {pageTodo.map((t) => (
          <Link key={t.step} href={`/rate/work?page=${page.id}&step=${t.step}`}>
            <button className={t.step === step ? "" : "secondary"}>{STEP_LABEL[t.step]}{t.done ? " ✓" : ""}</button>
          </Link>
        ))}
      </div>
      <p className="muted">{STEP_HELP[step]}</p>
      <Workbench
        key={`${page.id}:${step}`}
        pageId={page.id}
        width={page.width}
        height={page.height}
        step={step}
        blocks={blocks}
        askOwn={page.chapter.study.askOwnTranslation}
        missing={typesDone?.missing ?? false}
        pageNote={typesDone?.note ?? ""}
        reviewSteps={pageTodo.map((t) => t.step).filter((x) => x !== "review")}
      />
    </main>
  );
}
