#!/usr/bin/env python3
"""Attribute app/native mismatches using the two HBlank register phases."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import argparse
import csv
import hashlib
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NORMAL = "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-26"
DEFAULT_ALT = "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-09"
DEFAULT_NATIVE = "scripts/OUTPUT/eggo-reference_2026-10-08_09-13-14_074926/eggo-frame191-sync.frame00191.png"
DEFAULT_APP = "tests/OUTPUT/eggo-mania-visual_2026-10-08T07-05-55-482Z/input-replay-app-frames.png"
FRAME = 191
CPU_LEFT, CPU_RIGHT = 128, 240


def resolve(path: str | Path) -> Path:
    path = Path(path)
    return path if path.is_absolute() else ROOT / path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def layer_name(code: np.ndarray) -> str:
    kind, encoded_id = int(code[0]), int(code[1])
    if kind == 1:
        return f"BG{encoded_id - 1}"
    if kind == 2:
        return f"OBJ{encoded_id - 1}"
    return "backdrop"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--normal-layer-dir", default=DEFAULT_NORMAL)
    parser.add_argument("--alternate-layer-dir", default=DEFAULT_ALT)
    parser.add_argument("--native-image", default=DEFAULT_NATIVE)
    parser.add_argument("--app-frame-sheet", default=DEFAULT_APP)
    parser.add_argument("--frame", type=int, default=FRAME)
    parser.add_argument("--split-y", type=int, default=142)
    args = parser.parse_args()
    normal_dir, alternate_dir = resolve(args.normal_layer_dir), resolve(args.alternate_layer_dir)
    native_path, app_sheet_path = resolve(args.native_image), resolve(args.app_frame_sheet)
    native = np.asarray(Image.open(native_path).convert("RGB"))[:, CPU_LEFT:CPU_RIGHT]
    sheet = Image.open(app_sheet_path).convert("RGB")
    x0 = ((args.frame - 1) % 10) * 240 + CPU_LEFT
    y0 = ((args.frame - 1) // 10) * 160
    app = np.asarray(sheet.crop((x0, y0, x0 + CPU_RIGHT - CPU_LEFT, y0 + 160)))
    if native.shape != (160, 112, 3) or app.shape != native.shape:
        raise ValueError(f"Expected 112×160 field images; got {native.shape} and {app.shape}")
    mismatch = np.any(native != app, axis=2)

    normal_map = np.asarray(Image.open(normal_dir / "top-layer-map.png").convert("RGBA"))[:, CPU_LEFT:CPU_RIGHT]
    alternate_map = np.asarray(Image.open(alternate_dir / "top-layer-map.png").convert("RGBA"))[:, CPU_LEFT:CPU_RIGHT]
    top_map = normal_map.copy()
    top_map[args.split_y:] = alternate_map[args.split_y:]
    bands = np.where(np.arange(160)[:, None] < args.split_y, "normal", "alternate")
    counts: Counter[tuple[str, str]] = Counter()
    app_matches_top: Counter[tuple[str, str]] = Counter()
    app_matches_any_bg: Counter[tuple[str, str]] = Counter()
    samples = []
    mismatch_pixels = []
    layer_cache = {}
    for y, x in zip(*np.nonzero(mismatch)):
        phase = str(bands[y, 0])
        map_code = top_map[y, x]
        top = layer_name(map_code)
        counts[(phase, top)] += 1
        layer_dir = normal_dir if phase == "normal" else alternate_dir
        if layer_dir not in layer_cache:
            layer_cache[layer_dir] = {
                f"BG{index}": np.asarray(Image.open(layer_dir / f"bg{index}.png").convert("RGBA"))[:, CPU_LEFT:CPU_RIGHT]
                for index in range(4) if (layer_dir / f"bg{index}.png").is_file()
            }
        matched_bgs = [name for name, pixels in layer_cache[layer_dir].items()
                       if pixels[y, x, 3] and np.array_equal(app[y, x], pixels[y, x, :3])]
        if top.startswith("BG"):
            top_bg = top
            pixels = layer_cache[layer_dir].get(top_bg)
            if pixels is not None and pixels[y, x, 3] and np.array_equal(app[y, x], pixels[y, x, :3]):
                app_matches_top[(phase, top)] += 1
        if matched_bgs:
            app_matches_any_bg[(phase, top)] += 1
        sample = {
            "screen_x": int(x + CPU_LEFT), "screen_y": int(y), "phase": phase,
            "native_top_layer": top, "app_matches_bg_layers": matched_bgs,
            "native_rgb": native[y, x].tolist(), "app_rgb": app[y, x].tolist(),
        }
        mismatch_pixels.append(sample)
        if len(samples) < 200:
            samples.append(sample)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-hblank-layer-attribution_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    rows = []
    for key in sorted(counts):
        phase, top = key
        rows.append({"phase": phase, "native_top_layer": top,
                     "app_native_mismatches": counts[key],
                     "app_exact_top_bg_pixels": app_matches_top[key],
                     "app_exact_any_bg_pixels": app_matches_any_bg[key]})
    with (output / "layer-attribution.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]) if rows else
                                ("phase", "native_top_layer", "app_native_mismatches",
                                 "app_exact_top_bg_pixels", "app_exact_any_bg_pixels"))
        writer.writeheader()
        writer.writerows(rows)
    with (output / "mismatch-pixels.csv").open("w", newline="", encoding="utf-8") as file:
        fields = ("screen_x", "screen_y", "phase", "native_top_layer",
                  "app_matches_bg_layers", "native_rgb", "app_rgb")
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for sample in mismatch_pixels:
            writer.writerow({**sample,
                "app_matches_bg_layers": ";".join(sample["app_matches_bg_layers"]),
                "native_rgb": ",".join(map(str, sample["native_rgb"])),
                "app_rgb": ",".join(map(str, sample["app_rgb"]))})
    diff = np.where(mismatch[..., None], np.array([255, 0, 255], dtype=np.uint8),
                    np.array([24, 24, 24], dtype=np.uint8))
    Image.fromarray(diff).save(output / "app-native-mismatch-cpu.png")

    # Diagnostic only: put the captured native BG2/BG3 pixels back on top of
    # the app image exactly where the HBlank-combined native priority map says
    # that BG is visible. This tests whether the remaining screen errors are
    # mostly painter-order errors without changing game code.
    phase_layers = {"normal": normal_dir, "alternate": alternate_dir}
    overlay_counts = {}
    for layer_id in (2, 3):
        candidate = app.copy()
        replaced = 0
        for phase, layer_dir in phase_layers.items():
            layer = np.asarray(Image.open(layer_dir / f"bg{layer_id}.png").convert("RGBA"))[:, CPU_LEFT:CPU_RIGHT]
            y_start, y_end = (0, min(args.split_y, 160)) if phase == "normal" else (args.split_y, 160)
            visible = ((top_map[y_start:y_end, :, 0] == 1) &
                       (top_map[y_start:y_end, :, 1] == layer_id + 1) &
                       (layer[y_start:y_end, :, 3] > 0))
            replaced += int(visible.sum())
            candidate[y_start:y_end][visible] = layer[y_start:y_end, :, :3][visible]
        residual = int(np.any(native != candidate, axis=2).sum())
        filename = f"priority-overlay-bg{layer_id}.png"
        Image.fromarray(candidate).save(output / filename)
        overlay_counts[f"BG{layer_id}"] = {"replaced_pixels": replaced,
                                            "remaining_difference_pixels": residual,
                                            "image": filename}
    candidate = app.copy()
    replaced = 0
    for phase, layer_dir in phase_layers.items():
        y_start, y_end = (0, min(args.split_y, 160)) if phase == "normal" else (args.split_y, 160)
        for layer_id in (2, 3):
            layer = np.asarray(Image.open(layer_dir / f"bg{layer_id}.png").convert("RGBA"))[:, CPU_LEFT:CPU_RIGHT]
            visible = ((top_map[y_start:y_end, :, 0] == 1) &
                       (top_map[y_start:y_end, :, 1] == layer_id + 1) &
                       (layer[y_start:y_end, :, 3] > 0))
            replaced += int(visible.sum())
            candidate[y_start:y_end][visible] = layer[y_start:y_end, :, :3][visible]
    residual = int(np.any(native != candidate, axis=2).sum())
    Image.fromarray(candidate).save(output / "priority-overlay-bg2-bg3.png")
    overlay_counts["BG2+BG3"] = {"replaced_pixels": replaced,
                                 "remaining_difference_pixels": residual,
                                 "image": "priority-overlay-bg2-bg3.png"}
    parameters = {
        "experiment": "Frame-191 HBlank-phase native layer attribution for app mismatches",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "frame": args.frame,
        "cpu_crop": [CPU_LEFT, 0, CPU_RIGHT, 160],
        "normal_register_layer_directory": Path(args.normal_layer_dir).as_posix(),
        "alternate_register_layer_directory": Path(args.alternate_layer_dir).as_posix(),
        "phase_split_y": args.split_y,
        "normal_phase_rule": "Use last normal BG3 registers, with current BG2VOFS=90 and prior CPU camera BG3VOFS=91, before the split.",
        "alternate_phase_rule": "Use current alternate registers from the split line downward.",
        "app_frame_sheet": Path(args.app_frame_sheet).as_posix(),
        "random_seed": None,
        "audioOutputMuted": True,
        "input_sha256": {str(path.relative_to(ROOT)): sha256(path) for path in
                         (native_path, app_sheet_path, normal_dir / "top-layer-map.png",
                          alternate_dir / "top-layer-map.png")},
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    results = {
        "different_cpu_pixels": int(mismatch.sum()),
        "normal_phase_mismatches": int(mismatch[:args.split_y].sum()),
        "alternate_phase_mismatches": int(mismatch[args.split_y:].sum()),
        "mismatch_rows": rows,
        "first_200_pixel_samples": samples,
        "hypothetical_native_priority_overlays": overlay_counts,
        "interpretation": "Top-layer attribution is reliable only where the matching register phase applies; RGB matches to individual BG layers are diagnostic, not proof of draw order.",
        "artifacts": ["layer-attribution.csv", "app-native-mismatch-cpu.png",
                      "priority-overlay-bg2.png", "priority-overlay-bg3.png",
                      "priority-overlay-bg2-bg3.png"],
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), **{key: results[key] for key in
                      ("different_cpu_pixels", "normal_phase_mismatches", "alternate_phase_mismatches", "mismatch_rows", "hypothetical_native_priority_overlays")}},
                     indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
