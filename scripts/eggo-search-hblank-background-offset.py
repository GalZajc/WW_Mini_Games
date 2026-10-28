#!/usr/bin/env python3
"""Search small screen offsets for native BG2/BG3 pixels in frame 191."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import argparse
import csv
import hashlib
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
NORMAL_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-26"
ALTERNATE_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-09"
NATIVE = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.frame00191.png"
FRAME = 191
CPU_LEFT, CPU_RIGHT = 128, 240
SPLIT_Y = 142


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-sheet", type=Path, required=True,
                        help="600-frame Electron replay contact sheet")
    parser.add_argument("--radius", type=int, default=24,
                        help="Maximum absolute X/Y offset to search")
    args = parser.parse_args()
    app_path = args.app_sheet.resolve()
    app_parameters = json.loads((app_path.parent / "parameters.json").read_text(encoding="utf-8"))
    if app_parameters.get("audioOutputMuted") is not True:
        raise ValueError("Selected Electron capture is not confirmed muted")

    native = np.asarray(Image.open(NATIVE).convert("RGB"))
    sheet = Image.open(app_path).convert("RGB")
    sheet_x = ((FRAME - 1) % 10) * 240 + CPU_LEFT
    sheet_y = ((FRAME - 1) // 10) * 160
    app = np.asarray(sheet.crop((sheet_x, sheet_y, sheet_x + 112, sheet_y + 160)))
    native = native[:, CPU_LEFT:CPU_RIGHT]
    normal_map = np.asarray(Image.open(NORMAL_DIR / "top-layer-map.png").convert("RGBA"))[:, CPU_LEFT:CPU_RIGHT]
    alt_map = np.asarray(Image.open(ALTERNATE_DIR / "top-layer-map.png").convert("RGBA"))[:, CPU_LEFT:CPU_RIGHT]
    top_map = normal_map.copy()
    top_map[SPLIT_Y:] = alt_map[SPLIT_Y:]

    rows = []
    summaries = {}
    radius = max(0, min(64, args.radius))
    for phase, y0, y1 in (("normal", 0, SPLIT_Y), ("alternate", SPLIT_Y, 160)):
        for layer_id in (2, 3):
            code = np.array([1, layer_id + 1], dtype=np.uint8)
            mask = np.all(top_map[y0:y1, :, :2] == code, axis=2)
            yy, xx = np.nonzero(mask)
            candidates = []
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    ax, ay = xx + dx, yy + y0 + dy
                    valid = (ax >= 0) & (ax < 112) & (ay >= 0) & (ay < 160)
                    if not np.any(valid):
                        continue
                    expected = native[yy[valid] + y0, xx[valid]]
                    observed = app[ay[valid], ax[valid]]
                    delta = observed.astype(np.int16) - expected.astype(np.int16)
                    different = np.any(delta != 0, axis=1)
                    candidates.append({
                        "phase": phase, "layer": f"BG{layer_id}", "dx": dx, "dy": dy,
                        "reference_pixels": int(len(delta)),
                        "exact_pixels": int(np.count_nonzero(~different)),
                        "mean_absolute_channel_error": float(np.abs(delta).mean()),
                    })
            candidates.sort(key=lambda row: (-row["exact_pixels"],
                                               row["mean_absolute_channel_error"],
                                               abs(row["dx"]) + abs(row["dy"]), row["dy"], row["dx"]))
            direct = next(row for row in candidates if row["dx"] == 0 and row["dy"] == 0)
            key = f"{phase}_BG{layer_id}"
            summaries[key] = {"native_top_pixels": int(mask.sum()), "direct": direct,
                              "best_offsets": candidates[:12]}
            rows.extend(candidates)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-hblank-background-offset_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Frame-191 HBlank background screen-offset search",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "frame": FRAME, "cpu_crop": [CPU_LEFT, 0, CPU_RIGHT, 160],
        "hblank_split_y": SPLIT_Y, "searched_radius_pixels": radius,
        "layers": ["BG2", "BG3"],
        "search_metric": "Exact final RGB equality and mean absolute channel error on pixels whose native top layer is BG2/BG3",
        "app_frame_sheet": app_path.relative_to(ROOT).as_posix(),
        "app_audio_output_muted": True, "random_seed": None,
        "input_sha256": {path.relative_to(ROOT).as_posix(): sha256(path) for path in
                         (app_path, NATIVE, NORMAL_DIR / "top-layer-map.png",
                          ALTERNATE_DIR / "top-layer-map.png")},
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps({"layers": summaries,
        "output_directory": output.relative_to(ROOT).as_posix()}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with (output / "offset-scores.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), "layers": summaries}, indent=2))


if __name__ == "__main__":
    main()
