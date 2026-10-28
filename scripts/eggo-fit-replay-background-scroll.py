"""Fit vertical screenshot offsets per field for native/app replay frames."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 240, 160
FIELDS = {"player": (0, 112), "cpu": (128, 240)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-sheet", type=Path, required=True)
    parser.add_argument("--native-dir", type=Path, required=True)
    parser.add_argument("--native-prefix", default="eggo-replay-full-graphics")
    parser.add_argument("--frames", default="1,2,18,47,110,191,218,231,245,280,300,384,471,600")
    parser.add_argument("--columns", type=int, default=10)
    parser.add_argument("--max-shift", type=int, default=128)
    parser.add_argument("--y-min", type=int, default=0)
    parser.add_argument("--y-max", type=int, default=HEIGHT)
    args = parser.parse_args()

    frames = [int(value) for value in args.frames.split(",") if value.strip()]
    if any(frame < 1 or frame > 600 for frame in frames):
        raise SystemExit("Frame numbers must be in 1..600")
    with Image.open(args.app_sheet.resolve()) as image:
        sheet = image.convert("RGB")
    native_dir = args.native_dir.resolve()
    trace_path = native_dir / f"{args.native_prefix}.trace.json"
    native_trace = json.loads(trace_path.read_text(encoding="utf-8")) if trace_path.is_file() else None
    results = []
    shifts = range(-args.max_shift, args.max_shift + 1)

    for frame in frames:
        app_x = ((frame - 1) % args.columns) * WIDTH
        app_y = ((frame - 1) // args.columns) * HEIGHT
        app_frame = np.asarray(
            sheet.crop((app_x, app_y, app_x + WIDTH, app_y + HEIGHT)), dtype=np.uint8
        )
        native_path = native_dir / f"{args.native_prefix}.frame{frame:05d}.png"
        with Image.open(native_path) as image:
            native_frame = np.asarray(image.convert("RGB"), dtype=np.uint8)
        for field, (x0, x1) in FIELDS.items():
            scores = []
            for shift in shifts:
                y0 = max(args.y_min, -shift)
                y1 = min(args.y_max, HEIGHT - shift)
                app = app_frame[y0:y1, x0:x1]
                native = native_frame[y0 + shift:y1 + shift, x0:x1]
                matches = int(np.count_nonzero(np.all(app == native, axis=2)))
                scores.append((matches, shift, y0, y1))
            scores.sort(reverse=True)
            best_count, best_shift, y0, y1 = scores[0]
            if native_trace is not None:
                sample = native_trace[frame - 1]
                camera = sample.get("native_cameras", {}).get(field, {})
                bg3 = sample.get("native_bg_offsets", {}).get("bg3", {})
                details = {
                    "native_camera_y": camera.get("camera_y"),
                    "native_bg3_vofs": bg3.get("vofs"),
                    "native_bg3_hofs": bg3.get("hofs"),
                }
            else:
                details = {}
            compared = max(1, (y1 - y0) * (x1 - x0))
            results.append({
                "frame": frame,
                "field": field,
                "best_native_y_offset": best_shift,
                "exact_matches": best_count,
                "compared_pixels": compared,
                "match_fraction": round(best_count / compared, 6),
                "second_best_offset": scores[1][1],
                "second_best_matches": scores[1][0],
                **details,
            })

    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
    out = ROOT / "scripts" / "OUTPUT" / f"eggo-replay-background-fit_{stamp}"
    out.mkdir(parents=True, exist_ok=False)
    parameters = {
        "app_sheet": str(args.app_sheet.resolve()),
        "native_dir": str(native_dir),
        "native_prefix": args.native_prefix,
        "frames": frames,
        "searched_native_y_offsets": [min(shifts), max(shifts)],
        "compared_screen_rows": [args.y_min, args.y_max],
        "fields": FIELDS,
        "score": "exact RGB pixel matches after shifting the native image vertically",
    }
    (out / "parameters.json").write_text(json.dumps(parameters, indent=2), encoding="utf-8")
    with (out / "field-offset-fits.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)
    (out / "summary.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps({"output_dir": str(out), "fits": results}, indent=2))


if __name__ == "__main__":
    main()
