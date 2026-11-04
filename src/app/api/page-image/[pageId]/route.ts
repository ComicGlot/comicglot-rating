import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeePage } from "@/lib/flow";

// Pages belong to their publishers: serve them only to the admin and to raters assigned the chapter.
export async function GET(_: Request, ctx: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await ctx.params;
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorised", { status: 401 });
  if (s.role === "rater" && !(await canSeePage(s.sub, pageId))) return new NextResponse("Not found", { status: 404 });
  const p = await db.page.findUnique({ where: { id: pageId }, select: { imageData: true, imageMime: true } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(p.imageData), {
    // The page image is also used for every crop, so let the browser keep it for the session.
    headers: { "Content-Type": p.imageMime, "Cache-Control": "private, max-age=3600" },
  });
}
