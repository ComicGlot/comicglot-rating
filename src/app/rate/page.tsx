import Link from "next/link";
import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import GuideDrawer from "@/components/GuideDrawer";
import Icon from "@/components/Icon";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignChapters } from "@/lib/assign";
import { loadPlan } from "@/lib/flow";
import { fmt, plural } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/server";
import { chapterTitle } from "@/lib/i18n/titles";
import { type Step } from "@/lib/steps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your frames" };

export default async function RateHome() {
  const s = await requireRater();
  const { locale, m } = await getMessages();
  const rater = await db.rater.findUnique({ where: { id: s.sub }, select: { consentAt: true, accessKey: true } });
  if (!rater?.consentAt) redirect("/rate/welcome");
  await assignChapters(s.sub); // sets added since the last visit
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
      <TopNav home="/rate" user={s.username} crumbs={[m.home.title]} right={<GuideDrawer steps={steps} ranking={plan.some((c) => !!c.chapter.study.rankModels)} />} lang />
      <main className="wrap">
        {plan.length === 0 ? (
          <div className="empty">
            <div className="h3" style={{ marginBottom: 6 }}>{m.home.nothingYet}</div>
            {m.home.nothingYetText}
          </div>
        ) : (
          <>
            <section className="hero">
              <div className="card next">
                <div>
                  <span className="label">{done === 0 ? m.home.ready : done < total ? m.home.welcomeBack : m.home.allDone}</span>
                  <h1 className="display" style={{ margin: "8px 0 8px" }}>
                    {done < total ? fmt(m.home.hello, { name: s.username }) : m.home.thankYou}
                  </h1>
                  <p className="read muted" style={{ fontSize: 15, maxWidth: 540 }}>
                    {done < total ? (next?.chapter.chapter.practice ? m.home.practiceFirst : m.home.savedAsYouGo) : m.home.allConfirmed}
                  </p>
                  {rater.accessKey && (
                    <p className="small muted" style={{ maxWidth: 540, marginTop: 6 }}>
                      {fmt(m.home.yourKey, { key: rater.accessKey })}
                    </p>
                  )}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  {next ? (
                    <Link href={`/rate/work?page=${next.pageId}&step=${next.step}`} className="btn primary lg">
                      <Icon name="play" /> {done === 0 ? m.home.start : m.home.continue}
                      <span style={{ opacity: 0.75, fontWeight: 500 }}>
                        {fmt(m.home.nextTask, { set: chapterTitle(next.chapter.chapter, m), n: next.pageIndex + 1, step: m.steps[next.step].short })}
                      </span>
                    </Link>
                  ) : (
                    <span className="pill ok" style={{ height: 32, padding: "0 12px" }}><Icon name="check" size={14} /> {m.home.everythingConfirmed}</span>
                  )}
                  <div className="stepline">
                    {steps.map((x) => <span key={x} className="chip soft" style={{ cursor: "default" }}>{m.steps[x].label}</span>)}
                  </div>
                </div>
              </div>
              <div className="card stack" style={{ gap: 16 }}>
                <div className="row between">
                  <span className="label">{m.home.progress}</span>
                  <span className="pill">{pct}%</span>
                </div>
                <div className="bar" aria-label={`${pct}%`}><i style={{ width: `${pct}%` }} /></div>
                <div className="grid2" style={{ gap: 12 }}>
                  <div><div className="h2 num">{framesDone}<span className="faint" style={{ fontSize: 15 }}> / {framesAll}</span></div><div className="small muted">{m.home.framesConfirmed}</div></div>
                  <div><div className="h2 num">{minutes}<span className="faint" style={{ fontSize: 15 }}> {m.welcome.min}</span></div><div className="small muted">{m.home.timeOnFrames}</div></div>
                </div>
                <div className="small muted" style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
                  {fmt(m.home.tasks, { done, total })} · {plural(locale, m.home.sets, plan.length)}
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
                      <h2 className="h2">{chapterTitle(c.chapter, m)}</h2>
                      {c.chapter.practice && <span className="pill violet">{m.home.practiceBadge}</span>}
                      <span className="muted">{plural(locale, m.home.frames, c.pages.length)}</span>
                    </div>
                    <div className="minibar"><span className="small muted num">{d}/{c.todo.length}</span><div className="bar ok"><i style={{ width: `${cp}%` }} /></div></div>
                  </div>
                  <div className="contact">
                    {c.pages.map((pg) => {
                      const t = c.todo.filter((x) => x.pageId === pg.id);
                      if (!t.length) return null;
                      const open = t.find((x) => !x.done);
                      const isNext = next?.pageId === pg.id;
                      return (
                        <Link
                          key={pg.id}
                          href={`/rate/work?page=${pg.id}&step=${(open ?? t[t.length - 1]).step}`}
                          className={`tile${!open ? " done" : ""}${isNext ? " next-up" : ""}`}
                          title={!open ? m.home.confirmed : fmt(m.home.nextStep, { step: m.steps[open.step].label })}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/page-image/${pg.id}`} alt="" loading="lazy" />
                          <span className="tag">{pg.index + 1}</span>
                          <span className="state">
                            {!open ? <span className="pill ok"><Icon name="check" size={11} /> {m.home.done}</span> : <span className="pill">{m.steps[open.step].short}</span>}
                            {isNext && <span className="pill" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{m.home.next}</span>}
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
