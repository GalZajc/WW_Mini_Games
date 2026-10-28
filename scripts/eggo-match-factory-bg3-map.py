#!/usr/bin/env python3
"""Match a captured factory BG3 map to the decoded map atlas."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import argparse
import csv
import hashlib
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
ATLAS_PATH = ROOT / "renderer/games/eggo-mania/assets/factory-background-atlas.png"
ATLAS_METADATA = ROOT / "renderer/games/eggo-mania/assets/factory-background-atlas.json"
FRAME = 191
NORMAL_REGISTER_FRAME = 160
FIELD_X = {"player": 0, "cpu": 128}
FIELD_WIDTH, MAP_SIZE = 112, 256


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def decode_bg3_map(vram: bytes, palette_raw: bytes, io: bytes) -> tuple[np.ndarray, int, int, int]:
    control = u16(io, 8 + 2 * 3)
    bpp = 8 if control & 0x80 else 4
    size_code = control >> 14
    width, height = 256 * (1 + (size_code & 1)), 256 * (1 + ((size_code >> 1) & 1))
    char_base, screen_base = ((control >> 2) & 3) * 0x4000, ((control >> 8) & 31) * 0x800
    hofs, vofs = struct.unpack_from("<HH", io, 0x10 + 4 * 3)
    words = np.frombuffer(palette_raw, dtype="<u2")
    palette = np.stack(((words & 31) * 255 // 31,
                        ((words >> 5) & 31) * 255 // 31,
                        ((words >> 10) & 31) * 255 // 31,
                        np.full(words.shape, 255)), axis=-1).astype(np.uint8)
    image = np.zeros((height, width, 4), dtype=np.uint8)
    tile_bytes = 64 if bpp == 8 else 32
    for tile_y in range(height // 8):
        for tile_x in range(width // 8):
            block = (tile_y // 32) * (width // 256) + tile_x // 32
            entry_index = block * 1024 + (tile_y % 32) * 32 + tile_x % 32
            entry = u16(vram, screen_base + entry_index * 2)
            offset = char_base + (entry & 1023) * tile_bytes
            packed = np.frombuffer(vram, dtype=np.uint8, count=tile_bytes, offset=offset)
            if bpp == 8:
                indices = packed.reshape(8, 8)
                colors = palette[indices].copy()
            else:
                indices = np.stack((packed & 15, packed >> 4), axis=1).reshape(8, 8)
                colors = palette[indices + ((entry >> 12) & 15) * 16].copy()
            if entry & 0x400:
                colors = colors[:, ::-1]
            if entry & 0x800:
                colors = colors[::-1, :]
            colors[indices == 0, 3] = 0
            image[tile_y * 8:tile_y * 8 + 8, tile_x * 8:tile_x * 8 + 8] = colors
    if hofs:
        image = np.roll(image, -(hofs % width), axis=1)
    return image, control, hofs, vofs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frame", type=int, default=FRAME)
    parser.add_argument("--normal-register-frame", type=int, default=NORMAL_REGISTER_FRAME)
    parser.add_argument("--field", choices=tuple(FIELD_X), default="cpu")
    args = parser.parse_args()
    stem = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{args.frame:05d}"
    normal_io_path = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{args.normal_register_frame:05d}.0x4000000"
    vram_path, palette_path = stem.with_name(stem.name + ".memory3"), stem.with_name(stem.name + ".0x5000000")
    vram, palette_raw, normal_io = vram_path.read_bytes(), palette_path.read_bytes(), normal_io_path.read_bytes()
    full_map, control, hofs, vofs = decode_bg3_map(vram, palette_raw, normal_io)
    x0 = FIELD_X[args.field]
    target = full_map[:, x0:x0 + FIELD_WIDTH]
    atlas = np.asarray(Image.open(ATLAS_PATH).convert("RGBA"))
    columns = atlas.shape[1] // FIELD_WIDTH
    unique_maps = json.loads(ATLAS_METADATA.read_text(encoding="utf-8"))["unique_field_maps"]
    scores = []
    for index in range(unique_maps):
        x, y = (index % columns) * FIELD_WIDTH, (index // columns) * MAP_SIZE
        candidate = atlas[y:y + MAP_SIZE, x:x + FIELD_WIDTH]
        if candidate.shape != target.shape:
            continue
        different = np.any(candidate != target, axis=2)
        scores.append({"atlas_index": index,
                       "different_pixels": int(different.sum()),
                       "different_opaque_pixels": int(np.count_nonzero(different & (candidate[..., 3] > 0))),
                       "candidate_opaque_pixels": int(np.count_nonzero(candidate[..., 3])),
                       "current_opaque_pixels": int(np.count_nonzero(target[..., 3])),
                       "exact": not bool(different.any())})
    scores.sort(key=lambda row: (row["different_pixels"], row["atlas_index"]))
    best_index = scores[0]["atlas_index"]
    best_x, best_y = (best_index % columns) * FIELD_WIDTH, (best_index // columns) * MAP_SIZE
    best_map = atlas[best_y:best_y + MAP_SIZE, best_x:best_x + FIELD_WIDTH]
    diff = np.zeros((MAP_SIZE, FIELD_WIDTH, 4), dtype=np.uint8)
    diff[..., 0] = 255
    diff[..., 3] = np.any(best_map != target, axis=2).astype(np.uint8) * 255
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-factory-bg3-map-match_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Factory CPU field BG3 decoded map to atlas match",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "frame": args.frame, "normal_register_frame": args.normal_register_frame,
        "field": args.field, "field_crop_x": x0, "field_crop_size": [FIELD_WIDTH, MAP_SIZE],
        "normal_bg3_control": f"0x{control:04x}", "normal_bg3_hofs": hofs, "normal_bg3_vofs": vofs,
        "app_audio_output_muted": None, "random_seed": None,
        "inputs_sha256": {path.relative_to(ROOT).as_posix(): sha256(path) for path in
                           (vram_path, palette_path, normal_io_path, ATLAS_PATH, ATLAS_METADATA)},
    }
    result = {"best_candidates": scores[:30], "exact_map_match_found": any(row["exact"] for row in scores),
              "output_directory": output.relative_to(ROOT).as_posix()}
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with (output / "map-scores.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(scores[0]))
        writer.writeheader()
        writer.writerows(scores)
    Image.fromarray(target, "RGBA").save(output / "captured-map.png")
    Image.fromarray(best_map, "RGBA").save(output / "closest-atlas-map.png")
    Image.fromarray(diff, "RGBA").save(output / "closest-map-diff.png")
    print(json.dumps({"output": result["output_directory"], "normal_bg3_control": parameters["normal_bg3_control"],
                      "native_bg3_hofs_vofs": [hofs, vofs], "best_candidates": scores[:12]}, indent=2))


if __name__ == "__main__":
    main()
