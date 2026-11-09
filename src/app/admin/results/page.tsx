import Link from "next/link";
import Icon from "@/components/Icon";
import { pct } from "@/lib/format";
import { loadResults, wilson, type StudyRow } from "@/lib/stats";
import { FAMILY_LABEL, OCR_GROUP_LABEL, type OcrGroup } from "@/lib/steps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results" };

const READING_LABEL: Record<string, string> = {
  text: "Comic reader (ko-trocr-cg2m)",
  secondary_text: "General reader (team-lucid)",
  corrected_text: "Arbiter",
};
const fmtP = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));
const fmtA = (a: number | null) => (a == null ? "–" : a.toFixed(2));

function Split({ r }: { r: StudyRow }) {
  const n = Math.max(1, r.judgements);
  return (
    <div className="split" title={`guide ${r.guide}, tie ${r.tie}, no type ${r.plain}`}>
      <i className="g" style={{ width: `${(100 * r.guide) / n}%` }} />
      <i className="t" style={{ width: `${(100 * r.tie) / n}%` }} />
      <i className="p" style={{ width: `${(100 * r.plain) / n}%` }} />
    </div>
  );
}

function StudyTable({ rows }: { rows: StudyRow[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "auto" }}>
      <table className="t">
        <thead>
          <tr>
            <th>Texts</th><th className="r">Judgements</th><th>Split</th><th className="r">Guide</th><th className="r">No type</th><th className="r">Tie</th>
            <th className="r">Too strong (guide / no type)</th><th className="r">Too flat (guide / no type)</th><th className="r">α</th><th className="r">Texts decided</th><th className="r">Sign test p</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const [lo, hi] = wilson(r.blocksGuide, r.blocksDecided);
            return (
              <tr key={r.key} className={r.key === "all" ? "total" : ""}>
                <td>{r.label}</td>
                <td className="r num">{r.judgements}</td>
                <td><Split r={r} /></td>
                <td className="r num">{pct(r.guide, r.judgements)}</td>
                <td className="r num">{pct(r.plain, r.judgements)}</td>
                <td className="r num">{pct(r.tie, r.judgements)}</td>
                <td className="r num">{pct(r.strongGuide, r.toneGuide)} / {pct(r.strongPlain, r.tonePlain)}</td>
                <td className="r num">{pct(r.flatGuide, r.toneGuide)} / {pct(r.flatPlain, r.tonePlain)}</td>
                <td className="r num">{fmtA(r.alpha)}</td>
                <td className="r num" title={r.blocksDecided ? `guide wins ${r.blocksGuide} of ${r.blocksDecided} (95% CI ${Math.round(lo * 100)}–${Math.round(hi * 100)}%)` : ""}>
                  {r.blocksDecided ? <>{r.blocksGuide}/{r.blocksDecided} <span className="faint">({pct(r.blocksGuide, r.blocksDecided)})</span></> : "–"}
                </td>
                <td className="r num">{r.blocksDecided ? fmtP(r.p) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function Results() {
  const R = await loadResults();
  const all = R.study.find((r) => r.key === "all")!;
  const groups: OcrGroup[] = ["balloon", "boxsys", "free", "sfx"];
  const cerRows = [...R.cer].sort((a, b) => (READING_LABEL[a.reading] ? 0 : 1) - (READING_LABEL[b.reading] ? 0 : 1) || a.reading.localeCompare(b.reading));
  const bestIn = (g: string) => Math.min(...cerRows.map((c) => c.groups[g]?.cer ?? Infinity));

  return (
    <>
      <div className="admhead">
        <div>
          <span className="label">Study</span>
          <h1 className="h1" style={{ marginTop: 4 }}>Results</h1>
          <p className="muted" style={{ maxWidth: 640 }}>
            A live preview while the study runs, practice sets left out. The paper takes its numbers from the CSV exports and the analysis scripts in the ComicGlot repository, which add bootstrap intervals.
          </p>
        </div>
        <Link href="/admin/exports" className="btn"><Icon name="download" /> Exports</Link>
      </div>

      <div className="grid4">
        <div className="stat"><span className="label">Guide preferred</span><div className="v">{pct(all.guide, all.guide + all.plain)}</div><div className="d">of judgements that are not ties</div></div>
        <div className="stat"><span className="label">Texts decided</span><div className="v">{all.blocksDecided}</div><div className="d">{all.blocksDecided ? `sign test p ${fmtP(all.p)}` : "no texts judged yet"}</div></div>
        <div className="stat"><span className="label">Agreement</span><div className="v">{fmtA(all.alpha)}</div><div className="d">Krippendorff&apos;s α, nominal</div></div>
        <div className="stat"><span className="label">Attention checks</span><div className="v">{R.attention.n ? pct(R.attention.pass, R.attention.n) : "–"}</div><div className="d">{R.attention.n ? `${R.attention.pass} of ${R.attention.n} passed` : "none answered yet"}</div></div>
      </div>

      <section className="section">
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="label">Translations: the type&apos;s guide against no type</span>
          <span className="row" style={{ gap: 12 }}>
            <span className="legend"><i style={{ background: "var(--graphite)" }} />guide</span>
            <span className="legend"><i style={{ background: "var(--silver)" }} />tie</span>
            <span className="legend"><i style={{ background: "var(--cyan)" }} />no type</span>
          </span>
        </div>
        {all.judgements === 0 ? <div className="empty">No translation judgements yet.</div> : <StudyTable rows={R.study} />}
        <p className="small muted" style={{ marginTop: 10, maxWidth: 820 }}>
          {R.identical.all[1] > 0 && <>Identical versions (the guide changed nothing; not shown to raters): {(["balloon", "box", "sfx"] as const).map((f) => `${FAMILY_LABEL[f].toLowerCase()} ${R.identical[f][0]} of ${R.identical[f][1]}`).join(", ")}; all {R.identical.all[0]} of {R.identical.all[1]} pairs. </>}
          Shares are of all judgements by people (model judges are below). The sign test counts each text once, for the version most of its raters chose; texts where they split evenly are left out. {R.sourceWrong > 0 && <>Raters marked the Korean as wrong in {R.sourceWrong} judgements.</>}
        </p>
      </section>

      {R.perModel.length > 0 && (
        <section className="section">
          <span className="label">Per translation model (last column of the per-model table)</span>
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table className="t">
              <thead><tr><th>Model</th><th className="r">Judgements</th><th>Split</th><th className="r">Guide preferred</th><th className="r">Too strong (guide)</th><th className="r">Sign test p</th></tr></thead>
              <tbody>
                {R.perModel.map(({ model, human: r }) => (
                  <tr key={model}>
                    <td className="mono small">{model}</td>
                    <td className="r num">{r.judgements}</td>
                    <td><Split r={r} /></td>
                    <td className="r num">{pct(r.guide, r.guide + r.plain)}</td>
                    <td className="r num">{pct(r.strongGuide, r.toneGuide)}</td>
                    <td className="r num">{r.blocksDecided ? fmtP(r.p) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {R.judges.length > 0 && (
        <section className="section">
          <span className="label">Model judges (reported apart from people)</span>
          <div className="stack">
            {R.judges.map((j) => (
              <div key={j.judge}>
                <div className="small muted mono" style={{ marginBottom: 6 }}>{j.judge}</div>
                <StudyTable rows={j.rows} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <span className="label">Recognition: character error rate against the transcriptions</span>
        {R.transcribed === 0 ? (
          <div className="empty">No transcriptions yet.</div>
        ) : (
          <>
            <div className="card" style={{ padding: 0, overflow: "auto" }}>
              <table className="t">
                <thead><tr><th>Reader</th>{groups.map((g) => <th key={g} className="r">{OCR_GROUP_LABEL[g]}</th>)}<th className="r">All</th></tr></thead>
                <tbody>
                  {cerRows.map((c) => (
                    <tr key={c.reading}>
                      <td>{READING_LABEL[c.reading] ?? <span className="mono small">{c.reading}</span>}</td>
                      {[...groups, "all"].map((g) => {
                        const v = c.groups[g];
                        const best = v?.cer != null && v.cer === bestIn(g);
                        return <td key={g} className="r num" title={v ? `${v.n} texts` : ""}>{v?.cer != null ? (best ? <span className="best">{(100 * v.cer).toFixed(1)}%</span> : `${(100 * v.cer).toFixed(1)}%`) : <span className="faint">–</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              {R.transcribed} texts transcribed, {R.unreadable} marked unreadable (left out). Spaces are ignored, as in <span className="mono">eval/ocr_eval.py</span>. Marked: lowest in each column.
              {R.transcriberAgreement && <> Where two people typed the same text ({R.transcriberAgreement.blocks}), they differ on {(100 * R.transcriberAgreement.cer).toFixed(1)}% of characters.</>}
            </p>
          </>
        )}
      </section>

      {R.types.n > 0 && (
        <section className="section">
          <span className="label">Types: people against the detector</span>
          <div className="grid4">
            {R.types.rows.map((t) => (
              <div key={t.family} className="stat"><span className="label">{FAMILY_LABEL[t.family]}</span><div className="v">{pct(t.agree, t.n)}</div><div className="d">{t.agree} of {t.n} texts agree</div></div>
            ))}
            <div className="stat"><span className="label">All</span><div className="v">{pct(R.types.agree, R.types.n)}</div><div className="d">{R.types.agree} of {R.types.n}</div></div>
          </div>
        </section>
      )}

      {R.attention.failBy.length > 0 && (
        <section className="section">
          <span className="label">Missed attention checks</span>
          <div className="row">{R.attention.failBy.map((f) => <span key={f.rater} className="pill warn">{f.rater}: {f.n}</span>)}</div>
        </section>
      )}
    </>
  );
}
