"""Turn ComicGlot pipeline runs into a chapters file for the rating app (tools/import.ts).

Run it from the ComicGlot code repository's environment (it needs Pillow only):

    python tools/export_chapters.py --project-root E:/Projects/Python/ComicGlot \
        --runs E:/Projects/Python/ComicGlot/data/output/comicglot_run25/chapter_full_results.json ... \
        --calls study_round1/calls.jsonl --conditions true_class no_class \
        --readings ocr_systems.csv --study round1 --out data/round1

It writes <out>/chapters.json and <out>/images/<run>/<frame>.jpg. The images stay outside the JSON so
the file can be read and checked; `npm run import -- <out>/chapters.json` loads both.

Each frame (segment) of a run becomes one page and each detected block one numbered box. The
block's readings (the pipeline's text, secondary_text and corrected_text, plus every column of
--readings files) are stored for the CER export and never shown to raters. Candidates come from
calls.jsonl files of eval/translation_study/run_conditions.py; the source shown to translators is
the text that was translated.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

from PIL import Image


def local_path(src: str, root: Path) -> Path:
    """Map a Windows path from the original machine to this project root (everything from 'data' on)."""
    parts = [p for p in re.split(r"[\\/]", src) if p]
    if "data" in parts:
        parts = parts[parts.index("data"):]
    return root.joinpath(*parts)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", type=Path, nargs="+", required=True, help="chapter_full_results.json files, one per chapter")
    ap.add_argument("--project-root", type=Path, required=True)
    ap.add_argument("--study", required=True)
    ap.add_argument("--steps", nargs="+", default=["types", "transcribe", "compare", "review"])
    ap.add_argument("--no-own", action="store_true", help="do not ask translators for their own translation first")
    ap.add_argument("--guides", type=Path, help="style_guides.json (default: <project-root>/data/prompts/style_guides.json)")
    ap.add_argument("--calls", type=Path, nargs="*", default=[], help="calls.jsonl files with candidate translations")
    ap.add_argument("--conditions", nargs="*", default=["true_class", "no_class"], help="conditions to take from --calls")
    ap.add_argument("--readings", type=Path, nargs="*", default=[], help="CSV: block_uid plus one column per reader")
    ap.add_argument("--frames", default="", help="frame range per chapter, e.g. 0-19 (default: all)")
    ap.add_argument("--skip-empty", action="store_true", help="leave out frames without blocks")
    ap.add_argument("--max-width", type=int, default=900)
    ap.add_argument("--quality", type=int, default=85)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()

    guides_path = a.guides or a.project_root / "data" / "prompts" / "style_guides.json"
    guides = json.loads(guides_path.read_text(encoding="utf-8")) if guides_path.exists() else None

    cands: dict[str, list[dict]] = defaultdict(list)
    source_of: dict[str, str] = {}
    for f in a.calls:
        for line in f.read_text(encoding="utf-8").splitlines():
            c = json.loads(line)
            if c.get("condition") not in a.conditions or not c.get("translation"):
                continue
            cands[c["block_uid"]].append({"condition": c["condition"], "model": c.get("model"), "text": c["translation"]})
            source_of.setdefault(c["block_uid"], c.get("source_text") or "")

    extra: dict[str, dict[str, str]] = defaultdict(dict)
    for f in a.readings:
        for row in csv.DictReader(open(f, encoding="utf-8-sig")):
            uid = row.pop("block_uid")
            extra[uid].update({k: v for k, v in row.items() if v})

    lo, hi = (int(x) for x in a.frames.split("-")) if a.frames else (0, 10**9)
    chapters, n_pages, n_blocks, n_cands = [], 0, 0, 0
    for run_file in a.runs:
        run = run_file.parent.name
        data = json.loads(run_file.read_text(encoding="utf-8"))
        pages = []
        for k, frame in enumerate(data.get("frames", [])):
            if not lo <= k <= hi:
                continue
            blocks = frame.get("blocks", [])
            if a.skip_empty and not blocks:
                continue
            im = Image.open(local_path(frame["image_path"], a.project_root)).convert("RGB")
            sc = min(1.0, a.max_width / im.width)
            if sc < 1:
                im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
            rel = Path("images") / run / f"{k:03d}.jpg"
            (a.out / rel).parent.mkdir(parents=True, exist_ok=True)
            im.save(a.out / rel, quality=a.quality, optimize=True)
            out_blocks = []
            for order, b in enumerate(blocks):
                uid = f"{run}/{b.get('frame_id', frame.get('id'))}/{b.get('id')}"
                readings = {f: b[f] for f in ("text", "secondary_text", "corrected_text") if b.get(f)}
                readings.update(extra.get(uid, {}))
                source = source_of.get(uid) or b.get("corrected_text") or b.get("text") or ""
                out_blocks.append({
                    "id": uid, "order": order, "box": [round(v * sc) for v in b["box"]],
                    "class_name": b.get("class_name"), "source": source, "readings": readings,
                    "candidates": cands.get(uid, []),
                })
                n_cands += len(cands.get(uid, []))
            pages.append({"index": k, "image_file": rel.as_posix(), "image_mime": "image/jpeg",
                          "width": im.width, "height": im.height, "blocks": out_blocks})
            n_blocks += len(out_blocks)
        n_pages += len(pages)
        chapters.append({"id": run, "title": f"Chapter {len(chapters) + 1}", "pages": pages})

    a.out.mkdir(parents=True, exist_ok=True)
    out = {"study": a.study, "steps": a.steps, "askOwnTranslation": not a.no_own, "guides": guides, "chapters": chapters}
    (a.out / "chapters.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(chapters)} chapters, {n_pages} pages, {n_blocks} blocks, {n_cands} candidates -> {a.out / 'chapters.json'}")


if __name__ == "__main__":
    main()
