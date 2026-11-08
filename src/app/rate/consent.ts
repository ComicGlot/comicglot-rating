"use server";
import { redirect } from "next/navigation";
import { requireRater } from "@/lib/auth";
import { db } from "@/lib/db";

// The rater has read the study information and agrees to take part.
export async function acceptConsent(form: FormData): Promise<void> {
  const s = await requireRater();
  if (form.get("agree") !== "on") redirect("/rate/welcome?missing=1");
  await db.rater.update({ where: { id: s.sub }, data: { consentAt: new Date() } });
  redirect("/rate");
}
