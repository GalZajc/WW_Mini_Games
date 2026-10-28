"""Decode the 15-state native factory BG1 water-body animation from mGBA captures."""
from datetime import datetime
from pathlib import Path
import hashlib
import json
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "source_run": "scripts/OUTPUT/eggo-reference_2026-10-08_09-02-18_647810",
    "source_name": "water-body-cycle",
    "reference_capture_frames_by_phase": [1, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54],
    "frames": 15,
    "bg_layer": 1,
    "field_width": 112,
    "bg1_horizontal_scroll": 8,
    "waterline_source_y": 80,
    "blend_eva": 12,
    "blend_evb": 4,
    "native_frame_period": 60,
    "native_ticks_per_art_frame": 4,
    "runtime_phase_formula": "floor(((nativeFrame + 39) modulo 60) / 4)",
    "phase_reference": {
        "source_run": "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942",
        "source_name": "bot-tower",
        "frame": 840,
        "native_frame": 1403,
    },
    "color_conversion": "RGB555 channels expanded with value*255//31; BG palette index zero transparent",
    "random_seed": None,
}


def decode_bg1(vram, palette, io):
    control = struct.unpack_from("<H", io, 8 + 2 * PARAMETERS["bg_layer"])[0]
    if control & 0x80:
        raise ValueError("Expected a 4bpp text background for factory BG1")
    size = control >> 14
    if size != 0:
        raise ValueError(f"Expected a 256x256 factory BG1 map, got size code {size}")
    char_base = ((control >> 2) & 3) * 0x4000
    screen_base = ((control >> 8) & 31) * 0x800
    image = np.zeros((256, 256, 4), dtype=np.uint8)
    for tile_y in range(32):
        for tile_x in range(32):
            map_offset = screen_base + (tile_y * 32 + tile_x) * 2
            entry = struct.unpack_from("<H", vram, map_offset)[0]
            tile_number = entry & 1023
            packed = np.frombuffer(vram, dtype=np.uint8,
                                   count=32, offset=char_base + tile_number * 32)
            indices = np.stack((packed & 15, packed >> 4), axis=1).reshape(8, 8)
            pixels = palette[indices + ((entry >> 12) & 15) * 16].copy()
            if entry & 0x400:
                pixels = pixels[:, ::-1]
            if entry & 0x800:
                pixels = pixels[::-1, :]
            pixels[indices == 0, 3] = 0
            image[tile_y * 8:tile_y * 8 + 8,
                  tile_x * 8:tile_x * 8 + 8] = pixels
    return Image.fromarray(image, "RGBA"), control, char_base, screen_base


source = ROOT / PARAMETERS["source_run"]
source_metadata = json.loads((source / f"{PARAMETERS['source_name']}.json").read_text(encoding="utf-8"))
if source_metadata["writes"]:
    raise ValueError("The source trace must be input-free and unmodified")
if source_metadata["frames"] < max(PARAMETERS["reference_capture_frames_by_phase"]):
    raise ValueError("The capture does not contain all requested animation phase frames")

