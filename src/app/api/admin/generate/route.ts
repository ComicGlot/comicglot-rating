import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CONDITIONS, chat, pipelinePrompt, translationOf, type Condition } from "@/lib/openrouter";

// POST { studyId, condition, model, withPage?, limit? }
// Translates up to `limit` blocks of a study that do not yet have this condition, through OpenRouter,
// with the pipeline's own prompt. Stored as condition "<condition>[+page]@<model>", grouped by model,
// so "true_class" and "no_class" from one model are compared with each other.
export const maxDuration = 60;

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { studyId?: string; condition?: string; model?: string; withPage?: boolean; limit?: number };
  const cond = body.condition as Condition;
  const model = (body.model ?? "").trim();
  if (!body.studyId || !CONDITIONS.includes(cond) || !/^[\w.\-/:]+$/.test(model))
    return NextResponse.json({ error: "studyId, a known condition and a model id are required" }, { status: 400 });
  const study = await db.study.findUnique({ where: { id: body.studyId } });
  if (!study) return NextResponse.json({ error: "unknown study" }, { status: 404 });
  const group = model + (body.withPage ? "+page" : "");
  const condition = `${cond}${body.withPage ? "+page" : ""}@${model}`;
  const limit = Math.min(Math.max(1, body.limit ?? 8), 16);
  const guides = (study.guides ?? {}) as Record<string, string>;
  const missing = { page: { chapter: { studyId: study.id } }, candidates: { none: { condition } } };

  const todo = await db.block.findMany({
    where: missing,
    orderBy: [{ page: { chapter: { position: "asc" } } }, { page: { index: "asc" } }, { order: "asc" }],
    take: limit,
    select: { id: true, sourceText: true, className: true, order: true, pageId: true, page: { select: { index: true, chapterId: true } } },
  });

  const errors: string[] = [];
  let made = 0;
  // Five calls at a time keeps one request inside the time limit.
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (b) => {
        try {
          const prev = await db.block.findMany({
            where: {
              page: { chapterId: b.page.chapterId },
              OR: [{ page: { index: { lt: b.page.index } } }, { pageId: b.pageId, order: { lt: b.order } }],
            },
            orderBy: [{ page: { index: "desc" } }, { order: "desc" }],
            take: 3,
            select: { sourceText: true, className: true },
          });
          let page: { mime: string; base64: string } | undefined;
          if (body.withPage) {
            const p = await db.page.findUniqueOrThrow({ where: { id: b.pageId }, select: { imageData: true, imageMime: true } });
            page = { mime: p.imageMime, base64: Buffer.from(p.imageData).toString("base64") };
          }
          const msgs = pipelinePrompt(
            cond,
            { text: b.sourceText, className: b.className },
            prev.reverse().map((x) => ({ text: x.sourceText, className: x.className })),
            guides,
            page,
          );
          const raw = await chat(model, msgs, 0.7);
          const text = translationOf(raw);
          if (!text) throw new Error("empty reply");
          await db.candidate.create({ data: { blockId: b.id, condition, model: group, text, raw } });
          made++;
        } catch (e) {
          errors.push(String(e instanceof Error ? e.message : e).slice(0, 200));
        }
      }),
    );
  }
  const left = await db.block.count({ where: missing });
  return NextResponse.json({ condition, made, left, errors: errors.slice(0, 3) });
}
