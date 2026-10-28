"""Validate the measured 15-state factory player BG1 water-body cycle.

This offline diagnostic decodes only the water-visible BG1 rows from the saved
GBA captures, then compares their native tile pixels with all 15 atlas phases.
It does not launch Electron or play audio. Reproducible inputs and results are
saved under scripts/OUTPUT.
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
    "experiment": "Eggo Mania player factory BG1 water-body phase audit",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "frame_range": [1, 600],
    "ram_base": "0x02000000",
    "native_frame_address": "0x02011a9c",
    "waterline_address": "0x02003bb8",
    "camera_address": "0x02003914",
    "bg_index": 1,
    "active_bg_control": "0x0b01",
    "active_bg_start_rule": "first scanline after current waterline screen Y",
    "atlas": "renderer/games/eggo-mania/assets/factory-water-body.png",
    "atlas_frames": 15,
    "atlas_height": 256,
    "native_frame_period": 60,
    "native_ticks_per_art_frame": 4,
    "phase_offset": 39,
    "runtime_phase_formula": "floor(((nativeFrame + 39) modulo 60) / 4)",
    "atlas_horizontal_crop_origin": 8,
    "water_source_start_y": 80,
    "candidate_score": "alpha-mask XOR count plus RGB555 mismatches where both pixels are visible",
    "audio_enabled": False,
    "random_seed": None,
}


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def i32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<i", data, offset)[0]


def decode_bg1_rows(vram: bytes, palette_raw: bytes, control: int, hofs: int,
                    vofs: int, screen_y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Decode player-field BG1 RGB555 pixels for the requested screen rows."""
    if control & 0x80 or ((control >> 14) & 3) != 0:
        raise ValueError(f"Expected a 4bpp 256x256 BG1, got control {control:#06x}")
    char_base = ((control >> 2) & 3) * 0x4000
    screen_base = ((control >> 8) & 31) * 0x800
    if (hofs & 0x1FF) != PARAMETERS["atlas_horizontal_crop_origin"]:
        raise ValueError(f"Unexpected BG1HOFS: {hofs}")

    source_y = (screen_y + (vofs & 0xFF)) & 0xFF
    source_x = (np.arange(112, dtype=np.int32) + (hofs & 0x1FF)) & 0xFF
    map_offset = screen_base + ((source_y[:, None] >> 3) * 32 +
                                (source_x[None, :] >> 3)) * 2
    entries = np.frombuffer(vram, dtype="<u2")[map_offset >> 1]
    tile = entries & 0x3FF
    pixel_x = np.broadcast_to(source_x[None, :] & 7, entries.shape).copy()
    pixel_y = np.broadcast_to((source_y[:, None] & 7), entries.shape).copy()
    pixel_x = np.where((entries & 0x400) != 0, 7 - pixel_x, pixel_x)
    pixel_y = np.where((entries & 0x800) != 0, 7 - pixel_y, pixel_y)
    byte_offset = char_base + tile * 32 + pixel_y * 4 + (pixel_x >> 1)
    packed = np.frombuffer(vram, dtype=np.uint8)[byte_offset]
    indices = np.where((pixel_x & 1) == 0, packed & 15, packed >> 4)
    palette_index = ((entries >> 12) & 15) * 16 + indices
    palette_555 = np.frombuffer(palette_raw, dtype="<u2") & 0x7FFF
    colors = np.stack((palette_555[palette_index] & 31,
                       (palette_555[palette_index] >> 5) & 31,
                       (palette_555[palette_index] >> 10) & 31), axis=-1).astype(np.uint8)
    return colors, indices != 0


