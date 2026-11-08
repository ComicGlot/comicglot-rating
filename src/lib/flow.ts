import { db } from "./db";
import { LETTERS, shuffled } from "./shuffle";
import { ATTENTION_MODEL, effectiveSteps, type Step } from "./steps";

export type Task = { chapterId: string; pageId: string; step: Step } | null;

type PageInfo = { id: string; index: number; blocks: { candidates: Cand[] }[] };

// Does this step have anything to do on this page?
function applicable(step: Step, p: PageInfo): boolean {
  if (p.blocks.length === 0) return false;
  if (step === "compare") return p.blocks.some((b) => comparable(b.candidates));
  return true;
}

// Candidates of a block are compared within groups of the same model: e.g. "guide" against "no_type"
// from one model. A block can be compared when some group has two or more candidates.
// A group whose versions are the same text is never shown: the only possible answer would be "equal",
// and the share of such pairs (the guide changed nothing) is counted apart on the results page.
// Attention checks are identical on purpose and are kept.
export type Cand = { id: string; model: string | null; text?: string };
export const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
function groupsOf(cands: Cand[]): Map<string, string[]> {
  const g = new Map<string, Cand[]>();
  for (const c of cands) g.set(c.model ?? "", [...(g.get(c.model ?? "") ?? []), c]);
  const out = new Map<string, string[]>();
  for (const [k, v] of g) {
    if (v.length < 2) continue;
    const identical = v.every((c) => c.text !== undefined && sameText(c.text, v[0].text!));
    if (identical && k !== ATTENTION_MODEL) continue;
    out.set(k, v.map((c) => c.id));
  }
  return out;
}
export function comparable(cands: Cand[]): boolean {
  return groupsOf(cands).size > 0;
}

// The comparison sets a rater sees for a block, in a per-rater order, each with its own letters.
// Deterministic, so the server can rebuild them when a form comes back.
export function setsFor(raterId: string, blockId: string, cands: Cand[]): { key: string; letters: Record<string, string> }[] {
  const g = groupsOf(cands);
  return shuffled([...g.keys()].sort(), `${raterId}:${blockId}:sets`).map((key) => ({
    key,
    letters: lettersFor(raterId, `${blockId}:${key}`, g.get(key)!),
  }));
}

// Chapters of a rater with the page-by-step tasks in order. A blocked rater has none, except for the admin view.
export async function loadPlan(raterId: string, forAdmin = false) {
  const rater = await db.rater.findUnique({ where: { id: raterId } });
  if (!rater || (!rater.active && !forAdmin)) return [];
  const assignments = await db.chapterAssignment.findMany({
    where: { raterId, chapter: { study: { active: true } } },
    orderBy: { position: "asc" },
    include: {
      chapter: {
        include: {
          study: true,
          pages: {
            orderBy: { index: "asc" },
            select: { id: true, index: true, blocks: { select: { candidates: { select: { id: true, model: true, text: true } } } } },
          },
        },
      },
    },
  });
  const done = new Set(
    (await db.pageDone.findMany({ where: { raterId }, select: { pageId: true, step: true } })).map((d) => `${d.pageId}:${d.step}`),
  );
  // Practice sets come first, whatever their position.
  assignments.sort((a, b) => Number(b.chapter.practice) - Number(a.chapter.practice) || a.position - b.position);
  return assignments.map((a) => {
    const steps = effectiveSteps(a.chapter.study.steps, rater.steps);
    const pages: PageInfo[] = a.chapter.pages;
    const todo = pages.flatMap((p) => steps.filter((s) => applicable(s, p)).map((s) => ({ pageId: p.id, step: s, done: done.has(`${p.id}:${s}`) })));
    return { chapter: a.chapter, steps, pages, todo };
  });
}

export async function nextTask(raterId: string): Promise<Task> {
  for (const c of await loadPlan(raterId)) {
    const t = c.todo.find((x) => !x.done);
    if (t) return { chapterId: c.chapter.id, pageId: t.pageId, step: t.step };
  }
  return null;
}

// Letters for a compare item are a deterministic shuffle per rater and block.
export function lettersFor(raterId: string, blockId: string, candidateIds: string[]): Record<string, string> {
  const ids = shuffled([...candidateIds].sort(), `${raterId}:${blockId}`);
  return Object.fromEntries(ids.map((id, k) => [LETTERS[k], id]));
}

// May this rater see this page?
export async function canSeePage(raterId: string, pageId: string): Promise<boolean> {
  const p = await db.page.findUnique({ where: { id: pageId }, select: { chapterId: true } });
  if (!p) return false;
  if (!(await db.rater.findUnique({ where: { id: raterId }, select: { active: true } }))?.active) return false;
  return !!(await db.chapterAssignment.findUnique({ where: { raterId_chapterId: { raterId, chapterId: p.chapterId } } }));
}
