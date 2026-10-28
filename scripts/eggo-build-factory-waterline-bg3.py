"""Decode and validate the native 60-phase factory waterline BG3 art atlas."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
PREFIX = "eggo-replay-full-graphics"
FRAME_COUNT = 600
NATIVE_FRAME_ADDRESS = 0x02011A9C
RAM_BASE = 0x02000000
CPU_WATERLINE_Q16 = 0x02004F34
CPU_CAMERA_Q16 = 0x02004C90
BG3CNT_OFFSET = 0x0E
BG3_SCREEN_BASE = 11 * 0x800
SOURCE_X = np.arange(136, 248, dtype=np.int32)  # screen CPU crop x=128..239 + BG3HOFS 8
SOURCE_Y = np.arange(80, 98, dtype=np.int32)   # fixed first visible BG3 row through 17 rows below
PERIOD = 60


def read_capture(frame: int, suffix: str) -> bytes:
    return (CAPTURE / f"{PREFIX}.frame{frame:05d}.{suffix}").read_bytes()


def decode_alt_bg3_source(vram: bytes, palette_raw: bytes) -> np.ndarray:
    """Decode 112×18 RGBA pixels from alt BG3 screen base 11 at source Y=80."""
    screen_map = np.frombuffer(vram, dtype="<u2", count=1024,
                               offset=BG3_SCREEN_BASE).reshape(32, 32)
    entry = screen_map[SOURCE_Y[:, None] // 8, SOURCE_X[None, :] // 8]
    px = np.broadcast_to(SOURCE_X[None, :] & 7, entry.shape).copy()
    py = np.broadcast_to(SOURCE_Y[:, None] & 7, entry.shape).copy()
    px = np.where(entry & 0x0400, 7 - px, px)
    py = np.where(entry & 0x0800, 7 - py, py)
    tile = entry & 0x03FF
    byte_index = tile * 32 + py * 4 + (px >> 1)
    packed = np.frombuffer(vram, dtype=np.uint8)[byte_index]
    color_index = np.where(px & 1, packed >> 4, packed & 15).astype(np.uint16)
    color_index += ((entry >> 12) & 15).astype(np.uint16) * 16

    palette = np.frombuffer(palette_raw, dtype="<u2", count=256)
    words = palette[color_index]
    rgb5 = np.stack((words & 31, (words >> 5) & 31,
                     (words >> 10) & 31), axis=-1).astype(np.uint16)
    rgba = np.zeros((*entry.shape, 4), dtype=np.uint8)
    rgba[..., 0] = (rgb5[..., 0] * 255 // 31).astype(np.uint8)
    rgba[..., 1] = (rgb5[..., 1] * 2 * 255 // 63).astype(np.uint8)
    rgba[..., 2] = (rgb5[..., 2] * 255 // 31).astype(np.uint8)
    rgba[..., 3] = ((color_index & 15) != 0).astype(np.uint8) * 255
    return rgba


def waterline_y(ram: bytes) -> int:
    water = struct.unpack_from("<i", ram, CPU_WATERLINE_Q16 - RAM_BASE)[0]
    camera = struct.unpack_from("<i", ram, CPU_CAMERA_Q16 - RAM_BASE)[0]
    return ((water - camera) >> 16) + 15


def main() -> None:
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-factory-waterline-bg3_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
    )
    output.mkdir(parents=True, exist_ok=False)

    phases: dict[int, np.ndarray] = {}
    phase_sources: dict[int, list[int]] = {}
    records = []
    mismatches = []
    native_frames = []
    for capture_frame in range(1, FRAME_COUNT + 1):
        ram = read_capture(capture_frame, "ram")
        native_frame = struct.unpack_from("<I", ram,
                                           NATIVE_FRAME_ADDRESS - RAM_BASE)[0]
        native_frames.append(native_frame)
        phase = native_frame % PERIOD
        art = decode_alt_bg3_source(read_capture(capture_frame, "memory3"),
                                    read_capture(capture_frame, "0x5000000"))
        digest = hashlib.sha256(art.tobytes()).hexdigest()
        phase_sources.setdefault(phase, []).append(capture_frame)
        if phase not in phases:
            phases[phase] = art
        elif not np.array_equal(phases[phase], art):
            mismatch_pixels = int(np.count_nonzero(np.any(phases[phase] != art, axis=2)))
            mismatches.append({
                "capture_frame": capture_frame,
                "native_frame": native_frame,
                "phase": phase,
                "reference_capture_frame": phase_sources[phase][0],
                "different_source_pixels": mismatch_pixels,
            })
        records.append({
            "capture_frame": capture_frame,
            "native_frame": native_frame,
            "phase": phase,
            "source_rgba_sha256": digest,
            "transparent_pixels": int(np.count_nonzero(art[..., 3] == 0)),
            "different_pixels_from_phase_reference": 0 if capture_frame == phase_sources[phase][0] else
                int(np.count_nonzero(np.any(phases[phase] != art, axis=2))),
        })

    missing = sorted(set(range(PERIOD)) - set(phases))
    alternate_audit = []
    for capture_frame in range(1, FRAME_COUNT + 1):
        io = read_capture(capture_frame, "0x4000000")
        if struct.unpack_from("<H", io, BG3CNT_OFFSET)[0] != 0x0B01:
            continue
        ram = read_capture(capture_frame, "ram")
        native_frame = struct.unpack_from("<I", ram,
                                           NATIVE_FRAME_ADDRESS - RAM_BASE)[0]
        previous_ram = read_capture(capture_frame - 1, "ram")
        split_y = max(0, min(160, waterline_y(previous_ram) + 1))
        visible_height = min(18, 160 - split_y)
        phase = native_frame % PERIOD
        actual = decode_alt_bg3_source(read_capture(capture_frame, "memory3"),
                                       read_capture(capture_frame, "0x5000000"))
        changed = int(np.count_nonzero(np.any(
            phases[phase][:visible_height] != actual[:visible_height], axis=2)))
        alternate_audit.append({
            "capture_frame": capture_frame,
            "native_frame": native_frame,
            "phase": phase,
            "split_y": split_y,
            "visible_height": visible_height,
            "different_visible_pixels": changed,
        })

    atlas_path = None
    asset_path = None
    asset_digest = None
    if not missing and not mismatches and not any(
            row["different_visible_pixels"] for row in alternate_audit):
        atlas = np.concatenate([phases[phase] for phase in range(PERIOD)], axis=0)
        asset = Image.fromarray(atlas, "RGBA")
        asset_path = ROOT / "renderer/games/eggo-mania/assets/factory-waterline-bg3.png"
        asset.save(asset_path, optimize=True)
        asset_digest = hashlib.sha256(asset_path.read_bytes()).hexdigest()
        atlas_path = output / "factory-waterline-bg3.png"
        asset.save(atlas_path, optimize=True)
        metadata = {
            "source_capture_directory": str(CAPTURE.relative_to(ROOT)),
            "source_capture_prefix": PREFIX,
            "source_capture_metadata_sha256": hashlib.sha256(
                (CAPTURE / f"{PREFIX}.json").read_bytes()).hexdigest(),
            "native_frame_period": PERIOD,
            "phase_formula": "nativeFrame % 60",
            "dimensions": {"width": int(atlas.shape[1]), "height": int(atlas.shape[0]),
                           "phase_width": int(atlas.shape[1]), "phase_height": 18},
            "source_map": {"bg3cnt": "0x0b01", "screen_base": 11,
                           "source_x": [int(SOURCE_X[0]), int(SOURCE_X[-1])],
                           "source_y": [int(SOURCE_Y[0]), int(SOURCE_Y[-1])]},
            "pixel_format": "GBA RGB555 expanded to libretro RGB565 levels",
            "palette_index_zero_transparent": True,
            "sha256": asset_digest,
        }
        (asset_path.with_suffix(".json")).write_text(
            json.dumps(metadata, indent=2), encoding="utf-8")

    with (output / "per-frame.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)

    atlas_preview = Image.new("RGBA", (112, PERIOD * 18), (32, 32, 32, 255))
    for phase in range(PERIOD):
        if phase in phases:
            atlas_preview.alpha_composite(Image.fromarray(phases[phase]), (0, phase * 18))
    atlas_preview.save(output / "phase-atlas-preview.png")

    capture_manifest = CAPTURE / f"{PREFIX}.json"
    parameters = {
        "experiment": "Eggo Mania factory alternate BG3 animation atlas extraction",
        "capture_directory": str(CAPTURE.relative_to(ROOT)),
        "capture_prefix": PREFIX,
        "capture_metadata_sha256": hashlib.sha256(capture_manifest.read_bytes()).hexdigest(),
        "capture_frames": [1, FRAME_COUNT],
        "native_frame_address": f"0x{NATIVE_FRAME_ADDRESS:08x}",
        "phase_period": PERIOD,
        "source_crop": {"x": [int(SOURCE_X[0]), int(SOURCE_X[-1])],
                        "y": [int(SOURCE_Y[0]), int(SOURCE_Y[-1])]},
        "native_video_pixel_format": "RGB565",
        "audio_enabled": False,
        "random_seed": None,
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2), encoding="utf-8")
    result = {
        "capture_frames_checked": len(records),
        "native_frame_first": native_frames[0],
        "native_frame_last": native_frames[-1],
        "native_frame_monotonic": all(b == a + 1 for a, b in zip(native_frames, native_frames[1:])),
        "phase_count": len(phases),
        "phase_sample_counts": {str(key): len(value) for key, value in sorted(phase_sources.items())},
        "missing_phases": missing,
        "period_mismatches": mismatches,
        "period_matches_exactly": not missing and not mismatches,
        "alternate_frames_checked": len(alternate_audit),
        "alternate_visible_rows_checked": sum(row["visible_height"] for row in alternate_audit),
        "alternate_layer_differing_pixels": sum(row["different_visible_pixels"]
                                                  for row in alternate_audit),
        "alternate_layer_mismatch_frames": [row["capture_frame"] for row in alternate_audit
                                              if row["different_visible_pixels"]],
        "asset_path": str(asset_path.relative_to(ROOT)) if asset_path else None,
        "asset_sha256": asset_digest,
        "atlas_preview": atlas_path.name if atlas_path else "phase-atlas-preview.png",
        "audio_enabled": False,
    }
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
