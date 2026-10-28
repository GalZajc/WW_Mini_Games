"""Audit placed-cell template coverage for the one- and two-cell pieces."""
from datetime import datetime
import csv
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "renderer/games/eggo-mania/assets"
STAGES = ["beanstalk", "factory", "dragon", "castle", "pirate", "space", "jungle", "park"]
KINDS = list(range(8))
SCALE = 2
MASK_DATA = json.loads((ASSETS / "native-piece-masks.json").read_text(encoding="utf-8"))
MASKS = MASK_DATA["masks"]
MANIFEST = json.loads((ASSETS / "placed-pieces.json").read_text(encoding="utf-8"))

stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
OUT = ROOT / "scripts/OUTPUT" / f"eggo-placed-atlas-audit_{stamp}"
OUT.mkdir(parents=True)

parameters = {
    "experiment": "eggo-placed-atlas-audit",
    "created_local": datetime.now().astimezone().isoformat(),
    "stages": STAGES,
    "piece_kinds": KINDS,
    "rotations": list(range(4)),
    "cell_size_px": 16,
    "template_size_px": 48,
    "reference_rom_sha256": MANIFEST["parameters"]["rom_sha256"],
    "native_masks_sha256": hashlib.sha256((ASSETS / "native-piece-masks.json").read_bytes()).hexdigest(),
    "atlas_sha256": {},
    "random_seed": None,
    "method": "measure alpha coverage and per-cell pixel hashes inside occupied native mask cells",
}

records = []
sheet_cell = 48
label_w = 62
label_h = 30
col_w = sheet_cell * SCALE + 10
row_h = sheet_cell * SCALE + 10
sheet = Image.new("RGBA", (label_w + 4 * len(KINDS) * col_w, label_h + len(STAGES) * row_h), (26, 27, 31, 255))
draw = ImageDraw.Draw(sheet)
for rotation in range(4):
    for kind_index, kind in enumerate(KINDS):
        x = label_w + (rotation * len(KINDS) + kind_index) * col_w
        draw.text((x + 3, 7), f"k{kind} r{rotation}", fill=(232, 234, 239, 255))

for stage_index, stage in enumerate(STAGES):
    path = ASSETS / f"placed-{stage}.png"
    atlas_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    parameters["atlas_sha256"][stage] = atlas_hash
    atlas = Image.open(path).convert("RGBA")
    for rotation in range(4):
        for kind_index, kind in enumerate(KINDS):
            mask = MASKS[rotation * 8 + kind]
            min_x = min(x for x, _ in mask)
            max_x = max(x for x, _ in mask)
            min_y = min(y for _, y in mask)
            max_y = max(y for _, y in mask)
            width = (max_x - min_x + 1) * 16
            height = (max_y - min_y + 1) * 16
            piece = Image.new("RGBA", (sheet_cell, sheet_cell), (10, 11, 14, 255))
            x_offset = (sheet_cell - width) // 2
            y_offset = (sheet_cell - height) // 2
            cell_metrics = []
            for cell_x, cell_y in mask:
                crop = atlas.crop((kind * 48 + cell_x * 16, rotation * 48 + cell_y * 16,
                                   kind * 48 + (cell_x + 1) * 16, rotation * 48 + (cell_y + 1) * 16))
                pixels = np.asarray(crop)
                opaque = int(np.count_nonzero(pixels[:, :, 3]))
                unique = int(np.unique(pixels.reshape(-1, 4), axis=0).shape[0])
                ys, xs = np.nonzero(pixels[:, :, 3])
                bbox = None if not len(xs) else [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
                cell_metrics.append(opaque)
                records.append({
                    "stage": stage, "kind": kind, "rotation": rotation,
                    "cell_x": cell_x, "cell_y": cell_y,
                    "opaque_pixels": opaque, "opaque_fraction": round(opaque / 256, 6),
                    "unique_rgba": unique, "opaque_bbox": json.dumps(bbox),
                    "cell_sha256": hashlib.sha256(pixels.tobytes()).hexdigest(),
                })
                piece.paste(crop, (x_offset + (cell_x - min_x) * 16,
                                   y_offset + (cell_y - min_y) * 16), crop)
            x = label_w + (rotation * len(KINDS) + kind_index) * col_w + 5
            y = label_h + stage_index * row_h + 5
            sheet.paste(piece.resize((sheet_cell * SCALE, sheet_cell * SCALE), Image.Resampling.NEAREST), (x, y))
            draw.text((4, y + sheet_cell * SCALE // 2 - 5), stage, fill=(232, 234, 239, 255))

parameters["cell_records"] = len(records)
parameters["opacity_summary"] = {
    f"kind_{kind}": {
        "minimum_opaque_pixels": min(row["opaque_pixels"] for row in records if row["kind"] == kind),
        "cells_below_90_percent": sum(row["opaque_fraction"] < 0.9 for row in records if row["kind"] == kind),
    }
    for kind in KINDS
}
(OUT / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
with (OUT / "cell-audit.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=records[0].keys())
    writer.writeheader()
    writer.writerows(records)
sheet.save(OUT / "contact-sheet.png")
print(json.dumps({"output": str(OUT), "opacity_summary": parameters["opacity_summary"]}, ensure_ascii=False))
