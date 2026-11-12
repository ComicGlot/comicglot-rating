// Moves the study from one round to the next: closes <from>, opens <to>, and points the access keys and raters
// that were tied to <from> at <to>, so people keep signing in with the same key and land in the new round.
// Answers in <from> are kept (the study is only closed).
//
//   npx tsx tools/switch_study.ts round2 round3
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [fromName, toName] = process.argv.slice(2);
  if (!fromName || !toName) throw new Error("usage: npx tsx tools/switch_study.ts <from> <to>");
  const to = await db.study.findUnique({ where: { name: toName } });
  if (!to) throw new Error(`${toName}: no such study (import it first)`);
  const from = await db.study.findUnique({ where: { name: fromName } });
  let tokens = 0, raters = 0;
  await db.$transaction(async (tx) => {
    await tx.study.update({ where: { id: to.id }, data: { active: true } });
    if (!from) return;
    await tx.study.update({ where: { id: from.id }, data: { active: false } });
    tokens = (await tx.accessToken.updateMany({ where: { studyId: from.id }, data: { studyId: to.id } })).count;
    raters = (await tx.rater.updateMany({ where: { studyId: from.id }, data: { studyId: to.id } })).count;
  });
  console.log(`${toName} open${from ? `, ${fromName} closed` : ""}; ${tokens} access keys and ${raters} raters moved`);
}

main().finally(() => db.$disconnect());
