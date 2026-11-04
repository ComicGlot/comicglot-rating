"""Turn ComicGlot pipeline runs into a chapters file for the rating app (tools/import.ts).

Run it from the ComicGlot code repository's environment (it needs Pillow only):

    python tools/export_chapters.py --project-root E:/Projects/Python/ComicGlot \
        --runs E:/Projects/Python/ComicGlot/data/output/comicglot_run25/chapter_full_results.json ... \
        --calls study_round1/calls.jsonl --conditions true_class no_class \
        --readings ocr_systems.csv --study round1 --out data/round1

With --per-type N it samples frames instead of whole chapters: frames are drawn at random, rarest
type first, until every type has at least N blocks, then shuffled across series and grouped into sets
of --set-size frames, which the app shows like chapters. Pass only runs of chapters the detector was
not trained on. Without --per-type, every run becomes one chapter.

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
import random
import re
from collections import Counter, defaultdict
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
    ap.add_argument("--per-type", type=int, default=0, help="sample frames until every type has this many blocks")
    ap.add_argument("--set-size", type=int, default=20, help="frames per set when sampling")
    ap.add_argument("--seed", type=int, default=0)
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
    frames = []  # (run, index, frame) in reading order
    groups = []  # (chapter id, title, [frame keys])
    for run_file in a.runs:
        run = run_file.parent.name
        try:
            data = json.loads(run_file.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"skipped {run_file}: {e}")
            continue
        keys = []
        for k, frame in enumerate(data.get("frames", [])):
            if lo <= k <= hi and (frame.get("blocks") or not (a.skip_empty or a.per_type)):
                frames.append((run, k, frame))
                keys.append(len(frames) - 1)
        groups.append((run, f"Chapter {len(groups) + 1}", keys))

    if a.per_type:
        rng = random.Random(a.seed)
        types = Counter(b.get("class_name") for _, _, f in frames for b in f["blocks"])
        have, chosen = Counter(), []
        for t in sorted(types, key=lambda t: (types[t], t)):
            pool = [i for i, (_, _, f) in enumerate(frames) if i not in chosen and any(b.get("class_name") == t for b in f["blocks"])]
            rng.shuffle(pool)
            while have[t] < a.per_type and pool:
                i = pool.pop()
                chosen.append(i)
                have.update(b.get("class_name") for b in frames[i][2]["blocks"])
        rng.shuffle(chosen)
        groups = [(f"{a.study}-set{n // a.set_size + 1:02d}", f"Set {n // a.set_size + 1}", chosen[n:n + a.set_size])
                  for n in range(0, len(chosen), a.set_size)]
        short = {t: have[t] for t in types if have[t] < a.per_type}
        print("blocks per type:", dict(sorted(have.items(), key=lambda x: -x[1])))
        if short:
            print("types with fewer blocks than asked (all available frames used):", short)

    chapters, n_pages, n_blocks, n_cands = [], 0, 0, 0
    for cid, title, keys in groups:
        pages = []
        for pos, i in enumerate(keys):
            run, k, frame = frames[i]
            im = Image.open(local_path(frame["image_path"], a.project_root)).convert("RGB")
            sc = min(1.0, a.max_width / im.width)
            if sc < 1:
                im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
            rel = Path("images") / run / f"{k:03d}.jpg"
            (a.out / rel).parent.mkdir(parents=True, exist_ok=True)
            im.save(a.out / rel, quality=a.quality, optimize=True)
            out_blocks = []
            for order, b in enumerate(frame.get("blocks", [])):
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
            # In a sampled set the page index is the position in the set; the frame is named by its blocks' ids.
            pages.append({"index": pos if a.per_type else k, "image_file": rel.as_posix(), "image_mime": "image/jpeg",
                          "width": im.width, "height": im.height, "blocks": out_blocks})
            n_blocks += len(out_blocks)
        n_pages += len(pages)
        chapters.append({"id": cid, "title": title, "pages": pages})

    a.out.mkdir(parents=True, exist_ok=True)
    out = {"study": a.study, "steps": a.steps, "askOwnTranslation": not a.no_own, "guides": guides, "chapters": chapters}
    (a.out / "chapters.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(chapters)} chapters, {n_pages} pages, {n_blocks} blocks, {n_cands} candidates -> {a.out / 'chapters.json'}")


if __name__ == "__main__":
    main()
