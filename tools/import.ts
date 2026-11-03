// Import a study file into the database (run locally against the production DATABASE_URL):
//   npm run import -- data/round1.json
// File format (written by tools/export_packet.py in the ComicGlot repository checkout):
// { "study": "round1", "askOwnTranslation": true,
//   "items": [ { "id": "...", "class_name": "think_bubble", "source": "...", "context": ["..."],
//                "image_b64": "...", "image_mime": "image/png",
//                "candidates": { "guide": "...", "no_type": "..." } } ] }
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

type InItem = { id: string; class_name?: string; source: string; context?: string[]; image_b64?: string; image_mime?: string; candidates: Record<string, string> };

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npm run import -- <study.json>");
  const data = JSON.parse(readFileSync(file, "utf-8")) as { study: string; askOwnTranslation?: boolean; items: InItem[] };
  const db = new PrismaClient();
  const study = await db.study.upsert({
    where: { name: data.study },
    update: {},
    create: { name: data.study, askOwnTranslation: data.askOwnTranslation ?? true },
  });
  let n = 0;
  for (const it of data.items) {
    const fields = {
      className: it.class_name ?? null,
      sourceText: it.source,
      context: it.context ?? [],
      imageMime: it.image_b64 ? it.image_mime ?? "image/png" : null,
      imageData: it.image_b64 ? Buffer.from(it.image_b64, "base64") : null,
    };
    const item = await db.item.upsert({
      where: { studyId_externalId: { studyId: study.id, externalId: it.id } },
      update: fields,
      create: { studyId: study.id, externalId: it.id, ...fields },
    });
    for (const [condition, text] of Object.entries(it.candidates ?? {})) {
      await db.candidate.upsert({
        where: { itemId_condition: { itemId: item.id, condition } },
        update: { text },
        create: { itemId: item.id, condition, text },
      });
    }
    n++;
  }
  console.log(`study ${data.study}: ${n} items imported`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
