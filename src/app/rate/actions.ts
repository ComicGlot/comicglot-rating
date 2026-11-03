"use server";
import { redirect } from "next/navigation";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";

const TONE = new Set(["fine", "added", "overdone"]);

export async function submitJudgement(_: string | null, form: FormData): Promise<string | null> {
  const s = await requireRater();
  const id = String(form.get("assignmentId") ?? "");
  const a = await db.assignment.findUnique({ where: { id }, include: { judgement: true } });
  if (!a || a.raterId !== s.sub) return "This item is not assigned to you.";
  if (a.judgement) redirect("/rate");

  const letters = Object.keys(a.letters as Record<string, string>);
  const choice = String(form.get("choice") ?? "");
  if (choice !== "tie" && !letters.includes(choice)) return "Choose the better translation, or a tie.";
  const tone: Record<string, string> = {};
  for (const l of letters) {
    const v = String(form.get(`tone_${l}`) ?? "fine");
    if (!TONE.has(v)) return "Invalid tone value.";
    tone[l] = v;
  }
  const own = String(form.get("ownTranslation") ?? "").trim();
  const comment = String(form.get("comment") ?? "").trim();
  const ms = Number(form.get("msSpent") ?? 0);

  await db.judgement.create({
    data: {
      assignmentId: a.id,
      choice,
      tone,
      ownTranslation: own || null,
      comment: comment || null,
      msSpent: Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null,
    },
  });
  redirect("/rate");
}
