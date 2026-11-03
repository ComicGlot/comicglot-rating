"use server";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { COOKIE, cookieOptions, signSession } from "@/lib/session";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function login(_: string | null, form: FormData): Promise<string | null> {
  const username = String(form.get("username") ?? "").trim();
  const code = String(form.get("code") ?? "").trim();
  if (!username || !code) return "Enter your name and access code.";
  const jar = await cookies();

  const adminUser = process.env.ADMIN_USERNAME, adminPass = process.env.ADMIN_PASSWORD;
  if (adminUser && adminPass && same(username, adminUser) && same(code, adminPass)) {
    jar.set(COOKIE, await signSession({ sub: "admin", username, role: "admin" }), cookieOptions);
    redirect("/admin");
  }

  const rater = await db.rater.findUnique({ where: { username } });
  if (!rater || !rater.active || !(await bcrypt.compare(code, rater.codeHash))) return "Name or access code not recognised.";
  jar.set(COOKIE, await signSession({ sub: rater.id, username, role: "rater" }), cookieOptions);
  redirect("/rate");
}
