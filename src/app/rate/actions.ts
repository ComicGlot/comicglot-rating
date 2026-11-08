"use server";
import { redirect } from "next/navigation";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeePage, loadPlan, setsFor } from "@/lib/flow";
import { STEP_ORDER, TONE, TYPES, type Step } from "@/lib/steps";

// Errors are codes; the work screen shows them in the rater's language (messages.errors).
export type SaveError = "notAssigned" | "unreadableForm" | "notYourStep" | "finishOther" | "chooseType" | "typeOrUnreadable" | "chooseVersion" | "chooseTone";
export type SaveResult = { error: SaveError; n?: number } | null;

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
  if (!STEP_ORDER.includes(step) || !(await canSeePage(s.sub, pageId))) return { error: "notAssigned" };

  let payload: { blocks?: Record<string, In>; missing?: boolean; note?: string };
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return { error: "unreadableForm" };
  }

  const page = await db.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { blocks: { include: { candidates: { select: { id: true, model: true, text: true } } } } },
  });
  const plan = (await loadPlan(s.sub)).find((c) => c.chapter.id === page.chapterId);
  const pageTodo = plan?.todo.filter((t) => t.pageId === pageId) ?? [];
  if (!pageTodo.some((t) => t.step === step)) return { error: "notYourStep" };

  const rows: { blockId: string; data: In }[] = [];
  const given = payload.blocks ?? {};
  // Time on each text adds up over visits, so an edit later does not lose the first pass.
  const before = new Map(
    (await db.response.findMany({ where: { raterId: s.sub, step, block: { pageId } }, select: { blockId: true, data: true } }))
      .map((r) => [r.blockId, Number((r.data as In).ms) || 0]),
  );
  const msOf = (blockId: string, a: In) => (before.get(blockId) ?? 0) + Math.max(0, Math.min(Number(a.ms) || 0, 3600 * 1000)) || undefined;

  if (step === "review") {
    const open = pageTodo.filter((t) => t.step !== "review" && !t.done);
    if (open.length) return { error: "finishOther" };
  } else {
    for (const b of page.blocks) {
      const a = given[b.id] ?? {};
      if (step === "types") {
        const type = str(a.type, 40);
        if (!TYPE_SET.has(type)) return { error: "chooseType", n: b.order + 1 };
        rows.push({ blockId: b.id, data: { type, note: str(a.note, 300) || undefined, ms: msOf(b.id, a) } });
      } else if (step === "transcribe") {
        const unreadable = a.unreadable === true;
        const text = str(a.text, 1000);
        if (!unreadable && !text) return { error: "typeOrUnreadable", n: b.order + 1 };
        rows.push({ blockId: b.id, data: { text, ...(unreadable ? { unreadable } : {}), ms: msOf(b.id, a) } });
      } else if (step === "compare") {
        const sets = setsFor(s.sub, b.id, b.candidates);
        if (!sets.length) continue;
        const ans = Array.isArray(a.sets) ? (a.sets as In[]) : [];
        const out = [];
        for (const [k, set] of sets.entries()) {
          const x = ans[k] ?? {};
          const choice = str(x.choice, 8);
          if (choice !== "tie" && !(choice in set.letters)) return { error: "chooseVersion", n: b.order + 1 };
          const toneIn = (x.tone ?? {}) as Record<string, unknown>;
          // Tone is a required answer for every version; nothing is filled in for the rater.
          if (Object.keys(set.letters).some((l) => !TONE_SET.has(String(toneIn[l])))) return { error: "chooseTone", n: b.order + 1 };
          const tone = Object.fromEntries(Object.keys(set.letters).map((l) => [l, String(toneIn[l])]));
          // Store the letters with their candidates, so the export can unblind without recomputing.
          out.push({ model: set.key || null, letters: set.letters, choice, tone });
        }
        rows.push({
          blockId: b.id,
          data: { sets: out, own: str(a.own, 1000) || undefined, comment: str(a.comment, 500) || undefined, sourceWrong: a.sourceWrong === true || undefined, ms: msOf(b.id, a) },
        });
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
  redirect(`/rate/work?saved=${step}`);
}
