"""Turn ComicGlot study translations into an import file for the rating app.

Run from a ComicGlot checkout (it imports the study tooling there):

    python tools/export_packet.py --comicglot E:/Projects/Python/ComicGlot \
        --calls study_round1/calls.jsonl --runs RUN/chapter_full_results.json ... \
        --study round1 --out data/round1.json

calls.jsonl comes from `python -m eval.translation_study.run_conditions` in ComicGlot.
Each item gets a crop of its frame with the block outlined, the previous lines of the
scene, the Korean source and one candidate per condition. The output holds page excerpts:
keep it out of git (data/ is ignored) and delete it once imported.
"""
from __future__ import annotations

import argparse
import base64
import collections
import io
import json
import sys
from pathlib import Path


def marked_crop(block, root: Path, local_path, pad: int = 220, max_w: int = 720) -> bytes:
    from PIL import Image, ImageDraw
    im = Image.open(local_path(block["_frame_image"] or block["source_image"], root)).convert("RGB")
    x0, y0, x1, y1 = map(int, block["box"])
    ImageDraw.Draw(im).rectangle([x0 - 4, y0 - 4, x1 + 4, y1 + 4], outline=(220, 30, 30), width=4)
    crop = im.crop((0, max(0, y0 - pad), im.width, min(im.height, y1 + pad)))
    if crop.width > max_w:
        crop = crop.resize((max_w, int(crop.height * max_w / crop.width)))
    buf = io.BytesIO()
    crop.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--comicglot", type=Path, required=True, help="ComicGlot repository root")
    ap.add_argument("--calls", type=Path, required=True)
    ap.add_argument("--runs", type=Path, nargs="+", required=True)
    ap.add_argument("--study", required=True)
    ap.add_argument("--context", type=int, default=3)
    ap.add_argument("--no-own-translation", action="store_true")
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()

    sys.path.insert(0, str(a.comicglot))
    from eval.make_ocr_gt_sheet import local_path
    from eval.translation_study.run_conditions import load_blocks

    calls = [json.loads(l) for l in open(a.calls, encoding="utf-8")]
    by_item = collections.defaultdict(dict)
    for c in calls:
        by_item[c["block_uid"]][c["condition"]] = c
    order, blocks = load_blocks(a.runs)

    items = []
    for uid, conds in sorted(by_item.items()):
        b = blocks[uid]
        i = order.index(uid)
        prev = [blocks[u] for u in order[max(0, i - a.context):i] if blocks[u]["_run"] == b["_run"]]
        first = next(iter(conds.values()))
        items.append({
            "id": uid,
            "class_name": b.get("class_name"),
            "source": first.get("source_text") or b.get("corrected_text") or b.get("text") or "",
            "context": [p.get("corrected_text") or p.get("text") or "" for p in prev],
            "image_mime": "image/png",
            "image_b64": base64.b64encode(marked_crop(b, a.comicglot, local_path)).decode(),
            "candidates": {k: v["translation"] for k, v in conds.items()},
        })
    a.out.parent.mkdir(parents=True, exist_ok=True)
    json.dump({"study": a.study, "askOwnTranslation": not a.no_own_translation, "items": items},
              open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(items)} items -> {a.out}")


if __name__ == "__main__":
    main()
