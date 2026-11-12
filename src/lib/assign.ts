import { db } from "./db";

// Gives a rater every chapter of the active studies (or only of their token's study) that they do not have yet.
// The order they are worked in is set when the plan is loaded (flow.ts): in a study with a share per rater, the
// sets the fewest other raters have worked on come first. Returns the number of chapters added.
export async function assignChapters(raterId: string): Promise<number> {
  const rater = await db.rater.findUnique({ where: { id: raterId }, select: { studyId: true } });
  const have = new Set((await db.chapterAssignment.findMany({ where: { raterId }, select: { chapterId: true } })).map((a) => a.chapterId));
  const last = await db.chapterAssignment.aggregate({ where: { raterId }, _max: { position: true } });
  let pos = (last._max.position ?? -1) + 1;
  const chapters = await db.chapter.findMany({
    where: { study: { active: true, ...(rater?.studyId ? { id: rater.studyId } : {}) } },
    orderBy: [{ study: { createdAt: "asc" } }, { position: "asc" }],
    select: { id: true },
  });
  const add = chapters.filter((c) => !have.has(c.id)).map((c) => ({ raterId, chapterId: c.id, position: pos++ }));
  if (add.length) await db.chapterAssignment.createMany({ data: add });
  return add.length;
}
