"""Identify native actor textures in one captured animation interval."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RESOURCE_SHEET = ROOT / "scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879/yolko.png"
ACTOR_ROOT = 0x3BD4
ACTOR_FIELDS = {"selector": 0x854, "animation_state": 0x858,
                "animation_phase": 0x85C, "action_state": 0x874}


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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-directory", type=Path, required=True)
    parser.add_argument("--capture-prefix", required=True)
    parser.add_argument("--frames", type=int, required=True)
    parser.add_argument("--first-frame", type=int, default=1)
    parser.add_argument("--frame-step", type=int, default=1)
    args = parser.parse_args()
    capture_dir = args.capture_directory
    if not capture_dir.is_absolute():
        capture_dir = ROOT / capture_dir
    decoder = load_decoder()
    sheet = np.asarray(Image.open(RESOURCE_SHEET).convert("RGBA"))
    cells = resource_cells(sheet)
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    output = ROOT / "scripts/OUTPUT" / f"eggo-actor-resource-interval_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Native actor sprite resource matches in a captured interval",
        "capture_directory": str(capture_dir.relative_to(ROOT)).replace("\\", "/"),
        "capture_prefix": args.capture_prefix,
        "frames": list(range(args.first_frame, args.frames + 1, args.frame_step)),
        "actor_root_ewram_offset": hex(ACTOR_ROOT),
        "actor_fields": {key: hex(value) for key, value in ACTOR_FIELDS.items()},
        "resource_sheet": str(RESOURCE_SHEET.relative_to(ROOT)).replace("\\", "/"),
        "resource_sheet_sha256": hashlib.sha256(RESOURCE_SHEET.read_bytes()).hexdigest(),
        "audio_output": False,
        "match": "Exact decoded OAM alpha mask and RGB555 palette colors against 64x64 Yolko resource cells.",
    }
    (output / "parameters.json").write_text(
        json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    records = []
    for frame in parameters["frames"]:
        stem = capture_dir / f"{args.capture_prefix}.frame{frame:05d}"
        vram = stem.with_name(stem.name + ".memory3").read_bytes()
        palette_raw = stem.with_name(stem.name + ".0x5000000").read_bytes()
        io = stem.with_name(stem.name + ".0x4000000").read_bytes()
        oam = stem.with_name(stem.name + ".0x7000000").read_bytes()
        ram = stem.with_name(stem.name + ".ram").read_bytes()
        palette = decoder.palette_555(palette_raw)
        actor = {name: struct.unpack_from("<i", ram, ACTOR_ROOT + offset)[0]
                 for name, offset in ACTOR_FIELDS.items()}
        for index in range(128):
            a0, a1, _a2 = struct.unpack_from("<3H", oam, index * 8)
            if a0 & 0x200 or (a0 >> 14) != 0 or (a1 >> 14) != 3 or a0 & 0x100:
                continue
            x = a1 & 0x1FF
            if x >= 256:
                x -= 512
            if not -128 <= x < 112:
                continue
            obj = decoder.decode_object(vram, palette, io, oam, index)
            if obj is None or obj["pixels"].shape != (64, 64, 3):
                continue
            mask = obj["visible"]
            rgb = (obj["pixels"].astype(np.uint16) * 255 // 31).astype(np.uint8)
            for group, picture, asset_mask, asset_rgb in cells:
                if np.array_equal(mask, asset_mask) and np.array_equal(rgb[mask], asset_rgb[mask]):
                    records.append({"frame": frame, "oam_index": index,
                                    "oam_x": obj["x"], "oam_y": obj["y"],
                                    "resource_group": group, "resource_picture": picture,
                                    **actor})
    fields = ["frame", "oam_index", "oam_x", "oam_y", "resource_group",
              "resource_picture", *ACTOR_FIELDS]
    with (output / "matches.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    exact = [record for record in records
             if record["resource_group"] == 16 and record["resource_picture"] == 2]
    result = {"exact_resource_match_count": len(records),
              "target_group_16_picture_2": exact,
              "unique_resource_cells": sorted({(r["resource_group"], r["resource_picture"])
                                                for r in records})}
    (output / "results.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
