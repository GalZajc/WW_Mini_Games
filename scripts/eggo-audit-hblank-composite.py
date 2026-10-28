#!/usr/bin/env python3
"""Recompose a captured Eggo Mania frame across its HBlank register split."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import csv

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
NORMAL_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-26"
ALTERNATE_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-09"
NATIVE = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-08_09-13-14_074926/eggo-frame191-sync.frame00191.png"
APP_SHEET = ROOT / "tests/OUTPUT/eggo-mania-visual_2026-10-08T09-08-18-618Z/input-replay-app-frames.png"
FRAME = 191
SHEET_COLUMNS = 10
SPLIT_Y = 142
CPU_LEFT = 128
CPU_RIGHT = 240
SCREEN_WIDTH = 240
SCREEN_HEIGHT = 160


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def count_diff(left: np.ndarray, right: np.ndarray, x0: int, x1: int,
               y0: int = 0, y1: int = SCREEN_HEIGHT) -> int:
    return int(np.any(left[y0:y1, x0:x1] != right[y0:y1, x0:x1], axis=2).sum())


def main() -> None:
    normal = np.asarray(Image.open(NORMAL_DIR / "composite.png").convert("RGB"))
    alternate = np.asarray(Image.open(ALTERNATE_DIR / "composite.png").convert("RGB"))
    native = np.asarray(Image.open(NATIVE).convert("RGB"))
    sheet = Image.open(APP_SHEET).convert("RGB")
    app_parameters_path = APP_SHEET.parent / "parameters.json"
    app_parameters = json.loads(app_parameters_path.read_text(encoding="utf-8"))
    if app_parameters.get("audioOutputMuted") is not True:
        raise ValueError(f"The Electron capture was not confirmed muted: {app_parameters_path}")
    sheet_x = ((FRAME - 1) % SHEET_COLUMNS) * SCREEN_WIDTH
    sheet_y = ((FRAME - 1) // SHEET_COLUMNS) * SCREEN_HEIGHT
    app = np.asarray(sheet.crop((sheet_x, sheet_y,
                                 sheet_x + SCREEN_WIDTH, sheet_y + SCREEN_HEIGHT)))
    expected = normal.copy()
    expected[SPLIT_Y:, CPU_LEFT:CPU_RIGHT] = alternate[SPLIT_Y:, CPU_LEFT:CPU_RIGHT]
    normal_map = np.asarray(Image.open(NORMAL_DIR / "top-layer-map.png").convert("RGBA"))
    alternate_map = np.asarray(Image.open(ALTERNATE_DIR / "top-layer-map.png").convert("RGBA"))
    hblank_map = normal_map.copy()
    hblank_map[SPLIT_Y:, CPU_LEFT:CPU_RIGHT] = alternate_map[SPLIT_Y:, CPU_LEFT:CPU_RIGHT]

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-hblank-composite_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    for name, pixels in (("native.png", native), ("app.png", app),
                         ("recomposed-hblank.png", expected)):
        Image.fromarray(pixels).save(output / name)
    Image.fromarray((np.any(native != expected, axis=2) * 255).astype(np.uint8)).save(
        output / "recomposed-native-diff.png")
    Image.fromarray((np.any(native != app, axis=2) * 255).astype(np.uint8)).save(
        output / "app-native-diff.png")

    mismatch = np.any(native[:, CPU_LEFT:CPU_RIGHT] != app[:, CPU_LEFT:CPU_RIGHT], axis=2)
    ys, local_xs = np.nonzero(mismatch)
    layer_counts: dict[str, int] = {}
    phase_layer_counts: dict[str, int] = {}
    offset_counts: dict[str, dict[str, int]] = {}
    mismatch_rows = []
    for y, local_x in zip(ys.tolist(), local_xs.tolist()):
        x = local_x + CPU_LEFT
        code = hblank_map[y, x]
        kind, layer_id = int(code[0]), int(code[1]) - 1
        layer = f"BG{layer_id}" if kind == 1 else f"OBJ{layer_id}" if kind == 2 else "backdrop"
        phase = "normal" if y < SPLIT_Y else "alternate"
        layer_counts[layer] = layer_counts.get(layer, 0) + 1
        phase_layer_key = f"{phase}:{layer}"
        phase_layer_counts[phase_layer_key] = phase_layer_counts.get(phase_layer_key, 0) + 1
        native_rgb = native[y, x].astype(np.int16)
        app_rgb = app[y, x].astype(np.int16)
        best_offset = None
        for distance in range(1, 5):
            for dy in range(-distance, distance + 1):
                dx_abs = distance - abs(dy)
                candidates = ([(0, dy)] if dx_abs == 0 else [(-dx_abs, dy), (dx_abs, dy)])
                for dx, offset_y in candidates:
                    source_x, source_y = x + dx, y + offset_y
                    if (CPU_LEFT <= source_x < CPU_RIGHT and 0 <= source_y < SCREEN_HEIGHT and
                            np.array_equal(app[y, x], expected[source_y, source_x])):
                        best_offset = f"{dx:+d},{offset_y:+d}"
                        break
                if best_offset:
                    break
            if best_offset:
                break
        if best_offset:
            offset_counts.setdefault(phase_layer_key, {})[best_offset] = \
                offset_counts.setdefault(phase_layer_key, {}).get(best_offset, 0) + 1
        mismatch_rows.append({
            "screen_x": x,
            "screen_y": y,
            "register_phase": phase,
            "native_top_layer": layer,
            "native_rgb": ",".join(map(str, native_rgb.tolist())),
            "app_rgb": ",".join(map(str, app_rgb.tolist())),
            "absolute_rgb_error": ",".join(map(str, np.abs(native_rgb - app_rgb).tolist())),
            "nearest_exact_recomposed_offset": best_offset or "none_within_4px",
        })
    with (output / "cpu-mismatch-pixels.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(mismatch_rows[0]) if mismatch_rows else (
            "screen_x", "screen_y", "register_phase", "native_top_layer", "native_rgb",
            "app_rgb", "absolute_rgb_error", "nearest_exact_recomposed_offset"))
        writer.writeheader()
        writer.writerows(mismatch_rows)

    regions = {
        "player": (0, 112),
        "divider": (112, 128),
        "cpu": (128, 240),
    }
    report = {
        "experiment": "HBlank normal/alternate full-frame compositor parity",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "frame": FRAME,
        "screen": [SCREEN_WIDTH, SCREEN_HEIGHT],
        "hblank_split_y": SPLIT_Y,
        "hblank_applies_x": [CPU_LEFT, CPU_RIGHT],
        "normal_register_source": NORMAL_DIR.relative_to(ROOT).as_posix(),
        "alternate_register_source": ALTERNATE_DIR.relative_to(ROOT).as_posix(),
        "native_reference": NATIVE.relative_to(ROOT).as_posix(),
        "app_reference": APP_SHEET.relative_to(ROOT).as_posix(),
        "app_capture_parameters": app_parameters_path.relative_to(ROOT).as_posix(),
        "app_audio_output_muted": app_parameters["audioOutputMuted"],
        "random_seed": None,
        "audio_enabled": False,
        "cpu_mismatch_by_native_top_layer": layer_counts,
        "cpu_mismatch_by_phase_and_native_top_layer": phase_layer_counts,
        "cpu_app_pixels_matching_recomposed_color_nearby": offset_counts,
        "input_sha256": {
            str(path.relative_to(ROOT)): sha256(path)
            for path in (NORMAL_DIR / "composite.png", ALTERNATE_DIR / "composite.png",
                         NATIVE, APP_SHEET, app_parameters_path)
        },
        "regions": {},
        "artifacts": ["native.png", "app.png", "recomposed-hblank.png",
                       "recomposed-native-diff.png", "app-native-diff.png",
                       "cpu-mismatch-pixels.csv"],
    }
    for region, (x0, x1) in regions.items():
        report["regions"][region] = {
            "normal_compositor_vs_native": count_diff(normal, native, x0, x1),
            "alternate_compositor_vs_native": count_diff(alternate, native, x0, x1),
            "hblank_recomposed_vs_native": count_diff(expected, native, x0, x1),
            "app_vs_native": count_diff(app, native, x0, x1),
            "app_vs_hblank_recomposed": count_diff(app, expected, x0, x1),
        }
    report["output_directory"] = output.relative_to(ROOT).as_posix()
    (output / "parameters.json").write_text(
        json.dumps({key: report[key] for key in (
            "experiment", "created_utc", "frame", "screen", "hblank_split_y",
            "hblank_applies_x", "normal_register_source", "alternate_register_source",
            "native_reference", "app_reference", "app_capture_parameters",
            "app_audio_output_muted", "random_seed", "audio_enabled",
            "input_sha256", "output_directory")}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8")
    (output / "results.json").write_text(
        json.dumps({"regions": report["regions"],
                    "cpu_mismatch_by_native_top_layer": layer_counts,
                    "cpu_mismatch_by_phase_and_native_top_layer": phase_layer_counts,
                    "cpu_app_pixels_matching_recomposed_color_nearby": offset_counts,
                    "artifacts": report["artifacts"]},
                   indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": report["output_directory"], "regions": report["regions"]},
                     indent=2))


if __name__ == "__main__":
    main()
