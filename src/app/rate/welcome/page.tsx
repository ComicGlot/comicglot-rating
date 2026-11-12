import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import Icon from "@/components/Icon";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPlan } from "@/lib/flow";
import { fmt } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/server";
import { type Step } from "@/lib/steps";
import { acceptConsent } from "../consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

// Minutes per text and step (a comparison with tones takes about 20 s), plus a little per frame to look at it.
// Ranking four to six versions takes longer: about 45 s a text.
const MINUTES: Record<Step, number> = { types: 0.2, transcribe: 0.6, compare: 0.35, review: 0.05 };
const RANK_MINUTES = 0.75;

export default async function Welcome({ searchParams }: { searchParams: Promise<{ missing?: string }> }) {
  const s = await requireRater();
  const q = await searchParams;
  const { m } = await getMessages();
  const rater = await db.rater.findUniqueOrThrow({ where: { id: s.sub } });
  if (rater.consentAt && !q.missing) redirect("/rate");
  const plan = await loadPlan(s.sub);
  const study = plan[0]?.chapter.study;
  const steps = [...new Set(plan.flatMap((c) => c.steps))] as Step[];
  const blocks = await db.block.count({ where: { page: { chapter: { id: { in: plan.map((c) => c.chapter.id) }, practice: false } } } });
  const frames = plan.filter((c) => !c.chapter.practice).reduce((n, c) => n + c.pages.length, 0);
  const ranking = !!study?.rankModels;
  const sets = plan.filter((c) => !c.chapter.practice).length;
  // With a share per rater, the time shown is for the share; the rater may go on through every set.
  const share = study?.setsPerRater && sets ? Math.min(study.setsPerRater, sets) : 0;
  const part = share ? share / sets : 1;
  const minutes = Math.round(part * (blocks * steps.reduce((x, st) => x + (st === "compare" && ranking ? RANK_MINUTES : MINUTES[st]), 0) + frames * 0.05));
  // A study's own introduction (written by the admin) replaces the default text.
  const intro = study?.intro ? study.intro.split(/\n\s*\n/) : m.welcome.intro;
  const hasPractice = plan.some((c) => c.chapter.practice);

  return (
    <>
      <TopNav home="/rate" user={s.username} crumbs={[m.welcome.title]} lang />
      <main className="wrap narrow">
        <span className="label">{m.welcome.beforeStart}</span>
        <h1 className="display" style={{ margin: "8px 0 16px" }}>{fmt(m.welcome.hello, { name: s.username })}</h1>
        {intro.map((p, i) => <p key={i} className="read" style={{ fontSize: 16, lineHeight: "26px" }}>{p}</p>)}
        {steps.includes("compare") && <div className="callout info" style={{ marginTop: 8 }}>{m.welcome.englishNote}</div>}
        {share > 0 && <div className="callout" style={{ marginTop: 8 }}>{fmt(m.welcome.share, { n: share, total: sets, min: Math.max(5, Math.round(minutes / 5) * 5) })}</div>}

        <div className="section">
          <span className="label">{m.welcome.whatYouDo}</span>
          <div className="stack" style={{ gap: 8 }}>
            {steps.filter((x): x is Exclude<Step, "review"> => x !== "review").map((x, i) => (
              <div key={x} className="card tight" style={{ display: "flex", gap: 14 }}>
                <span className="qnum" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{i + 1}</span>
                <div className="grow">
                  <div className="h3">{x === "compare" && ranking ? m.ranking.label : m.steps[x].label}</div>
                  <p className="read muted" style={{ margin: "4px 0 0" }}>{x === "compare" && ranking ? m.ranking.help : m.steps[x].help}</p>
                  <details className="more" style={{ marginTop: 8 }}>
                    <summary className="small">{m.welcome.details}</summary>
                    <ul className="read" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      {(x === "compare" && ranking ? m.ranking.guide : m.steps[x].guide).map((g) => <li key={g}>{g}</li>)}
                    </ul>
                  </details>
                </div>
              </div>
            ))}
            {steps.includes("review") && (
              <div className="card tight" style={{ display: "flex", gap: 14 }}>
                <span className="qnum"><Icon name="check" size={12} /></span>
                <div className="grow">
                  <div className="h3">{m.steps.review.label}</div>
                  <p className="read muted" style={{ margin: "4px 0 0" }}>{m.steps.review.help}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section grid3">
          <div className="stat"><span className="label">{m.welcome.frames}</span><div className="v">{frames}</div><div className="d">{fmt(m.welcome.textsInAll, { n: blocks })}</div></div>
          <div className="stat"><span className="label">{m.welcome.time}</span><div className="v">~{Math.max(5, Math.round(minutes / 5) * 5)}<small> {m.welcome.min}</small></div><div className="d">{m.welcome.timeHint}</div></div>
          <div className="stat"><span className="label">{m.welcome.saving}</span><div className="v" style={{ fontSize: 20 }}>{m.welcome.savingValue}</div><div className="d">{m.welcome.savingHint}</div></div>
        </div>

        <div className="section card">
          <span className="label">{m.welcome.yourData}</span>
          <ul className="read" style={{ margin: "8px 0 16px", paddingLeft: 18 }}>
            {m.welcome.data.map((d) => <li key={d}>{d}</li>)}
          </ul>
          <form action={acceptConsent} className="stack" style={{ gap: 16 }}>
            <label className="check">
              <input type="checkbox" name="agree" required />
              {m.welcome.agree}
            </label>
            {q.missing && <div className="callout warn">{m.welcome.tickToContinue}</div>}
            <div className="row">
              <button className="btn primary lg">{hasPractice ? m.welcome.startPractice : m.welcome.start} <Icon name="arrowR" /></button>
              <span className="muted small">{fmt(m.welcome.guideAgain, { key: "?" })}</span>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
