#!/usr/bin/env python3
"""Attribute app/native mismatch pixels to captured native PPU layers."""
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
PARITY_DIR = ROOT / "scripts/OUTPUT/eggo-replay-screen-parity_2026-10-08_02-42-05_922850"
PPU_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_04-42-28"
FRAME_SHEET = ROOT / "tests/OUTPUT/eggo-mania-visual_2026-10-08T01-54-16-117Z/input-replay-app-frames.png"
FRAME = 1
SHEET_COLUMNS = 10
SCREEN_SIZE = (240, 160)
REGIONS = {"player": (0, 112), "divider": (112, 128), "cpu": (128, 240)}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def layer_name(kind: int, layer_id: int) -> str:
    return f"bg{layer_id}" if kind == 1 else f"obj{layer_id}" if kind == 2 else "backdrop"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parity-dir", type=Path, default=PARITY_DIR,
                        help="replay screenshot comparison output directory")
    parser.add_argument("--ppu-dir", type=Path, default=PPU_DIR,
                        help="native single-frame PPU reconstruction directory")
    parser.add_argument("--frame-sheet", type=Path, default=FRAME_SHEET,
                        help="app replay frame sheet PNG")
    parser.add_argument("--frame", type=int, default=FRAME,
                        help="one-based frame index in the app frame sheet")
    parser.add_argument("--sheet-columns", type=int, default=SHEET_COLUMNS)
    args = parser.parse_args()
    parity_dir = args.parity_dir if args.parity_dir.is_absolute() else ROOT / args.parity_dir
    ppu_dir = args.ppu_dir if args.ppu_dir.is_absolute() else ROOT / args.ppu_dir
    frame_sheet = args.frame_sheet if args.frame_sheet.is_absolute() else ROOT / args.frame_sheet
    frame = args.frame
    if frame < 1 or args.sheet_columns < 1:
        parser.error("--frame and --sheet-columns must be positive")

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-app-layer-attribution_{timestamp}"
    output.mkdir(parents=True, exist_ok=False)

    parity = json.loads((parity_dir / "results.json").read_text(encoding="utf-8"))
    ppu = json.loads((ppu_dir / "results.json").read_text(encoding="utf-8"))
    native_reference_path = parity_dir / f"frame{frame:05d}-native.png"
    if not native_reference_path.is_file():
        raise FileNotFoundError(f"No native replay screenshot for frame {frame}: {native_reference_path}")
    native = np.asarray(Image.open(native_reference_path).convert("RGB"))
    ppu_native = np.asarray(Image.open(ppu_dir / "native.png").convert("RGB"))
    if ppu_native.shape != native.shape or not np.array_equal(ppu_native, native):
        raise ValueError(
            "The PPU layer capture's native.png does not match the selected replay frame. "
            "Compose the same --frame before attributing layer priority."
        )
    ppu_composite = np.asarray(Image.open(ppu_dir / "composite.png").convert("RGB"))
    app_sheet = Image.open(frame_sheet).convert("RGB")
    x0 = ((frame - 1) % args.sheet_columns) * SCREEN_SIZE[0]
    y0 = ((frame - 1) // args.sheet_columns) * SCREEN_SIZE[1]
    app = np.asarray(app_sheet.crop((x0, y0, x0 + SCREEN_SIZE[0], y0 + SCREEN_SIZE[1])))
    if app.shape != native.shape:
        raise ValueError(f"App frame {app.shape} does not match native frame {native.shape}")

    mismatch = np.any(native != app, axis=2)
    ppu_mismatch = np.any(native != ppu_composite, axis=2)
    top_map = np.asarray(Image.open(ppu_dir / "top-layer-map.png").convert("RGBA"))
    layer_images = {}
    for bg in range(4):
        path = next((ppu_dir / name for name in (f"BG{bg}.png", f"bg{bg}.png")
                     if (ppu_dir / name).is_file()), None)
        if path is not None:
            layer_images[f"bg{bg}"] = np.asarray(Image.open(path).convert("RGBA"))

    rows = []
    samples = []
    for region, (left, right) in REGIONS.items():
        mask_region = mismatch[:, left:right]
        row = {
            "region": region,
            "app_native_mismatches": int(mask_region.sum()),
            "ppu_native_mismatches": int(ppu_mismatch[:, left:right].sum()),
        }
        region_mismatch = mismatch.copy()
        region_mask = np.zeros_like(mismatch)
        region_mask[:, left:right] = True
        region_mismatch &= region_mask
        ys, xs = np.nonzero(region_mismatch)
        app_matches = {name: 0 for name in layer_images}
        app_matches["native_top_layer"] = 0
        top_counts: dict[str, int] = {}
        other_layer_matches: dict[str, int] = {}
        for y, x in zip(ys.tolist(), xs.tolist()):
            rgba = top_map[y, x]
            top_kind, top_id = int(rgba[0]), int(rgba[1]) - 1
            top = layer_name(top_kind, top_id)
            top_counts[top] = top_counts.get(top, 0) + 1
            top_layer_pixels = layer_images.get(top)
            if top_layer_pixels is not None and top_layer_pixels[y, x, 3] and np.array_equal(
                app[y, x], top_layer_pixels[y, x, :3]
            ):
                app_matches["native_top_layer"] += 1
            matched_layers = []
            for name, pixels in layer_images.items():
                if pixels[y, x, 3] and np.array_equal(app[y, x], pixels[y, x, :3]):
                    app_matches[name] += 1
                    if name != top:
                        matched_layers.append(name)
                        other_layer_matches[name] = other_layer_matches.get(name, 0) + 1
            if len(samples) < 100 and matched_layers:
                samples.append({
                    "x": x, "y": y, "region": region,
                    "native_top_layer": top, "app_matches_other_layers": matched_layers,
                    "native_rgb": native[y, x].tolist(), "app_rgb": app[y, x].tolist(),
                })
        row["mismatches_by_native_top_layer"] = json.dumps(top_counts, sort_keys=True)
        row["app_exact_matches_to_native_layer_pixels"] = json.dumps(app_matches, sort_keys=True)
        row["app_exact_matches_to_non_top_native_layers"] = json.dumps(other_layer_matches, sort_keys=True)
        rows.append(row)

    with (output / "region-attribution.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (output / "sample-layer-crossmatches.json").write_text(
        json.dumps(samples, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    parameters = {
        "experiment": "Attribute app/native replay mismatches to decoded PPU layers",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "frame": frame,
        "parity_directory": parity_dir.relative_to(ROOT).as_posix(),
        "ppu_directory": ppu_dir.relative_to(ROOT).as_posix(),
        "app_frame_sheet": frame_sheet.relative_to(ROOT).as_posix(),
        "app_sheet_columns": args.sheet_columns,
        "random_seed": None,
        "audio_enabled": False,
        "input_sha256": {
            str(path.relative_to(ROOT)): sha256(path)
            for path in (parity_dir / "results.json", ppu_dir / "native.png",
                         ppu_dir / "composite.png", ppu_dir / "top-layer-map.png", frame_sheet)
        },
    }
    result = {
        "frame": frame,
        "app_native_different_pixels": int(mismatch.sum()),
        "ppu_composite_native_different_pixels": int(ppu_mismatch.sum()),
        "native_compositor_cpu_exact": ppu["cpu_differing_pixels"] == 0,
        "regions": rows,
        "crossmatched_sample_count": len(samples),
        "interpretation": "Layer-color coincidences are diagnostic evidence, not proof of the app's draw order.",
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), **result}, indent=2))


if __name__ == "__main__":
    main()
