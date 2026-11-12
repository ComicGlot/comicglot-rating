import { db } from "./db";
import { shuffled } from "./shuffle";

// Gives a rater the chapters of the active studies (or only of their token's study) that they do not have yet,
// in study and chapter order. A study with `setsPerRater` gives each rater its practice sets and that many other
// sets: those with the fewest raters so far (testers not counted), ties broken in a per-rater random order, so
// the sets fill evenly and every pair of raters shares some sets. Returns the number of chapters added.
export async function assignChapters(raterId: string): Promise<number> {
  const rater = await db.rater.findUnique({ where: { id: raterId }, select: { studyId: true } });
  const have = new Set((await db.chapterAssignment.findMany({ where: { raterId }, select: { chapterId: true } })).map((a) => a.chapterId));
  const last = await db.chapterAssignment.aggregate({ where: { raterId }, _max: { position: true } });
  let pos = (last._max.position ?? -1) + 1;
  const chapters = await db.chapter.findMany({
    where: { study: { active: true, ...(rater?.studyId ? { id: rater.studyId } : {}) } },
    orderBy: [{ study: { createdAt: "asc" } }, { position: "asc" }],
    select: {
      id: true, practice: true, studyId: true, study: { select: { setsPerRater: true } },
      _count: { select: { assignments: { where: { rater: { role: { not: "tester" } } } } } },
    },
  });

  const add: string[] = [];
  for (const studyId of [...new Set(chapters.map((c) => c.studyId))]) {
    const cs = chapters.filter((c) => c.studyId === studyId);
    const limit = cs[0].study.setsPerRater;
    if (!limit) {
      add.push(...cs.filter((c) => !have.has(c.id)).map((c) => c.id));
      continue;
    }
    add.push(...cs.filter((c) => c.practice && !have.has(c.id)).map((c) => c.id));
    const sets = cs.filter((c) => !c.practice);
    const need = limit - sets.filter((c) => have.has(c.id)).length;
    if (need <= 0) continue;
    const open = shuffled(sets.filter((c) => !have.has(c.id)), `${raterId}:sets`);
    // A stable sort keeps the random order among sets with the same number of raters.
    open.sort((a, b) => a._count.assignments - b._count.assignments);
    // Hand them out in the study's order, so the sets come up as Set 2, Set 5, ... rather than at random.
    const chosen = new Set(open.slice(0, need).map((c) => c.id));
    add.push(...sets.filter((c) => chosen.has(c.id)).map((c) => c.id));
  }
  if (add.length) await db.chapterAssignment.createMany({ data: add.map((chapterId) => ({ raterId, chapterId, position: pos++ })) });
  return add.length;
}
