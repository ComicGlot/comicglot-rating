import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

// Crops are page excerpts: serve them only to the admin and to raters who have the item.
export async function GET(_: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorised", { status: 401 });
  if (s.role === "rater") {
    const a = await db.assignment.findUnique({ where: { raterId_itemId: { raterId: s.sub, itemId } } });
    if (!a) return new NextResponse("Not found", { status: 404 });
  }
  const it = await db.item.findUnique({ where: { id: itemId }, select: { imageData: true, imageMime: true } });
  if (!it?.imageData || !it.imageMime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(it.imageData), {
    headers: { "Content-Type": it.imageMime, "Cache-Control": "private, no-store" },
  });
}
