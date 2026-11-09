import { NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";

export async function POST(req: Request) {
  const token = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const s = await verifySession(token);
  const res = NextResponse.redirect(new URL(s?.role === "admin" ? "/admin/login" : "/login", req.url), 303);
  res.cookies.delete(COOKIE);
  return res;
}
