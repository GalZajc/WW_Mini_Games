#!/usr/bin/env python3
"""Compare every app replay frame with same-frame native GBA screenshots."""
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image


FRAME_WIDTH = 240
FRAME_HEIGHT = 160
DEFAULT_FRAME_COUNT = 600
DEFAULT_APP_COLUMNS = 10
OUTPUT_ROOT = Path(__file__).resolve().parent / "OUTPUT"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-dir", type=Path, required=True, help="Folder with native frame PNGs")
    parser.add_argument("--native-prefix", required=True, help="Native PNG prefix before .frameNNNNN.png")
    parser.add_argument("--app-frame-sheet", type=Path, required=True, help="App contact sheet from the hidden replay harness")
    parser.add_argument("--frame-count", type=int, default=DEFAULT_FRAME_COUNT)
    parser.add_argument("--app-columns", type=int, default=DEFAULT_APP_COLUMNS)
    args = parser.parse_args()

    native_dir = args.native_dir.resolve()
    frame_sheet_path = args.app_frame_sheet.resolve()
    sheet = Image.open(frame_sheet_path).convert("RGBA")
    required_width = args.app_columns * FRAME_WIDTH
    required_height = ((args.frame_count + args.app_columns - 1) // args.app_columns) * FRAME_HEIGHT
    if sheet.size[0] < required_width or sheet.size[1] < required_height:
        raise ValueError(f"App sheet is {sheet.size}; expected at least {(required_width, required_height)}")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    out_dir = OUTPUT_ROOT / f"eggo-replay-screen-parity_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Eggo Mania native/app full-frame replay pixel comparison",
        "frame_count": args.frame_count,
        "frame_width": FRAME_WIDTH,
        "frame_height": FRAME_HEIGHT,
        "app_columns": args.app_columns,
        "native_dir": str(native_dir),
        "native_prefix": args.native_prefix,
        "app_frame_sheet": str(frame_sheet_path),
        "comparison": "RGBA exact match, including alpha",
        "created_utc": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "parameters.json").write_text(json.dumps(parameters, indent=2), encoding="utf-8")

    rows: list[dict[str, int | None]] = []
    totals = {"player": 0, "divider": 0, "cpu": 0}
    exact_frames = 0
    total_different_pixels = 0
    first_mismatch = None
    peak = {"frame": None, "different_pixels": -1}
    peak_images = None

    with (out_dir / "frame-differences.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=[
            "frame", "different_pixels", "player_pixels", "divider_pixels", "cpu_pixels",
            "min_x", "min_y", "max_x", "max_y", "first_x", "first_y",
        ])
        writer.writeheader()
        for frame in range(1, args.frame_count + 1):
            native_path = native_dir / f"{args.native_prefix}.frame{frame:05d}.png"
            if not native_path.is_file():
                raise FileNotFoundError(native_path)
            native = Image.open(native_path).convert("RGBA")
            if native.size != (FRAME_WIDTH, FRAME_HEIGHT):
                raise ValueError(f"{native_path.name} has size {native.size}")
            sheet_x = ((frame - 1) % args.app_columns) * FRAME_WIDTH
            sheet_y = ((frame - 1) // args.app_columns) * FRAME_HEIGHT
            app = sheet.crop((sheet_x, sheet_y, sheet_x + FRAME_WIDTH, sheet_y + FRAME_HEIGHT))
            native_pixels = np.asarray(native, dtype=np.uint8)
            app_pixels = np.asarray(app, dtype=np.uint8)
            different = np.any(native_pixels != app_pixels, axis=2)
            count = int(different.sum())
            total_different_pixels += count
            if count == 0:
                exact_frames += 1
                bounds = (None, None, None, None)
                first_xy = (None, None)
                player_count = divider_count = cpu_count = 0
            else:
                ys, xs = np.nonzero(different)
                bounds = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
                first_xy = (int(xs[0]), int(ys[0]))
                player_count = int(different[:, :112].sum())
                divider_count = int(different[:, 112:128].sum())
                cpu_count = int(different[:, 128:].sum())
                totals["player"] += player_count
                totals["divider"] += divider_count
                totals["cpu"] += cpu_count
                if first_mismatch is None:
                    first_mismatch = {"frame": frame, "different_pixels": count,
                                      "first_pixel": {"x": first_xy[0], "y": first_xy[1]},
                                      "bounds": {"min_x": bounds[0], "min_y": bounds[1],
                                                 "max_x": bounds[2], "max_y": bounds[3]}}
                    diff_pixels = native_pixels.copy()
                    diff_pixels[different] = np.array([255, 0, 255, 255], dtype=np.uint8)
                    Image.fromarray(diff_pixels, "RGBA").save(out_dir / f"frame{frame:05d}-diff.png")
                    app.save(out_dir / f"frame{frame:05d}-app.png")
                    native.save(out_dir / f"frame{frame:05d}-native.png")
            if count > peak["different_pixels"]:
                peak = {"frame": frame, "different_pixels": count}
                peak_images = (native.copy(), app.copy(), different.copy())
            row = {
                "frame": frame, "different_pixels": count,
                "player_pixels": player_count, "divider_pixels": divider_count, "cpu_pixels": cpu_count,
                "min_x": bounds[0], "min_y": bounds[1], "max_x": bounds[2], "max_y": bounds[3],
                "first_x": first_xy[0], "first_y": first_xy[1],
            }
            rows.append(row)
            writer.writerow(row)

    if peak_images is not None:
        peak_native, peak_app, peak_diff = peak_images
        peak_native.save(out_dir / f"frame{peak['frame']:05d}-native.png")
        peak_app.save(out_dir / f"frame{peak['frame']:05d}-app.png")
        peak_pixels = np.asarray(peak_native, dtype=np.uint8).copy()
        peak_pixels[peak_diff] = np.array([255, 0, 255, 255], dtype=np.uint8)
        Image.fromarray(peak_pixels, "RGBA").save(out_dir / f"frame{peak['frame']:05d}-diff.png")

    result = {
        "frames_compared": args.frame_count,
        "exact_frames": exact_frames,
        "first_mismatch": first_mismatch,
        "peak_difference": peak,
        "total_different_frame_pixels": total_different_pixels,
        "region_different_frame_pixels": totals,
        "all_frames_pixel_identical": exact_frames == args.frame_count,
        "outputs": {
            "frame_csv": "frame-differences.csv",
            "first_mismatch_native": f"frame{first_mismatch['frame']:05d}-native.png" if first_mismatch else None,
            "first_mismatch_app": f"frame{first_mismatch['frame']:05d}-app.png" if first_mismatch else None,
            "first_mismatch_diff": f"frame{first_mismatch['frame']:05d}-diff.png" if first_mismatch else None,
            "peak_difference_native": f"frame{peak['frame']:05d}-native.png" if peak_images else None,
            "peak_difference_app": f"frame{peak['frame']:05d}-app.png" if peak_images else None,
            "peak_difference_diff": f"frame{peak['frame']:05d}-diff.png" if peak_images else None,
        },
    }
    (out_dir / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out_dir), **result}, indent=2))


if __name__ == "__main__":
    main()