records = []
decoded = []
for phase, frame_number in enumerate(PARAMETERS["reference_capture_frames_by_phase"]):
    prefix = source / f"{PARAMETERS['source_name']}.frame{frame_number:05d}"
    vram_path = Path(str(prefix) + ".memory3")
    palette_path = Path(str(prefix) + ".0x5000000")
    io_path = Path(str(prefix) + ".0x4000000")
    vram, palette_bytes, io = vram_path.read_bytes(), palette_path.read_bytes(), io_path.read_bytes()
    if len(vram) != 0x18000 or len(palette_bytes) != 0x400:
        raise ValueError(f"Unexpected graphics-memory size at frame {frame_number}")
    raw = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw & 31) * 255 // 31,
                        ((raw >> 5) & 31) * 255 // 31,
                        ((raw >> 10) & 31) * 255 // 31,
                        np.full(raw.shape, 255)), axis=-1).astype(np.uint8)
    image, control, char_base, screen_base = decode_bg1(vram, palette, io)
    image_phase = phase
    hofs = struct.unpack_from("<H", io, 0x10 + 4 * PARAMETERS["bg_layer"])[0]
    vofs = struct.unpack_from("<H", io, 0x12 + 4 * PARAMETERS["bg_layer"])[0]
    blend_control, blend_alpha = struct.unpack_from("<HH", io, 0x50)
    if hofs != PARAMETERS["bg1_horizontal_scroll"]:
        raise ValueError(f"BG1 horizontal scroll changed at frame {frame_number}: {hofs}")
    if blend_control != 0x1D42 or blend_alpha != 0x040C:
        raise ValueError(f"Unexpected BG1 blend registers at frame {frame_number}")
    crop = image.crop((hofs, 0, hofs + PARAMETERS["field_width"], 256))
    decoded.append(crop)
    records.append({
        "frame": frame_number,
        "animation_phase": image_phase,
        "bg1_control": f"0x{control:04x}",
        "char_base": char_base,
        "screen_base": screen_base,
        "horizontal_scroll": hofs,
        "vertical_scroll": vofs,
        "blend_control": f"0x{blend_control:04x}",
        "blend_alpha": f"0x{blend_alpha:04x}",
        "decoded_crop_sha256": hashlib.sha256(crop.tobytes()).hexdigest(),
        "source_sha256": {
            suffix: hashlib.sha256(Path(str(prefix) + suffix).read_bytes()).hexdigest()
            for suffix in (".memory3", ".0x5000000", ".0x4000000")
        },
    })

phase_parameters = PARAMETERS["phase_reference"]
phase_prefix = ROOT / phase_parameters["source_run"] / (
    f"{phase_parameters['source_name']}.frame{phase_parameters['frame']:05d}")
phase_vram_path = Path(str(phase_prefix) + ".memory3")
phase_palette_path = Path(str(phase_prefix) + ".0x5000000")
phase_io_path = Path(str(phase_prefix) + ".0x4000000")
phase_vram, phase_palette_bytes, phase_io = (phase_vram_path.read_bytes(),
                                               phase_palette_path.read_bytes(),
                                               phase_io_path.read_bytes())
phase_raw = np.frombuffer(phase_palette_bytes, dtype="<u2")
phase_palette = np.stack(((phase_raw & 31) * 255 // 31,
                          ((phase_raw >> 5) & 31) * 255 // 31,
                          ((phase_raw >> 10) & 31) * 255 // 31,
                          np.full(phase_raw.shape, 255)), axis=-1).astype(np.uint8)
phase_image, _, _, _ = decode_bg1(phase_vram, phase_palette, phase_io)
phase_hofs = struct.unpack_from("<H", phase_io, 0x10 + 4 * PARAMETERS["bg_layer"])[0]
phase_bld_control, phase_bld_alpha = struct.unpack_from("<HH", phase_io, 0x50)
if phase_hofs != PARAMETERS["bg1_horizontal_scroll"]:
    raise ValueError(f"Phase-reference BG1 horizontal scroll changed: {phase_hofs}")
if phase_bld_control != 0x1D42 or phase_bld_alpha != 0x040C:
    raise ValueError("Phase-reference BG1 blend registers differ from the measured trace")
phase_crop = phase_image.crop((phase_hofs, 0, phase_hofs + PARAMETERS["field_width"], 256))
phase_source = np.asarray(phase_crop.crop((0, PARAMETERS["waterline_source_y"],
                                           PARAMETERS["field_width"], 256)))
phase_candidates = []
for index, image in enumerate(decoded):
    candidate = np.asarray(image.crop((0, PARAMETERS["waterline_source_y"],
                                      PARAMETERS["field_width"], 256)))
    comparable = (candidate[:, :, 3] > 0) & (phase_source[:, :, 3] > 0)
    error = np.abs(candidate[:, :, :3].astype(np.int16) - phase_source[:, :, :3].astype(np.int16))
    phase_candidates.append({
        "atlas_frame": index,
        "mean_absolute_rgb_error": float(error[comparable].mean()) if comparable.any() else None,
        "comparable_pixels": int(comparable.sum()),
        "alpha_mismatch_pixels": int(np.count_nonzero(candidate[:, :, 3] != phase_source[:, :, 3])),
    })
