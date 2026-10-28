"""Extract player-colored 64x64 OAM images missing from the reconstructed atlas."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
POSE_AUDIT = ROOT / "scripts/OUTPUT/eggo-actor-pose-parity_2026-10-08_09-46-19/poses.csv"
RESOURCE_SHEET = ROOT / "scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879/yolko.png"
ACTOR_BASE = 0x3BD4


def load_decoder():
    source = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_layers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load native OAM decoder: {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    output = ROOT / "scripts/OUTPUT" / (
        "eggo-unmapped-player-art_" +
        datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S"))
    output.mkdir(parents=True, exist_ok=False)

    missing = {}
    with POSE_AUDIT.open("r", newline="", encoding="utf-8-sig") as stream:
        for row in csv.DictReader(stream):
            if row["side"] == "player" and row["native_actor_oam_found"] == "False":
                missing[int(row["frame"])] = row

    decoder = load_decoder()
    resource_sheet = np.asarray(Image.open(RESOURCE_SHEET).convert("RGBA"))
    resource_cells = []
    for resource_row in range(resource_sheet.shape[0] // 64):
        for resource_column in range(resource_sheet.shape[1] // 64):
            crop = resource_sheet[resource_row * 64:(resource_row + 1) * 64,
                                  resource_column * 64:(resource_column + 1) * 64]
            resource_mask = crop[..., 3] > 0
            if resource_mask.any():
                resource_cells.append((resource_row + 1, resource_column,
                                       resource_mask, crop[..., :3]))
    rows = []
    images = {}
    for frame, pose in sorted(missing.items()):
        base = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{frame:05d}"
        vram = base.with_name(base.name + ".memory3").read_bytes()
        palette_raw = base.with_name(base.name + ".0x5000000").read_bytes()
        io = base.with_name(base.name + ".0x4000000").read_bytes()
        oam = base.with_name(base.name + ".0x7000000").read_bytes()
        ram = base.with_name(base.name + ".ram").read_bytes()
        palette = decoder.palette_555(palette_raw)
        selector, state, phase = struct.unpack_from("<3I", ram, ACTOR_BASE + 0x854)
        action_state = struct.unpack_from("<I", ram, ACTOR_BASE + 0x874)[0]
        actor_x, actor_y = struct.unpack_from("<2i", ram, ACTOR_BASE)

        for index in range(128):
            obj = decoder.decode_object(vram, palette, io, oam, index)
            if obj is None or obj["pixels"].shape != (64, 64, 3):
                continue
            x, y = int(obj["x"]), int(obj["y"])
            if not -128 <= x < 112:
                continue
            a0, a1, a2 = struct.unpack_from("<3H", oam, index * 8)
            pixels = obj["pixels"].copy()
            mask = obj["visible"].copy()
            if a1 & 0x1000:
                pixels = pixels[:, ::-1]
                mask = mask[:, ::-1]
            if a1 & 0x2000:
                pixels = pixels[::-1, :]
                mask = mask[::-1, :]

            # Yolko's native body is bright magenta in RGB555. This excludes
            # pieces and scenery while retaining alternate poses whose alpha
            # mask is absent from the current hand-built atlas.
            pink = mask & (pixels[..., 0] >= 24) & (pixels[..., 1] <= 18) & (pixels[..., 2] >= 16)
            pink_count = int(np.count_nonzero(pink))
            if pink_count < 48:
                continue
            key = hashlib.sha256(pixels.tobytes() + mask.tobytes()).hexdigest()
            images.setdefault(key, {"pixels": pixels, "mask": mask, "observations": []})
            images[key]["observations"].append(frame)
            rows.append({
                "frame": frame, "oam_index": index, "screen_x": x, "screen_y": y,
                "tile": a2 & 1023, "hflip": bool(a1 & 0x1000), "vflip": bool(a1 & 0x2000),
                "pink_pixel_count": pink_count, "image_sha256": key,
                "selector": selector, "animation_state": state, "animation_phase": phase,
                "action_state": action_state, "actor_x_q16": actor_x, "actor_y_q16": actor_y,
                "animation_table": pose["native_animation_table"],
                "animation_frame_pointer": pose["native_animation_frame"],
                "app_pose_state": pose["app_pose_state"],
                "app_pose_row": pose["app_pose_row"], "app_pose_frame": pose["app_pose_frame"],
                "app_held": pose["app_held"], "app_actor_ground": pose["app_actor_ground"],
                "app_actor_walking": pose["app_actor_walking"],
                "app_actor_vy": pose["app_actor_vy"],
            })

    fields = list(rows[0]) if rows else ["frame", "oam_index"]
    with (output / "observations.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    ordered = sorted(images.items(), key=lambda item: (-len(item[1]["observations"]), item[0]))
    columns = 6
    cell_w, cell_h = 84, 86
    contact = Image.new("RGBA", (columns * cell_w, max(1, (len(ordered) + columns - 1) // columns) * cell_h), (30, 30, 30, 255))
    draw = ImageDraw.Draw(contact)
    for ordinal, (key, record) in enumerate(ordered):
        x0, y0 = (ordinal % columns) * cell_w, (ordinal // columns) * cell_h
        values = (record["pixels"].astype(np.uint16) * 255 // 31).astype(np.uint8)
        rgba = np.zeros((64, 64, 4), dtype=np.uint8)
        rgba[..., :3] = values
        rgba[..., 3] = record["mask"].astype(np.uint8) * 255
        contact.alpha_composite(Image.fromarray(rgba, "RGBA"), (x0 + 10, y0))
        draw.text((x0 + 2, y0 + 66), f"{ordinal}: {len(record['observations'])}x", fill="white")
        draw.text((x0 + 2, y0 + 76), f"f{min(record['observations'])}-{max(record['observations'])}", fill="white")
    contact.save(output / "unique-unmapped-pink-oam.png")

    resource_matches = {}
    for key, record in ordered:
        native_mask = record["mask"]
        native_rgb = (record["pixels"].astype(np.uint16) * 255 // 31).astype(np.uint8)
        scored = []
        for resource_row, resource_column, resource_mask, resource_rgb in resource_cells:
            mask_delta = int(np.count_nonzero(native_mask ^ resource_mask))
            common = native_mask & resource_mask
            color_delta = int(np.count_nonzero(np.any(native_rgb != resource_rgb, axis=-1) & common))
            color_distance = int(np.abs(native_rgb.astype(np.int16) -
                                         resource_rgb.astype(np.int16))[common].sum())
            scored.append((mask_delta, color_delta, color_distance, resource_row, resource_column))
        scored.sort()
        resource_matches[key] = [
            {"row": row, "column": column, "mask_delta_pixels": mask_delta,
             "color_mismatch_pixels": color_delta, "rgb_absolute_difference": color_distance}
            for mask_delta, color_delta, color_distance, row, column in scored[:3]
        ]

    native_cells = sorted({
        (match["row"], match["column"])
        for matches in resource_matches.values()
        for match in matches[:1]
        if match["mask_delta_pixels"] == 0 and match["color_mismatch_pixels"] == 0
    })
    if len(native_cells) != len(ordered):
        raise ValueError("Every extracted image must map to one exact ROM resource cell")
    asset_dir = ROOT / "renderer/games/eggo-mania/assets"
    native_atlas = Image.new("RGBA", (64 * len(native_cells), 64), (0, 0, 0, 0))
    native_manifest = []
    native_cell_index = {}
    for index, (resource_row, resource_column) in enumerate(native_cells):
        crop = resource_sheet[(resource_row - 1) * 64:resource_row * 64,
                              resource_column * 64:(resource_column + 1) * 64]
        native_atlas.paste(Image.fromarray(crop, "RGBA"), (index * 64, 0))
        native_cell_index[(resource_row, resource_column)] = index
        native_manifest.append({"index": index, "source_resource_row": resource_row,
                                "source_resource_column": resource_column})
    asset_path = asset_dir / "yolko-native-poses.png"
    native_atlas.save(asset_path)
    asset_manifest_path = asset_dir / "yolko-native-poses.json"
    asset_manifest_path.write_text(json.dumps({
        "source_resource_sheet": str(RESOURCE_SHEET.relative_to(ROOT)),
        "cell_size": [64, 64], "cells": native_manifest,
    }, indent=2), encoding="utf-8")

    result = {
        "experiment": "Extract native Yolko OAM images missing from current pose atlas",
        "capture_directory": str(CAPTURE_DIR.relative_to(ROOT)),
        "pose_audit_csv": str(POSE_AUDIT.relative_to(ROOT)),
        "resource_sheet": str(RESOURCE_SHEET.relative_to(ROOT)),
        "missing_player_frames_scanned": len(missing),
        "pink_oam_observations": len(rows),
        "unique_images": len(images),
        "images": [
            {"ordinal": index, "sha256": key, "observations": len(record["observations"]),
             "frames": sorted(set(record["observations"])),
             "nearest_resource_cells": resource_matches[key],
             "runtime_native_pose_column": native_cell_index.get(
                 (resource_matches[key][0]["row"], resource_matches[key][0]["column"]))}
            for index, (key, record) in enumerate(ordered)
        ],
        "offline_audio_output": False,
        "files": ["observations.csv", "unique-unmapped-pink-oam.png",
                  str(asset_path.relative_to(ROOT)),
                  str(asset_manifest_path.relative_to(ROOT))],
    }
    (output / "parameters.json").write_text(json.dumps({
        "experiment": result["experiment"],
        "capture_directory": result["capture_directory"],
        "pose_audit_csv": result["pose_audit_csv"],
        "resource_sheet": str(RESOURCE_SHEET.relative_to(ROOT)),
        "pink_color_filter_rgb555": {"red_min": 24, "green_max": 18, "blue_min": 16},
        "minimum_pink_pixels": 48,
        "unique_image_key": "SHA-256 of canonical 64x64 RGB555 pixels and transparency mask",
        "audioOutputMuted": None,
        "audioOutput": "none; this analysis is offline",
        "runtime_asset": str(asset_path.relative_to(ROOT)),
        "runtime_asset_manifest": str(asset_manifest_path.relative_to(ROOT)),
    }, indent=2), encoding="utf-8")
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "frames": len(missing),
                      "observations": len(rows), "unique_images": len(images)}, indent=2))


if __name__ == "__main__":
    main()
