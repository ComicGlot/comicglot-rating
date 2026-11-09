"use server";
import { revalidatePath } from "next/cache";
import { isRole, newCode, normKey, ROLES } from "@/lib/access";
import { assignChapters } from "@/lib/assign";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { STEP_ORDER } from "@/lib/steps";

function stepsFrom(form: FormData): string[] {
  const picked = new Set(form.getAll("steps").map(String));
  return STEP_ORDER.filter((s) => picked.has(s));
}

const done = () => revalidatePath("/admin", "layout");

// ---- Invitation tokens ----

export type TokenResult = { token: string } | { error: string } | null;

export async function createToken(_: TokenResult, form: FormData): Promise<TokenResult> {
  await requireAdmin();
  const role = String(form.get("role") ?? "translator");
  if (!isRole(role)) return { error: "Unknown role." };
  const word = normKey(String(form.get("word") ?? ""));
  if (word && !/^[A-Z0-9_-]{4,40}$/.test(word)) return { error: "A custom word needs 4 to 40 letters, digits, dashes or underscores." };
  const token = word || `${role.slice(0, 2).toUpperCase()}-${newCode(6)}`;
  if ((await db.accessToken.findUnique({ where: { token } })) || (await db.rater.findUnique({ where: { accessKey: token } })))
    return { error: "That word is already in use." };
  const uses = String(form.get("uses") ?? "one");
  const n = Number(form.get("n") ?? 0);
  const maxUses = uses === "one" ? 1 : uses === "n" ? Math.max(1, Math.min(500, Math.floor(n) || 1)) : null;
  const days = Number(form.get("days") ?? 0);
  const studyId = String(form.get("studyId") ?? "") || null;
  const custom = form.get("customSteps") === "on";
  await db.accessToken.create({
    data: {
      token, role, maxUses, studyId,
      label: String(form.get("label") ?? "").trim() || null,
      steps: custom ? stepsFrom(form) : [...ROLES[role].steps],
      expiresAt: days > 0 ? new Date(Date.now() + days * 86400_000) : null,
    },
  });
  done();
  return { token };
}

export async function toggleToken(form: FormData): Promise<void> {
  await requireAdmin();
  const t = await db.accessToken.findUnique({ where: { id: String(form.get("tokenId") ?? "") } });
  if (t) await db.accessToken.update({ where: { id: t.id }, data: { active: !t.active } });
  done();
}

// Deleting a token stops new sign-ins with it; raters who already entered keep their own key and answers.
export async function deleteToken(form: FormData): Promise<void> {
  await requireAdmin();
  await db.accessToken.deleteMany({ where: { id: String(form.get("tokenId") ?? "") } });
  done();
}

// ---- Raters ----

export async function toggleRater(form: FormData): Promise<void> {
  await requireAdmin();
  const r = await db.rater.findUnique({ where: { id: String(form.get("raterId") ?? "") } });
  if (r) await db.rater.update({ where: { id: r.id }, data: { active: !r.active } });
  done();
}

export async function setRaterSteps(form: FormData): Promise<void> {
  await requireAdmin();
  const role = String(form.get("role") ?? "");
  await db.rater.update({
    where: { id: String(form.get("raterId") ?? "") },
    data: { steps: stepsFrom(form), ...(isRole(role) ? { role } : {}) },
  });
  done();
}

export async function assignNew(form: FormData): Promise<void> {
  await requireAdmin();
  await assignChapters(String(form.get("raterId") ?? ""));
  done();
}

// Keeps the rater and their key, removes everything they answered.
export async function clearRaterAnswers(form: FormData): Promise<void> {
  await requireAdmin();
  const raterId = String(form.get("raterId") ?? "");
  await db.$transaction([db.response.deleteMany({ where: { raterId } }), db.pageDone.deleteMany({ where: { raterId } })]);
  done();
}

// Removes the rater with every answer (cascade).
export async function deleteRater(form: FormData): Promise<void> {
  await requireAdmin();
  await db.rater.deleteMany({ where: { id: String(form.get("raterId") ?? "") } });
  done();
}

// ---- Studies ----

export async function toggleStudy(form: FormData): Promise<void> {
  await requireAdmin();
  const st = await db.study.findUnique({ where: { id: String(form.get("studyId") ?? "") } });
  if (st) await db.study.update({ where: { id: st.id }, data: { active: !st.active } });
  done();
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
  done();
}

// Every answer given in this study, by everyone; the frames and translations stay.
export async function clearStudyAnswers(form: FormData): Promise<void> {
  await requireAdmin();
  const studyId = String(form.get("studyId") ?? "");
  await db.$transaction([
    db.response.deleteMany({ where: { block: { page: { chapter: { studyId } } } } }),
    db.pageDone.deleteMany({ where: { page: { chapter: { studyId } } } }),
  ]);
  done();
}

// The study with its frames, translations, assignments and answers.
export async function deleteStudy(form: FormData): Promise<void> {
  await requireAdmin();
  await db.study.deleteMany({ where: { id: String(form.get("studyId") ?? "") } });
  done();
}

// Every rater whose role is tester, with their answers: one click to clean the dashboard after trying the study.
export async function deleteTesters(): Promise<void> {
  await requireAdmin();
  await db.rater.deleteMany({ where: { role: "tester" } });
  done();
}
