"""Render a labeled contact sheet of OAM29's captured 8x8 sprite samples."""
from __future__ import annotations

from pathlib import Path
import hashlib
import importlib.util
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
OUTPUT_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-native-oam-timeline_2026-10-08_04-14-24"
OAM_INDEX = 29
SPRITE_SCALE = 8
COLUMNS = 5
CELL_WIDTH = 148
CELL_HEIGHT = 112


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_compositor", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load OAM decoder {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    results_path = OUTPUT_DIRECTORY / "results.json"
    results = json.loads(results_path.read_text(encoding="utf-8"))
    samples = [sample for sample in results["samples"]
               if sample.get("active") and sample.get("width") == 8 and sample.get("height") == 8]
    decoder = load_decoder()
    rows = (len(samples) + COLUMNS - 1) // COLUMNS
    sheet = Image.new("RGB", (COLUMNS * CELL_WIDTH, rows * CELL_HEIGHT), (32, 34, 42))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    trace_hash = hashlib.sha256()

    for index, sample in enumerate(samples):
        frame = sample["frame"]
        stem = CAPTURE_DIRECTORY / f"{CAPTURE_PREFIX}.frame{frame:05d}"
        paths = [stem.with_name(stem.name + suffix) for suffix in
                 (".memory3", ".0x5000000", ".0x4000000", ".0x7000000")]
        vram, palette_raw, io, oam = (path.read_bytes() for path in paths)
        for data in (vram, palette_raw, io, oam):
            trace_hash.update(data)
        obj = decoder.decode_object(vram, decoder.palette_555(palette_raw), io, oam, OAM_INDEX)
        if obj is None or (obj["width"], obj["height"]) != (8, 8):
            raise RuntimeError(f"OAM{OAM_INDEX} changed shape while reading frame {frame}")

        rgb = (obj["pixels"].astype(np.uint16) * 255 // 31).astype(np.uint8)
        rgba = np.dstack((rgb, obj["visible"].astype(np.uint8) * 255))
        sprite = Image.fromarray(rgba, "RGBA").resize(
            (8 * SPRITE_SCALE, 8 * SPRITE_SCALE), Image.Resampling.NEAREST)
        col, row = index % COLUMNS, index // COLUMNS
        x0, y0 = col * CELL_WIDTH, row * CELL_HEIGHT
        sheet.paste((47, 49, 58), (x0 + 1, y0 + 1, x0 + CELL_WIDTH - 1, y0 + CELL_HEIGHT - 1))
        sheet.paste(sprite, (x0 + 8, y0 + 26), sprite)
        floors = sample["completed_floors"]
        draw.text((x0 + 8, y0 + 7),
                  f"f{frame:03d} {sample['field']} x={sample['x']} y={sample['y']}",
                  fill=(235, 238, 245), font=font)
        draw.text((x0 + 8, y0 + 93),
                  f"worldY~{sample['camera_adjusted_y_diagnostic']} tile {sample['tile']}",
                  fill=(180, 187, 202), font=font)
        draw.text((x0 + 8, y0 + 102),
                  f"floors {floors['player']}:{floors['cpu']}",
                  fill=(180, 187, 202), font=font)

    sheet_path = OUTPUT_DIRECTORY / "oam29-8x8-timeline.png"
    sheet.save(sheet_path)
    parameters = {
        "experiment": "Eggo Mania OAM29 8x8 sprite contact sheet",
        "capture_directory": str(CAPTURE_DIRECTORY.relative_to(ROOT)).replace("\\", "/"),
        "capture_prefix": CAPTURE_PREFIX,
        "source_timeline_results": str(results_path.relative_to(ROOT)).replace("\\", "/"),
        "oam_index": OAM_INDEX,
        "frames_included": [sample["frame"] for sample in samples],
        "grid": {"columns": COLUMNS, "rows": rows, "sprite_scale": SPRITE_SCALE},
        "input_trace_sha256_in_sample_order": trace_hash.hexdigest(),
        "random_seed": None,
    }
    parameter_path = OUTPUT_DIRECTORY / "timeline-sheet-parameters.json"
    parameter_path.write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    results["inspection_sheet"] = str(sheet_path.relative_to(ROOT)).replace("\\", "/")
    results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"image": str(sheet_path.relative_to(ROOT)).replace("\\", "/"),
                      "sprite_samples": len(samples), "grid": parameters["grid"]}, indent=2))


if __name__ == "__main__":
    main()
