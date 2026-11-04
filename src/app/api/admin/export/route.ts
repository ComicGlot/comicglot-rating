import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

function csv(v: unknown): string {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const table = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(csv).join(",")).join("\n") + "\n";

const blockInclude = {
  page: { select: { index: true, chapter: { select: { externalId: true, study: { select: { name: true } } } } } },
} as const;

// GET ?kind=types|transcribe|compare|pages  (admin only). One CSV per step, unblinded.
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "admin") return new NextResponse("Forbidden", { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "compare";
  let body: string;

  if (kind === "pages") {
    const rows = await db.pageDone.findMany({
      orderBy: { createdAt: "asc" },
      include: { rater: { select: { username: true } }, page: { select: { index: true, chapter: { select: { externalId: true, study: { select: { name: true } } } } } } },
    });
    body = table(
      ["study", "chapter", "page", "rater", "step", "text_without_box", "note", "ms_spent", "saved_at"],
      rows.map((d) => [d.page.chapter.study.name, d.page.chapter.externalId, d.page.index, d.rater.username, d.step, d.missing, d.note, d.msSpent, d.createdAt.toISOString()]),
    );
  } else if (kind === "types" || kind === "transcribe" || kind === "compare") {
    const rows = await db.response.findMany({
      where: { step: kind },
      orderBy: [{ raterId: "asc" }, { createdAt: "asc" }],
      include: {
        rater: { select: { username: true } },
        block: { include: { ...blockInclude, ...(kind === "compare" ? { candidates: true } : {}) } },
      },
    });
    const id = (r: (typeof rows)[number]) => [r.block.page.chapter.study.name, r.block.page.chapter.externalId, r.block.page.index, r.block.externalId, r.block.order, r.rater.username];
    const idHead = ["study", "chapter", "page", "block", "order", "rater"];
    if (kind === "types") {
      body = table([...idHead, "detector_type", "rater_type", "agree", "note"], rows.map((r) => {
        const d = r.data as { type?: string; note?: string };
        return [...id(r), r.block.className, d.type, d.type === r.block.className, d.note];
      }));
    } else if (kind === "transcribe") {
      // Every reader output stored with the block becomes a column, for the CER table.
      const keys = [...new Set(rows.flatMap((r) => Object.keys((r.block.readings ?? {}) as object)))].sort();
      body = table([...idHead, "detector_type", "gt_text", "unreadable", "pipeline_text", ...keys.map((k) => `reading:${k}`)], rows.map((r) => {
        const d = r.data as { text?: string; unreadable?: boolean };
        const rd = (r.block.readings ?? {}) as Record<string, unknown>;
        return [...id(r), r.block.className, d.text, !!d.unreadable, r.block.sourceText, ...keys.map((k) => rd[k])];
      }));
    } else {
      // One row per comparison set; letters are mapped back to conditions.
      type Set = { model: string | null; letters: Record<string, string>; choice: string; tone: Record<string, string> };
      const out: unknown[][] = [];
      for (const r of rows) {
        const d = r.data as { sets?: Set[]; own?: string; comment?: string };
        const cand = new Map((r.block as unknown as { candidates: { id: string; condition: string; text: string }[] }).candidates.map((c) => [c.id, c]));
        for (const st of d.sets ?? []) {
          const conds = Object.fromEntries(Object.entries(st.letters).map(([l, cid]) => [l, cand.get(cid)?.condition ?? "?"]));
          out.push([
            ...id(r), r.block.className, st.model, Object.values(conds).sort().join("|"),
            st.choice, st.choice === "tie" ? "tie" : conds[st.choice],
            Object.entries(st.tone).map(([l, t]) => `${conds[l]}:${t}`).join(";"),
            r.block.sourceText, Object.entries(conds).map(([l, c]) => `${c}: ${cand.get(st.letters[l])?.text ?? ""}`).join("\n"),
            d.own, d.comment, r.updatedAt.toISOString(),
          ]);
        }
      }
      body = table([...idHead, "detector_type", "model", "conditions", "choice_letter", "choice_condition", "tone_by_condition", "source", "candidates", "own_translation", "comment", "saved_at"], out);
    }
  } else {
    return new NextResponse("kind must be types, transcribe, compare or pages", { status: 400 });
  }
  return new NextResponse("\uFEFF" + body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}.csv"` },
  });
}
