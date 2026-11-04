"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { STEP_LABEL, TONE, TYPES, type Step } from "@/lib/steps";
import { saveStep, type SaveResult } from "../actions";

export type WBBlock = {
  id: string;
  order: number;
  box: [number, number, number, number];
  responses: Record<string, Record<string, unknown>>;
  source?: string;
  // compare step only: comparison sets, each a list of lettered candidates
  sets?: { letter: string; text: string }[][];
};

type Props = {
  pageId: string;
  width: number;
  height: number;
  step: Step;
  blocks: WBBlock[];
  askOwn: boolean;
  missing: boolean;
  pageNote: string;
  reviewSteps: Step[];
};

type SetAnswer = { choice: string; tone: Record<string, string> };
type Answer = {
  type?: string;
  note?: string;
  text?: string;
  unreadable?: boolean;
  own?: string;
  comment?: string;
  sets?: SetAnswer[];
};

const TYPE_LABEL = Object.fromEntries(TYPES) as Record<string, string>;

function initial(step: Step, b: WBBlock): Answer {
  const r = (b.responses[step] ?? {}) as Answer & { sets?: (SetAnswer & { letters?: unknown })[] };
  if (step === "compare") {
    const sets = (b.sets ?? []).map((opts, k) => ({
      choice: r.sets?.[k]?.choice ?? "",
      tone: Object.fromEntries(opts.map((o) => [o.letter, r.sets?.[k]?.tone?.[o.letter] ?? "fine"])),
    }));
    return { own: r.own ?? "", comment: r.comment ?? "", sets };
  }
  if (step === "types") return { type: r.type ?? "", note: r.note ?? "" };
  if (step === "transcribe") return { text: r.text ?? "", unreadable: !!r.unreadable };
  return {};
}

function complete(step: Step, a: Answer): boolean {
  if (step === "types") return !!a.type;
  if (step === "transcribe") return !!a.unreadable || !!a.text?.trim();
  if (step === "compare") return (a.sets ?? []).every((s) => !!s.choice);
  return true;
}

