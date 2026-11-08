import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { setsFor } from "@/lib/flow";
import { chat, type ChatMessage } from "@/lib/openrouter";
import { TONE } from "@/lib/steps";

// POST { studyId, judge, withImage?, limit? }
// A language model judges the same blind pairs the translators see, with the same letters a person
// would get (shuffled from its own rater id). It sees the Korean, the two versions and, if asked, the
// frame with the text's box given by coordinates; it is never told the type. Its answers are stored
// as the rater "model:<judge>", so the export and the results page keep them apart from people.
export const maxDuration = 60;

const TONE_SET = new Set<string>(TONE);

function prompt(source: string, opts: { letter: string; text: string }[], box: number[], size: [number, number], withImage: boolean): string {
  return [
    "You are an experienced Korean-to-English comic translator. Two English versions of one line from a Korean webtoon follow.",
    withImage
      ? `The attached frame is ${size[0]}x${size[1]} pixels; the line is drawn inside the box from (${box[0]}, ${box[1]}) to (${box[2]}, ${box[3]}). Look at how it is drawn: the balloon or box, the lettering and the scene.`
      : "Judge the line as it would be drawn in a comic.",
    "",
    `Korean: ${source}`,
    ...opts.map((o) => `${o.letter}: ${o.text}`),
    "",
    "Choose the version a reader of an English comic would get the same meaning and the same tone from. Adding tone that the page does not show is as wrong as losing it. Choose \"tie\" if both are equally good or equally bad.",
    "For each version, say whether its tone fits the page (\"fine\"), adds some tone the page does not show (\"added\"), or is clearly too strong (\"overdone\").",
    "",
    `Answer with JSON only: {"choice": "${opts.map((o) => o.letter).join('" | "')}" | "tie", "tone": {${opts.map((o) => `"${o.letter}": "fine" | "added" | "overdone"`).join(", ")}}, "reason": "<one sentence>"}`,
  ].join("\n");
}

function parse(raw: string, letters: string[]): { choice: string; tone: Record<string, string>; reason?: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { choice?: string; tone?: Record<string, string>; reason?: string };
    const choice = String(j.choice ?? "").trim();
    if (choice !== "tie" && !letters.includes(choice)) return null;
    const tone = Object.fromEntries(letters.map((l) => [l, TONE_SET.has(String(j.tone?.[l])) ? String(j.tone![l]) : "fine"]));
    return { choice, tone, reason: j.reason ? String(j.reason).slice(0, 300) : undefined };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { studyId?: string; judge?: string; withImage?: boolean; limit?: number };
  const judge = (body.judge ?? "").trim();
  if (!body.studyId || !/^[\w.\-/:]+$/.test(judge)) return NextResponse.json({ error: "studyId and a judge model id are required" }, { status: 400 });
  const withImage = body.withImage !== false;
  const username = `model:${judge}${withImage ? "" : ":text"}`;
  const rater =
    (await db.rater.findUnique({ where: { username } })) ??
    // A model judge cannot sign in: its code is random and never shown, and it is created blocked.
    (await db.rater.create({ data: { username, codeHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), active: false, steps: ["compare"], note: "model judge", consentAt: new Date() } }));

  const limit = Math.min(Math.max(1, body.limit ?? 6), 12);
  const todo = await db.block.findMany({
    where: { page: { chapter: { studyId: body.studyId, practice: false } }, responses: { none: { raterId: rater.id, step: "compare" } } },
    orderBy: [{ page: { chapter: { position: "asc" } } }, { page: { index: "asc" } }, { order: "asc" }],
    include: { candidates: true, page: { select: { id: true, width: true, height: true } } },
    take: 400,
  });
  const work = todo.filter((b) => setsFor(rater.id, b.id, b.candidates).length > 0).slice(0, limit);

  const errors: string[] = [];
  let made = 0;
  await Promise.all(
    work.map(async (b) => {
      try {
        let image: string | undefined;
        if (withImage) {
          const p = await db.page.findUniqueOrThrow({ where: { id: b.page.id }, select: { imageData: true, imageMime: true } });
          image = `data:${p.imageMime};base64,${Buffer.from(p.imageData).toString("base64")}`;
        }
        const text = new Map(b.candidates.map((c) => [c.id, c.text]));
        const out = [];
        for (const set of setsFor(rater.id, b.id, b.candidates)) {
          const opts = Object.entries(set.letters).map(([letter, id]) => ({ letter, text: text.get(id) ?? "" }));
          const q = prompt(b.sourceText, opts, [b.x0, b.y0, b.x1, b.y1], [b.page.width, b.page.height], withImage);
          const msgs: ChatMessage[] = [{ role: "user", content: image ? [{ type: "text", text: q }, { type: "image_url", image_url: { url: image } }] : q }];
          let ans = parse(await chat(judge, msgs, 0), Object.keys(set.letters));
          if (!ans) ans = parse(await chat(judge, msgs, 0), Object.keys(set.letters)); // one retry on an unreadable reply
          if (!ans) throw new Error("no usable answer");
          out.push({ model: set.key || null, letters: set.letters, choice: ans.choice, tone: ans.tone, reason: ans.reason });
        }
        await db.response.create({ data: { raterId: rater.id, blockId: b.id, step: "compare", data: { sets: out } } });
        made++;
      } catch (e) {
        errors.push(String(e instanceof Error ? e.message : e).slice(0, 200));
      }
    }),
  );
  const left = todo.filter((b) => setsFor(rater.id, b.id, b.candidates).length > 0).length - made;
  return NextResponse.json({ judge: username, made, left: Math.max(0, left), errors: errors.slice(0, 3) });
}
