import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { chat, translationPrompt } from "@/lib/openrouter";

// POST { studyId, condition, model, guides?: { [className]: guideText }, limit? }
// Fills in a missing condition for up to `limit` items of a study through OpenRouter.
// With `guides`, each block gets the guide of its type; without, it is translated with no type.
export const maxDuration = 60;

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { studyId?: string; condition?: string; model?: string; guides?: Record<string, string>; limit?: number };
  if (!body.studyId || !body.condition || !body.model) return NextResponse.json({ error: "studyId, condition and model are required" }, { status: 400 });
  const limit = Math.min(Math.max(1, body.limit ?? 10), 25);
  const items = await db.item.findMany({
    where: { studyId: body.studyId, candidates: { none: { condition: body.condition } } },
    take: limit,
    orderBy: { externalId: "asc" },
  });
  let made = 0;
  for (const it of items) {
    const guide = body.guides ? body.guides[it.className ?? ""] ?? body.guides["default"] : undefined;
    const text = await chat(body.model, translationPrompt(it.sourceText, it.context, guide));
    if (!text) continue;
    await db.candidate.create({ data: { itemId: it.id, condition: body.condition, model: body.model, text } });
    made++;
  }
  const left = await db.item.count({ where: { studyId: body.studyId, candidates: { none: { condition: body.condition } } } });
  return NextResponse.json({ made, left });
}
