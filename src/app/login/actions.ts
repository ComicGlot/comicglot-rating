"use server";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newCode, normKey } from "@/lib/access";
import { assignChapters } from "@/lib/assign";
import { db } from "@/lib/db";
import { COOKIE, cookieOptions, signSession } from "@/lib/session";

export type EnterError = "keyMissing" | "keyWrong" | null;

// One field: a rater's personal key brings them back; an invitation token creates a new rater.
export async function enter(_: EnterError, form: FormData): Promise<EnterError> {
  const key = normKey(String(form.get("key") ?? ""));
  if (!key) return "keyMissing";
  const jar = await cookies();

  const known = await db.rater.findUnique({ where: { accessKey: key } });
  if (known) {
    if (!known.active) return "keyWrong";
    jar.set(COOKIE, await signSession({ sub: known.id, username: known.username, role: "rater" }), cookieOptions);
    redirect("/rate");
  }

  const t = await db.accessToken.findUnique({ where: { token: key } });
  if (!t || !t.active || (t.expiresAt && t.expiresAt < new Date())) return "keyWrong";
  // Claim a use atomically, so two people cannot both take the last use of a token.
  const claimed = await db.accessToken.updateMany({
    where: { id: t.id, active: true, ...(t.maxUses != null ? { uses: { lt: t.maxUses } } : {}) },
    data: { uses: { increment: 1 } },
  });
  if (!claimed.count) return "keyWrong";

  // A one-person token stays that person's key; a shared token gives each person a key of their own.
  const accessKey = t.maxUses === 1 ? key : newCode(10);
  let username = "";
  for (let i = 0; i < 5 && !username; i++) {
    const u = `${t.role}-${newCode(4).toLowerCase()}`;
    if (!(await db.rater.findUnique({ where: { username: u } }))) username = u;
  }
  const rater = await db.rater.create({
    data: { username, accessKey, role: t.role, steps: t.steps, tokenId: t.id, studyId: t.studyId, note: t.label },
  });
  await assignChapters(rater.id);
  jar.set(COOKIE, await signSession({ sub: rater.id, username, role: "rater" }), cookieOptions);
  redirect("/rate");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// The admin account lives in the environment (ADMIN_USERNAME, ADMIN_PASSWORD), not in the database.
export async function adminLogin(_: "missing" | "wrong" | null, form: FormData): Promise<"missing" | "wrong" | null> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return "missing";
  const u = process.env.ADMIN_USERNAME, p = process.env.ADMIN_PASSWORD;
  if (!u || !p || !same(username, u) || !same(password, p)) return "wrong";
  (await cookies()).set(COOKIE, await signSession({ sub: "admin", username, role: "admin" }), cookieOptions);
  redirect("/admin");
}