def main() -> None:
    capture = ROOT / PARAMETERS["capture_directory"]
    prefix = PARAMETERS["capture_prefix"]
    atlas_path = ROOT / PARAMETERS["atlas"]
    atlas_rgba = np.asarray(Image.open(atlas_path).convert("RGBA"), dtype=np.uint8)
    expected_shape = (PARAMETERS["atlas_frames"] * PARAMETERS["atlas_height"], 112, 4)
    if atlas_rgba.shape != expected_shape:
        raise ValueError(f"Unexpected atlas size {atlas_rgba.shape}; expected {expected_shape}")
    atlas = atlas_rgba.reshape(PARAMETERS["atlas_frames"], PARAMETERS["atlas_height"], 112, 4)
    atlas_colors = np.rint(atlas[..., :3].astype(np.float32) * (31.0 / 255.0)).astype(np.uint8)
    atlas_visible = atlas[..., 3] != 0

    base = 0x02000000
    native_frame_addr = 0x02011A9C
    waterline_addr = 0x02003BB8
    camera_addr = 0x02003914
    records = []
    phase_formula_total_score = 0
    for capture_frame in range(PARAMETERS["frame_range"][0], PARAMETERS["frame_range"][1] + 1):
        stem = capture / f"{prefix}.frame{capture_frame:05d}"
        io = Path(str(stem) + ".0x4000000").read_bytes()
        bg_control = u16(io, 8 + 2 * PARAMETERS["bg_index"])
        if bg_control != int(PARAMETERS["active_bg_control"], 16):
            continue
        ram = Path(str(stem) + ".ram").read_bytes()
        native_frame = struct.unpack_from("<I", ram, native_frame_addr - base)[0]
        waterline = i32(ram, waterline_addr - base)
        camera = i32(ram, camera_addr - base)
        water_screen_y = ((waterline - camera) >> 16) + 15
        first_y = max(0, water_screen_y + 1)
        if first_y >= 160:
            continue
        screen_y = np.arange(first_y, 160, dtype=np.int32)
        vofs = u16(io, 0x12 + 4 * PARAMETERS["bg_index"])
        hofs = u16(io, 0x10 + 4 * PARAMETERS["bg_index"])
        vram = Path(str(stem) + ".memory3").read_bytes()
        palette_raw = Path(str(stem) + ".0x5000000").read_bytes()
        actual_colors, actual_visible = decode_bg1_rows(
            vram, palette_raw, bg_control, hofs, vofs, screen_y
        )
        source_y = (screen_y + (vofs & 0xFF)) & 0xFF
        phase_scores = []
        for phase in range(PARAMETERS["atlas_frames"]):
            expected_visible = atlas_visible[phase, source_y, :]
            expected_colors = atlas_colors[phase, source_y, :, :]
            alpha_errors = int(np.count_nonzero(expected_visible != actual_visible))
            color_errors = int(np.count_nonzero(
                np.any(expected_colors != actual_colors, axis=2) &
                expected_visible & actual_visible
            ))
            phase_scores.append(alpha_errors + color_errors)
        best_score = min(phase_scores)
        best_phases = [phase for phase, score in enumerate(phase_scores) if score == best_score]
        predicted_phase = ((native_frame + PARAMETERS["phase_offset"]) %
                           PARAMETERS["native_frame_period"]) // PARAMETERS["native_ticks_per_art_frame"]
        predicted_score = phase_scores[predicted_phase]
        phase_formula_total_score += predicted_score
        records.append({
            "capture_frame": capture_frame,
            "native_frame": native_frame,
            "waterline_screen_y": water_screen_y,
            "bg1_hofs": hofs,
            "bg1_vofs": vofs,
            "visible_pixels_checked": int(actual_visible.size),
            "best_native_atlas_phases": ";".join(map(str, best_phases)),
            "best_score": best_score,
            "phase_from_native_cycle": predicted_phase,
            "score_at_native_cycle_phase": predicted_score,
            "all_phase_scores": ";".join(map(str, phase_scores)),
        })

    if not records:
        raise RuntimeError("No visible player-field factory BG1 water frames found")
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-player-water-body-phase_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    fields = list(records[0])
    with (output / "per-frame-phase-results.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    results = {
        "active_native_frames_checked": len(records),
        "phase_formula_total_score": phase_formula_total_score,
        "phase_formula_exact_frames": sum(int(row["score_at_native_cycle_phase"]) == 0 for row in records),
        "native_frames_with_unambiguous_best_phase": sum(";" not in row["best_native_atlas_phases"]
                                                          for row in records),
        "atlas_sha256": hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
        "audio_enabled": False,
        "limits": [
            "This compares raw BG1 tile pixels only; it does not assert whole-screen parity.",
            "The audit compares only visible BG1 water pixels; it is not a complete field screenshot check.",
        ],
    }
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    parameters = {
        **PARAMETERS,
        "source_metadata_sha256": hashlib.sha256(
            (capture / f"{prefix}.json").read_bytes()
        ).hexdigest(),
        "atlas_sha256": results["atlas_sha256"],
        "phase_rule_tested": PARAMETERS["runtime_phase_formula"],
        "output_directory": str(output.relative_to(ROOT)),
        "created_utc": datetime.now(timezone.utc).isoformat(),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **results}, indent=2))


if __name__ == "__main__":
    main()
