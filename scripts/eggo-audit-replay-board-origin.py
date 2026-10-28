"""Locate captured CPU board cells in the ROM's BG2 layer and app screenshot."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "renderer/games/eggo-mania/assets"
EVENTS = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.board-events.json"
APP_REPORT = ROOT / "tests/OUTPUT/eggo-mania-visual_2026-10-08T11-50-35-542Z/input-replay-report.json"
FIELD_LEFT = 128
FIELD_WIDTH = 112
HEIGHT = 160
TILE = 16


def rgb565(rgb: np.ndarray) -> np.ndarray:
    value = rgb.astype(np.uint16)
    return np.stack((value[..., 0] >> 3, value[..., 1] >> 2,
                     value[..., 2] >> 3), axis=-1)


def atlas_tiles(atlas: np.ndarray) -> np.ndarray:
    tiles = []
    for picture_y in range(4):
        for picture_x in range(8):
            for cell_y in range(3):
                for cell_x in range(3):
                    x = picture_x * 48 + cell_x * TILE
                    y = picture_y * 48 + cell_y * TILE
                    tiles.append(atlas[y:y + TILE, x:x + TILE])
    return np.asarray(tiles, dtype=np.uint8)


def score(native: np.ndarray, tile_rgb565: np.ndarray, tile_visible: np.ndarray,
          tile_ids: np.ndarray, rows: list[list[int]], origin_x: int, origin_y: int,
          include_templates: bool = False) -> dict:
    differences = compared = 0
    selected_templates = []
    for row_index, row in enumerate(rows):
        top = origin_y - row_index * TILE
        for column, cell in enumerate(row):
            if not cell:
                continue
            left = origin_x + column * TILE
            x0, x1 = max(0, left), min(FIELD_WIDTH, left + TILE)
            y0, y1 = max(0, top), min(HEIGHT, top + TILE)
            if x0 >= x1 or y0 >= y1:
                continue
            actual = native[y0:y1, x0:x1]
            actual_visible = actual[..., 3] > 0
            expected_visible = tile_visible[:, y0 - top:y1 - top, x0 - left:x1 - left]
            expected_rgb = tile_rgb565[:, y0 - top:y1 - top, x0 - left:x1 - left]
            actual565 = rgb565(actual[..., :3])
            delta = np.any(expected_rgb != actual565[None, ...], axis=3)
            vis_delta = expected_visible != actual_visible[None, ...]
            mismatch_counts = np.count_nonzero(vis_delta | (expected_visible & delta), axis=(1, 2))
            template_id = int(np.argmin(mismatch_counts))
            differences += int(mismatch_counts[template_id])
            compared += int((y1 - y0) * (x1 - x0))
            selected_templates.append(int(tile_ids[template_id]) + 1)
    result = {"different_pixels": differences, "compared_pixels": compared}
    if include_templates:
        result["selected_art_candidates"] = selected_templates
    return result


def score_screenshot(target: np.ndarray, tile_rgb565: np.ndarray, tile_visible: np.ndarray,
                     tile_ids: np.ndarray, rows: list[list[int]], origin_x: int,
                     origin_y: int, include_templates: bool = False) -> dict:
    """Match opaque atlas pixels against the fully composed app screenshot."""
    differences = compared = 0
    selected_templates = []
    for row_index, row in enumerate(rows):
        top = origin_y - row_index * TILE
        for column, cell in enumerate(row):
            if not cell:
                continue
            left = origin_x + column * TILE
            x0, x1 = max(0, left), min(FIELD_WIDTH, left + TILE)
            y0, y1 = max(0, top), min(HEIGHT, top + TILE)
            if x0 >= x1 or y0 >= y1:
                continue
            actual565 = rgb565(target[y0:y1, x0:x1])
            expected_visible = tile_visible[:, y0 - top:y1 - top, x0 - left:x1 - left]
            expected_rgb = tile_rgb565[:, y0 - top:y1 - top, x0 - left:x1 - left]
            delta = np.any(expected_rgb != actual565[None, ...], axis=3)
            mismatch_counts = np.count_nonzero(expected_visible & delta, axis=(1, 2))
            template_id = int(np.argmin(mismatch_counts))
            differences += int(mismatch_counts[template_id])
            compared += int(np.count_nonzero(expected_visible[template_id]))
            selected_templates.append(int(tile_ids[template_id]) + 1)
    result = {"different_pixels": differences, "compared_pixels": compared}
    if include_templates:
        result["selected_art_candidates"] = selected_templates
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frame", type=int, default=191)
    parser.add_argument("--native-layer-dir", type=Path, required=True,
                        help="Layer output from eggo-compose-native-layers.py for this exact frame")
    parser.add_argument("--board-events", type=Path, default=EVENTS)
    parser.add_argument("--app-report", type=Path, default=APP_REPORT)
    args = parser.parse_args()
    frame = args.frame
    native_layer_path = args.native_layer_dir.resolve() / "bg2.png"
    events_path, app_report_path = args.board_events.resolve(), args.app_report.resolve()
    events = json.loads(events_path.read_text(encoding="utf-8"))
    eligible_events = [item for item in events if item["frame"] <= frame]
    if not eligible_events:
        raise ValueError(f"No board state was recorded on or before replay frame {frame}")
    event = max(eligible_events, key=lambda item: item["frame"])
    layer_parameters_path = args.native_layer_dir.resolve() / "parameters.json"
    layer_results_path = args.native_layer_dir.resolve() / "results.json"
    if not layer_parameters_path.is_file():
        raise FileNotFoundError(f"Missing frame metadata: {layer_parameters_path}")
    if not layer_results_path.is_file():
        raise FileNotFoundError(f"Missing frame results: {layer_results_path}")
    layer_parameters = json.loads(layer_parameters_path.read_text(encoding="utf-8"))
    layer_results = json.loads(layer_results_path.read_text(encoding="utf-8"))
    layer_frame = layer_results.get("frame")
    if layer_frame != frame:
        raise ValueError(
            f"Native layer directory is for frame {layer_frame}, not requested frame {frame}: "
            f"{args.native_layer_dir.resolve()}"
        )
    source_directory = Path(layer_parameters["capture_directory"])
    if not source_directory.is_absolute():
        source_directory = ROOT / source_directory
    target_png = source_directory / f"{layer_parameters['capture_prefix']}.frame{frame:05d}.png"
    expected_hash = layer_parameters.get("target_png_sha256")
    if target_png.is_file() and expected_hash:
        actual_hash = hashlib.sha256(target_png.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise ValueError(f"Native layer target hash does not match {target_png}")
    rows = event["rows_bottom_up"][1]
    native_all = np.asarray(Image.open(native_layer_path).convert("RGBA"))
    native = native_all[:, FIELD_LEFT:FIELD_LEFT + FIELD_WIDTH]
    app_sheet_path = args.app_report.resolve().with_name("input-replay-app-frames.png")
    app_sheet = Image.open(app_sheet_path).convert("RGB")
    sheet_x = ((frame - 1) % 10) * 240
    sheet_y = ((frame - 1) // 10) * 160
    app = np.asarray(app_sheet.crop((sheet_x, sheet_y, sheet_x + 240, sheet_y + 160)))
    if app.shape != (HEIGHT, 240, 3):
        raise ValueError(f"App screenshot sheet does not contain replay frame {frame}: {app.shape}")
    app = app[:, FIELD_LEFT:FIELD_LEFT + FIELD_WIDTH]
    atlas = np.asarray(Image.open(ASSETS / "placed-factory.png").convert("RGBA"))
    tiles = atlas_tiles(atlas)
    all_visible = tiles[..., 3] > 0
    tile_ids = np.flatnonzero(all_visible.sum(axis=(1, 2)) >= 80)
    tile_visible = all_visible[tile_ids]
    tile_rgb565 = rgb565(tiles[tile_ids, ..., :3])
    report = json.loads(app_report_path.read_text(encoding="utf-8"))
    app_view = report["cameraSeries"][1][frame - 1]
    app_board_camera = app_view["appBoardCamera"]
    app_origin_y = round(112 - (1 - app_board_camera) * TILE)

    records = []
    app_records = []
    # At the board's visible rows, the frame's top-layer map identifies BG2 as
    # the rendered board-cell layer. BG0 can contain an underlying matching
    # atlas pattern at another Y and is not a reliable placement oracle.
    for origin_x in (0,):
        for origin_y in range(-HEIGHT, HEIGHT + TILE * 8 + 1):
            result = score(native, tile_rgb565, tile_visible, tile_ids,
                           rows, origin_x, origin_y)
            if result["compared_pixels"] < 800:
                continue
            result.update({"origin_x": origin_x, "origin_y": origin_y,
                           "error_fraction": result["different_pixels"] / result["compared_pixels"]})
            records.append(result)
            app_result = score_screenshot(app, tile_rgb565, tile_visible, tile_ids,
                                          rows, origin_x, origin_y)
            if app_result["compared_pixels"] >= 800:
                app_result.update({"origin_x": origin_x, "origin_y": origin_y,
                                   "error_fraction": app_result["different_pixels"] /
                                   app_result["compared_pixels"]})
                app_records.append(app_result)
    ranked = sorted(records, key=lambda item: (item["error_fraction"],
                                               -item["compared_pixels"],
                                               item["different_pixels"]))
    app_ranked = sorted(app_records, key=lambda item: (item["error_fraction"],
                                                       -item["compared_pixels"],
                                                       item["different_pixels"]))
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-replay-board-origin_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    best = ranked[0]
    best = {**best, **score(native, tile_rgb565, tile_visible, tile_ids, rows,
                            best["origin_x"], best["origin_y"], include_templates=True)}
    best_app = app_ranked[0]
    best_app = {**best_app, **score_screenshot(app, tile_rgb565, tile_visible, tile_ids, rows,
                                               best_app["origin_x"], best_app["origin_y"],
                                               include_templates=True)}
    composed = native.copy()
    selected_templates = iter(best["selected_art_candidates"])
    for row_index, row in enumerate(rows):
        top = best["origin_y"] - row_index * TILE
        for column, cell in enumerate(row):
            if not cell:
                continue
            art = next(selected_templates)
            tile = tiles[art - 1]
            x = best["origin_x"] + column * TILE
            x0, x1 = max(0, x), min(FIELD_WIDTH, x + TILE)
            y0, y1 = max(0, top), min(HEIGHT, top + TILE)
            if x0 < x1 and y0 < y1:
                src = tile[y0 - top:y1 - top, x0 - x:x1 - x]
                mask = src[..., 3] > 0
                region = composed[y0:y1, x0:x1]
                region[mask] = src[mask]
    Image.fromarray(composed).save(output / "best-atlas-on-native-bg2.png")
    composed_app = app.copy()
    selected_app_templates = iter(best_app["selected_art_candidates"])
    for row_index, row in enumerate(rows):
        top = best_app["origin_y"] - row_index * TILE
        for column, cell in enumerate(row):
            if not cell:
                continue
            art = next(selected_app_templates)
            tile = tiles[art - 1]
            x = best_app["origin_x"] + column * TILE
            x0, x1 = max(0, x), min(FIELD_WIDTH, x + TILE)
            y0, y1 = max(0, top), min(HEIGHT, top + TILE)
            if x0 < x1 and y0 < y1:
                src = tile[y0 - top:y1 - top, x0 - x:x1 - x]
                mask = src[..., 3] > 0
                region = composed_app[y0:y1, x0:x1]
                region[mask] = src[mask][:, :3]
    Image.fromarray(composed_app).save(output / "best-atlas-on-app-screenshot.png")
    parameters = {
        "experiment": "Eggo Mania CPU placed-art origin against ROM BG2 and app screenshot",
        "frame": frame,
        "board_event_frame": event["frame"],
        "native_layer_frame": layer_frame,
        "board_event": str(events_path.relative_to(ROOT)) if events_path.is_relative_to(ROOT) else str(events_path),
        "native_bg2_layer": str(native_layer_path.relative_to(ROOT)) if native_layer_path.is_relative_to(ROOT) else str(native_layer_path),
        "app_report": str(app_report_path.relative_to(ROOT)) if app_report_path.is_relative_to(ROOT) else str(app_report_path),
        "app_frame_sheet": str(app_sheet_path.relative_to(ROOT)) if app_sheet_path.is_relative_to(ROOT) else str(app_sheet_path),
        "placed_factory_atlas": str((ASSETS / "placed-factory.png").relative_to(ROOT)),
        "board_cells": sum(value != 0 for row in rows for value in row),
        "app_board_camera": app_board_camera,
        "app_board_row0_top_y": app_origin_y,
        "origin_x_scan": [0, 0],
        "origin_y_scan": [-HEIGHT, HEIGHT + TILE * 8],
        "metric": "For each occupied board cell, choose its best nonempty ROM-decoded factory atlas tile (>=80 opaque pixels); score alpha-mask and RGB565 mismatches. At least 800 pixels required.",
        "random_seed": None,
        "audio_enabled": False,
        "input_sha256": {
            str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (events_path, native_layer_path, app_report_path, ASSETS / "placed-factory.png",
                         layer_parameters_path, layer_results_path, app_sheet_path)},
        "created_utc": datetime.now(timezone.utc).isoformat(),
    }
    results = {"best_candidate": best, "app_screenshot_best_candidate": best_app,
               "app_camera_candidate_origin_y": app_origin_y,
               "top_20_candidates": ranked[:20],
               "app_screenshot_top_10_candidates": app_ranked[:10],
        "limitation": "Each occupied cell is matched to its best nonempty atlas tile. The native BG2 result tests the layer selected by the PPU top-layer map; app screenshot matches can still be affected by overlays and incomplete art ownership.",
               "output_directory": str(output.relative_to(ROOT))}
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
