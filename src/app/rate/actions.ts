"use server";
import { redirect } from "next/navigation";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeePage, loadPlan, setsFor } from "@/lib/flow";
import { STEP_ORDER, TONE, TYPES, type Step } from "@/lib/steps";

export type SaveResult = { error: string } | null;

const TYPE_SET = new Set<string>(TYPES.map(([v]) => v));
const TONE_SET = new Set<string>(TONE);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

type In = Record<string, unknown>;

// Saves one step of one page for the signed-in rater, then moves to the next task.
export async function saveStep(_: SaveResult, form: FormData): Promise<SaveResult> {
  const s = await requireRater();
  const pageId = String(form.get("pageId") ?? "");
  const step = String(form.get("step") ?? "") as Step;
  const ms = Math.max(0, Math.min(Number(form.get("ms")) || 0, 6 * 3600 * 1000));
  if (!STEP_ORDER.includes(step) || !(await canSeePage(s.sub, pageId))) return { error: "This page is not assigned to you." };

  let payload: { blocks?: Record<string, In>; missing?: boolean; note?: string };
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return { error: "The form could not be read. Reload the page." };
  }

  const page = await db.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { blocks: { include: { candidates: { select: { id: true, model: true } } } } },
  });
  const plan = (await loadPlan(s.sub)).find((c) => c.chapter.id === page.chapterId);
  const pageTodo = plan?.todo.filter((t) => t.pageId === pageId) ?? [];
  if (!pageTodo.some((t) => t.step === step)) return { error: "This step is not part of your tasks for this page." };

  const rows: { blockId: string; data: In }[] = [];
  const given = payload.blocks ?? {};

  if (step === "review") {
    const open = pageTodo.filter((t) => t.step !== "review" && !t.done);
    if (open.length) return { error: "Finish the other steps of this page first." };
  } else {
    for (const b of page.blocks) {
      const a = given[b.id] ?? {};
      if (step === "types") {
        const type = str(a.type, 40);
        if (!TYPE_SET.has(type)) return { error: `Choose a type for block ${b.order + 1}.` };
        rows.push({ blockId: b.id, data: { type, note: str(a.note, 300) || undefined } });
      } else if (step === "transcribe") {
        const unreadable = a.unreadable === true;
        const text = str(a.text, 1000);
        if (!unreadable && !text) return { error: `Type the text of block ${b.order + 1} or mark it unreadable.` };
        rows.push({ blockId: b.id, data: unreadable ? { text, unreadable } : { text } });
      } else if (step === "compare") {
        const sets = setsFor(s.sub, b.id, b.candidates);
        if (!sets.length) continue;
        const ans = Array.isArray(a.sets) ? (a.sets as In[]) : [];
        const out = [];
        for (const [k, set] of sets.entries()) {
          const x = ans[k] ?? {};
          const choice = str(x.choice, 8);
          if (choice !== "tie" && !(choice in set.letters)) return { error: `Choose a translation for block ${b.order + 1}.` };
          const toneIn = (x.tone ?? {}) as Record<string, unknown>;
          const tone = Object.fromEntries(Object.keys(set.letters).map((l) => [l, TONE_SET.has(String(toneIn[l])) ? String(toneIn[l]) : "fine"]));
          // Store the letters with their candidates, so the export can unblind without recomputing.
          out.push({ model: set.key || null, letters: set.letters, choice, tone });
        }
        rows.push({ blockId: b.id, data: { sets: out, own: str(a.own, 1000) || undefined, comment: str(a.comment, 500) || undefined } });
      }
    }
  }

  const missing = step === "types" && payload.missing === true;
  const note = step === "types" && missing ? str(payload.note, 500) || null : null;
  await db.$transaction([
    ...rows.map((r) =>
      db.response.upsert({
        where: { raterId_blockId_step: { raterId: s.sub, blockId: r.blockId, step } },
        create: { raterId: s.sub, blockId: r.blockId, step, data: r.data as object },
        update: { data: r.data as object },
      }),
    ),
    db.pageDone.upsert({
      where: { raterId_pageId_step: { raterId: s.sub, pageId, step } },
      create: { raterId: s.sub, pageId, step, missing, note, msSpent: ms },
      update: { missing, note, msSpent: { increment: ms } },
    }),
    // A change after the page was confirmed asks for a new confirmation.
    ...(step !== "review" ? [db.pageDone.deleteMany({ where: { raterId: s.sub, pageId, step: "review" } })] : []),
  ]);
  redirect("/rate/work");
}
