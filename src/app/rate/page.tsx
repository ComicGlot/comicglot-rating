import Link from "next/link";
import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import GuideDrawer from "@/components/GuideDrawer";
import Icon from "@/components/Icon";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPlan } from "@/lib/flow";
import { STEP_LABEL, STEP_SHORT, type Step } from "@/lib/steps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your frames" };

export default async function RateHome() {
  const s = await requireRater();
  const rater = await db.rater.findUnique({ where: { id: s.sub }, select: { consentAt: true } });
  if (!rater?.consentAt) redirect("/rate/welcome");
  const plan = await loadPlan(s.sub);
  const total = plan.reduce((n, c) => n + c.todo.length, 0);
  const done = plan.reduce((n, c) => n + c.todo.filter((t) => t.done).length, 0);
  const steps = [...new Set(plan.flatMap((c) => c.steps))] as Step[];
  const pct = Math.round((100 * done) / Math.max(1, total));

  // The first open task, and the frame it is on.
  let next: { chapter: (typeof plan)[number]; pageIndex: number; step: Step; pageId: string } | null = null;
  for (const c of plan) {
    const t = c.todo.find((x) => !x.done);
    if (t) { next = { chapter: c, pageIndex: c.pages.findIndex((p) => p.id === t.pageId), step: t.step, pageId: t.pageId }; break; }
  }
  const spent = await db.pageDone.aggregate({ where: { raterId: s.sub }, _sum: { msSpent: true } });
  const minutes = Math.round((spent._sum.msSpent ?? 0) / 60000);
  const framesDone = plan.reduce((n, c) => n + c.pages.filter((p) => { const t = c.todo.filter((x) => x.pageId === p.id); return t.length && t.every((x) => x.done); }).length, 0);
  const framesAll = plan.reduce((n, c) => n + c.pages.filter((p) => c.todo.some((x) => x.pageId === p.id)).length, 0);

  return (
    <>
      <TopNav home="/rate" user={s.username} crumbs={["Your frames"]} right={<GuideDrawer steps={steps} />} />
      <main className="wrap">
        {plan.length === 0 ? (
          <div className="empty">
            <div className="h3" style={{ marginBottom: 6 }}>Nothing to do yet</div>
            No frames are assigned to you yet. You will get an e-mail when they are ready.
          </div>
        ) : (
          <>
            <section className="hero">
              <div className="card next">
                <div>
                  <span className="label">{done === 0 ? "Ready when you are" : done < total ? "Welcome back" : "All done"}</span>
                  <h1 className="display" style={{ margin: "8px 0 8px" }}>
                    {done < total ? `Hello, ${s.username}` : "Thank you!"}
                  </h1>
                  <p className="read muted" style={{ fontSize: 15, maxWidth: 520 }}>
                    {done < total
                      ? next?.chapter.chapter.practice
                        ? "Start with the practice frame: it works like the others, and your answers on it are not counted."
                        : `Your work is saved frame by frame, so you can stop whenever you like and pick up here.`
                      : "Every frame is confirmed. You can still open any frame below to look at or change your answers."}
                  </p>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  {next ? (
                    <Link href={`/rate/work?page=${next.pageId}&step=${next.step}`} className="btn primary lg">
                      <Icon name="play" /> {done === 0 ? "Start" : "Continue"}
                      <span className="muted" style={{ color: "inherit", opacity: 0.6, fontWeight: 400 }}>
                        {next.chapter.chapter.title} · frame {next.pageIndex + 1} · {STEP_SHORT[next.step]}
                      </span>
                    </Link>
                  ) : (
                    <span className="pill ok" style={{ height: 32, padding: "0 12px" }}><Icon name="check" size={14} /> Everything is confirmed</span>
                  )}
                  <div className="stepline">
                    {steps.map((x) => <span key={x} className="chip soft" style={{ cursor: "default" }}>{STEP_LABEL[x]}</span>)}
                  </div>
                </div>
              </div>
              <div className="card stack" style={{ gap: 16 }}>
                <div className="row between">
                  <span className="label">Progress</span>
                  <span className="pill">{pct}%</span>
                </div>
                <div className="bar" aria-label={`${pct}% done`}><i style={{ width: `${pct}%` }} /></div>
                <div className="grid2" style={{ gap: 12 }}>
                  <div><div className="h2 num">{framesDone}<span className="faint" style={{ fontSize: 15 }}> / {framesAll}</span></div><div className="small muted">frames confirmed</div></div>
                  <div><div className="h2 num">{minutes}<span className="faint" style={{ fontSize: 15 }}> min</span></div><div className="small muted">time on frames</div></div>
                </div>
                <div className="small muted" style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
                  {done} of {total} tasks · {plan.length} set{plan.length === 1 ? "" : "s"}
                </div>
              </div>
            </section>

            {plan.map((c) => {
              const d = c.todo.filter((t) => t.done).length;
              const cp = Math.round((100 * d) / Math.max(1, c.todo.length));
              return (
                <section key={c.chapter.id} className="section">
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <div className="row" style={{ gap: 10 }}>
                      <h2 className="h2">{c.chapter.title}</h2>
                      {c.chapter.practice && <span className="pill violet">Practice · not counted</span>}
                      <span className="muted">{c.pages.length} frames</span>
                    </div>
                    <div className="minibar"><span className="small muted num">{d}/{c.todo.length}</span><div className="bar ok"><i style={{ width: `${cp}%` }} /></div></div>
                  </div>
                  <div className="contact">
                    {c.pages.map((pg) => {
                      const t = c.todo.filter((x) => x.pageId === pg.id);
                      if (!t.length) return null;
                      const open = t.find((x) => !x.done);
                      const all = !open;
                      const isNext = next?.pageId === pg.id;
                      return (
                        <Link
                          key={pg.id}
                          href={`/rate/work?page=${pg.id}&step=${(open ?? t[t.length - 1]).step}`}
                          className={`tile${all ? " done" : ""}${isNext ? " next-up" : ""}`}
                          title={all ? "Confirmed" : `Next: ${STEP_LABEL[open!.step]}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/page-image/${pg.id}`} alt="" loading="lazy" />
                          <span className="tag">{pg.index + 1}</span>
                          <span className="state">
                            {all ? <span className="pill ok"><Icon name="check" size={11} /> Done</span> : <span className="pill">{STEP_SHORT[open!.step]}</span>}
                            {isNext && <span className="pill dark">Next</span>}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}
