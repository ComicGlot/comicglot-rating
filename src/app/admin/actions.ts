"use server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assignChapters } from "@/lib/assign";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { STEP_ORDER } from "@/lib/steps";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

function newCode(n = 10): string {
  return Array.from(randomBytes(n), (x) => ALPHABET[x % ALPHABET.length]).join("");
}

function stepsFrom(form: FormData): string[] {
  const picked = new Set(form.getAll("steps").map(String));
  return STEP_ORDER.filter((s) => picked.has(s));
}

export type CodeResult = { username: string; code: string; assigned: number } | { error: string } | null;

export async function createRater(_: CodeResult, form: FormData): Promise<CodeResult> {
  await requireAdmin();
  const username = String(form.get("username") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(username)) return { error: "Use 2 to 40 letters, digits, dots, dashes or underscores." };
  if (await db.rater.findUnique({ where: { username } })) return { error: "That name is taken." };
  const code = newCode();
  const rater = await db.rater.create({
    data: { username, note: note || null, steps: stepsFrom(form), codeHash: await bcrypt.hash(code, 10) },
  });
  const assigned = await assignChapters(rater.id);
  revalidatePath("/admin", "layout");
  return { username, code, assigned };
}

export async function resetCode(_: CodeResult, form: FormData): Promise<CodeResult> {
  await requireAdmin();
  const id = String(form.get("raterId") ?? "");
  const r = await db.rater.findUnique({ where: { id } });
  if (!r) return { error: "Unknown rater." };
  const code = newCode();
  await db.rater.update({ where: { id }, data: { codeHash: await bcrypt.hash(code, 10) } });
  return { username: r.username, code, assigned: 0 };
}

export async function toggleRater(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("raterId") ?? "");
  const r = await db.rater.findUnique({ where: { id } });
  if (r) await db.rater.update({ where: { id }, data: { active: !r.active } });
  revalidatePath("/admin", "layout");
}

export async function setRaterSteps(form: FormData): Promise<void> {
  await requireAdmin();
  await db.rater.update({ where: { id: String(form.get("raterId") ?? "") }, data: { steps: stepsFrom(form) } });
  revalidatePath("/admin", "layout");
}

export async function assignNew(form: FormData): Promise<void> {
  await requireAdmin();
  await assignChapters(String(form.get("raterId") ?? ""));
  revalidatePath("/admin", "layout");
}

export async function toggleStudy(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("studyId") ?? "");
  const st = await db.study.findUnique({ where: { id } });
  if (st) await db.study.update({ where: { id }, data: { active: !st.active } });
  revalidatePath("/admin", "layout");
}

export async function updateStudy(form: FormData): Promise<void> {
  await requireAdmin();
  await db.study.update({
    where: { id: String(form.get("studyId") ?? "") },
    data: {
      steps: stepsFrom(form),
      askOwnTranslation: form.get("askOwn") === "on",
      ...(form.has("intro") ? { intro: String(form.get("intro") ?? "").trim() || null } : {}),
    },
  });
  revalidatePath("/admin", "layout");
}
