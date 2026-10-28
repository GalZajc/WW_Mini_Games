"""Find the exact source row for the factory's native BG1 layer.

This offline check compares one saved GBA PPU layer against the extracted
256x256 factory map. It does not launch Electron or enable audio. All results
are saved under scripts/OUTPUT for reproducibility.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FRAME = 219
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
NATIVE_LAYER = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-07_17-28-35/bg1.png"
SOURCE_MAP = ROOT / "renderer/games/eggo-mania/assets/factory.png"
FIELDS = {"player": (0, 112), "cpu": (128, 112)}


def rgb565_round_trip(image: np.ndarray) -> np.ndarray:
    rgb = image[..., :3].astype(np.uint16)
    r5 = np.rint(rgb[..., 0] * 31 / 255).astype(np.uint16)
    g5 = np.rint(rgb[..., 1] * 31 / 255).astype(np.uint16)
    b5 = np.rint(rgb[..., 2] * 31 / 255).astype(np.uint16)
    result = np.empty_like(rgb, dtype=np.uint8)
    result[..., 0] = (r5 * 255 // 31).astype(np.uint8)
    result[..., 1] = ((g5 * 2) * 255 // 63).astype(np.uint8)
    result[..., 2] = (b5 * 255 // 31).astype(np.uint8)
    return result


def main() -> None:
    layer_parameters = json.loads((NATIVE_LAYER.parent / "parameters.json").read_text(encoding="utf-8"))
    layer_results_path = NATIVE_LAYER.parent / "results.json"
    layer_results = json.loads(layer_results_path.read_text(encoding="utf-8"))
    if layer_results.get("frame") != FRAME:
        raise ValueError(
            f"Native BG1 layer is for frame {layer_results.get('frame')}, expected {FRAME}"
        )
    source_frame = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{FRAME:05d}.png"
    expected_target_hash = layer_parameters.get("target_png_sha256")
    if source_frame.is_file() and expected_target_hash:
        actual_target_hash = hashlib.sha256(source_frame.read_bytes()).hexdigest()
        if actual_target_hash != expected_target_hash:
            raise ValueError(f"Native BG1 layer target hash does not match {source_frame}")

    native_image = np.asarray(Image.open(NATIVE_LAYER).convert("RGBA"))
    source_image = np.asarray(Image.open(SOURCE_MAP).convert("RGBA"))
    if native_image.shape[:2] != (160, 240) or source_image.shape[:2] != (256, 256):
        raise ValueError("Unexpected native-layer or factory-map dimensions")
    native_rgb = native_image[..., :3]
    source_rgb = rgb565_round_trip(source_image)
    records = []
    best = None
    for field, (left, width) in FIELDS.items():
        target = native_image[:, left:left + width]
        for offset in range(256):
            ys = (np.arange(160) + offset) % 256
            xs = (np.arange(width) + left) % 256
            sample = source_image[np.ix_(ys, xs)]
            target_visible = target[..., 3] != 0
            source_visible = sample[..., 3] != 0
            same_color = np.all(target[..., :3] == source_rgb[np.ix_(ys, xs)], axis=2)
            exact = (target_visible == source_visible) & (~target_visible | same_color)
            record = {
                "field": field,
                "source_y_offset": offset,
                "exact_pixels": int(exact.sum()),
                "different_pixels": int((~exact).sum()),
                "native_visible_pixels": int(target_visible.sum()),
                "source_visible_pixels": int(source_visible.sum()),
                "visibility_disagreements": int((target_visible != source_visible).sum()),
                "color_disagreements_where_both_visible": int(
                    (target_visible & source_visible & ~same_color).sum()),
            }
            records.append(record)
            if best is None or record["different_pixels"] < best["different_pixels"]:
                best = record

    records.sort(key=lambda row: (row["different_pixels"], row["field"], row["source_y_offset"]))
    output = ROOT / "scripts/OUTPUT" / (
        "eggo-factory-bg1-scroll_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f"))
    output.mkdir(parents=True, exist_ok=False)
    with (output / "offset-scores.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    parameters = {
        "experiment": "Eggo Mania factory BG1 source-row alignment",
        "frame": FRAME,
        "capture_directory": str(CAPTURE_DIR),
        "native_layer_png": str(NATIVE_LAYER),
        "native_layer_results_frame": layer_results["frame"],
        "native_layer_results_sha256": hashlib.sha256(layer_results_path.read_bytes()).hexdigest(),
        "source_map_png": str(SOURCE_MAP),
        "source_scroll_rule": "sample source pixel at x+field_left, y+candidate_offset, each modulo 256",
        "fields": {name: {"left": left, "width": width} for name, (left, width) in FIELDS.items()},
        "offset_range": [0, 255],
        "random_seed": None,
        "audio_enabled": False,
        "source_map_sha256": hashlib.sha256(SOURCE_MAP.read_bytes()).hexdigest(),
        "native_layer_sha256": hashlib.sha256(NATIVE_LAYER.read_bytes()).hexdigest(),
        "created_utc": datetime.now(timezone.utc).isoformat(),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    result = {
        "best_alignment_per_field": {
            field: min((r for r in records if r["field"] == field),
                      key=lambda row: row["different_pixels"])
            for field in FIELDS
        },
        "overall_best": best,
        "limitations": [
            "This checks a single native frame and the factory static map; it does not establish the frame-to-frame BG1 scroll rule.",
            "The source map is quantized to native RGB565 levels before comparison.",
        ],
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
