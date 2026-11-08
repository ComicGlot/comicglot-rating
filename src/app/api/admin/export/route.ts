import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ATTENTION_MODEL } from "@/lib/steps";

function csv(v: unknown): string {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const table = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(csv).join(",")).join("\n") + "\n";

const blockInclude = {
  page: { select: { index: true, chapter: { select: { externalId: true, study: { select: { name: true } } } } } },
} as const;

// Practice sets never reach an export.
const counted = { page: { chapter: { practice: false } } } as const;
const kindOf = (username: string) => (username.startsWith("model:") ? "model" : "person");

// GET ?kind=types|transcribe|compare|pages  (admin only). One CSV per step, unblinded.
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "admin") return new NextResponse("Forbidden", { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "compare";
  let body: string;

  if (kind === "pages") {
    const rows = await db.pageDone.findMany({
      where: counted,
      orderBy: { createdAt: "asc" },
      include: { rater: { select: { username: true } }, page: { select: { index: true, chapter: { select: { externalId: true, study: { select: { name: true } } } } } } },
    });
    body = table(
      ["study", "chapter", "page", "rater", "rater_kind", "step", "text_without_box", "note", "ms_spent", "saved_at", "updated_at"],
      rows.map((d) => [d.page.chapter.study.name, d.page.chapter.externalId, d.page.index, d.rater.username, kindOf(d.rater.username), d.step, d.missing, d.note, d.msSpent, d.createdAt.toISOString(), d.updatedAt.toISOString()]),
    );
  } else if (kind === "types" || kind === "transcribe" || kind === "compare") {
    const rows = await db.response.findMany({
      where: { step: kind, block: counted },
      orderBy: [{ raterId: "asc" }, { createdAt: "asc" }],
      include: {
        rater: { select: { username: true } },
        block: { include: { ...blockInclude, ...(kind === "compare" ? { candidates: true } : {}) } },
      },
    });
    const id = (r: (typeof rows)[number]) => [r.block.page.chapter.study.name, r.block.page.chapter.externalId, r.block.page.index, r.block.externalId, r.block.order, r.rater.username, kindOf(r.rater.username)];
    const idHead = ["study", "chapter", "page", "block_uid", "order", "rater", "rater_kind"];
    if (kind === "types") {
      body = table([...idHead, "detector_type", "rater_type", "agree", "note", "ms"], rows.map((r) => {
        const d = r.data as { type?: string; note?: string; ms?: number };
        return [...id(r), r.block.className, d.type, d.type === r.block.className, d.note, d.ms];
      }));
    } else if (kind === "transcribe") {
      // Every reader output stored with the block becomes a column, for the CER table.
      const keys = [...new Set(rows.flatMap((r) => Object.keys((r.block.readings ?? {}) as object)))].sort();
      body = table([...idHead, "detector_type", "gt_text", "unreadable", "pipeline_text", "ms", ...keys.map((k) => `reading:${k}`)], rows.map((r) => {
        const d = r.data as { text?: string; unreadable?: boolean; ms?: number };
        const rd = (r.block.readings ?? {}) as Record<string, unknown>;
        // gt_text follows eval/ocr_eval.py: "#ILLEGIBLE" for blocks the rater could not read.
        return [...id(r), r.block.className, d.unreadable ? "#ILLEGIBLE" : d.text, !!d.unreadable, r.block.sourceText, d.ms, ...keys.map((k) => rd[k])];
      }));
    } else {
      // One row per comparison set; letters are mapped back to conditions.
      type Set = { model: string | null; letters: Record<string, string>; choice: string; tone: Record<string, string> };
      const out: unknown[][] = [];
      for (const r of rows) {
        const d = r.data as { sets?: Set[]; own?: string; comment?: string; sourceWrong?: boolean; ms?: number };
        const cand = new Map((r.block as unknown as { candidates: { id: string; condition: string; text: string }[] }).candidates.map((c) => [c.id, c]));
        for (const st of d.sets ?? []) {
          const conds = Object.fromEntries(Object.entries(st.letters).map(([l, cid]) => [l, cand.get(cid)?.condition ?? "?"]));
          const attention = st.model === ATTENTION_MODEL;
          out.push([
            ...id(r), r.block.className, st.model, Object.values(conds).sort().join("|"),
            st.choice, st.choice === "tie" ? "tie" : conds[st.choice],
            Object.entries(st.tone).map(([l, t]) => `${conds[l]}:${t}`).join(";"),
            attention, attention ? st.choice === "tie" : "",
            !!d.sourceWrong,
            r.block.sourceText, Object.entries(conds).map(([l, c]) => `${c}: ${cand.get(st.letters[l])?.text ?? ""}`).join("\n"),
            d.own, d.comment, d.ms, r.updatedAt.toISOString(),
          ]);
        }
      }
      body = table(
        [...idHead, "detector_type", "model", "conditions", "choice_letter", "choice_condition", "tone_by_condition", "is_attention_check", "attention_passed", "source_wrong", "source", "candidates", "own_translation", "comment", "ms", "saved_at"],
        out,
      );
    }
  } else {
    return new NextResponse("kind must be types, transcribe, compare or pages", { status: 400 });
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="comicglot-${kind}-${stamp}.csv"` },
  });
}
