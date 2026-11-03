import { db } from "./db";
import { LETTERS, shuffled } from "./shuffle";

// Give a rater every item of a study that they do not have yet.
// Item order and candidate letters are shuffled per rater.
export async function assignStudy(raterId: string, studyId: string): Promise<number> {
  const items = await db.item.findMany({
    where: { studyId },
    include: { candidates: { select: { id: true } } },
    orderBy: { externalId: "asc" },
  });
  const have = new Set(
    (await db.assignment.findMany({ where: { raterId }, select: { itemId: true } })).map((a) => a.itemId),
  );
  const start = await db.assignment.count({ where: { raterId } });
  const todo = shuffled(items.filter((i) => !have.has(i.id) && i.candidates.length >= 2), `${raterId}:${studyId}`);
  await db.assignment.createMany({
    data: todo.map((it, n) => {
      const cands = shuffled(it.candidates.map((c) => c.id), `${raterId}:${it.id}`);
      return {
        raterId,
        itemId: it.id,
        position: start + n,
        letters: Object.fromEntries(cands.map((id, k) => [LETTERS[k], id])),
      };
    }),
  });
  return todo.length;
}