function Crop({ pageId, width, height, box, maxW = 320 }: { pageId: string; width: number; height: number; box: WBBlock["box"]; maxW?: number }) {
  const pad = 6;
  const x0 = Math.max(0, box[0] - pad), y0 = Math.max(0, box[1] - pad);
  const x1 = Math.min(width, box[2] + pad), y1 = Math.min(height, box[3] + pad);
  const sc = Math.min(maxW / Math.max(1, x1 - x0), 2);
  return (
    <div
      className="crop"
      aria-label="The text block as drawn on the page"
      style={{
        width: (x1 - x0) * sc,
        height: (y1 - y0) * sc,
        backgroundImage: `url(/api/page-image/${pageId})`,
        backgroundSize: `${width * sc}px ${height * sc}px`,
        backgroundPosition: `${-x0 * sc}px ${-y0 * sc}px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

function summary(step: Step, data: Record<string, unknown> | undefined): string {
  if (!data) return "—";
  const a = data as Answer;
  if (step === "types") return (TYPE_LABEL[a.type ?? ""] ?? a.type ?? "—") + (a.note ? ` (${a.note})` : "");
  if (step === "transcribe") return a.unreadable ? "unreadable" : a.text ?? "—";
  if (step === "compare") {
    const c = (a.sets ?? []).map((s) => (s.choice === "tie" ? "tie" : s.choice)).join(", ");
    return [c && `choice ${c}`, a.own && `own: ${a.own}`].filter(Boolean).join("; ") || "—";
  }
  return "";
}

export default function Workbench(p: Props) {
  const started = useRef(Date.now());
  const msInput = useRef<HTMLInputElement>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(p.blocks.map((b) => [b.id, initial(p.step, b)])));
  const [missing, setMissing] = useState(p.missing);
  const [pageNote, setPageNote] = useState(p.pageNote);
  const [active, setActive] = useState<string | null>(p.blocks[0]?.id ?? null);
  const shown = p.blocks.filter((b) => p.step !== "compare" || b.sets?.length);
  const [revealed, setRevealed] = useState(!p.askOwn || shown.some((b) => b.responses.compare));
  const [res, action, pending] = useActionState<SaveResult, FormData>(saveStep, null);

  const set = (id: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  const setSet = (id: string, k: number, patch: Partial<SetAnswer>) =>
    setAnswers((a) => {
      const sets = [...(a[id].sets ?? [])];
      sets[k] = { ...sets[k], ...patch };
      return { ...a, [id]: { ...a[id], sets } };
    });
  const todo = shown.filter((b) => !complete(p.step, answers[b.id])).length;
  const ready = p.step === "review" || (p.step === "compare" ? revealed && todo === 0 : todo === 0);
  const focus = (id: string) => {
    setActive(id);
    document.getElementById(`b-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const payload = JSON.stringify({
    blocks: Object.fromEntries(shown.map((b) => [b.id, answers[b.id]])),
    missing,
    note: pageNote,
  });

  return (
    <div className="bench">
      <div className="pagecol">
        <div className="pageframe">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/page-image/${p.pageId}`} alt="The page" width={p.width} height={p.height} />
          {p.blocks.map((b) => {
            const [x0, y0, x1, y1] = b.box;
            const done = complete(p.step, answers[b.id]) && (p.step !== "compare" || !!b.sets?.length);
            return (
              <button
                type="button"
                key={b.id}
                className={`box${active === b.id ? " on" : ""}${done ? " done" : ""}`}
                style={{
                  left: `${(x0 / p.width) * 100}%`,
                  top: `${(y0 / p.height) * 100}%`,
                  width: `${((x1 - x0) / p.width) * 100}%`,
                  height: `${((y1 - y0) / p.height) * 100}%`,
                }}
                onClick={() => focus(b.id)}
                title={`Block ${b.order + 1}`}
              >
                <span>{b.order + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form
        action={action}
        className="formcol"
        onSubmit={() => {
          if (msInput.current) msInput.current.value = String(Date.now() - started.current);
        }}
      >
        <input type="hidden" name="pageId" value={p.pageId} />
        <input type="hidden" name="step" value={p.step} />
        <input type="hidden" name="payload" value={payload} />
        <input type="hidden" name="ms" ref={msInput} defaultValue="0" />

        {p.step === "compare" && p.askOwn && !revealed && (
          <div className="card note">
            Write your own translation of each block first if you wish (optional), then show the translations.
            Your own text is locked once the translations are shown.
          </div>
        )}

        {p.step !== "review" &&
          shown.map((b) => {
            const a = answers[b.id];
            return (
              <div
                key={b.id}
                id={`b-${b.id}`}
                className={`card blk${active === b.id ? " on" : ""}`}
                onFocusCapture={() => setActive(b.id)}
                onClick={() => setActive(b.id)}
              >
                <div className="blkhead">
                  <span className="num">{b.order + 1}</span>
                  <Crop pageId={p.pageId} width={p.width} height={p.height} box={b.box} />
                </div>

                {p.step === "types" && (
                  <>
                    <label htmlFor={`t-${b.id}`}>Type</label>
                    <select id={`t-${b.id}`} value={a.type} onChange={(e) => set(b.id, { type: e.target.value })}>
                      <option value="">Choose…</option>
                      {TYPES.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <label htmlFor={`n-${b.id}`}>Note (optional)</label>
                    <input id={`n-${b.id}`} type="text" value={a.note} onChange={(e) => set(b.id, { note: e.target.value })} />
                  </>
                )}

                {p.step === "transcribe" && (
                  <>
                    <label htmlFor={`x-${b.id}`}>Korean as drawn</label>
                    <textarea
                      id={`x-${b.id}`}
                      lang="ko"
                      className="korean"
                      value={a.text}
                      disabled={a.unreadable}
                      onChange={(e) => set(b.id, { text: e.target.value })}
                    />
                    <label className="inline">
                      <input type="checkbox" checked={a.unreadable} onChange={(e) => set(b.id, { unreadable: e.target.checked })} />
                      Cannot read this block
                    </label>
                  </>
                )}

                {p.step === "compare" && (
                  <>
                    <p className="korean src">{b.source}</p>
                    {p.askOwn && (
                      <>
                        <label htmlFor={`o-${b.id}`}>Your translation (optional)</label>
                        <textarea id={`o-${b.id}`} value={a.own} readOnly={revealed} onChange={(e) => set(b.id, { own: e.target.value })} />
                      </>
                    )}
                    {revealed &&
                      b.sets!.map((opts, k) => (
                        <fieldset key={k} className="set">
                          {b.sets!.length > 1 && <legend>Comparison {k + 1} of {b.sets!.length}</legend>}
                          {opts.map((o) => (
                            <div key={o.letter} className={`cand${a.sets![k].choice === o.letter ? " chosen" : ""}`}>
                              <label className="inline">
                                <input
                                  type="radio"
                                  name={`c-${b.id}-${k}`}
                                  checked={a.sets![k].choice === o.letter}
                                  onChange={() => setSet(b.id, k, { choice: o.letter })}
                                />
                                <span className="letter">{o.letter}</span>
                                <span className="ctext">{o.text}</span>
                              </label>
                              <div className="tone" role="radiogroup" aria-label={`Tone of ${o.letter}`}>
                                <span className="muted">Tone:</span>
                                {TONE.map((t) => (
                                  <label key={t} className="inline">
                                    <input
                                      type="radio"
                                      name={`tone-${b.id}-${k}-${o.letter}`}
                                      checked={a.sets![k].tone[o.letter] === t}
                                      onChange={() => setSet(b.id, k, { tone: { ...a.sets![k].tone, [o.letter]: t } })}
                                    />
                                    {t === "fine" ? "fits the page" : t === "added" ? "adds tone" : "overdone"}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          <label className="inline">
                            <input
                              type="radio"
                              name={`c-${b.id}-${k}`}
                              checked={a.sets![k].choice === "tie"}
                              onChange={() => setSet(b.id, k, { choice: "tie" })}
                            />
                            Equally good or equally bad
                          </label>
                        </fieldset>
                      ))}
                    {revealed && (
                      <>
                        <label htmlFor={`m-${b.id}`}>Comment (optional)</label>
                        <input id={`m-${b.id}`} type="text" value={a.comment} onChange={(e) => set(b.id, { comment: e.target.value })} />
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}

        {p.step === "types" && (
          <div className="card">
            <label className="inline">
              <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />
              There is text on this page without a numbered box
            </label>
            {missing && (
              <>
                <label htmlFor="pnote">Where, and what kind?</label>
                <input id="pnote" type="text" value={pageNote} onChange={(e) => setPageNote(e.target.value)} />
              </>
            )}
          </div>
        )}

        {p.step === "review" && (
          <div className="card">
            <table className="review">
              <thead>
                <tr>
                  <th>#</th>
                  {p.reviewSteps.map((s) => (
                    <th key={s}>
                      {STEP_LABEL[s]} <Link href={`/rate/work?page=${p.pageId}&step=${s}`} className="muted">edit</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.blocks.map((b) => (
                  <tr key={b.id} className={active === b.id ? "on" : ""} onClick={() => focus(b.id)}>
                    <td>{b.order + 1}</td>
                    {p.reviewSteps.map((s) => (
                      <td key={s} className={s === "transcribe" ? "korean" : ""}>{summary(s, b.responses[s])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {p.missing && <p>Text without a box: {p.pageNote || "yes"}</p>}
          </div>
        )}

        <div className="submitbar">
          {p.step === "compare" && !revealed ? (
            <button type="button" onClick={() => setRevealed(true)}>Show the translations</button>
          ) : (
            <button disabled={!ready || pending}>
              {pending ? "Saving…" : p.step === "review" ? "Confirm this page" : "Save and continue"}
            </button>
          )}
          {p.step !== "review" && todo > 0 && (p.step !== "compare" || revealed) && (
            <span className="muted">{todo} block{todo === 1 ? "" : "s"} left</span>
          )}
          {res && "error" in res && <span className="err">{res.error}</span>}
        </div>
      </form>
    </div>
  );
}