best_phase = min(phase_candidates, key=lambda item: item["mean_absolute_rgb_error"])
predicted_phase = ((phase_parameters["native_frame"] + 39) % 60) // 4
if (best_phase["atlas_frame"] != predicted_phase or
        best_phase["mean_absolute_rgb_error"] != 0 or
        best_phase["alpha_mismatch_pixels"] != 0):
    raise ValueError(
        "The 15-frame atlas does not exactly predict the frame-840 water body: "
        f"predicted phase {predicted_phase}, best candidate {best_phase}"
    )
phase_measurement = {
    **phase_parameters,
    "reference_crop_sha256": hashlib.sha256(phase_source.tobytes()).hexdigest(),
    "reference_input_sha256": {
        suffix: hashlib.sha256(Path(str(phase_prefix) + suffix).read_bytes()).hexdigest()
        for suffix in (".memory3", ".0x5000000", ".0x4000000")
    },
    "bg1_horizontal_scroll": phase_hofs,
    "blend_control": f"0x{phase_bld_control:04x}",
    "blend_alpha": f"0x{phase_bld_alpha:04x}",
    "best_atlas_frame": best_phase["atlas_frame"],
    "predicted_atlas_frame": predicted_phase,
    "phase_formula": PARAMETERS["runtime_phase_formula"],
    "best_mean_absolute_rgb_error": best_phase["mean_absolute_rgb_error"],
    "candidates": phase_candidates,
}

asset_path = ROOT / "renderer" / "games" / "eggo-mania" / "assets" / "factory-water-body.png"
atlas = Image.new("RGBA", (PARAMETERS["field_width"], 256 * len(decoded)))
for index, image in enumerate(decoded):
    atlas.alpha_composite(image, (0, index * 256))
atlas.save(asset_path)
output = ROOT / "scripts" / "OUTPUT" / ("eggo-factory-water-body_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
output.mkdir(parents=True)
contact = Image.new("RGBA", (PARAMETERS["field_width"] * 5, 256 * 3), (24, 30, 36, 255))
for index, image in enumerate(decoded):
    contact.alpha_composite(image, ((index % 5) * PARAMETERS["field_width"],
                                    (index // 5) * 256))
contact.save(output / "frame-contact-sheet.png")
asset_sha256 = hashlib.sha256(asset_path.read_bytes()).hexdigest()
data = {
    "parameters": PARAMETERS,
    "rom_sha256": source_metadata.get("rom_sha256"),
    "core_sha256": source_metadata.get("core_sha256"),
    "source_initial_state_sha256": source_metadata.get("initial_state_sha256"),
    "asset_size": list(atlas.size),
    "asset_sha256": asset_sha256,
    "unique_decoded_frames": len({row["decoded_crop_sha256"] for row in records}),
    "bg1_vertical_scroll_range": [min(row["vertical_scroll"] for row in records),
                                   max(row["vertical_scroll"] for row in records)],
    "phase_measurement": phase_measurement,
    "frames": records,
    "source_parameters": source_metadata,
}
output_parameters = {
    **PARAMETERS,
    "source_capture_metadata_sha256": hashlib.sha256(
        (source / f"{PARAMETERS['source_name']}.json").read_bytes()
    ).hexdigest(),
    "source_random_seed": source_metadata.get("random_seed"),
}
(output / "parameters.json").write_text(json.dumps(output_parameters, indent=2) + "\n", encoding="utf-8")
(output / "measurements.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
metadata = {key: value for key, value in data.items() if key != "frames"}
metadata["frame_pixel_hashes"] = [row["decoded_crop_sha256"] for row in records]
asset_path.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(output)
