import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import Icon from "@/components/Icon";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPlan } from "@/lib/flow";
import { STEP_GUIDE, STEP_HELP, STEP_LABEL, type Step } from "@/lib/steps";
import { acceptConsent } from "../consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

const DEFAULT_INTRO = `ComicGlot is a research project on how the shape of a speech balloon or a piece of lettering in a webtoon should change its translation. This study checks how well the system reads and translates such text, against the judgement of people who know the language.

You will see single frames from Korean webtoons, one at a time, with every text on the frame numbered. The frames come from many series, so the story will not run on from one frame to the next.`;

const MINUTES: Record<Step, number> = { types: 0.25, transcribe: 0.6, compare: 0.8, review: 0.1 };

export default async function Welcome({ searchParams }: { searchParams: Promise<{ missing?: string }> }) {
  const s = await requireRater();
  const q = await searchParams;
  const rater = await db.rater.findUniqueOrThrow({ where: { id: s.sub } });
  const plan = await loadPlan(s.sub);
  const study = plan[0]?.chapter.study;
  const steps = [...new Set(plan.flatMap((c) => c.steps))] as Step[];
  const blocks = await db.block.count({ where: { page: { chapter: { id: { in: plan.map((c) => c.chapter.id) }, practice: false } } } });
  const frames = plan.filter((c) => !c.chapter.practice).reduce((n, c) => n + c.pages.length, 0);
  const minutes = Math.round(blocks * steps.reduce((m, x) => m + MINUTES[x], 0) + frames * 0.2);
  const intro = (study?.intro || DEFAULT_INTRO).split(/\n\s*\n/);
  const hasPractice = plan.some((c) => c.chapter.practice);
  if (rater.consentAt && !q.missing) redirect("/rate");

  return (
    <>
      <TopNav home="/rate" user={s.username} crumbs={["Welcome"]} />
      <main className="wrap narrow">
        <span className="label">Before you start</span>
        <h1 className="display" style={{ margin: "8px 0 16px" }}>Welcome, {s.username}</h1>
        {intro.map((p, i) => <p key={i} className="read" style={{ fontSize: 16, lineHeight: "26px" }}>{p}</p>)}

        <div className="section">
          <span className="label">What you will do on each frame</span>
          <div className="stack" style={{ gap: 8 }}>
            {steps.filter((x) => x !== "review").map((x, i) => (
              <div key={x} className="card tight" style={{ display: "flex", gap: 14 }}>
                <span className="pill dark" style={{ height: 24, minWidth: 24, justifyContent: "center" }}>{i + 1}</span>
                <div className="grow">
                  <div className="h3">{STEP_LABEL[x]}</div>
                  <p className="read muted" style={{ margin: "4px 0 0" }}>{STEP_HELP[x]}</p>
                  <details className="more" style={{ marginTop: 8 }}>
                    <summary className="small">Details</summary>
                    <ul className="read" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      {STEP_GUIDE[x as Exclude<Step, "review">].map((g) => <li key={g}>{g}</li>)}
                    </ul>
                  </details>
                </div>
              </div>
            ))}
            {steps.includes("review") && (
              <div className="card tight" style={{ display: "flex", gap: 14 }}>
                <span className="pill" style={{ height: 24, minWidth: 24, justifyContent: "center" }}><Icon name="check" size={12} /></span>
                <div className="grow">
                  <div className="h3">{STEP_LABEL.review}</div>
                  <p className="read muted" style={{ margin: "4px 0 0" }}>{STEP_HELP.review}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section grid3">
          <div className="stat"><span className="label">Frames</span><div className="v">{frames}</div><div className="d">{blocks} texts in all</div></div>
          <div className="stat"><span className="label">Time</span><div className="v">~{Math.max(5, Math.round(minutes / 5) * 5)}<small> min</small></div><div className="d">A rough guess; take breaks whenever you like</div></div>
          <div className="stat"><span className="label">Saving</span><div className="v" style={{ fontSize: 20 }}>Automatic</div><div className="d">Each frame is saved when you finish it; drafts stay in this browser</div></div>
        </div>

        <div className="section card">
          <span className="label">Your data</span>
          <ul className="read" style={{ margin: "8px 0 16px", paddingLeft: 18 }}>
            <li>We store what you enter, the time you spend on each frame and the name you signed in with. Nothing else.</li>
            <li>Your answers are analysed together with other raters&apos; and reported only as totals. Your own translations may be quoted without your name.</li>
            <li>The frames belong to their publishers. Please do not save, copy or share them, and do not look the series up.</li>
            <li>You can stop at any time and ask for your answers to be removed.</li>
          </ul>
          <form action={acceptConsent} className="stack" style={{ gap: 16 }}>
            <label className="check">
              <input type="checkbox" name="agree" required />
              I have read this and agree to take part.
            </label>
            {q.missing && <div className="callout warn">Please tick the box to continue.</div>}
            <div className="row">
              <button className="btn primary lg">{hasPractice ? "Start with a practice frame" : "Start"} <Icon name="arrowR" /></button>
              <span className="muted small">Press <span className="kbd">?</span> on any frame to see the guide again.</span>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
