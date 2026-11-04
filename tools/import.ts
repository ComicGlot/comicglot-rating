// Imports chapters for the rating app from a JSON file made by tools/export_chapters.py.
//
//   npm run import -- data/round1.json
//
// Format:
//   { "study": "round1", "steps": ["types","transcribe","compare","review"], "askOwnTranslation": true,
//     "guides": { "<type>": "<style guide>", "default": "..." },
//     "chapters": [ { "id": "run12", "title": "Chapter 1", "pages": [
//        { "index": 0, "image_file": "run12/000.jpg" | "image_b64": "...", "image_mime": "image/jpeg", "width": 800, "height": 1600,
//          "blocks": [ { "id": "run12/0/3", "order": 0, "box": [x0,y0,x1,y1], "class_name": "speech_bubble",
//                        "source": "...", "readings": { "general": "...", "comic": "..." },
//                        "candidates": [ { "condition": "true_class", "model": "claude-3-7-sonnet", "text": "..." } ] } ] } ] } ] }
//
// A chapter that already exists keeps its pages and the raters' work: only its candidates and readings are
// added (matched by block id); existing candidates are never changed. Nothing is deleted.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";

type InBlock = {
  id: string; order: number; box: [number, number, number, number]; class_name?: string | null; source: string;
  readings?: Record<string, string>; candidates?: { condition: string; model?: string | null; text: string }[];
};
type InPage = { index: number; image_file?: string; image_b64?: string; image_mime?: string; width: number; height: number; blocks: InBlock[] };
type InFile = {
  study: string; steps?: string[]; askOwnTranslation?: boolean; guides?: Record<string, string>;
  chapters: { id: string; title?: string; pages: InPage[] }[];
};

const STEPS = ["types", "transcribe", "compare", "review"];
const db = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npm run import -- <chapters.json>");
  const base = dirname(resolve(file));
  const data = JSON.parse(readFileSync(file, "utf8")) as InFile;
  const steps = STEPS.filter((s) => (data.steps ?? STEPS).includes(s) || s === "review");
  const study = await db.study.upsert({
    where: { name: data.study },
    create: { name: data.study, steps, askOwnTranslation: data.askOwnTranslation ?? true, guides: data.guides ?? Prisma.JsonNull },
    update: { ...(data.guides ? { guides: data.guides } : {}) },
  });
  let pos = (await db.chapter.aggregate({ where: { studyId: study.id }, _max: { position: true } }))._max.position ?? -1;
  let newChapters = 0, newBlocks = 0, cands = 0;

  for (const ch of data.chapters) {
    const existing = await db.chapter.findUnique({ where: { studyId_externalId: { studyId: study.id, externalId: ch.id } } });
    if (!existing) {
      const chapter = await db.chapter.create({ data: { studyId: study.id, externalId: ch.id, title: ch.title ?? ch.id, position: ++pos } });
      for (const p of ch.pages) {
        const img = p.image_file ? readFileSync(resolve(base, p.image_file)) : Buffer.from(p.image_b64 ?? "", "base64");
        if (!img.length) throw new Error(`${ch.id} page ${p.index}: no image`);
        await db.page.create({
          data: {
            chapterId: chapter.id, index: p.index, imageMime: p.image_mime ?? "image/jpeg", imageData: img, width: p.width, height: p.height,
            blocks: {
              create: p.blocks.map((b) => ({
                externalId: b.id, order: b.order, x0: Math.round(b.box[0]), y0: Math.round(b.box[1]), x1: Math.round(b.box[2]), y1: Math.round(b.box[3]),
                className: b.class_name ?? null, sourceText: b.source ?? "", readings: b.readings ?? Prisma.JsonNull,
                candidates: { create: (b.candidates ?? []).map((c) => ({ condition: c.condition, model: c.model ?? null, text: c.text })) },
              })),
            },
          },
        });
        newBlocks += p.blocks.length;
        cands += p.blocks.reduce((n, b) => n + (b.candidates?.length ?? 0), 0);
      }
      newChapters++;
      continue;
    }
    // Existing chapter: merge readings and candidates only.
    for (const p of ch.pages)
      for (const b of p.blocks) {
        const blk = await db.block.findFirst({ where: { externalId: b.id, page: { chapterId: existing.id } } });
        if (!blk) { console.warn(`skipped unknown block ${b.id}`); continue; }
        if (b.readings) await db.block.update({ where: { id: blk.id }, data: { readings: { ...((blk.readings ?? {}) as object), ...b.readings } } });
        for (const c of b.candidates ?? []) {
          // A candidate that raters may already have judged is never changed.
          const old = await db.candidate.findUnique({ where: { blockId_condition: { blockId: blk.id, condition: c.condition } } });
          if (old) { if (old.text !== c.text) console.warn(`kept the existing ${c.condition} of ${b.id}; the file has a different text`); continue; }
          await db.candidate.create({ data: { blockId: blk.id, condition: c.condition, model: c.model ?? null, text: c.text } });
          cands++;
        }
      }
  }
  console.log(`${data.study}: ${newChapters} new chapters, ${newBlocks} new blocks, ${cands} candidates written`);
}

main().finally(() => db.$disconnect());
