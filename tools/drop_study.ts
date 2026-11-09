// Deletes a study with its chapters, pages, blocks and candidates, so it can be imported again from a new export.
// Refuses while the study holds any answers (pass --force to delete them too). Access keys stay; raters keep
// their accounts and lose their assignments.
//
//   npx tsx tools/drop_study.ts round1
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [name, flag] = process.argv.slice(2);
  if (!name) throw new Error("usage: npx tsx tools/drop_study.ts <study> [--force]");
  const study = await db.study.findUnique({ where: { name } });
  if (!study) return console.log(`${name}: no such study`);
  const answers = await db.response.count({ where: { block: { page: { chapter: { studyId: study.id } } } } });
  if (answers && flag !== "--force") throw new Error(`${name} holds ${answers} answers; pass --force to delete them`);
  await db.study.delete({ where: { id: study.id } });
  console.log(`${name}: deleted (${answers} answers)`);
}

main().finally(() => db.$disconnect());
