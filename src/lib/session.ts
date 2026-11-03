// Signed session cookie. Works in the edge middleware and in server code.
import { SignJWT, jwtVerify } from "jose";

export type Role = "admin" | "rater";
export type Session = { sub: string; username: string; role: Role };

export const COOKIE = "cg_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ username: s.username, role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const role = payload.role === "admin" ? "admin" : payload.role === "rater" ? "rater" : null;
    if (!role || !payload.sub) return null;
    return { sub: payload.sub, username: String(payload.username ?? ""), role };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};
