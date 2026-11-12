"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useI18n } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n";
import { TONE, TYPES, type Step } from "@/lib/steps";
import RankBoard from "./RankBoard";

export type WBBlock = {
  id: string;
  order: number;
  box: [number, number, number, number];
  responses: Record<string, Record<string, unknown>>;
  source?: string;
  // compare step only: comparison sets, each a list of lettered candidates
  sets?: { letter: string; text: string }[][];
  // compare step, ranking mode: the versions to put in order, best first
  cards?: { letter: string; text: string }[];
  // has something to compare (for the review table)
  cmp?: boolean;
};

export type WBTask = {
  pageId: string;
  width: number;
  height: number;
  step: Step;
  blocks: WBBlock[];
  askOwn: boolean;
  // compare step ranks several versions instead of choosing between two
  ranking?: boolean;
  missing: boolean;
  pageNote: string;
  tabs: { step: Step; done: boolean }[];
  reviewSteps: Step[];
};

type Props = WBTask & {
  // Called with the answers once the frame is complete; the set runner saves them and moves on.
  onSave: (payload: string, ms: number) => void;
  busy: boolean;
  error?: string;
  frameNav?: React.ReactNode;
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
  // ranking mode: groups of letters, best first (letters in one group are tied), and the number of cards
  groups?: string[][];
  need?: number;
  moves?: number;
  first?: string[];
};

function initial(step: Step, b: WBBlock): Answer {
  const r = (b.responses[step] ?? {}) as Answer & { sets?: (SetAnswer & { letters?: unknown })[]; ranking?: { groups?: string[][] } };
  if (step === "compare" && b.cards) {
    // A saved ranking comes back as stored; a draft or an answer of this visit has the groups at the top level.
    const groups = r.groups ?? r.ranking?.groups ?? [];
    return { comment: r.comment ?? "", sourceWrong: !!r.sourceWrong, groups, need: b.cards.length, moves: r.moves ?? 0, first: r.first ?? [] };
  }
  if (step === "compare") {
    // Nothing is preselected: the choice and the tone of every version are answers the rater gives.
    const sets = (b.sets ?? []).map((opts, k) => ({
      choice: r.sets?.[k]?.choice ?? "",
      tone: Object.fromEntries(opts.map((o) => [o.letter, r.sets?.[k]?.tone?.[o.letter] ?? ""])),
    }));
    return { own: r.own ?? "", comment: r.comment ?? "", sourceWrong: !!r.sourceWrong, sets };
  }
  if (step === "types") return { type: r.type ?? "", note: r.note ?? "" };
  if (step === "transcribe") return { text: r.text ?? "", unreadable: !!r.unreadable };
  return {};
}

const setDone = (s: SetAnswer) => !!s.choice && Object.values(s.tone).every((t) => !!t);

