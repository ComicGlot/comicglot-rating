import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value);
}

export async function requireRater(): Promise<Session> {
  const s = await getSession();
  if (!s || s.role !== "rater") redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s || s.role !== "admin") redirect("/login");
  return s;
}
