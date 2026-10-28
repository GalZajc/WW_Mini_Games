"""Match native factory water-surface OAM art to the decoded 32-frame atlas.

The sprite is reconstructed from captured VRAM, palette and OAM, so the phase
measurement is independent of actors and other layers that can cover it in the
final screenshot. This is an offline analysis and produces no audio.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania native factory water-surface OAM phase audit",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "frame_range": [1, 600],
    "extra_checkpoint": {
        "directory": "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942",
        "prefix": "bot-tower.frame00840",
        "label": "frame-840-native-reference",
    },
    "atlas": "renderer/games/eggo-mania/assets/factory-water-surface.png",
    "atlas_frames": 32,
    "atlas_frame_size": [112, 32],
    "surface_object": {"x_positions": [-8, 56], "size": [64, 32], "palette_bank": 4},
    "native_frame_counter_address": "0x02011a9c",
    "audio_enabled": False,
    "random_seed": None,
}


def rgb555_palette(raw: bytes) -> np.ndarray:
    words = np.frombuffer(raw, dtype="<u2")
    return np.stack(((words & 31) * 255 // 31,
                     ((words >> 5) & 31) * 255 // 31,
                     ((words >> 10) & 31) * 255 // 31,
                     np.full(words.shape, 255)), axis=-1).astype(np.uint8)


def decode_obj(vram: bytes, palette: np.ndarray, tile_base: int,
               bank: int, width: int, height: int, one_dimensional: bool) -> np.ndarray:
    output = np.zeros((height, width, 4), dtype=np.uint8)
    stride = width // 8 if one_dimensional else 32
    for tile_y in range(height // 8):
        for tile_x in range(width // 8):
            tile = (tile_base + tile_y * stride + tile_x) & 1023
            start = 0x10000 + tile * 32
            packed = np.frombuffer(vram[start:start + 32], dtype=np.uint8)
            if packed.size != 32:
                raise ValueError(f"OBJ tile {tile} falls outside captured VRAM")
            indices = np.stack((packed & 15, packed >> 4), axis=1).reshape(8, 8).astype(np.int16)
            pixels = palette[256 + bank * 16 + indices].copy()
            pixels[indices == 0, 3] = 0
            output[tile_y * 8:tile_y * 8 + 8,
                   tile_x * 8:tile_x * 8 + 8] = pixels
    return output


def decode_surface(stem: Path) -> tuple[np.ndarray | None, int | None, list[int]]:
    vram = Path(str(stem) + ".memory3").read_bytes()
    palette = rgb555_palette(Path(str(stem) + ".0x5000000").read_bytes())
    io = Path(str(stem) + ".0x4000000").read_bytes()
    oam = Path(str(stem) + ".0x7000000").read_bytes()
    one_dimensional = bool(struct.unpack_from("<H", io, 0)[0] & 0x40)
    pieces = {}
    surface_tiles = []
    ys = set()
    for index, (attr0, attr1, attr2, _) in enumerate(struct.iter_unpack("<4H", oam)):
        if attr0 & 0x300 == 0x200 or (attr0 >> 14) == 3:
            continue
        shape, size_index = (attr0 >> 14) & 3, (attr1 >> 14) & 3
        dimensions = [[(8, 8), (16, 16), (32, 32), (64, 64)],
                      [(16, 8), (32, 8), (32, 16), (64, 32)],
                      [(8, 16), (8, 32), (16, 32), (32, 64)]][shape][size_index]
        x = attr1 & 0x1FF
        if x >= 0x100:
            x -= 0x200
        bank = (attr2 >> 12) & 15
        if (dimensions != (64, 32) or bank != 4 or x not in (-8, 56) or
                (attr0 & 0x0100)):
            continue
        y = attr0 & 0xFF
        sprite = decode_obj(vram, palette, attr2 & 0x3FF, bank,
                            *dimensions, one_dimensional)
        if attr1 & 0x1000:
            sprite = sprite[:, ::-1]
        if attr1 & 0x2000:
            sprite = sprite[::-1, :]
        pieces[x] = sprite
        surface_tiles.append(attr2 & 0x3FF)
        ys.add(y)
    if not pieces:
        return None, None, []
    if set(pieces) != {-8, 56} or len(ys) != 1:
        raise ValueError(f"{stem} does not contain the expected water OAM pair: {pieces.keys()}, {ys}")
    surface = np.zeros((32, 112, 4), dtype=np.uint8)
    surface[:, 0:56] = pieces[-8][:, 8:64]
    surface[:, 56:112] = pieces[56][:, 0:56]
    return surface, next(iter(ys)), sorted(surface_tiles)


def match_phase(native: np.ndarray, atlas: np.ndarray) -> tuple[list[int], int, list[int]]:
    scores = [int(np.count_nonzero(np.any(atlas[index] != native, axis=2)))
              for index in range(PARAMETERS["atlas_frames"])]
    best = min(scores)
    return [index for index, score in enumerate(scores) if score == best], best, scores


def main() -> None:
    atlas_path = ROOT / PARAMETERS["atlas"]
    atlas_rgba = np.asarray(Image.open(atlas_path).convert("RGBA"), dtype=np.uint8)
    expected = (32 * 32, 112, 4)
    if atlas_rgba.shape != expected:
        raise ValueError(f"Unexpected atlas shape: {atlas_rgba.shape}")
    atlas = atlas_rgba.reshape(32, 32, 112, 4)

    directory = ROOT / PARAMETERS["capture_directory"]
    rows = []
    offset_scores = [0] * 32
    for frame in range(PARAMETERS["frame_range"][0], PARAMETERS["frame_range"][1] + 1):
        stem = directory / f"{PARAMETERS['capture_prefix']}.frame{frame:05d}"
        native, y, tiles = decode_surface(stem)
        if native is None:
            continue
        ram = Path(str(stem) + ".ram").read_bytes()
        native_frame = struct.unpack_from("<I", ram, 0x11A9C)[0]
        best_phases, errors, scores = match_phase(native, atlas)
        for offset in range(32):
            if (native_frame + offset) % 32 in best_phases:
                offset_scores[offset] += 1
        rows.append({
            "capture_frame": frame,
            "native_frame": native_frame,
            "oam_y": y,
            "water_oam_tiles": ";".join(map(str, tiles)),
            "best_atlas_phases": ";".join(map(str, best_phases)),
            "different_sprite_pixels": errors,
            "phase_at_existing_runtime_offset_12": (native_frame + 12) % 32,
            "error_at_existing_runtime_offset_12": scores[(native_frame + 12) % 32],
            "all_phase_scores": ";".join(map(str, scores)),
        })

    extra = PARAMETERS["extra_checkpoint"]
    extra_stem = ROOT / extra["directory"] / extra["prefix"]
    extra_native, extra_y, extra_tiles = decode_surface(extra_stem)
    extra_phases, extra_error, extra_scores = match_phase(extra_native, atlas)
    extra_ram = Path(str(extra_stem) + ".ram").read_bytes()
    extra_frame = struct.unpack_from("<I", extra_ram, 0x11A9C)[0]
    for offset in range(32):
        if (extra_frame + offset) % 32 in extra_phases:
            offset_scores[offset] += 1
    rows.append({
        "capture_frame": extra["label"],
        "native_frame": extra_frame,
        "oam_y": extra_y,
        "water_oam_tiles": ";".join(map(str, extra_tiles)),
        "best_atlas_phases": ";".join(map(str, extra_phases)),
        "different_sprite_pixels": extra_error,
        "phase_at_existing_runtime_offset_12": (extra_frame + 12) % 32,
        "error_at_existing_runtime_offset_12": extra_scores[(extra_frame + 12) % 32],
        "all_phase_scores": ";".join(map(str, extra_scores)),
    })

    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-native-water-surface-phase_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    with (output / "per-frame-phase-results.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    total = len(rows)
    max_score = max(offset_scores)
    best_offsets = [offset for offset, score in enumerate(offset_scores) if score == max_score]
    extra_row = rows[-1]
    results = {
        "native_frames_checked": total,
        "exact_sprite_phase_matches": sum(row["different_sprite_pixels"] == 0 for row in rows),
        "best_constant_offsets": best_offsets,
        "best_constant_offset_exact_frames": max_score,
        "offset_12_exact_frames": sum(row["error_at_existing_runtime_offset_12"] == 0 for row in rows),
        "extra_checkpoint": {
            "native_frame": extra_frame,
            "best_phases": extra_phases,
            "different_sprite_pixels": extra_error,
            "phase_at_offset_12": (extra_frame + 12) % 32,
            "error_at_offset_12": extra_scores[(extra_frame + 12) % 32],
        },
        "atlas_sha256": hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
        "audio_enabled": False,
        "limits": [
            "This identifies sprite art phase from native OAM/VRAM; it does not infer the ROM's animation timer.",
            "Repeated atlas phases can be visually indistinguishable in the exact 112x32 surface image.",
        ],
    }
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    parameters = {
        **PARAMETERS,
        "atlas_sha256": results["atlas_sha256"],
        "capture_metadata_sha256": hashlib.sha256(
            (directory / f"{PARAMETERS['capture_prefix']}.json").read_bytes()
        ).hexdigest(),
        "phase_rule_tested": "(nativeFrame + constantOffset) modulo 32",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **results}, indent=2))


if __name__ == "__main__":
    main()
