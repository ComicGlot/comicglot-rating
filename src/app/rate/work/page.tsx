import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import GuideDrawer from "@/components/GuideDrawer";
import LiveProgress from "@/components/LiveProgress";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { comparable, loadPlan, setsFor } from "@/lib/flow";
import { getMessages } from "@/lib/i18n/server";
import { chapterTitle } from "@/lib/i18n/titles";
import { STEP_ORDER, type Step } from "@/lib/steps";
import SetRunner, { type RunTask } from "./SetRunner";
import { type WBBlock } from "./Workbench";

export const dynamic = "force-dynamic";
export const metadata = { title: "Frame" };

export default async function Work({ searchParams }: { searchParams: Promise<{ page?: string; step?: string }> }) {
  const s = await requireRater();
  const [{ m }, rater, q, plan] = await Promise.all([
    getMessages(),
    db.rater.findUnique({ where: { id: s.sub }, select: { consentAt: true } }),
    searchParams,
    loadPlan(s.sub),
  ]);
  if (!rater?.consentAt) redirect("/rate/welcome");

  let pageId = q.page, step = q.step as Step | undefined;
  if (!pageId || !step) {
    const t = plan.flatMap((c) => c.todo).find((x) => !x.done);
    if (!t) redirect("/rate");
    pageId = t.pageId;
    step = t.step;
  }
  // The plan holds only this rater's chapters of active studies, so it is also the access check.
  const chapterPlan = plan.find((c) => c.pages.some((p) => p.id === pageId));
  if (!STEP_ORDER.includes(step) || !chapterPlan || !chapterPlan.steps.includes(step)) redirect("/rate");
  const pageTodo = chapterPlan.todo.filter((t) => t.pageId === pageId);
  if (!pageTodo.some((t) => t.step === step)) redirect(pageTodo[0] ? `/rate/work?page=${pageId}&step=${pageTodo[0].step}` : "/rate");

  // A rater with one step works through the whole set in the browser; with several steps, one task at a time.
  const oneStep = chapterPlan.steps.filter((x) => x !== "review").length === 1;
  const run = oneStep ? chapterPlan.todo.filter((t) => t.step === step) : pageTodo.filter((t) => t.step === step);
  const runPages = [...new Set(run.map((t) => t.pageId))];
  const [pages, responses, pageDone] = await Promise.all([
    db.page.findMany({ where: { id: { in: runPages } }, include: { blocks: { orderBy: { order: "asc" }, include: { candidates: true } } } }),
    db.response.findMany({ where: { raterId: s.sub, block: { pageId: { in: runPages } } } }),
    db.pageDone.findMany({ where: { raterId: s.sub, pageId: { in: runPages } } }),
  ]);
  const byId = new Map(pages.map((p) => [p.id, p]));
  const askOwn = chapterPlan.chapter.study.askOwnTranslation;

  const tasks: RunTask[] = run.map((t) => {
    const page = byId.get(t.pageId)!;
    const blocks: WBBlock[] = page.blocks.map((b) => {
      const r = Object.fromEntries(responses.filter((x) => x.blockId === b.id).map((x) => [x.step, x.data as Record<string, unknown>]));
      const base: WBBlock = { id: b.id, order: b.order, box: [b.x0, b.y0, b.x1, b.y1], responses: r, cmp: comparable(b.candidates) };
      if (t.step === "compare") {
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
    const pt = chapterPlan.todo.filter((x) => x.pageId === page.id);
    const typesDone = pageDone.find((d) => d.pageId === page.id && d.step === "types");
    return {
      pageId: page.id, width: page.width, height: page.height, step: t.step, blocks, askOwn,
      missing: typesDone?.missing ?? false, pageNote: typesDone?.note ?? "",
      tabs: pt.map((x) => ({ step: x.step, done: x.done })), reviewSteps: pt.map((x) => x.step).filter((x) => x !== "review"),
      done: t.done, frame: chapterPlan.pages.findIndex((p) => p.id === page.id) + 1,
    };
  });
  const start = Math.max(0, tasks.findIndex((t) => t.pageId === pageId && t.step === step));

  // After this run: the next open task outside it, in plan order.
  const order = plan.flatMap((c) => c.todo);
  const inRun = new Set(run.map((t) => `${t.pageId}:${t.step}`));
  const here = order.findIndex((t) => t.pageId === pageId && t.step === step);
  const nextT = [...order.slice(here + 1), ...order.slice(0, Math.max(0, here))].find((t) => !t.done && !inRun.has(`${t.pageId}:${t.step}`));
  const after = nextT ? `/rate/work?page=${nextT.pageId}&step=${nextT.step}` : "/rate";

  const all = plan.reduce((n, c) => n + c.todo.length, 0);
  const done = plan.reduce((n, c) => n + c.todo.filter((t) => t.done).length, 0);

  return (
    <>
      <TopNav
        home="/rate"
        user={s.username}
        crumbs={[{ label: m.work.yourFrames, href: "/rate" }, { label: chapterTitle(chapterPlan.chapter, m), strong: true }]}
        right={<GuideDrawer steps={chapterPlan.steps} />}
        lang
      >
        {chapterPlan.chapter.practice && <span className="pill violet">{m.work.practice}</span>}
        <span style={{ flex: 1 }} />
        <LiveProgress done={done} all={all} />
      </TopNav>
      <SetRunner key={`${chapterPlan.chapter.id}:${step}:${start}`} tasks={tasks} start={start} after={after} frames={chapterPlan.pages.length} />
    </>
  );
}
