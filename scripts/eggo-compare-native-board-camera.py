"""Locate ROM-rendered placed-cell art in paired native/app jump captures.

The search only compares opaque atlas pixels. Transparent tile pixels reveal
the stage background and are intentionally excluded from the board-camera
score. Results and the complete source/parameter record go under scripts/OUTPUT.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/eggo-grounded-stack-jump.json"
NATIVE_MASKS = ROOT / "renderer/games/eggo-mania/assets/native-piece-masks.js"
PLACED_ATLAS = ROOT / "renderer/games/eggo-mania/assets/placed-factory.png"
FRAMES = (1, 8, 18, 32, 40, 56, 72, 90)
APP_JUMP_FRAMES = (1, 2, 4, 8, 12, 18, 24, 32, 40, 48, 56, 64, 72, 80, 90)
NATIVE_FIELDS = (0,)
FIELD_WIDTH, FRAME_HEIGHT, TILE = 112, 160, 16
ORIGIN_X_RANGE = range(1)
# ``origin_y`` is the screen top of world row y=1. The ROM may scroll part of
# a tall tower outside the 160px viewport, so scan the full range in which any
# row can still intersect the field.
ORIGIN_Y_RANGE = range(-FRAME_HEIGHT, FRAME_HEIGHT + TILE * 8 + 1)
TOP_MATCHES = 5


def newest_app_sheet() -> Path:
    matches = sorted((ROOT / "tests/OUTPUT").glob("eggo-mania-visual_*/jump-stack-jump-frames.png"),
                     key=lambda path: path.stat().st_mtime_ns)
    if not matches:
        raise FileNotFoundError("Run the focused jump-stack visual probe first.")
    return matches[-1]


def atlas_tiles(fixture: dict) -> list[tuple[int, int, np.ndarray, np.ndarray]]:
    source = NATIVE_MASKS.read_text(encoding="utf-8")
    encoded = re.search(r"NATIVE_PIECE_MASKS\s*=\s*(\[.*?\]);", source, re.S)
    if not encoded:
        raise ValueError("Could not parse the ROM-derived piece masks.")
    masks = json.loads(encoded.group(1))
    rows = fixture["rows_bottom_up"]
    atlas = np.asarray(Image.open(PLACED_ATLAS).convert("RGBA"))
    cells_by_owner: dict[int, list[tuple[int, int]]] = {}
    for y, row in enumerate(rows):
        for x, owner in enumerate(row):
            if owner:
                cells_by_owner.setdefault(owner, []).append((x, y))
    result = []
    for owner, cells in cells_by_owner.items():
        template = fixture["piece_templates"][str(owner)]
        kind, rotation = template["kind"], template["rotation"]
        mask = masks[rotation * 8 + kind]
        min_mask_x = min(x for x, _ in mask)
        max_mask_y = max(y for _, y in mask)
        min_x = min(x for x, _ in cells)
        min_y = min(y for _, y in cells)
        for world_x, world_y in cells:
            local_x, local_y = world_x - min_x, world_y - min_y
            art_id = 1 + (rotation * 8 + kind) * 9 + (max_mask_y - local_y) * 3 + (local_x + min_mask_x)
            index = art_id - 1
            picture, cell = divmod(index, 9)
            atlas_x = (picture % 8) * 48 + (cell % 3) * TILE
            atlas_y = (picture // 8) * 48 + (cell // 3) * TILE
            tile = atlas[atlas_y:atlas_y + TILE, atlas_x:atlas_x + TILE]
            result.append((world_x, world_y, tile[:, :, :3].copy(), tile[:, :, 3] > 0))
    return result


def score_origin(native: np.ndarray, field_x: int, origin_x: int, origin_y: int,
                 tiles: list[tuple[int, int, np.ndarray, np.ndarray]]) -> tuple[int, int, int]:
    absolute_error = 0
    differing_pixels = 0
    compared_pixels = 0
    for x, y, rgb, opaque in tiles:
        screen_y = origin_y + (1 - y) * TILE
        screen_x = field_x + origin_x + x * TILE
        top, bottom = max(0, screen_y), min(FRAME_HEIGHT, screen_y + TILE)
        left, right = max(0, screen_x), min(FIELD_WIDTH, screen_x + TILE)
        if top >= bottom or left >= right:
            continue
        src_top, src_bottom = top - screen_y, bottom - screen_y
        src_left, src_right = left - screen_x, right - screen_x
        crop = native[top:bottom, left:right].astype(np.int16)
        expected_rgb = rgb[src_top:src_bottom, src_left:src_right]
        expected_opaque = opaque[src_top:src_bottom, src_left:src_right]
        # Captured GBA pixels are expanded from RGB565. Compare in native
        # channel precision so PNG expansion/rounding does not hide alignment.
        actual565 = np.stack((crop[..., 0] >> 3, crop[..., 1] >> 2, crop[..., 2] >> 3), axis=-1)
        expected = expected_rgb.astype(np.int16)
        expected565 = np.stack((expected[..., 0] >> 3, expected[..., 1] >> 2, expected[..., 2] >> 3), axis=-1)
        delta = np.abs(actual565 - expected565)
        absolute_error += int(delta[expected_opaque].sum())
        differing_pixels += int(np.count_nonzero(np.any(delta[expected_opaque] != 0, axis=1)))
        compared_pixels += int(np.count_nonzero(expected_opaque))
    return differing_pixels, absolute_error, compared_pixels


def main() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    app_sheet_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else newest_app_sheet()
    all_frames = len(sys.argv) > 2
    frames = tuple(range(1, 91)) if all_frames else FRAMES
    app_frames = frames if all_frames else APP_JUMP_FRAMES
    native_run = Path(sys.argv[2]).resolve() if all_frames else ROOT / fixture["source_followup_run"]
    native_file_dir = native_run.parent
    app_sheet = np.asarray(Image.open(app_sheet_path).convert("RGB"))
    tiles = atlas_tiles(fixture)
    opaque_pixel_count = sum(int(np.count_nonzero(tile[3])) for tile in tiles)
    output = ROOT / "scripts/OUTPUT" / ("eggo-board-camera_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f"))
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "fixture": str(FIXTURE.relative_to(ROOT)),
        "native_run": str(native_run.relative_to(ROOT)) if native_run.is_relative_to(ROOT) else str(native_run),
        "app_sheet": str(app_sheet_path.relative_to(ROOT)),
        "rom_sha256": fixture["source_rom_sha256"],
        "core_sha256": fixture["source_core_sha256"],
        "frames": list(frames),
        "app_jump_frames": list(app_frames),
        "app_sheet_columns": 10 if all_frames else 5,
        "app_sheet_initial_grounded_frame_index": 0,
        "native_field_x_offsets": list(NATIVE_FIELDS),
        "field_width": FIELD_WIDTH,
        "frame_height": FRAME_HEIGHT,
        "tile_pixels": TILE,
        "origin_x_offsets_scanned": [ORIGIN_X_RANGE.start, ORIGIN_X_RANGE.stop - 1],
        "origin_y_offsets_scanned": [ORIGIN_Y_RANGE.start, ORIGIN_Y_RANGE.stop - 1],
        "metric": "RGB565 absolute channel error over opaque ROM-decoded placed-atlas pixels; transparent pixels excluded",
        "placed_cells": len(tiles),
        "random_seed": None,
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False), encoding="utf-8")
    results = []
    for frame in frames:
        native_path = native_file_dir / f"{native_run.name}.frame{frame:05d}.png"
        native = np.asarray(Image.open(native_path).convert("RGB"))
        # Sheet slot 0 is the grounded pre-jump image; requested jump frames
        # start at slot 1 for the sampled sheet, or use their frame number in
        # the all-frame 10-column sheet.
        sheet_columns = 10 if all_frames else 5
        app_index = frame if all_frames else APP_JUMP_FRAMES.index(frame) + 1
        app = app_sheet[(app_index // sheet_columns) * FRAME_HEIGHT:(app_index // sheet_columns + 1) * FRAME_HEIGHT,
                        (app_index % sheet_columns) * FIELD_WIDTH:(app_index % sheet_columns + 1) * FIELD_WIDTH]
        record = {"frame": frame, "app_sheet_index": app_index, "fields": []}
        for field_x in NATIVE_FIELDS:
            candidates = []
            app_candidates = []
            expected_origin_y = None
            if all_frames:
                prior_camera = fixture["camera_reference_pixels"] - fixture["camera_position_q16_before_input"] / 65536 if frame == 1 else fixture["native_camera_samples"][frame - 2]["camera_pixels"]
                expected_origin_y = round(prior_camera) + 80
                origins = range(expected_origin_y - 1, expected_origin_y + 2)
            else:
                origins = ORIGIN_Y_RANGE
            for origin_y in origins:
                for origin_x in ORIGIN_X_RANGE:
                    differing, error, compared = score_origin(native, field_x, origin_x, origin_y, tiles)
                    if compared:
                        candidates.append((differing, error, compared, origin_x, origin_y))
                    app_differing, app_error, app_compared = score_origin(app, 0, origin_x, origin_y, tiles)
                    if app_compared:
                        app_candidates.append((app_differing, app_error, app_compared, origin_x, origin_y))
            # Favor the placement explaining the most exact atlas pixels;
            # low-error placements with only a handful of visible pixels must
            # not beat the real, partially clipped tower.
            candidates.sort(key=lambda item: (-(item[2] - item[0]), item[0], item[1]))
            app_candidates.sort(key=lambda item: (-(item[2] - item[0]), item[0], item[1]))
            native_best, app_best = candidates[0], app_candidates[0]
            visible_evidence = native_best[2] - native_best[0]
            vertical_alignment_matches = None
            if visible_evidence:
                vertical_alignment_matches = native_best[4] == app_best[4]
            record["fields"].append({
                "native_field_x": field_x,
                "placed_art_visible_evidence_pixels": visible_evidence,
                "placed_art_vertical_alignment_matches_native": vertical_alignment_matches,
                "native_best_origin": {"x": native_best[3], "top_row_y": native_best[4],
                                       "compared_opaque_pixels": native_best[2],
                                       "differing_opaque_pixels": native_best[0]},
                "app_best_origin": {"x": app_best[3], "top_row_y": app_best[4],
                                    "compared_opaque_pixels": app_best[2],
                                    "differing_opaque_pixels": app_best[0]},
                "native_minus_app_top_row_y": native_best[4] - app_best[4],
                "expected_top_row_y": expected_origin_y,
                "native_matches_expected_y": expected_origin_y is None or native_best[4] == expected_origin_y,
                "app_matches_expected_y": expected_origin_y is None or app_best[4] == expected_origin_y,
                "best_art_matches": [
                    {"differing_opaque_pixels": a, "absolute_rgb565_error": b,
                     "compared_opaque_pixels": compared, "x": x, "top_row_y": y}
                    for a, b, compared, x, y in candidates[:TOP_MATCHES]
                ],
                "app_best_art_matches": [
                    {"differing_opaque_pixels": a, "absolute_rgb565_error": b,
                     "compared_opaque_pixels": compared, "x": x, "top_row_y": y}
                    for a, b, compared, x, y in app_candidates[:TOP_MATCHES]
                ],
                "native_player_field_full_image_difference_pixels": int(np.count_nonzero(
                    np.any(app != native[:, field_x:field_x + FIELD_WIDTH], axis=2))),
            })
        results.append(record)
        print(f"Scanned native frame {frame}")
    (output / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
