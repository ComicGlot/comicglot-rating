"use client";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { STEP_LABEL, STEP_SHORT, TONE, TONE_LABEL, TYPES, TYPE_NAME, type Step } from "@/lib/steps";
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
  tabs: { step: Step; done: boolean }[];
  reviewSteps: Step[];
  saved?: string;
};

type SetAnswer = { choice: string; tone: Record<string, string> };
type Answer = {
  type?: string;
  note?: string;
  text?: string;
  unreadable?: boolean;
  own?: string;
  comment?: string;
  sourceWrong?: boolean;
  sets?: SetAnswer[];
};

function initial(step: Step, b: WBBlock): Answer {
  const r = (b.responses[step] ?? {}) as Answer & { sets?: (SetAnswer & { letters?: unknown })[] };
  if (step === "compare") {
    const sets = (b.sets ?? []).map((opts, k) => ({
      choice: r.sets?.[k]?.choice ?? "",
      tone: Object.fromEntries(opts.map((o) => [o.letter, r.sets?.[k]?.tone?.[o.letter] ?? "fine"])),
    }));
    return { own: r.own ?? "", comment: r.comment ?? "", sourceWrong: !!r.sourceWrong, sets };
  }
  if (step === "types") return { type: r.type ?? "", note: r.note ?? "" };
  if (step === "transcribe") return { text: r.text ?? "", unreadable: !!r.unreadable };
  return {};
}

function complete(step: Step, a: Answer | undefined): boolean {
  if (!a) return false;
  if (step === "types") return !!a.type;
  if (step === "transcribe") return !!a.unreadable || !!a.text?.trim();
  if (step === "compare") return (a.sets ?? []).length > 0 && (a.sets ?? []).every((s) => !!s.choice);
  return true;
}

function Crop({ pageId, width, height, box, maxW = 360, maxH = 220 }: { pageId: string; width: number; height: number; box: WBBlock["box"]; maxW?: number; maxH?: number }) {
  const pad = 8;
  const x0 = Math.max(0, box[0] - pad), y0 = Math.max(0, box[1] - pad);
  const x1 = Math.min(width, box[2] + pad), y1 = Math.min(height, box[3] + pad);
  const sc = Math.min(maxW / Math.max(1, x1 - x0), maxH / Math.max(1, y1 - y0), 2.5);
  return (
    <div
      className="crop"
      role="img"
      aria-label="The text as drawn on the page"
      style={{
        width: Math.round((x1 - x0) * sc),
        height: Math.round((y1 - y0) * sc),
        backgroundImage: `url(/api/page-image/${pageId})`,
        backgroundSize: `${width * sc}px ${height * sc}px`,
        backgroundPosition: `${-x0 * sc}px ${-y0 * sc}px`,
      }}
    />
  );
}

function summary(step: Step, data: Record<string, unknown> | undefined): React.ReactNode {
  if (!data) return <span className="faint">not done</span>;
  const a = data as Answer;
  if (step === "types") return <>{TYPE_NAME[a.type ?? ""] ?? a.type}{a.note ? <span className="muted"> · {a.note}</span> : null}</>;
  if (step === "transcribe") return a.unreadable ? <span className="pill warn">unreadable</span> : <span className="korean">{a.text}</span>;
  if (step === "compare") {
    const c = (a.sets ?? []).map((s) => (s.choice === "tie" ? "tie" : s.choice)).join(", ");
    return (
      <>
        {c ? <>chose <b>{c}</b></> : "—"}
        {a.sourceWrong ? <span className="pill warn" style={{ marginLeft: 6 }}>Korean looks wrong</span> : null}
        {a.own ? <div className="muted read small">own: {a.own}</div> : null}
      </>
    );
  }
  return null;
}

const typing = (t: EventTarget | null) => !!t && /INPUT|TEXTAREA|SELECT/.test((t as HTMLElement).tagName);

