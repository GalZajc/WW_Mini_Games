"""Map captured actor OAM frames to the complete ROM-decoded Yolko resource sheet."""
from __future__ import annotations

from collections import Counter
from datetime import datetime
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
RESOURCE_SHEET = ROOT / "scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879/yolko.png"
ACTOR_ROOT = 0x3BD4
ACTOR_FIELDS = {
    "x_q16": 0x000,
    "y_q16": 0x004,
    "vy_q16": 0x018,
    "variant": 0x868,
    "animation_selector": 0x854,
    "animation_state": 0x858,
    "animation_phase": 0x85C,
    "animation_flags": 0x86C,
    "action_state": 0x874,
    "next_action_state": 0x878,
    "inventory": 0x864,
}
PLAYER_OAM_X_RANGE = (-128, 112)
SCREEN_OAM_ADDRESS = 0x07000000
SCREEN_PALETTE_ADDRESS = 0x05000000
SCREEN_IO_ADDRESS = 0x04000000
SCREEN_VRAM_ADDRESS = 0x06000000


def load_decoder():
    source = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_layers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import OAM decoder: {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resource_cells(sheet: np.ndarray):
    cells = []
    for row in range(sheet.shape[0] // 64):
        for column in range(sheet.shape[1] // 64):
            crop = sheet[row * 64:(row + 1) * 64,
                         column * 64:(column + 1) * 64]
            mask = crop[..., 3] > 0
            if mask.any():
                cells.append((row + 1, column, mask,
                              np.ascontiguousarray(crop[..., :3])))
    return cells


def main():
    decoder = load_decoder()
    sheet = np.asarray(Image.open(RESOURCE_SHEET).convert("RGBA"))
    cells = resource_cells(sheet)
    output = ROOT / "scripts/OUTPUT" / (
        "eggo-actor-resource-matches_" +
        datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S"))
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Native Yolko actor OAM to full ROM resource-sheet matching",
        "capture_directory": str(CAPTURE_DIR.relative_to(ROOT)),
        "capture_prefix": CAPTURE_PREFIX,
        "resource_sheet": str(RESOURCE_SHEET.relative_to(ROOT)),
        "resource_sheet_sha256": hashlib.sha256(RESOURCE_SHEET.read_bytes()).hexdigest(),
        "capture_frames": 600,
        "oam_size": [64, 64],
        "player_oam_x_range": list(PLAYER_OAM_X_RANGE),
        "actor_root_ewram_offset": hex(ACTOR_ROOT),
        "actor_fields": {key: hex(value) for key, value in ACTOR_FIELDS.items()},
        "color_conversion": "Expand each captured RGB555 channel to RGB8 using channel*255//31 before exact comparison.",
        "random_seed": "encoded in the saved emulator checkpoint",
        "audio_output": False,
    }
    (output / "parameters.json").write_text(
        json.dumps(parameters, indent=2), encoding="utf-8")

    records = []
    for frame in range(1, parameters["capture_frames"] + 1):
        base = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{frame:05d}"
        vram = base.with_name(base.name + ".memory3").read_bytes()
        palette_raw = base.with_name(base.name + ".0x5000000").read_bytes()
        io = base.with_name(base.name + ".0x4000000").read_bytes()
        oam = base.with_name(base.name + ".0x7000000").read_bytes()
        ram = base.with_name(base.name + ".ram").read_bytes()
        palette = decoder.palette_555(palette_raw)
        actor = {name: struct.unpack_from("<i", ram, ACTOR_ROOT + offset)[0]
                 for name, offset in ACTOR_FIELDS.items()}

        for index in range(128):
            a0, a1, _a2 = struct.unpack_from("<3H", oam, index * 8)
            if (a0 & 0x200 or (a0 >> 14) != 0 or (a1 >> 14) != 3 or
                    a0 & 0x100):
                continue
            x = a1 & 0x1FF
            if x >= 256:
                x -= 512
            if not PLAYER_OAM_X_RANGE[0] <= x < PLAYER_OAM_X_RANGE[1]:
                continue
            obj = decoder.decode_object(vram, palette, io, oam, index)
            if obj is None or obj["pixels"].shape != (64, 64, 3):
                continue
            mask = obj["visible"]
            rgb = (obj["pixels"].astype(np.uint16) * 255 // 31).astype(np.uint8)
            for resource_row, resource_column, resource_mask, resource_rgb in cells:
                if not np.array_equal(mask, resource_mask):
                    continue
                if np.array_equal(rgb[mask], resource_rgb[mask]):
                    records.append({
                        "frame": frame,
                        "oam_index": index,
                        "oam_x": obj["x"],
                        "oam_y": obj["y"],
                        "resource_group": resource_row,
                        "resource_picture": resource_column,
                        **actor,
                    })

    fields = ["frame", "oam_index", "oam_x", "oam_y", "resource_group",
              "resource_picture", *ACTOR_FIELDS]
    with (output / "matches.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)

    by_resource = Counter((r["resource_group"], r["resource_picture"])
                          for r in records)
    result = {
        "matched_oam_frames": len({r["frame"] for r in records}),
        "exact_resource_matches": len(records),
        "matches_by_resource": [
            {"group": group, "picture": picture, "frames": count}
            for (group, picture), count in sorted(by_resource.items())],
        "resource_match_intervals": [],
    }
    frames_by_resource = {}
    for row in records:
        key = (row["resource_group"], row["resource_picture"])
        frames_by_resource.setdefault(key, set()).add(row["frame"])
    for (group, picture), frames in sorted(frames_by_resource.items()):
        ordered = sorted(frames)
        start = previous = ordered[0]
        for current in ordered[1:]:
            if current != previous + 1:
                result["resource_match_intervals"].append({
                    "group": group, "picture": picture,
                    "first_frame": start, "last_frame": previous})
                start = current
            previous = current
        result["resource_match_intervals"].append({
            "group": group, "picture": picture,
            "first_frame": start, "last_frame": previous})
    (output / "results.json").write_text(
        json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
