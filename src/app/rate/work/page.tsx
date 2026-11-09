import Link from "next/link";
import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import GuideDrawer from "@/components/GuideDrawer";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeePage, comparable, loadPlan, nextTask, setsFor } from "@/lib/flow";
import { fmt } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/server";
import { chapterTitle } from "@/lib/i18n/titles";
import { STEP_ORDER, type Step } from "@/lib/steps";
import Workbench, { type WBBlock } from "./Workbench";

export const dynamic = "force-dynamic";
export const metadata = { title: "Frame" };

export default async function Work({ searchParams }: { searchParams: Promise<{ page?: string; step?: string; saved?: string }> }) {
  const s = await requireRater();
  const [{ m }, rater, q] = await Promise.all([
    getMessages(),
    db.rater.findUnique({ where: { id: s.sub }, select: { consentAt: true } }),
    searchParams,
  ]);
  if (!rater?.consentAt) redirect("/rate/welcome");
  let pageId = q.page, step = q.step as Step | undefined;
  if (!pageId || !step) {
    const t = await nextTask(s.sub);
    if (!t) redirect("/rate");
    pageId = t.pageId;
    step = t.step;
  }
  if (!STEP_ORDER.includes(step) || !(await canSeePage(s.sub, pageId))) redirect("/rate");

  const [page, plan, responses, pageDone] = await Promise.all([
    db.page.findUniqueOrThrow({
      where: { id: pageId },
      include: {
        chapter: { include: { study: true } },
        blocks: { orderBy: { order: "asc" }, include: { candidates: true } },
      },
    }),
    loadPlan(s.sub),
    db.response.findMany({ where: { raterId: s.sub, block: { pageId } } }),
    db.pageDone.findMany({ where: { raterId: s.sub, pageId } }),
  ]);
  const chapterPlan = plan.find((c) => c.chapter.id === page.chapterId)!;
  if (!chapterPlan.steps.includes(step)) redirect("/rate");
  const pageTodo = chapterPlan.todo.filter((t) => t.pageId === page.id);
  if (!pageTodo.some((t) => t.step === step)) redirect(pageTodo[0] ? `/rate/work?page=${page.id}&step=${pageTodo[0].step}` : "/rate");

  // The next open task after this one, in plan order: saving goes straight there.
  const order = plan.flatMap((c) => c.todo);
  const here = order.findIndex((t) => t.pageId === page.id && t.step === step);
  const nextT = [...order.slice(here + 1), ...order.slice(0, Math.max(0, here))].find((t) => !t.done && !(t.pageId === page.id && t.step === step));
  const next = nextT ? `/rate/work?page=${nextT.pageId}&step=${nextT.step}` : "/rate";

  const blocks: WBBlock[] = page.blocks.map((b) => {
    const r = Object.fromEntries(responses.filter((x) => x.blockId === b.id).map((x) => [x.step, x.data as Record<string, unknown>]));
    const base: WBBlock = { id: b.id, order: b.order, box: [b.x0, b.y0, b.x1, b.y1], responses: r, cmp: comparable(b.candidates) };
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
  const all = plan.reduce((n, c) => n + c.todo.length, 0);
  const done = plan.reduce((n, c) => n + c.todo.filter((t) => t.done).length, 0);
  const framePos = chapterPlan.pages.findIndex((p) => p.id === page.id);
  const pct = Math.round((100 * done) / Math.max(1, all));

  return (
    <>
      <TopNav
        home="/rate"
        user={s.username}
        crumbs={[{ label: m.work.yourFrames, href: "/rate" }, { label: chapterTitle(page.chapter, m), href: "/rate" }, { label: fmt(m.work.frameOf, { n: framePos + 1, total: chapterPlan.pages.length }), strong: true }]}
        right={<GuideDrawer steps={chapterPlan.steps} />}
        lang
      >
        {page.chapter.practice && <span className="pill violet">{m.work.practice}</span>}
        <span style={{ flex: 1 }} />
        <Link href="/rate" className="minibar" title={`${done} of ${all} tasks done`} style={{ minWidth: 160 }}>
          <span className="small muted num">{pct}%</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </Link>
      </TopNav>
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
        tabs={pageTodo.map((t) => ({ step: t.step, done: t.done }))}
        reviewSteps={pageTodo.map((t) => t.step).filter((x) => x !== "review")}
        saved={q.saved && (STEP_ORDER as readonly string[]).includes(q.saved) ? q.saved : undefined}
        next={next}
        nextPageId={nextT && nextT.pageId !== page.id ? nextT.pageId : undefined}
      />
    </>
  );
}
