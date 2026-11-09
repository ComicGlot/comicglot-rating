"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import Icon from "@/components/Icon";
import { useI18n } from "@/components/I18n";
import { fmt } from "@/lib/i18n";
import { saveTask } from "../actions";
import Workbench, { type WBTask } from "./Workbench";

export type RunTask = WBTask & { done: boolean; frame: number };

// Runs the frames of one set in the browser: moving on is instant and each save runs in the background.
// A failed save brings the rater back to that frame with the answers kept (they stay as a draft until saved).
export default function SetRunner({ tasks, start, after, frames }: { tasks: RunTask[]; start: number; after: string; frames: number }) {
  const router = useRouter();
  const { m } = useI18n();
  const [i, setI] = useState(start);
  const [done, setDone] = useState(() => tasks.map((t) => t.done));
  // The answers saved in this visit, per task and block, so going back shows them.
  const [latest, setLatest] = useState<Record<number, Record<string, Record<string, unknown>>>>({});
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const pending = useRef(new Set<Promise<void>>());
  const failed = useRef(false);

  const t = tasks[i];
  const keyOf = (x: RunTask) => `${x.pageId}:${x.step}`;

  // Keep the address on the current frame, so a reload or a bookmark comes back here.
  useEffect(() => {
    window.history.replaceState(null, "", `/rate/work?page=${t.pageId}&step=${t.step}`);
  }, [t.pageId, t.step]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(h);
  }, [toast]);

  // Fetch the next two frames' images ahead.
  for (const j of [i + 1, i + 2]) if (tasks[j] && tasks[j].pageId !== t.pageId) preload(`/api/page-image/${tasks[j].pageId}`, { as: "image" });

  const save = useCallback((payload: string, ms: number) => {
    const k = i, task = tasks[k], wasDone = done[k];
    const nowDone = done.map((x, j) => (j === k ? true : x));
    setDone(nowDone);
    setLatest((l) => ({ ...l, [k]: JSON.parse(payload).blocks }));
    setError("");
    failed.current = false;
    const back = (msg: string) => {
      failed.current = true;
      setDone((d) => d.map((x, j) => (j === k ? wasDone : x)));
      setError(msg);
      setLeaving(false);
      setI(k);
    };
    const job: Promise<void> = saveTask({ pageId: task.pageId, step: task.step, payload, ms })
      .then((r) => {
        if ("ok" in r) {
          try { localStorage.removeItem(`cg-draft:${keyOf(task)}`); } catch {}
          if (!wasDone) window.dispatchEvent(new CustomEvent("cg:progress", { detail: 1 }));
        } else back(fmt(m.errors[r.error], { n: r.n ?? "" }));
      })
      .catch(() => back(m.errors.network))
      .finally(() => { pending.current.delete(job); });
    pending.current.add(job);

    // The next open frame of this set, after this one; when none is left, leave once every save is in.
    const order = [...tasks.keys()].slice(k + 1).concat([...tasks.keys()].slice(0, k));
    const nx = order.find((j) => !nowDone[j]);
    if (nx !== undefined) {
      setI(nx);
      setToast(fmt(m.work.frameSaved, { n: task.frame }));
    } else {
      setLeaving(true);
      Promise.allSettled([...pending.current]).then(() => { if (!failed.current) router.push(after); });
    }
  }, [i, tasks, done, after, router, m]);

  const blocks = useMemo(() => {
    const l = latest[i];
    if (!l) return t.blocks;
    return t.blocks.map((b) => (l[b.id] ? { ...b, responses: { ...b.responses, [t.step]: l[b.id] } } : b));
  }, [latest, i, t]);

  const nav = (
    <div className="framenav">
      <button type="button" className="btn navbtn" onClick={() => setI(i - 1)} disabled={i === 0 || leaving} title={m.work.prevFrame}>
        <Icon name="arrowL" /> <span className="hide-sm">{m.work.prevFrame}</span>
      </button>
      <span className="fpos num">{fmt(m.work.frameOf, { n: t.frame, total: frames })}{done[i] && <Icon name="check" size={14} />}</span>
      <button type="button" className="btn navbtn" onClick={() => setI(i + 1)} disabled={i === tasks.length - 1 || leaving} title={m.work.nextFrame}>
        <span className="hide-sm">{m.work.nextFrame}</span> <Icon name="arrowR" />
      </button>
    </div>
  );

  return (
    <>
      {toast && <div className="toast" role="status"><Icon name="check" size={14} /> {toast}</div>}
      <Workbench
        key={`${keyOf(t)}:${error ? "e" : ""}`}
        {...t}
        blocks={blocks}
        onSave={save}
        busy={leaving}
        error={error}
        frameNav={tasks.length > 1 ? nav : undefined}
      />
    </>
  );
}