export default function Workbench(p: Props) {
  const draftKey = `cg-draft:${p.pageId}:${p.step}`;
  const started = useRef(Date.now());
  const msInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const frameScroll = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const shown = useMemo(() => p.blocks.filter((b) => p.step !== "compare" || b.sets?.length), [p.blocks, p.step]);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(p.blocks.map((b) => [b.id, initial(p.step, b)])));
  const [missing, setMissing] = useState(p.missing);
  const [pageNote, setPageNote] = useState(p.pageNote);
  const [active, setActive] = useState<string | null>(() => (shown.find((b) => !complete(p.step, initial(p.step, b))) ?? shown[0])?.id ?? null);
  const [revealed, setRevealed] = useState(!p.askOwn || shown.some((b) => b.responses.compare));
  const [zoom, setZoom] = useState(1);
  const [focusMode, setFocusMode] = useState(true);
  const [restored, setRestored] = useState(false);
  const [res, action, pending] = useActionState<SaveResult, FormData>(saveStep, null);

  // Time per text: added up while a text is the active one.
  const timeOn = useRef<Record<string, number>>({});
  const since = useRef({ id: active, t: Date.now() });
  useEffect(() => {
    const prev = since.current;
    if (prev.id) timeOn.current[prev.id] = (timeOn.current[prev.id] ?? 0) + (Date.now() - prev.t);
    since.current = { id: active, t: Date.now() };
  }, [active]);

  // Drafts: restore once, then keep in this browser until the frame is saved.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { answers: Record<string, Answer>; missing: boolean; pageNote: string; revealed: boolean };
        setAnswers((a) => Object.fromEntries(Object.keys(a).map((id) => [id, d.answers?.[id] ? { ...a[id], ...d.answers[id] } : a[id]])));
        setMissing(!!d.missing);
        setPageNote(d.pageNote ?? "");
        if (d.revealed) setRevealed(true);
        setRestored(true);
      }
    } catch {}
  }, [draftKey]);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ answers, missing, pageNote, revealed })); } catch {}
  }, [answers, missing, pageNote, revealed, draftKey]);

  const set = useCallback((id: string, patch: Partial<Answer>) => {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  }, []);
  const setSet = useCallback((id: string, k: number, patch: Partial<SetAnswer>) => {
    dirty.current = true;
    setAnswers((a) => {
      const sets = [...(a[id].sets ?? [])];
      sets[k] = { ...sets[k], ...patch };
      return { ...a, [id]: { ...a[id], sets } };
    });
  }, []);

  const idx = Math.max(0, shown.findIndex((b) => b.id === active));
  const cur = shown[idx];
  const doneCount = shown.filter((b) => complete(p.step, answers[b.id])).length;
  const todo = shown.length - doneCount;
  const openSteps = p.tabs.filter((t) => t.step !== "review" && !t.done);
  const ready = p.step === "review" ? openSteps.length === 0 : p.step === "compare" ? revealed && todo === 0 : todo === 0;

  const go = useCallback((d: number) => {
    const n = shown[Math.min(shown.length - 1, Math.max(0, idx + d))];
    if (n) setActive(n.id);
  }, [shown, idx]);
  const goNextOpen = useCallback(() => {
    const after = [...shown.slice(idx + 1), ...shown.slice(0, idx)].find((b) => !complete(p.step, answers[b.id]));
    if (after) setActive(after.id);
  }, [shown, idx, answers, p.step]);

  // Keep the active box in view in the frame.
  useEffect(() => {
    if (!active) return;
    const el = frameScroll.current?.querySelector<HTMLElement>(`[data-box="${active}"]`);
    const sc = frameScroll.current;
    if (el && sc) {
      const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
      if (r.top < s.top + 40 || r.bottom > s.bottom - 20) sc.scrollTo({ top: sc.scrollTop + r.top - s.top - s.height / 3, behavior: "smooth" });
    }
    if (p.step === "transcribe") textRef.current?.focus({ preventScroll: true });
  }, [active, p.step]);

  const submit = useCallback(() => {
    if (ready && !pending) formRef.current?.requestSubmit();
  }, [ready, pending]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (p.step === "transcribe" && cur && complete(p.step, answers[cur.id]) && todo > 0) return goNextOpen();
        if (ready) return submit();
        return goNextOpen();
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); return go(e.key === "ArrowDown" ? 1 : -1); }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j") return go(1);
      if (k === "k") return go(-1);
      if (!cur) return;
      if (p.step === "types" && /^[0-9]$/.test(k)) {
        const t = TYPES[k === "0" ? 9 : Number(k) - 1];
        if (t) { set(cur.id, { type: t[0] }); setTimeout(goNextOpen, 180); }
      }
      if (p.step === "compare" && revealed && cur.sets) {
        const a = answers[cur.id];
        const k0 = Math.max(0, (a.sets ?? []).findIndex((s) => !s.choice));
        const opts = cur.sets[k0] ?? [];
        if (k === "t") setSet(cur.id, k0, { choice: "tie" });
        else if (opts.some((o) => o.letter.toLowerCase() === k)) setSet(cur.id, k0, { choice: k.toUpperCase() });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.step, cur, answers, todo, ready, revealed, go, goNextOpen, submit, set, setSet]);

  const payload = JSON.stringify({
    blocks: Object.fromEntries(shown.map((b) => [b.id, { ...answers[b.id], ms: Math.round(timeOn.current[b.id] ?? 0) }])),
    missing,
    note: pageNote,
  });

  const a = cur ? answers[cur.id] : undefined;
  const [toast, setToast] = useState(p.saved ?? "");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="wb">
      {toast && <div className="toast" role="status"><Icon name="check" size={14} /> {toast}</div>}
      {/* ---------------- the frame ---------------- */}
      <section className="viewer" aria-label="The frame">
        <div className="vtools">
          <button type="button" className="btn ghost icon" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))} title="Zoom out" aria-label="Zoom out"><Icon name="zoomOut" /></button>
          <button type="button" className="btn ghost sm num" onClick={() => setZoom(1)} title="Fit to width" style={{ minWidth: 56 }}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="btn ghost icon" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))} title="Zoom in" aria-label="Zoom in"><Icon name="zoomIn" /></button>
          <span style={{ flex: 1 }} />
          {p.step !== "review" && (
            <button type="button" className={`chip${focusMode ? " on" : ""}`} onClick={() => setFocusMode((f) => !f)} title="Fade the other boxes">
              <Icon name="eye" size={14} /> Focus
            </button>
          )}
        </div>
        <div className="vscroll" ref={frameScroll}>
          <div className={`frame${focusMode && p.step !== "review" ? " dim" : ""}`} style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? Math.max(p.width, 420) : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/page-image/${p.pageId}`} alt="The frame" width={p.width} height={p.height} draggable={false} />
            {p.blocks.map((b) => {
              const [x0, y0, x1, y1] = b.box;
              const isShown = shown.some((x) => x.id === b.id);
              const done = p.step !== "review" && isShown && complete(p.step, answers[b.id]);
              return (
                <button
                  type="button"
                  key={b.id}
                  data-box={b.id}
                  className={`bx${active === b.id ? " on" : ""}${done ? " done" : ""}`}
                  style={{ left: `${(x0 / p.width) * 100}%`, top: `${(y0 / p.height) * 100}%`, width: `${((x1 - x0) / p.width) * 100}%`, height: `${((y1 - y0) / p.height) * 100}%`, opacity: isShown ? undefined : 0.3 }}
                  onClick={() => isShown && setActive(b.id)}
                  aria-label={`Text ${b.order + 1}`}
                >
                  <span className="n">{b.order + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- the task ---------------- */}
      <form
        ref={formRef}
        action={action}
        className="task"
        onSubmit={() => {
          if (msInput.current) msInput.current.value = String(Date.now() - started.current);
          try { localStorage.removeItem(draftKey); } catch {}
        }}
      >
        <input type="hidden" name="pageId" value={p.pageId} />
        <input type="hidden" name="step" value={p.step} />
        <input type="hidden" name="payload" value={payload} />
        <input type="hidden" name="ms" ref={msInput} defaultValue="0" />

        <div className="thead">
          <div className="row between">
            <nav className="seg" aria-label="Steps on this frame">
              {p.tabs.map((t) => (
                <Link key={t.step} href={`/rate/work?page=${p.pageId}&step=${t.step}`} className={t.step === p.step ? "on" : ""} aria-current={t.step === p.step ? "step" : undefined}>
                  <span className={`dot${t.done ? " done" : ""}`} />{STEP_SHORT[t.step]}
                </Link>
              ))}
            </nav>
            {restored && p.step !== "review" && <span className="pill violet" title="Restored from this browser">Draft restored</span>}
          </div>
          {p.step !== "review" && shown.length > 0 && (
            <div className="row between">
              <div className="blocknav" role="tablist" aria-label="Texts on this frame">
                {shown.map((b) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active === b.id}
                    key={b.id}
                    className={`bn${active === b.id ? " on" : ""}${complete(p.step, answers[b.id]) ? " done" : ""}`}
                    onClick={() => setActive(b.id)}
                  >
                    {b.order + 1}
                  </button>
                ))}
              </div>
              <span className="small muted num">{doneCount} of {shown.length} answered</span>
            </div>
          )}
        </div>

        <div className="tbody">
          {p.step === "compare" && !revealed && (
            <div className="callout info" style={{ marginBottom: 20 }}>
              <Icon name="lock" /> <span>If you like, write your own English for each text first. It is locked once you show the two versions.</span>
            </div>
          )}

          {p.step !== "review" && cur && a && (
            <div className="blk" key={cur.id}>
              <div className="blkhead">
                <div className="cropbox"><Crop pageId={p.pageId} width={p.width} height={p.height} box={cur.box} /></div>
                <div className="blkmeta">
                  <span className="label">Text {cur.order + 1} · {idx + 1} of {shown.length}</span>
                  {p.step === "compare" && cur.source != null && <div className="source korean" lang="ko">{cur.source || <span className="faint">(empty)</span>}</div>}
                  {p.step === "transcribe" && <p className="read muted" style={{ margin: 0 }}>Type it exactly as drawn, with the punctuation.</p>}
                  {p.step === "types" && <p className="read muted" style={{ margin: 0 }}>What is the text drawn in?</p>}
                </div>
              </div>

              {p.step === "types" && (
                <>
                  <div className="typegrid" role="radiogroup" aria-label="Type">
                    {TYPES.map(([v, n, d], i) => (
                      <button
                        type="button"
                        key={v}
                        role="radio"
                        aria-checked={a.type === v}
                        className={`typeopt${a.type === v ? " on" : ""}`}
                        onClick={() => { set(cur.id, { type: v }); setTimeout(goNextOpen, 180); }}
                      >
                        <span>{n}</span>
                        <small>{d}</small>
                        {i < 10 && <span className="kbd">{i === 9 ? 0 : i + 1}</span>}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    <span>Note (optional)</span>
                    <input type="text" value={a.note} onChange={(e) => set(cur.id, { note: e.target.value })} placeholder="e.g. could also be a scream" />
                  </label>
                </>
              )}

              {p.step === "transcribe" && (
                <>
                  <textarea
                    ref={textRef}
                    lang="ko"
                    className="ko-input"
                    value={a.text}
                    disabled={a.unreadable}
                    onChange={(e) => set(cur.id, { text: e.target.value })}
                    placeholder="한국어로 입력하세요"
                    aria-label={`Korean of text ${cur.order + 1}`}
                  />
                  <div className="row between">
                    <button type="button" className={`chip${a.unreadable ? " on" : ""}`} onClick={() => set(cur.id, { unreadable: !a.unreadable })} aria-pressed={!!a.unreadable}>
                      <Icon name="flag" size={14} /> I cannot read this
                    </button>
                    <span className="small faint"><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> next text</span>
                  </div>
                </>
              )}

              {p.step === "compare" && (
                <>
                  {p.askOwn && (
                    <label className="field">
                      <span>Your own English (optional){revealed && a.own ? " · locked" : ""}</span>
                      <textarea value={a.own} readOnly={revealed} onChange={(e) => set(cur.id, { own: e.target.value })} placeholder={revealed ? "" : "How would you letter this line?"} style={{ minHeight: 64 }} />
                    </label>
                  )}
                  {revealed &&
                    cur.sets!.map((opts, k) => (
                      <div key={k} className="compare-set">
                        {cur.sets!.length > 1 && <div className="setlabel" style={{ marginBottom: 10 }}><span className="label">Comparison {k + 1} of {cur.sets!.length}</span></div>}
                        <div className="pair">
                          {opts.map((o) => {
                            const chosen = a.sets![k].choice === o.letter;
                            return (
                              <div key={o.letter} className={`cand${chosen ? " on" : ""}`} onClick={() => setSet(cur.id, k, { choice: o.letter })} role="radio" aria-checked={chosen} tabIndex={0}
                                onKeyDown={(e) => { if (e.key === " " && e.target === e.currentTarget) { e.preventDefault(); setSet(cur.id, k, { choice: o.letter }); } }}>
                                <div className="ltr"><b>{o.letter}</b></div>
                                <div className="text">{o.text}</div>
                                <div className="tone" onClick={(e) => e.stopPropagation()} role="radiogroup" aria-label={`Tone of ${o.letter}`}>
                                  <span className="small muted" style={{ marginRight: 4 }}>Tone</span>
                                  {TONE.map((t) => (
                                    <button type="button" key={t} className={`chip ${t}${a.sets![k].tone[o.letter] === t ? " on" : ""}`} onClick={() => setSet(cur.id, k, { tone: { ...a.sets![k].tone, [o.letter]: t } })}>
                                      {TONE_LABEL[t]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="tierow" style={{ marginTop: 10, justifyContent: "space-between" }}>
                          <button type="button" className={`chip${a.sets![k].choice === "tie" ? " on" : ""}`} onClick={() => setSet(cur.id, k, { choice: "tie" })}>
                            Tie: equally good or equally bad
                          </button>
                          {k === 0 && <span className="hint"><span><span className="kbd">A</span><span className="kbd">B</span>choose</span><span><span className="kbd">T</span>tie</span><span><span className="kbd">J</span>next text</span></span>}
                        </div>
                      </div>
                    ))}
                  {revealed && (
                    <div className="row" style={{ marginTop: 4 }}>
                      <button type="button" className={`chip${a.sourceWrong ? " on" : ""}`} onClick={() => set(cur.id, { sourceWrong: !a.sourceWrong })} aria-pressed={!!a.sourceWrong}>
                        <Icon name="flag" size={14} /> Korean looks wrong
                      </button>
                      <input type="text" className="grow" value={a.comment} onChange={(e) => set(cur.id, { comment: e.target.value })} placeholder="Comment (optional)" style={{ minHeight: 28, padding: "4px 10px", fontSize: 13 }} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {p.step === "types" && (
            <div className="card tight" style={{ marginTop: 24, maxWidth: 760 }}>
              <label className="check">
                <input type="checkbox" checked={missing} onChange={(e) => { dirty.current = true; setMissing(e.target.checked); }} />
                There is text on this frame without a numbered box
              </label>
              {missing && (
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Where, and what kind?</span>
                  <input type="text" value={pageNote} onChange={(e) => { dirty.current = true; setPageNote(e.target.value); }} />
                </label>
              )}
            </div>
          )}

          {p.step === "review" && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="t review">
                <thead>
                  <tr>
                    <th>Text</th>
                    {p.reviewSteps.map((s) => (
                      <th key={s}>
                        {STEP_LABEL[s]} <Link href={`/rate/work?page=${p.pageId}&step=${s}`} className="faint" style={{ textTransform: "none", letterSpacing: 0, marginLeft: 4 }}>edit</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.blocks.map((b) => (
                    <tr key={b.id} onMouseEnter={() => setActive(b.id)} className={active === b.id ? "on" : ""}>
                      <td style={{ width: 140 }}>
                        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                          <span className="pill dark">{b.order + 1}</span>
                          <Crop pageId={p.pageId} width={p.width} height={p.height} box={b.box} maxW={90} maxH={56} />
                        </div>
                      </td>
                      {p.reviewSteps.map((s) => <td key={s} className="read">{summary(s, b.responses[s])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {p.step === "review" && p.missing && <div className="callout warn" style={{ marginTop: 12 }}><Icon name="flag" /> Text without a box: {p.pageNote || "yes"}</div>}
        </div>

        <div className="tfoot">
          {p.step !== "review" && shown.length > 1 && (
            <>
              <button type="button" className="btn icon" onClick={() => go(-1)} disabled={idx === 0} title="Previous text (K)" aria-label="Previous text"><Icon name="arrowL" /></button>
              <button type="button" className="btn icon" onClick={() => go(1)} disabled={idx === shown.length - 1} title="Next text (J)" aria-label="Next text"><Icon name="arrowR" /></button>
            </>
          )}
          <span className="grow small muted">
            {res && "error" in res ? <span className="err">{res.error}</span> : p.step === "review" ? (openSteps.length ? <>Finish {openSteps.map((t) => STEP_LABEL[t.step].toLowerCase()).join(" and ")} first.</> : "Everything looks right?") : todo > 0 ? `${todo} text${todo === 1 ? "" : "s"} left on this frame` : "All texts answered"}
          </span>
          {p.step === "compare" && !revealed ? (
            <button type="button" className="btn primary" onClick={() => { dirty.current = true; setRevealed(true); }}>
              Show the versions <Icon name="arrowR" />
            </button>
          ) : (
            <button className="btn primary" disabled={!ready || pending}>
              {pending ? "Saving…" : p.step === "review" ? "Confirm this frame" : "Save and continue"}
              {!pending && <span className="kbd">Ctrl ↵</span>}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
