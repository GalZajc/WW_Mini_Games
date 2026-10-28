"""Measure the factory water OBJ atlas phase against consecutive native frames."""
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
    "experiment": "Eggo Mania factory-water surface phase calibration",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "atlas": "renderer/games/eggo-mania/assets/factory-water-surface.png",
    "first_frame": 1,
    "frame_count": 32,
    "screen_size": [240, 160],
    "field_crop": [0, 0, 112, 160],
    "native_frame_counter_address": "0x02011a9c",
    "water_oam_positions_x": [-8, 56],
    "water_oam_size": [64, 32],
    "comparison": "Exact RGB equality on opaque atlas pixels after GBA RGB555 to RGB565 conversion",
    "runtime_frame_offset": 12,
    "previous_runtime_frame_offset": 5,
    "current_runtime_phase": "(nativeFrame + runtime_frame_offset) % 32",
    "electron_audio_muted": "not_applicable; offline native-capture analysis",
    "random_seed": None,
}


def expand_rgb555_to_rgb565(pixels: np.ndarray) -> np.ndarray:
    rgb = pixels[..., :3].copy()
    green5 = rgb[..., 1].astype(np.uint16) * 31 // 255
    rgb[..., 1] = (green5 * 2 * 255 // 63).astype(np.uint8)
    return rgb


def main() -> None:
    directory = ROOT / PARAMETERS["capture_directory"]
    atlas = np.asarray(Image.open(ROOT / PARAMETERS["atlas"]).convert("RGBA"))
    if atlas.shape != (32 * 32, 112, 4):
        raise ValueError(f"Unexpected water atlas shape: {atlas.shape}")

    rows: list[dict[str, int | float | str]] = []
    offset_scores = [0] * 32
    previous_runtime_exact_frames = 0
    for frame in range(PARAMETERS["first_frame"],
                       PARAMETERS["first_frame"] + PARAMETERS["frame_count"]):
        stem = directory / f"{PARAMETERS['capture_prefix']}.frame{frame:05d}"
        ram = Path(str(stem) + ".ram").read_bytes()
        oam = Path(str(stem) + ".0x7000000").read_bytes()
        native = np.asarray(Image.open(Path(str(stem) + ".png")).convert("RGB"))
        native_frame = struct.unpack_from("<I", ram, 0x11A9C)[0]

        sprites = {}
        for index in range(128):
            attr0, attr1, attr2, _ = struct.unpack_from("<4H", oam, index * 8)
            x = attr1 & 0x1FF
            if x >= 0x100:
                x -= 0x200
            shape, size = (attr0 >> 14) & 3, (attr1 >> 14) & 3
            if (shape, size) != (1, 3):
                continue
            if x in PARAMETERS["water_oam_positions_x"] and (attr2 >> 12) & 15 == 4:
                sprites[x] = {"index": index, "y": attr0 & 0xFF,
                              "tile": attr2 & 0x3FF}
        if set(sprites) != set(PARAMETERS["water_oam_positions_x"]):
            raise ValueError(f"Frame {frame} lacks the two native water surface objects: {sprites}")
        y_values = {sprite["y"] for sprite in sprites.values()}
        if len(y_values) != 1:
            raise ValueError(f"Frame {frame} water objects disagree on Y: {sprites}")
        y = next(iter(y_values))

        candidates = []
        visible_top = max(0, y)
        visible_bottom = min(160, y + 32)
        source_top = visible_top - y
        source_bottom = source_top + (visible_bottom - visible_top)
        for phase in range(32):
            source = atlas[phase * 32 + source_top:phase * 32 + source_bottom]
            mask = source[..., 3] != 0
            expected = expand_rgb555_to_rgb565(source)
            actual = native[visible_top:visible_bottom, :112]
            errors = np.any(expected != actual, axis=2) & mask
            candidates.append((int(errors.sum()), phase, int(mask.sum())))
        best_error = min(error for error, _, _ in candidates)
        best_phases = [phase for error, phase, _ in candidates if error == best_error]
        best_phase = best_phases[0]
        for offset in range(32):
            if (native_frame + offset) % 32 in best_phases:
                offset_scores[offset] += 1
        current_phase = (native_frame + PARAMETERS["runtime_frame_offset"]) % 32
        current_error = next(error for error, phase, _ in candidates if phase == current_phase)
        previous_phase = (native_frame + PARAMETERS["previous_runtime_frame_offset"]) % 32
        previous_error = next(error for error, phase, _ in candidates if phase == previous_phase)
        previous_runtime_exact_frames += previous_error == 0
        rows.append({
            "capture_frame": frame,
            "native_frame": native_frame,
            "oam_y": y,
            "oam_tiles": f"{sprites[-8]['tile']},{sprites[56]['tile']}",
            "best_atlas_phase": best_phase,
            "equivalent_best_phases": ",".join(map(str, best_phases)),
            "best_differing_opaque_pixels": best_error,
            "opaque_pixels_compared": candidates[0][2],
            "current_runtime_phase": current_phase,
            "current_runtime_differing_pixels": current_error,
            "previous_runtime_phase": previous_phase,
            "previous_runtime_differing_pixels": previous_error,
        })

    best_offsets = [offset for offset, score in enumerate(offset_scores)
                    if score == max(offset_scores)]
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-water-surface-phase_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    parameters = {**PARAMETERS, "created_utc": datetime.now(timezone.utc).isoformat(),
                  "atlas_sha256": hashlib.sha256(
                      (ROOT / PARAMETERS["atlas"]).read_bytes()).hexdigest()}
    summary = {
        "frames_analyzed": len(rows),
        "exact_native_asset_frames": sum(row["best_differing_opaque_pixels"] == 0 for row in rows),
        "current_runtime_exact_frames": sum(row["current_runtime_differing_pixels"] == 0 for row in rows),
        "previous_runtime_exact_frames": previous_runtime_exact_frames,
        "best_global_frame_offsets": best_offsets,
        "best_offset_best_phase_frames": max(offset_scores),
        "best_offset_zero_pixel_frames": sum(row["best_differing_opaque_pixels"] == 0 for row in rows),
        "phase_rows": "phase = (nativeFrame + offset) % 32",
        "waterline_surface_atlas_offset_to_test": best_offsets[0] if best_offsets else None,
        "limitations": ["Measures the captured water OAM phase; it does not by itself prove full-screen parity."],
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    with (output / "phase-by-frame.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"output": str(output), **summary}, indent=2))


if __name__ == "__main__":
    main()
