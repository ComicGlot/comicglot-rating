import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per judgement, with letters mapped back to conditions (admin only).
export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "admin") return new NextResponse("Forbidden", { status: 403 });
  const rows = await db.judgement.findMany({
    orderBy: { createdAt: "asc" },
    include: { assignment: { include: { rater: true, item: { include: { study: true, candidates: true } } } } },
  });
  const head = ["study", "rater", "item", "class", "position", "choice_letter", "choice_condition",
    "tone_by_condition", "own_translation", "comment", "ms_spent", "created_at"];
  const out = [head.join(",")];
  for (const j of rows) {
    const a = j.assignment;
    const letters = a.letters as Record<string, string>;
    const cond = new Map(a.item.candidates.map((c) => [c.id, c.condition]));
    const tone = Object.entries(j.tone as Record<string, string>).map(([l, v]) => `${cond.get(letters[l])}:${v}`).join(";");
    out.push([
      a.item.study.name, a.rater.username, a.item.externalId, a.item.className, a.position,
      j.choice, j.choice === "tie" ? "tie" : cond.get(letters[j.choice]), tone,
      j.ownTranslation, j.comment, j.msSpent, j.createdAt.toISOString(),
    ].map(csv).join(","));
  }
  return new NextResponse(out.join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="judgements.csv"' },
  });
}
