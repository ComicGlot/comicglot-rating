import { db } from "./db";
import { LETTERS, shuffled } from "./shuffle";
import { ATTENTION_MODEL, baseCondition, effectiveSteps, type Step } from "./steps";

export type Task = { chapterId: string; pageId: string; step: Step } | null;

type PageInfo = { id: string; index: number; blocks: { candidates: Cand[] }[] };

// Does this step have anything to do on this page?
function applicable(step: Step, p: PageInfo, rankModels: number | null): boolean {
  if (p.blocks.length === 0) return false;
  if (step === "compare") return p.blocks.some((b) => (rankModels ? rankable(b.candidates) : comparable(b.candidates)));
  return true;
}

// Candidates of a block are compared within groups of the same model: e.g. "guide" against "no_type"
// from one model. A block can be compared when some group has two or more candidates.
// A group whose versions are the same text is never shown: the only possible answer would be "equal",
// and the share of such pairs (the guide changed nothing) is counted apart on the results page.
// Attention checks are identical on purpose and are kept.
export type Cand = { id: string; model: string | null; condition?: string; text?: string };
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

// ---------- ranking mode ----------
// For each text a rater ranks the versions of a few models, each with and without the guide, from best to worst.
// The models are drawn per rater and text, so over many raters and texts every model meets every other.
// Versions with the same text are one card (they get the same rank). An attention check adds a decoy: the
// translation of another text, which belongs at the bottom.
const norm = (t: string) => t.replace(/\s+/g, " ").trim();
const GUIDE = "true_class", PLAIN = "no_class";

// Models of a block with both versions, and each model's two candidates.
function rankPool(cands: Cand[]) {
  const by = new Map<string, { g?: Cand; p?: Cand }>();
  for (const c of cands) {
    if (c.model === ATTENTION_MODEL || !c.condition) continue;
    const base = baseCondition(c.condition);
    if (base !== GUIDE && base !== PLAIN) continue;
    const e = by.get(c.model ?? "") ?? {};
    if (base === GUIDE) e.g = c;
    else e.p = c;
    by.set(c.model ?? "", e);
  }
  const full = new Map([...by].filter(([, e]) => e.g && e.p) as [string, { g: Cand; p: Cand }][]);
  return full;
}
const decoyOf = (cands: Cand[]) => cands.find((c) => c.model === ATTENTION_MODEL && c.text);

// Can this block be ranked: two or more different texts among the versions (or a decoy)?
export function rankable(cands: Cand[]): boolean {
  const texts = new Set([...rankPool(cands).values()].flatMap((e) => [norm(e.g.text ?? ""), norm(e.p.text ?? "")]));
  return texts.size >= 2 || (texts.size >= 1 && !!decoyOf(cands));
}

export type RankItem = { models: string[]; cards: Record<string, string[]>; decoy?: string };

// The cards one rater ranks for one block. Deterministic, so the server rebuilds them when the answer comes back.
export function rankFor(raterId: string, blockId: string, cands: Cand[], k: number): RankItem | null {
  const pool = rankPool(cands);
  const decoy = decoyOf(cands);
  // Always k models, each with its two versions; a decoy is one more card on top, never in place of a model.
  const want = Math.max(1, k);
  const order = shuffled([...pool.keys()].sort(), `${raterId}:${blockId}:models`);
  const pick = order.slice(0, want);
  const textsOf = (ms: string[]) => new Set(ms.flatMap((m) => [norm(pool.get(m)!.g.text ?? ""), norm(pool.get(m)!.p.text ?? "")]));
  // All the drawn versions say the same: swap the last model for the next one that says something else.
  if (textsOf(pick).size < 2) {
    const other = order.slice(want).find((m) => textsOf([...pick.slice(0, -1), m]).size >= 2);
    if (other) pick[pick.length - 1] = other;
    else if (!decoy) return null; // every model says the same: nothing to rank
  }
  if (!pick.length) return null;
  const groups = new Map<string, string[]>();
  for (const m of pick)
    for (const c of [pool.get(m)!.g, pool.get(m)!.p]) {
      const t = norm(c.text ?? "");
      groups.set(t, [...(groups.get(t) ?? []), c.id]);
    }
  let decoyKey: string | undefined;
  if (decoy) {
    const t = norm(decoy.text ?? "");
    if (!groups.has(t)) { groups.set(t, [decoy.id]); decoyKey = t; }
  }
  const keys = shuffled([...groups.keys()].sort(), `${raterId}:${blockId}:cards`);
  const cards: Record<string, string[]> = {};
  let decoyLetter: string | undefined;
  keys.forEach((t, i) => {
    cards[LETTERS[i]] = groups.get(t)!.sort();
    if (t === decoyKey) decoyLetter = LETTERS[i];
  });
  return { models: pick.slice().sort(), cards, ...(decoyLetter ? { decoy: decoyLetter } : {}) };
}

