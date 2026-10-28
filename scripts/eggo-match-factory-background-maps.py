"""Match native factory BG3 map snapshots to the extracted map atlas.

This is a read-only diagnostic: it compares decoded 112x256 map crops from
saved VRAM/palette/register captures, not emulator screenshots. Results and
input hashes are saved under scripts/OUTPUT.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURES = [
    {"directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
     "prefix": "eggo-replay-full-graphics", "frames": [1, 191]},
    {"directory": "scripts/OUTPUT/eggo-reference_2026-10-05_17-38-15_607301",
     "prefix": "factory-anim-60s", "frames": [168, 176, 184]},
    {"directory": "scripts/OUTPUT/eggo-reference_2026-10-05_17-59-34_990709",
     "prefix": "eggo-factory-active-bg", "frames": [168, 176, 184]},
]
ATLAS_PATH = ROOT / "renderer/games/eggo-mania/assets/factory-background-atlas.png"
FIELDS = {"player": {"x": 0, "actor_y": 0x3BD8},
          "cpu": {"x": 128, "actor_y": 0x4F54}}
RAM_BASE = 0x02000000
WORLD_Y_BASELINE = 720.0440673828125
WORLD_PIXELS_PER_HEIGHT = 16
FRAME_COUNTER = 0x02011A9C


def decode_bg3_map(vram: bytes, palette_bytes: bytes, io: bytes) -> tuple[np.ndarray, dict]:
    control = struct.unpack_from("<H", io, 8 + 2 * 3)[0]
    bpp = 8 if control & 0x80 else 4
    size_code = control >> 14
    width = 256 * (1 + (size_code & 1))
    height = 256 * (1 + ((size_code >> 1) & 1))
    char_base = ((control >> 2) & 3) * 0x4000
    screen_base = ((control >> 8) & 31) * 0x800
    words = np.frombuffer(palette_bytes, dtype="<u2")
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
            entry = struct.unpack_from("<H", vram, screen_base + entry_index * 2)[0]
            start = char_base + (entry & 1023) * tile_bytes
            packed = np.frombuffer(vram, dtype=np.uint8, count=tile_bytes, offset=start)
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
            image[tile_y * 8:tile_y * 8 + 8,
                  tile_x * 8:tile_x * 8 + 8] = colors
    hofs = struct.unpack_from("<H", io, 0x10 + 4 * 3)[0]
    if hofs:
        image = np.roll(image, -(hofs % width), axis=1)
    metadata = {"control": f"0x{control:04x}", "bpp": bpp,
                "map_size": [width, height], "char_base": char_base,
                "screen_base": screen_base, "hofs": hofs,
                "vofs": struct.unpack_from("<H", io, 0x12 + 4 * 3)[0]}
    return image, metadata


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    atlas_pixels = np.asarray(atlas)
    atlas_columns = atlas.width // 112
    atlas_rows = atlas.height // 256
    atlas_hashes: dict[str, list[int]] = {}
    for index in range(atlas_columns * atlas_rows):
        row, col = divmod(index, atlas_columns)
        crop = atlas_pixels[row * 256:(row + 1) * 256,
                            col * 112:(col + 1) * 112]
        canonical = crop.copy()
        canonical[canonical[..., 3] == 0, :3] = 0
        atlas_hashes.setdefault(sha256(canonical.tobytes()), []).append(index)

    records = []
    input_hashes = {}
    for capture in CAPTURES:
        folder = ROOT / capture["directory"]
        for frame in capture["frames"]:
            stem = folder / f"{capture['prefix']}.frame{frame:05d}"
            vram_path = Path(str(stem) + ".memory3")
            palette_path = Path(str(stem) + ".0x5000000")
            io_path = Path(str(stem) + ".0x4000000")
            ram_path = Path(str(stem) + ".ram")
            vram, palette, io, ram = (path.read_bytes()
                                      for path in (vram_path, palette_path, io_path, ram_path))
            input_hashes[str(vram_path.relative_to(ROOT))] = sha256(vram)
            input_hashes[str(palette_path.relative_to(ROOT))] = sha256(palette)
            input_hashes[str(io_path.relative_to(ROOT))] = sha256(io)
            input_hashes[str(ram_path.relative_to(ROOT))] = sha256(ram)
            full_map, map_metadata = decode_bg3_map(vram, palette, io)
            counter = struct.unpack_from("<I", ram, FRAME_COUNTER - RAM_BASE)[0]
            for field, field_data in FIELDS.items():
                x = field_data["x"]
                crop = full_map[:, x:x + 112]
                if crop.shape != (256, 112, 4):
                    raise ValueError(f"Unexpected BG3 map crop {crop.shape} for {field}")
                crop = crop.copy()
                crop[crop[..., 3] == 0, :3] = 0
                y = struct.unpack_from("<i", ram, field_data["actor_y"])[0] / 65536
                height = (WORLD_Y_BASELINE - y) / WORLD_PIXELS_PER_HEIGHT
                digest = sha256(crop.tobytes())
                records.append({
                    "capture": capture["prefix"], "frame": frame, "field": field,
                    "native_frame_counter": counter, "actor_world_y": y,
                    "actor_world_height": height, **map_metadata,
                    "map_sha256": digest,
                    "matching_atlas_indices": atlas_hashes.get(digest, []),
                })

    output = ROOT / "scripts/OUTPUT" / (
        "eggo-factory-map-match_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f"))
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Decode captured factory BG3 maps and match exact atlas cells",
        "captures": CAPTURES,
        "atlas": str(ATLAS_PATH.relative_to(ROOT)),
        "fields": FIELDS,
        "world_height_formula": "(720.0440673828125 - actor_world_y) / 16",
        "map_decoder": "GBA Mode-0 BG3 map, palette and tile data; horizontal BG3 scroll baked in, vertical scroll retained as register metadata",
        "random_seed": None,
        "audio_enabled": False,
        "atlas_sha256": sha256(ATLAS_PATH.read_bytes()),
        "input_sha256": input_hashes,
        "created_utc": datetime.now(timezone.utc).isoformat(),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    (output / "maps.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "records": records}, indent=2))


if __name__ == "__main__":
    main()
