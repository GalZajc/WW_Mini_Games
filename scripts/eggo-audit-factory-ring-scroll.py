"""Align extracted factory stream rings with native BG1/BG3 pixels.

The audit is offline: it reads a saved capture and asset files only. It tries
every vertical phase of the 64-row ring, applying the captured ROM stream
variants at the prior native frame-counter value, then records exact matches.
When an alternate HBlank composite is supplied, CPU ring scoring excludes the
lower alternate-register strip because that region is a different BG3 source.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json
import struct
import argparse

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FRAME = 219
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
ASSET_DIR = ROOT / "renderer/games/eggo-mania/assets"
COMPOSITE_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-07_17-28-35"
FIELDS = {"player": {"bg": 1, "screen_left": 0, "camera_address": 0x02003980},
          "cpu": {"bg": 3, "screen_left": 128, "camera_address": 0x02004CFC}}
RAM_BASE = 0x02000000
FRAME_COUNTER_ADDRESS = 0x02011A9C


def u16(raw: bytes, offset: int) -> int:
    return struct.unpack_from("<H", raw, offset)[0]


def rgb565_round_trip(rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[..., :3].astype(np.uint16)
    r5 = np.rint(rgb[..., 0] * 31 / 255).astype(np.uint16)
    g5 = np.rint(rgb[..., 1] * 31 / 255).astype(np.uint16)
    b5 = np.rint(rgb[..., 2] * 31 / 255).astype(np.uint16)
    out = np.empty_like(rgb, dtype=np.uint8)
    out[..., 0] = (r5 * 255 // 31).astype(np.uint8)
    out[..., 1] = ((g5 * 2) * 255 // 63).astype(np.uint8)
    out[..., 2] = (b5 * 255 // 31).astype(np.uint8)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frame", type=int, default=FRAME)
    parser.add_argument("--composite-dir", type=Path, default=COMPOSITE_DIR)
    parser.add_argument("--alternate-composite-dir", type=Path,
                        help="Optional alternate HBlank compositor output for the lower CPU-field scanlines")
    parser.add_argument("--split-y", type=int,
                        help="First scanline from --alternate-composite-dir; requires that option")
    parser.add_argument("--app-frame-sheet", type=Path,
                        help="Optional muted 10-column Electron replay contact sheet")
    args = parser.parse_args()
    frame = args.frame
    composite_dir = args.composite_dir.resolve()
    alternate_dir = args.alternate_composite_dir.resolve() if args.alternate_composite_dir else None
    if bool(alternate_dir) != (args.split_y is not None):
        parser.error("--alternate-composite-dir and --split-y must be provided together")
    if args.split_y is not None and not 0 <= args.split_y <= 160:
        parser.error("--split-y must be in [0,160]")
    stem = f"{CAPTURE_PREFIX}.frame{frame:05d}"
    ram = (CAPTURE_DIR / f"{stem}.ram").read_bytes()
    io = (CAPTURE_DIR / f"{stem}.0x4000000").read_bytes()
    native_counter = struct.unpack_from("<I", ram, FRAME_COUNTER_ADDRESS - RAM_BASE)[0]
    rings_json = json.loads((ASSET_DIR / "background-rings.json").read_text(encoding="utf-8"))
    ring_config = rings_json["assets"]["factory"]
    stream_config = rings_json["streams"]["factory"]
    records = []
    ring_previews = {}
    ring_rgb_by_field = {}
    native_layers_by_field = {}
    for field, info in FIELDS.items():
        ring_path = ASSET_DIR / ring_config[field]["file"]
        atlas_path = ASSET_DIR / stream_config[field]["file"]
        base_ring = np.asarray(Image.open(ring_path).convert("RGBA"))
        ring = base_ring.copy()
        current_ring = base_ring.copy()
        atlas = np.asarray(Image.open(atlas_path).convert("RGBA"))
        layer_path = composite_dir / f"bg{info['bg']}.png"
        native_layer = np.asarray(Image.open(layer_path).convert("RGBA")).copy()
        if field == "cpu" and alternate_dir is not None:
            alternate_layer = np.asarray(
                Image.open(alternate_dir / f"bg{info['bg']}.png").convert("RGBA"))
            native_layer[args.split_y:, info["screen_left"]:info["screen_left"] + 112] = \
                alternate_layer[args.split_y:, info["screen_left"]:info["screen_left"] + 112]
        left = info["screen_left"]
        target = native_layer[:, left:left + 112]
        native_layers_by_field[field] = native_layer

        # The queue visible in a frame was scheduled using the previous native
        # global counter. This is the measured one-frame DMA delay.
        stream_delta = stream_config[field].get("stream_counter_delta", -1)
        stream_counter = max(0, native_counter + stream_delta)
        for row in stream_config[field]["rows"]:
            x0 = row["x_tiles"] * 8
            y0 = row["ring_row"] * 8
            width = row["width_tiles"] * 8
            previous_phase = (stream_counter // row["rate"]) % row["period"]
            current_phase = (native_counter // row["rate"]) % row["period"]
            previous_y = row["atlas_y"] + previous_phase * 8
            current_y = row["atlas_y"] + current_phase * 8
            ring[y0:y0 + 8, x0:x0 + width] = atlas[previous_y:previous_y + 8, :width]
            current_ring[y0:y0 + 8, x0:x0 + width] = atlas[current_y:current_y + 8, :width]

        ring_rgb = rgb565_round_trip(ring)
        current_ring_rgb = rgb565_round_trip(current_ring)
        ring_rgb_by_field[field] = {"previous": ring_rgb, "current": current_ring_rgb}
        score_height = (min(160, args.split_y)
                        if field == "cpu" and alternate_dir is not None else 160)
        score_target = target[:score_height]
        for offset in range(ring.shape[0]):
            ys = (np.arange(score_height) + offset) % ring.shape[0]
            source = ring[ys, :112]
            source_visible = source[..., 3] != 0
            target_visible = score_target[..., 3] != 0
            same_color = np.all(ring_rgb[ys, :112] == score_target[..., :3], axis=2)
            exact = (source_visible == target_visible) & (~target_visible | same_color)
            row_result = {
                "field": field,
                "source_ring_y_offset": offset,
                "exact_pixels": int(exact.sum()),
                "different_pixels": int((~exact).sum()),
                "visibility_disagreements": int((source_visible != target_visible).sum()),
                "color_disagreements_where_both_visible": int(
                    (source_visible & target_visible & ~same_color).sum()),
            }
            records.append(row_result)
        ring_previews[field] = {"previous": ring.copy(), "current": current_ring}

    output = ROOT / "scripts/OUTPUT" / (
        "eggo-factory-ring-scroll_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f"))
    output.mkdir(parents=True, exist_ok=False)
    for field, phases in ring_previews.items():
        for phase, ring in phases.items():
            Image.fromarray(ring).save(output / f"factory-{field}-ring-{phase}.png")
    with (output / "offset-scores.csv").open("w", newline="", encoding="utf-8") as stream:
        fields = list(records[0])
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    results_by_field = {}
    app_path = composite_dir / "app.png"
    top_map_path = composite_dir / "top-layer-map.png"
    app_rgb = np.asarray(Image.open(app_path).convert("RGB")) if app_path.is_file() else None
    app_capture_muted = None
    if args.app_frame_sheet is not None:
        app_frame_sheet = args.app_frame_sheet.resolve()
        app_parameters = app_frame_sheet.parent / "parameters.json"
        capture_parameters = json.loads(app_parameters.read_text(encoding="utf-8"))
        app_capture_muted = capture_parameters.get("audioOutputMuted") is True
        if not app_capture_muted:
            raise ValueError(f"Electron capture is not confirmed muted: {app_parameters}")
        sheet = Image.open(app_frame_sheet).convert("RGB")
        x0 = ((frame - 1) % 10) * 240
        y0 = ((frame - 1) // 10) * 160
        app_rgb = np.asarray(sheet.crop((x0, y0, x0 + 240, y0 + 160)))
        if app_rgb.shape[:2] != (160, 240):
            raise ValueError(f"App frame sheet does not contain frame {frame}: {app_frame_sheet}")
    top_map = (np.asarray(Image.open(top_map_path).convert("RGBA")).copy()
               if top_map_path.is_file() else None)
    if alternate_dir is not None and top_map is not None:
        alternate_map = np.asarray(Image.open(alternate_dir / "top-layer-map.png").convert("RGBA"))
        top_map[args.split_y:, 128:240] = alternate_map[args.split_y:, 128:240]
    native_rgb = np.asarray(Image.open(composite_dir / "native.png").convert("RGB"))
    for field in FIELDS:
        scored = sorted((r for r in records if r["field"] == field),
                        key=lambda r: (r["different_pixels"], r["source_ring_y_offset"]))
        ring_offset = scored[0]["source_ring_y_offset"]
        results_by_field[field] = {
            "best_alignment": scored[0],
            "top_five_offsets": [{"offset": r["source_ring_y_offset"],
                                  "different_pixels": r["different_pixels"]}
                                 for r in scored[:5]],
            "native_bg_vofs": u16(io, 0x12 + 4 * FIELDS[field]["bg"]),
            "native_camera_y": struct.unpack_from(
                "<I", ram, FIELDS[field]["camera_address"] - RAM_BASE)[0],
        }
        source_ring = ring_previews[field]["previous"]
        compare_height = (min(160, args.split_y)
                          if field == "cpu" and alternate_dir is not None else 160)
        source_y = (np.arange(compare_height) + ring_offset) % source_ring.shape[0]
        aligned_source = source_ring[source_y, :112].copy()
        native_target = native_layers_by_field[field][:compare_height,
            FIELDS[field]["screen_left"]:FIELDS[field]["screen_left"] + 112]
        source_visible = aligned_source[..., 3] != 0
        target_visible = native_target[..., 3] != 0
        same_color = np.all(ring_rgb_by_field[field]["previous"][source_y, :112] ==
                            native_target[..., :3], axis=2)
        visibility_mismatch = source_visible != target_visible
        color_mismatch = source_visible & target_visible & ~same_color
        layer_mismatch = visibility_mismatch | color_mismatch
        mismatch_map = np.full((compare_height, 112, 3), 24, dtype=np.uint8)
        mismatch_map[visibility_mismatch] = (255, 0, 255)
        mismatch_map[color_mismatch] = (255, 176, 0)
        aligned_name = f"{field}-ring-at-native-layer-offset.png"
        native_name = f"{field}-native-bg-layer.png"
        mismatch_name = f"{field}-ring-native-layer-difference.png"
        Image.fromarray(aligned_source).save(output / aligned_name)
        Image.fromarray(native_target).save(output / native_name)
        Image.fromarray(mismatch_map).save(output / mismatch_name)
        results_by_field[field]["best_source_vs_native_layer"] = {
            "source_ring_y_offset": ring_offset,
            "scored_screen_rows": compare_height,
            "different_pixels": int(layer_mismatch.sum()),
            "visibility_disagreements": int(visibility_mismatch.sum()),
            "color_disagreements_where_both_visible": int(color_mismatch.sum()),
            "different_pixels_by_screen_row": [int(value) for value in layer_mismatch.sum(axis=1)],
            "aligned_source_image": aligned_name,
            "native_layer_image": native_name,
            "difference_image": mismatch_name,
        }
        if app_rgb is not None and top_map is not None:
            info = FIELDS[field]
            left = info["screen_left"]
            bg_top = ((top_map[:, left:left + 112, 0] == 1) &
                      (top_map[:, left:left + 112, 1] == info["bg"] + 1))
            score_height = (min(160, args.split_y)
                            if field == "cpu" and alternate_dir is not None else 160)
            bg_top[score_height:] = False
            bg_top = bg_top[:score_height]
            app_field = app_rgb[:, left:left + 112]
            app_scored = app_field[:score_height]
            native_scored = native_rgb[:score_height, left:left + 112]
            ys = (np.arange(score_height)[:, None] + ring_offset) % ring_previews[field]["previous"].shape[0]
            xs = np.arange(112)[None, :]
            current_expected = ring_rgb_by_field[field]["current"][ys, xs]
            previous_expected = ring_rgb_by_field[field]["previous"][ys, xs]
            results_by_field[field]["app_vs_native_bg_layer"] = {
                "scored_screen_rows": score_height,
                "native_top_bg_pixels": int(bg_top.sum()),
                "app_different_from_native_composite_on_bg": int(np.any(
                    app_scored != native_scored,
                    axis=2)[bg_top].sum()),
                "app_different_from_expected_previous_phase_ring": int(np.any(
                    app_scored != previous_expected, axis=2)[bg_top].sum()),
                "app_different_from_expected_current_phase_ring": int(np.any(
                    app_scored != current_expected, axis=2)[bg_top].sum()),
            }
            app_ring_alignment = {}
            for phase_name, phase_rgb in ring_rgb_by_field[field].items():
                phase_scores = []
                for offset in range(phase_rgb.shape[0]):
                    phase_y = (np.arange(score_height)[:, None] + offset) % phase_rgb.shape[0]
                    expected = phase_rgb[phase_y, xs]
                    differing = np.any(app_scored != expected, axis=2)
                    phase_scores.append({"offset": offset,
                                         "different_pixels_on_native_bg": int(differing[bg_top].sum())})
                app_ring_alignment[phase_name] = sorted(
                    phase_scores, key=lambda score: (score["different_pixels_on_native_bg"], score["offset"]))[:5]
            results_by_field[field]["app_best_ring_alignment"] = app_ring_alignment
    parameters = {
        "experiment": "Eggo Mania factory BG1/BG3 ring source-row alignment",
        "frame": frame,
        "capture_directory": str(CAPTURE_DIR),
        "normal_composite_directory": str(composite_dir),
        "alternate_composite_directory": str(alternate_dir) if alternate_dir else None,
        "alternate_hblank_split_y": args.split_y,
        "app_frame_sheet": str(args.app_frame_sheet.resolve()) if args.app_frame_sheet else None,
        "app_capture_audio_output_muted": app_capture_muted,
        "frame_counter_address": hex(FRAME_COUNTER_ADDRESS),
        "frame_counter": native_counter,
        "stream_counter_used": native_counter - 1,
        "native_layer_pngs": {field: str(composite_dir / f"bg{info['bg']}.png")
                              for field, info in FIELDS.items()},
        "ring_assets": {field: ring_config[field]["file"] for field in FIELDS},
        "stream_atlases": {field: stream_config[field]["file"] for field in FIELDS},
        "stream_index_rule": "floor((captured global frame counter - 1) / row rate) modulo period",
        "scroll_search": "all source rows modulo ring height; screen source row equals y + offset",
        "random_seed": None,
        "audio_enabled": False,
        "created_utc": datetime.now(timezone.utc).isoformat(),
    }
    for field, asset in ring_config.items():
        if field in FIELDS:
            parameters["asset_sha256_" + field] = hashlib.sha256(
                (ASSET_DIR / asset["file"]).read_bytes()).hexdigest()
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    results = {"best_alignment_per_field": results_by_field,
        "limitation": "A single frame verifies source ring registration, not the general camera update rule.",
               "output_directory": str(output.relative_to(ROOT))}
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **results}, indent=2))


if __name__ == "__main__":
    main()