function complete(step: Step, a: Answer | undefined): boolean {
  if (!a) return false;
  if (step === "types") return !!a.type;
  if (step === "transcribe") return !!a.unreadable || !!a.text?.trim();
  if (step === "compare" && a.groups) return !!a.need && a.groups.flat().length === a.need;
  if (step === "compare") return (a.sets ?? []).length > 0 && (a.sets ?? []).every(setDone);
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

const typing = (t: EventTarget | null) => !!t && /INPUT|TEXTAREA|SELECT/.test((t as HTMLElement).tagName);

function QHead({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="qhead">
      <span className="qnum">{done ? <Icon name="check" size={12} /> : n}</span>
      <span>{children}</span>
    </div>
  );
}

export default function Workbench(p: Props) {
  const { locale, m } = useI18n();
  const draftKey = `cg-draft:${p.pageId}:${p.step}`;
  const started = useRef(Date.now());
  const frameScroll = useRef<HTMLDivElement>(null);
  const taskScroll = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  const shown = useMemo(() => p.blocks.filter((b) => p.step !== "compare" || b.sets?.length || b.cards?.length), [p.blocks, p.step]);
  // The review table lists a text only if one of the steps has something to do on it.
  const reviewBlocks = useMemo(() => p.blocks.filter((b) => p.reviewSteps.some((s) => s !== "compare" || b.cmp)), [p.blocks, p.reviewSteps]);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(p.blocks.map((b) => [b.id, initial(p.step, b)])));
  const [missing, setMissing] = useState(p.missing);
  const [pageNote, setPageNote] = useState(p.pageNote);
  const [active, setActive] = useState<string | null>(() => (shown.find((b) => !complete(p.step, initial(p.step, b))) ?? shown[0])?.id ?? null);
  const [revealed, setRevealed] = useState(!p.askOwn || shown.some((b) => b.responses.compare));
  const [zoom, setZoom] = useState(1);
  const [focusMode, setFocusMode] = useState(true);
  const [restored, setRestored] = useState(false);

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
      sets[k] = { ...sets[k], ...patch, tone: { ...sets[k].tone, ...(patch.tone ?? {}) } };
      return { ...a, [id]: { ...a[id], sets } };
    });
  }, []);

  const idx = Math.max(0, shown.findIndex((b) => b.id === active));
  const cur = shown[idx];
  const doneCount = shown.filter((b) => complete(p.step, answers[b.id])).length;
  const todo = shown.length - doneCount;
  const openSteps = p.tabs.filter((t) => t.step !== "review" && !t.done);
  const ready = p.step === "review" ? openSteps.length === 0 : p.step === "compare" ? revealed && todo === 0 : todo === 0;
  const curDone = !!cur && complete(p.step, answers[cur.id]);

  const go = useCallback((d: number) => {
    const n = shown[Math.min(shown.length - 1, Math.max(0, idx + d))];
    if (n) setActive(n.id);
  }, [shown, idx]);
  const goNextOpen = useCallback(() => {
    const after = [...shown.slice(idx + 1), ...shown.slice(0, idx)].find((b) => !complete(p.step, answers[b.id]));
    if (after) setActive(after.id);
  }, [shown, idx, answers, p.step]);

  const payload = () => JSON.stringify({
    blocks: Object.fromEntries(shown.map((b) => [b.id, { ...answers[b.id], ms: Math.round(timeOn.current[b.id] ?? 0) }])),
    missing,
    note: pageNote,
  });
  const submit = () => {
    if (!ready || p.busy) return;
    const prev = since.current;
    if (prev.id) timeOn.current[prev.id] = (timeOn.current[prev.id] ?? 0) + (Date.now() - prev.t);
    since.current = { id: active, t: Date.now() };
    p.onSave(payload(), Date.now() - started.current);
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Answer one comparison. When the text is complete, the next-step button (next text, or save) comes into view;
  // the rater moves on themselves.
  const answer = useCallback((id: string, k: number, patch: Partial<SetAnswer>) => {
    const old = answers[id]?.sets?.[k];
    setSet(id, k, patch);
    if (!old) return;
    const now = { ...old, ...patch, tone: { ...old.tone, ...(patch.tone ?? {}) } };
    const rest = (answers[id].sets ?? []).every((s, j) => j === k || setDone(s));
    if (setDone(now) && !setDone(old) && rest) setTimeout(() => saveRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  }, [answers, setSet]);

  // Ranking mode (RankBoard does the dragging). Each change is kept for Undo and counted: the number of moves and
  // the order in which versions were first placed are stored with the answer, as signs of how a rater worked.
  const history = useRef<Record<string, string[][][]>>({});
  const setGroups = useCallback((b: WBBlock, next: string[][], move?: string) => {
    const a = answers[b.id];
    const was = complete("compare", a);
    history.current[b.id] = [...(history.current[b.id] ?? []), a?.groups ?? []].slice(-50);
    const first = [...(a?.first ?? [])];
    for (const l of next.flat()) if (!first.includes(l)) first.push(l);
    set(b.id, { groups: next, moves: (a?.moves ?? 0) + (move ? 1 : 0), first });
    const rest = shown.every((x) => x.id === b.id || complete("compare", answers[x.id]));
    if (!was && next.flat().length === (b.cards?.length ?? 0) && rest) setTimeout(() => saveRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
  }, [answers, set, shown]);
  const undoRank = useCallback((b: WBBlock) => {
    const h = history.current[b.id] ?? [];
    if (!h.length) return;
    const prev = h[h.length - 1];
    history.current[b.id] = h.slice(0, -1);
    set(b.id, { groups: prev, moves: (answers[b.id]?.moves ?? 0) + 1 });
  }, [answers, set]);

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

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && p.step === "compare" && cur?.cards && !typing(e.target)) {
        e.preventDefault();
        return undoRank(cur);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (p.step === "transcribe" && cur && complete(p.step, answers[cur.id]) && todo > 0) return goNextOpen();
        if (ready) return submitRef.current();
        return goNextOpen();
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); return go(e.key === "ArrowDown" ? 1 : -1); }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter" && p.step !== "transcribe") {
        // Enter does the obvious next thing: save a finished frame, or go to the next open text.
        if ((e.target as HTMLElement)?.tagName === "BUTTON") return;
        e.preventDefault();
        if (ready) return submitRef.current();
        if (curDone) return goNextOpen();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "j") return go(1);
      if (k === "k") return go(-1);
      if (!cur) return;
      if (p.step === "types" && /^[0-9]$/.test(k)) {
        const t = TYPES[k === "0" ? 9 : Number(k) - 1];
        if (t) { set(cur.id, { type: t[0] }); setTimeout(goNextOpen, 180); }
      }
      if (p.step === "compare" && cur.cards) {
        // A letter picks up that version (focuses it); its own keys then place it. Ctrl+Z undoes.
        const c = cur.cards.find((o) => o.letter.toLowerCase() === k);
        if (c) { e.preventDefault(); document.querySelector<HTMLElement>(`[data-card="${c.letter}"]`)?.focus(); }
        return;
      }
      if (p.step === "compare" && revealed && cur.sets) {
        const a = answers[cur.id];
        const k0 = Math.max(0, (a.sets ?? []).findIndex((s) => !setDone(s)));
        const opts = cur.sets[k0] ?? [];
        if (k === "e" || k === "t") answer(cur.id, k0, { choice: "tie" });
        else if (opts.some((o) => o.letter.toLowerCase() === k)) answer(cur.id, k0, { choice: k.toUpperCase() });
        else if (/^[1-6]$/.test(k)) {
          // 1 2 3: tone of the first version; 4 5 6: of the second
          const n = Number(k) - 1, letter = opts[Math.floor(n / 3)]?.letter;
          if (letter) answer(cur.id, k0, { tone: { [letter]: TONE[n % 3] } });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.step, cur, curDone, answers, todo, ready, revealed, go, goNextOpen, set, answer, undoRank]);

  const a = cur ? answers[cur.id] : undefined;

  const summary = (step: Step, data: Record<string, unknown> | undefined): React.ReactNode => {
    if (!data) return <span className="faint">{m.work.review.notDone}</span>;
    const d = data as Answer;
    if (step === "types") return <>{m.types[d.type as keyof typeof m.types]?.[0] ?? d.type}{d.note ? <span className="muted"> · {d.note}</span> : null}</>;
    if (step === "transcribe") return d.unreadable ? <span className="pill warn">{m.work.review.unreadable}</span> : <span className="korean">{d.text}</span>;
    if (step === "compare" && (d.groups || (data as { ranking?: unknown }).ranking)) {
      const g = d.groups ?? (data as { ranking: { groups: string[][] } }).ranking.groups;
      return <>{g.map((x) => x.join(" = ")).join(" › ")}</>;
    }
    if (step === "compare") {
      const c = (d.sets ?? []).map((s) => (s.choice === "tie" ? m.work.review.equal : s.choice)).join(", ");
      return (
        <>
          {c ? fmt(m.work.review.chose, { c }) : "—"}
          {d.sourceWrong ? <span className="pill warn" style={{ marginLeft: 6 }}>{m.work.koreanWrong}</span> : null}
          {d.own ? <div className="muted read small">{fmt(m.work.review.own, { t: d.own })}</div> : null}
        </>
      );
    }
    return null;
  };

  const stepNames = (ss: { step: Step }[]) => ss.map((t) => m.steps[t.step].label.toLowerCase()).join(` ${m.work.and} `);
  const saveLabel = p.step === "review" ? m.work.confirm : m.work.saveNext;

  return (
    <div className="wb">
      {/* ---------------- the frame ---------------- */}
      <section className="viewer" aria-label={m.work.theFrame}>
        <div className="vtools">
          <button type="button" className="btn ghost icon" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))} title={m.work.zoomOut} aria-label={m.work.zoomOut}><Icon name="zoomOut" /></button>
          <button type="button" className="btn ghost sm num" onClick={() => setZoom(1)} title={m.work.fit} style={{ minWidth: 56 }}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="btn ghost icon" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))} title={m.work.zoomIn} aria-label={m.work.zoomIn}><Icon name="zoomIn" /></button>
          <span style={{ flex: 1 }} />
          {p.step !== "review" && (
            <button type="button" className={`chip${focusMode ? " on" : ""}`} onClick={() => setFocusMode((f) => !f)} title={m.work.focusTitle}>
              <Icon name="eye" size={14} /> {m.work.focus}
            </button>
          )}
        </div>
        <div className="vscroll" ref={frameScroll}>
          <div className={`frame${focusMode && p.step !== "review" ? " dim" : ""}`} style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? Math.max(p.width, 420) : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/page-image/${p.pageId}`} alt={m.work.theFrame} width={p.width} height={p.height} draggable={false} />
            {/* Only the texts of this task get a box; others on the page are not part of it. */}
            {(p.step === "review" ? reviewBlocks : shown).map((b) => {
              const [x0, y0, x1, y1] = b.box;
              const done = p.step !== "review" && complete(p.step, answers[b.id]);
              return (
                <button
                  type="button"
                  key={b.id}
                  data-box={b.id}
                  className={`bx${active === b.id ? " on" : ""}${done ? " done" : ""}`}
                  style={{ left: `${(x0 / p.width) * 100}%`, top: `${(y0 / p.height) * 100}%`, width: `${((x1 - x0) / p.width) * 100}%`, height: `${((y1 - y0) / p.height) * 100}%` }}
                  onClick={() => setActive(b.id)}
                  aria-label={`${m.work.review.text} ${b.order + 1}`}
                >
                  <span className="n">{b.order + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- the task ---------------- */}
      <div className="task">
        <div className="thead">
          {(p.frameNav || p.tabs.length > 1) && (
            <div className="row between">
              {p.frameNav}
              {p.tabs.length > 1 && (
                <nav className="seg" aria-label={m.work.title}>
                  {p.tabs.map((t) => (
                    <Link key={t.step} href={`/rate/work?page=${p.pageId}&step=${t.step}`} className={t.step === p.step ? "on" : ""} aria-current={t.step === p.step ? "step" : undefined}>
                      <span className={`dot${t.done ? " done" : ""}`} />{m.steps[t.step].short}
                    </Link>
                  ))}
                </nav>
              )}
              {restored && p.step !== "review" && <span className="pill violet">{m.work.draftRestored}</span>}
            </div>
          )}
          {p.step !== "review" && shown.length > 1 && (
            <div className="row between">
              <div className="blocknav" role="tablist">
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
              <span className="small muted num">{fmt(m.work.answered, { done: doneCount, total: shown.length })}</span>
            </div>
          )}
        </div>

        <div className="tbody" ref={taskScroll}>
          {p.step === "compare" && !revealed && (
            <div className="callout info" style={{ marginBottom: 20 }}>
              <Icon name="lock" /> <span>{m.work.writeOwnFirst}</span>
            </div>
          )}

          {p.step !== "review" && cur && a && (
            <div className="blk" key={cur.id}>
              <div className="blkhead">
                <div className="cropbox"><Crop pageId={p.pageId} width={p.width} height={p.height} box={cur.box} maxH={p.step === "compare" && revealed ? 150 : 220} /></div>
                <div className="blkmeta">
                  <span className="label">{fmt(m.work.textOf, { n: cur.order + 1, i: idx + 1, total: shown.length })}</span>
                  {p.step === "compare" && cur.source != null && <div className="source korean" lang="ko">{cur.source || <span className="faint">—</span>}</div>}
                  {p.step === "transcribe" && <p className="read muted" style={{ margin: 0 }}>{m.work.typeExactly}</p>}
                  {p.step === "types" && <p className="read muted" style={{ margin: 0 }}>{m.steps.types.help}</p>}
                </div>
              </div>

              {p.step === "types" && (
                <div className={`q${a.type ? " done" : ""}`}>
                  <QHead n={1} done={!!a.type}>{m.work.whatDrawnIn}</QHead>
                  <div className="typegrid" role="radiogroup" aria-label={m.work.whatDrawnIn}>
                    {TYPES.map(([v], i) => (
                      <button
                        type="button"
                        key={v}
                        role="radio"
                        aria-checked={a.type === v}
                        className={`typeopt${a.type === v ? " on" : ""}`}
                        onClick={() => { set(cur.id, { type: v }); setTimeout(goNextOpen, 180); }}
                      >
                        <span>{m.types[v][0]}</span>
                        <small>{m.types[v][1]}</small>
                        {i < 10 && <span className="kbd">{i === 9 ? 0 : i + 1}</span>}
                      </button>
                    ))}
                  </div>
                  <label className="field" style={{ marginTop: 12 }}>
                    <span>{m.work.note}</span>
                    <input type="text" value={a.note} onChange={(e) => set(cur.id, { note: e.target.value })} placeholder={m.work.notePlaceholder} />
                  </label>
                </div>
              )}

              {p.step === "transcribe" && (
                <div className={`q${complete("transcribe", a) ? " done" : ""}`}>
                  <QHead n={1} done={complete("transcribe", a)}>{m.work.koreanLabel}</QHead>
                  <textarea
                    ref={textRef}
                    lang="ko"
                    className="ko-input"
                    value={a.text}
                    disabled={a.unreadable}
                    onChange={(e) => set(cur.id, { text: e.target.value })}
                    placeholder={m.work.koreanPlaceholder}
                    aria-label={m.work.koreanLabel}
                  />
                  <div className="or">{m.work.or}</div>
                  <button type="button" className={`optrow${a.unreadable ? " on" : ""}`} onClick={() => set(cur.id, { unreadable: !a.unreadable })} aria-pressed={!!a.unreadable}>
                    <span className="box">{a.unreadable && <Icon name="check" size={12} />}</span>
                    <span>{m.work.cannotRead}<small>{m.work.cannotReadHint}</small></span>
                  </button>
                  <div className="hint" style={{ marginTop: 12 }}>
                    <span><span className="kbd">Ctrl</span><span className="kbd">Enter</span>{m.work.keys.nextOrSave}</span>
                  </div>
                </div>
              )}

              {p.step === "compare" && cur.cards && (
                <>
                  <QHead n={1} done={complete("compare", a)}>{m.ranking.q}</QHead>
                  <RankBoard cards={cur.cards} groups={a.groups ?? []} onChange={(g, move) => setGroups(cur, g, move)} scroller={() => taskScroll.current} />
                  <div className="extras">
                    <button type="button" className="btn ghost sm" onClick={() => undoRank(cur)} disabled={!(history.current[cur.id]?.length)}><Icon name="arrowL" size={14} /> {m.ranking.undo}</button>
                    <button type="button" className="btn ghost sm" onClick={() => setGroups(cur, [], "clear")} disabled={!(a.groups ?? []).length}>{m.ranking.clear}</button>
                    <span style={{ flex: 1 }} />
                    <button type="button" className={`chip${a.sourceWrong ? " on" : ""}`} onClick={() => set(cur.id, { sourceWrong: !a.sourceWrong })} aria-pressed={!!a.sourceWrong}>
                      <Icon name="flag" size={14} /> {m.work.koreanWrong}
                    </button>
                  </div>
                  <input type="text" className="grow" value={a.comment} onChange={(e) => set(cur.id, { comment: e.target.value })} placeholder={m.work.comment} style={{ width: "100%", marginTop: 8, minHeight: 30, padding: "4px 10px", fontSize: 13 }} />
                </>
              )}

              {p.step === "compare" && !cur.cards && (
                <>
                  {/* Once the versions are shown an empty own translation is locked and only takes room. */}
                  {p.askOwn && (!revealed || !!a.own) && (
                    <label className="field">
                      <span>{m.work.ownEnglish}{revealed && a.own ? ` · ${m.work.ownLocked}` : ""}</span>
                      <textarea value={a.own} readOnly={revealed} onChange={(e) => set(cur.id, { own: e.target.value })} placeholder={revealed ? "" : m.work.ownPlaceholder} style={{ minHeight: 64 }} />
                    </label>
                  )}
                  {revealed &&
                    cur.sets!.map((opts, k) => {
                      const st = a.sets![k];
                      return (
                        <div key={k} className="compare-set">
                          {cur.sets!.length > 1 && <div className="setlabel" style={{ marginBottom: 10 }}><span className="label">{fmt(m.work.comparison, { k: k + 1, n: cur.sets!.length })}</span></div>}
                          <QHead n={1} done={!!st.choice}>{m.work.q1}</QHead>
                          {/* "Equal" first, then the versions: each version card is the button that chooses it. */}
                          <button
                            type="button"
                            role="radio"
                            aria-checked={st.choice === "tie"}
                            className={`opt equal${st.choice === "tie" ? " on" : ""}`}
                            onClick={() => answer(cur.id, k, { choice: "tie" })}
                          >
                            <span>{m.work.equal} <small>· {m.work.equalHint}</small></span>
                            <span className="kbd">E</span>
                          </button>
                          <div className="versions" role="radiogroup" aria-label={m.work.q1}>
                            {opts.map((o) => (
                              <button
                                type="button"
                                key={o.letter}
                                role="radio"
                                aria-checked={st.choice === o.letter}
                                className={`version pick${st.choice === o.letter ? " win" : ""}${st.choice && st.choice !== o.letter && st.choice !== "tie" ? " lose" : ""}${st.choice === "tie" ? " tie" : ""}`}
                                onClick={() => answer(cur.id, k, { choice: o.letter })}
                              >
                                <div className="ltr">
                                  <b>{o.letter}</b>
                                  {st.choice === o.letter ? <span className="badge"><Icon name="check" size={12} /> {m.work.better}</span> : st.choice === "tie" ? <span className="badge">=</span> : <span className="kbd">{o.letter}</span>}
                                </div>
                                <div className="text">{o.text}</div>
                              </button>
                            ))}
                          </div>
                          {/* Tone, one row per version, in the same columns as the cards above. */}
                          <QHead n={2} done={Object.values(st.tone).every((t) => !!t)}>{m.work.q2}</QHead>
                          <div className="versions tones">
                            {opts.map((o, oi) => {
                              const tone = st.tone[o.letter];
                              return (
                                <div key={o.letter} className={`tone3${tone ? " done" : ""}`} role="radiogroup" aria-label={fmt(m.work.version, { l: o.letter })}>
                                  <span className="tcap"><b>{o.letter}</b></span>
                                  <div className="tbtns">
                                    {TONE.map((t, ti) => (
                                      <button
                                        type="button"
                                        key={t}
                                        role="radio"
                                        aria-checked={tone === t}
                                        className={`tbtn tone-${t}${tone === t ? " on" : ""}`}
                                        onClick={() => answer(cur.id, k, { tone: { [o.letter]: t } })}
                                        title={m.tone[`${t}Help`]}
                                      >
                                        {m.tone[t]}
                                        {oi < 2 && <span className="kbd">{oi * 3 + ti + 1}</span>}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  {revealed && (
                    <div className="extras">
                      <button type="button" className={`chip${a.sourceWrong ? " on" : ""}`} onClick={() => set(cur.id, { sourceWrong: !a.sourceWrong })} aria-pressed={!!a.sourceWrong}>
                        <Icon name="flag" size={14} /> {m.work.koreanWrong}
                      </button>
                      <input type="text" className="grow" value={a.comment} onChange={(e) => set(cur.id, { comment: e.target.value })} placeholder={m.work.comment} style={{ minHeight: 28, padding: "4px 10px", fontSize: 13 }} />
                    </div>
                  )}
                </>
              )}

              {/* The obvious next step, right where the answer was given. */}
              {(p.step !== "compare" || revealed) && (ready ? (
                <button type="button" ref={saveRef} className="btn primary nextbig" onClick={submit} disabled={p.busy}>
                  {p.busy ? m.work.saving : saveLabel} <Icon name="arrowR" /> <span className="kbd">↵</span>
                </button>
              ) : curDone && todo > 0 ? (
                <button type="button" ref={saveRef} className="btn primary nextbig" onClick={goNextOpen}>
                  {m.work.nextText} <Icon name="arrowR" /> <span className="kbd">↵</span>
                </button>
              ) : null)}

              {p.step === "compare" && cur.cards && (
                <div className="hint" style={{ marginTop: 12 }}>
                  <span><span className="kbd">A</span>…<span className="kbd">F</span>{m.ranking.keys.pick}</span>
                  <span><span className="kbd">1</span>…<span className="kbd">6</span>{m.ranking.keys.place}</span>
                  <span><span className="kbd">←</span><span className="kbd">→</span>{m.ranking.keys.move}</span>
                  <span><span className="kbd">=</span>{m.ranking.keys.tie}</span>
                  <span><span className="kbd">⌫</span>{m.ranking.keys.out}</span>
                  <span><span className="kbd">↵</span>{m.work.keys.enter}</span>
                </div>
              )}
              {p.step === "compare" && revealed && !cur.cards && (
                <div className="hint" style={{ marginTop: 12 }}>
                  <span><span className="kbd">E</span>{m.work.keys.equal}</span>
                  <span><span className="kbd">A</span><span className="kbd">B</span>{m.work.keys.choose}</span>
                  <span><span className="kbd">1 2 3</span> / <span className="kbd">4 5 6</span>{m.work.keys.tone}</span>
                  <span><span className="kbd">↵</span>{m.work.keys.enter}</span>
                </div>
              )}
            </div>
          )}

          {p.step === "types" && (
            <div className="card tight" style={{ marginTop: 16, maxWidth: 760 }}>
              <label className="check">
                <input type="checkbox" checked={missing} onChange={(e) => { dirty.current = true; setMissing(e.target.checked); }} />
                {m.work.missingBox}
              </label>
              {missing && (
                <label className="field" style={{ marginTop: 10 }}>
                  <span>{m.work.whereWhat}</span>
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
                    <th>{m.work.review.text}</th>
                    {p.reviewSteps.map((s) => (
                      <th key={s}>
                        {m.steps[s].label} <Link href={`/rate/work?page=${p.pageId}&step=${s}`} className="faint" style={{ textTransform: "none", letterSpacing: 0, marginLeft: 4 }}>{m.work.review.edit}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewBlocks.map((b) => (
                    <tr key={b.id} onMouseEnter={() => setActive(b.id)}>
                      <td style={{ width: 140 }}>
                        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                          <span className="pill dark">{b.order + 1}</span>
                          <Crop pageId={p.pageId} width={p.width} height={p.height} box={b.box} maxW={90} maxH={56} />
                        </div>
                      </td>
                      {p.reviewSteps.map((s) => <td key={s} className="read">{s === "compare" && !b.cmp ? <span className="faint">—</span> : summary(s, b.responses[s])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {p.step === "review" && p.missing && <div className="callout warn" style={{ marginTop: 12 }}><Icon name="flag" /> {fmt(m.work.textWithoutBox, { note: p.pageNote || m.work.yes })}</div>}
        </div>

        <div className="tfoot">
          {p.step !== "review" && shown.length > 1 && (
            <>
              <button type="button" className="btn navbtn" onClick={() => go(-1)} disabled={idx === 0} title={`${m.work.prev} (K)`}><Icon name="arrowL" /> {m.work.prev}</button>
              <button type="button" className="btn navbtn" onClick={() => go(1)} disabled={idx === shown.length - 1} title={`${m.work.next} (J)`}>{m.work.next} <Icon name="arrowR" /></button>
            </>
          )}
          <span className="grow small muted">
            {p.error ? <span className="err">{p.error}</span>
              : p.step === "review" ? (openSteps.length ? fmt(m.work.finishFirst, { steps: stepNames(openSteps) }) : m.work.allRight)
              : todo > 0 ? plural(locale, m.work.left, todo) : m.work.allAnswered}
          </span>
          {p.step === "compare" && !revealed ? (
            <button type="button" className="btn primary" onClick={() => { dirty.current = true; setRevealed(true); }}>
              {m.work.showVersions} <Icon name="arrowR" />
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={!ready || p.busy} onClick={submit}>
              {p.busy ? m.work.saving : saveLabel}
              {!p.busy && <span className="kbd">↵</span>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
