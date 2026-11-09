import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";

// Raters need a session for /rate; /admin (except its sign-in page) and /api/admin need the admin role.
export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p === "/admin/login") return NextResponse.next();
  const s = await verifySession(req.cookies.get(COOKIE)?.value);
  if (p.startsWith("/api/admin")) return s?.role === "admin" ? NextResponse.next() : new NextResponse("Forbidden", { status: 403 });
  if (p.startsWith("/admin")) return s?.role === "admin" ? NextResponse.next() : NextResponse.redirect(new URL("/admin/login", req.url));
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/rate/:path*", "/admin/:path*", "/api/:path*"] };
