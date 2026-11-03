import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";

// Everything except the login page needs a valid session; /admin needs the admin role.
export async function middleware(req: NextRequest) {
  const s = await verifySession(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  const isAdminPath = p.startsWith("/admin") || p.startsWith("/api/admin");
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  if (isAdminPath && s.role !== "admin") return NextResponse.redirect(new URL("/rate", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/rate/:path*", "/admin/:path*", "/api/:path*"] };
