import Icon from "@/components/Icon";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exports" };

const EXPORTS = [
  {
    kind: "compare",
    title: "Translations",
    what: "One row per comparison: which condition each letter was, the choice, the tone marks, attention checks, the rater's own English.",
    feeds: "the translation study table and the last column of the per-model table (pairwise analysis in eval/translation_study).",
  },
  {
    kind: "transcribe",
    title: "Transcriptions",
    what: "The rater's Korean as gt_text (#ILLEGIBLE when unreadable) next to every stored reading (reading:<system>).",
    feeds: "the recognition table: it is the --gt file of eval/ocr_eval.py as it is.",
  },
  {
    kind: "types",
    title: "Text types",
    what: "The type each person chose next to the detector's type.",
    feeds: "Agreement of people with the detector on unseen frames.",
  },
  {
    kind: "pages",
    title: "Frames and time",
    what: "Every saved step per frame and rater, with the time spent and text the rater saw without a box.",
    feeds: "Effort and completeness; the time per text is in the other exports (ms).",
  },
] as const;

export default async function Exports() {
  const counts = Object.fromEntries(
    await Promise.all(
      (["compare", "transcribe", "types"] as const).map(async (k) => [k, await db.response.count({ where: { step: k, block: { page: { chapter: { practice: false } } } } })] as const),
    ),
  );
  const pages = await db.pageDone.count({ where: { page: { chapter: { practice: false } } } });
  return (
    <>
      <div className="admhead">
        <div>
          <span className="label">Manage</span>
          <h1 className="h1" style={{ marginTop: 4 }}>Exports</h1>
          <p className="muted" style={{ maxWidth: 640 }}>CSV files in UTF-8, unblinded, practice sets left out. Rows from model judges carry <span className="mono">rater_kind = model</span>.</p>
        </div>
      </div>
      <div className="grid2">
        {EXPORTS.map((e) => {
          const n = e.kind === "pages" ? pages : counts[e.kind];
          return (
            <div key={e.kind} className="card stack" style={{ gap: 10 }}>
              <div className="row between">
                <span className="h3">{e.title}</span>
                <span className="pill">{n} rows</span>
              </div>
              <p className="read muted" style={{ margin: 0 }}>{e.what}</p>
              <p className="small" style={{ margin: 0 }}><span className="label">Feeds</span><br />{e.feeds}</p>
              <div style={{ marginTop: 4 }}>
                <a href={`/api/admin/export?kind=${e.kind}`} className="btn" aria-disabled={!n}><Icon name="download" /> Download CSV</a>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