// Is a ranking (groups of letters, best first; letters in one group are tied) a full order of the cards?
export function validRanking(groups: unknown, letters: string[]): groups is string[][] {
  if (!Array.isArray(groups) || !groups.every((g) => Array.isArray(g) && g.length > 0 && g.every((l) => typeof l === "string"))) return false;
  const flat = (groups as string[][]).flat();
  return flat.length === letters.length && new Set(flat).size === flat.length && letters.every((l) => flat.includes(l));
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
            select: { id: true, index: true, blocks: { select: { candidates: { select: { id: true, model: true, condition: true, text: true } } } } },
          },
        },
      },
    },
  });
  const done = new Set(
    (await db.pageDone.findMany({ where: { raterId }, select: { pageId: true, step: true } })).map((d) => `${d.pageId}:${d.step}`),
  );
  // In a study with a share per rater, every rater has every set, and the sets others have done least come first:
  // a set this rater has started stays first, then the sets by how many pages other raters (testers not counted)
  // have saved in them, ties in a per-rater random order. Raters who stop after their share still cover the study.
  const shared = assignments.filter((a) => a.chapter.study.setsPerRater && !a.chapter.practice).map((a) => a.chapter.id);
  const rank = new Map<string, number>();
  if (shared.length) {
    const others = await db.pageDone.findMany({
      where: { raterId: { not: raterId }, rater: { role: { not: "tester" } }, page: { chapterId: { in: shared } } },
      select: { page: { select: { chapterId: true } } },
    });
    const cover = new Map<string, number>();
    for (const o of others) cover.set(o.page.chapterId, (cover.get(o.page.chapterId) ?? 0) + 1);
    const pagesOf = (id: string) => assignments.find((a) => a.chapter.id === id)!.chapter.pages;
    const state = (id: string) => {
      const ps = pagesOf(id), n = ps.filter((p) => [...done].some((d) => d.startsWith(`${p.id}:`))).length;
      return n === 0 ? 1 : n < ps.length ? 0 : 2; // started 0, untouched 1, finished 2
    };
    const tie = shuffled(shared, `${raterId}:order`);
    const order = [...shared].sort((x, y) => state(x) - state(y) || (cover.get(x) ?? 0) / Math.max(1, pagesOf(x).length) - (cover.get(y) ?? 0) / Math.max(1, pagesOf(y).length) || tie.indexOf(x) - tie.indexOf(y));
    order.forEach((id, i) => rank.set(id, i));
  }
  // Practice sets come first, whatever their position.
  assignments.sort((a, b) => Number(b.chapter.practice) - Number(a.chapter.practice) || (rank.get(a.chapter.id) ?? 0) - (rank.get(b.chapter.id) ?? 0) || a.position - b.position);
  return assignments.map((a) => {
    const steps = effectiveSteps(a.chapter.study.steps, rater.steps);
    const pages: PageInfo[] = a.chapter.pages;
    const todo = pages.flatMap((p) => steps.filter((s) => applicable(s, p, a.chapter.study.rankModels)).map((s) => ({ pageId: p.id, step: s, done: done.has(`${p.id}:${s}`) })));
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
  // One query: an assignment of an active rater to the chapter that holds the page.
  return !!(await db.chapterAssignment.findFirst({
    where: { raterId, rater: { active: true }, chapter: { pages: { some: { id: pageId } } } },
    select: { raterId: true },
  }));
}
