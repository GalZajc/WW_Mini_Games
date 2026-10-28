"""Extract the 15-state native factory waterline OBJ animation from mGBA captures."""
from datetime import datetime
from pathlib import Path
import hashlib
import json
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "source_run": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "source_name": "eggo-replay-full-graphics",
    "reference_capture_frames_by_phase": [1, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54],
    "frames": 15,
    "field_width": 112,
    "sprite_size": [64, 32],
    "palette_bank": 4,
    "oam_x_positions": [-8, 56],
    "waterline_to_oam_top_pixels": 16,
    "native_frame_period": 60,
    "native_ticks_per_art_frame": 4,
    "runtime_phase_formula": "floor(((nativeFrame + 39) modulo 60) / 4)",
    "runtime_phase_audit": "scripts/OUTPUT/eggo-water-surface-animation_2026-10-08_06-54-42",
    "color_conversion": "RGB555 channel values expanded with value*255//31; palette index zero transparent",
    "random_seed": None,
}


def decode_obj(vram, palette, first_tile, bank, width, height, one_dimensional):
    pixels = np.zeros((height, width, 4), dtype=np.uint8)
    stride = width // 8 if one_dimensional else 32
    for tile_y in range(height // 8):
        for tile_x in range(width // 8):
            # OBJ tile numbers are ten bits. This capture uses 1D mapping and
            # these sprites exactly occupy tiles 960..1023 without wrapping.
            tile = (first_tile + tile_y * stride + tile_x) & 1023
            start = 0x10000 + tile * 32
            packed = np.frombuffer(vram[start:start + 32], dtype=np.uint8)
            if packed.size != 32:
                raise ValueError(f"OBJ tile {tile} falls outside captured VRAM")
            indices = np.stack((packed & 15, packed >> 4), axis=1).reshape(8, 8).astype(np.int16)
            part = palette[256 + bank * 16 + indices].copy()
            part[indices == 0, 3] = 0
            pixels[tile_y * 8:(tile_y + 1) * 8,
                   tile_x * 8:(tile_x + 1) * 8] = part
    return Image.fromarray(pixels, "RGBA")


def decode_frame(source, frame_number):
    prefix = source / f"{PARAMETERS['source_name']}.frame{frame_number:05d}"
    vram = Path(str(prefix) + ".memory3").read_bytes()
    palette_bytes = Path(str(prefix) + ".0x5000000").read_bytes()
    oam = Path(str(prefix) + ".0x7000000").read_bytes()
    io = Path(str(prefix) + ".0x4000000").read_bytes()
    if len(vram) != 0x18000 or len(palette_bytes) != 0x400 or len(oam) != 0x400:
        raise ValueError(f"Unexpected graphics-memory lengths at frame {frame_number}")

    raw = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw & 31) * 255 // 31,
                        ((raw >> 5) & 31) * 255 // 31,
                        ((raw >> 10) & 31) * 255 // 31,
                        np.full(raw.shape, 255)), axis=-1).astype(np.uint8)
    one_dimensional = bool(struct.unpack_from("<H", io)[0] & 0x40)
    atlas_frame = Image.new("RGBA", (PARAMETERS["field_width"], PARAMETERS["sprite_size"][1]))
    objects = []
    for index, (attr0, attr1, attr2, _) in enumerate(struct.iter_unpack("<4H", oam)):
        if attr0 & 0x300 == 0x200 or attr0 >> 14 == 3:
            continue
        shape = attr0 >> 14
        size = attr1 >> 14
        dimensions = [[(8, 8), (16, 16), (32, 32), (64, 64)],
                      [(16, 8), (32, 8), (32, 16), (64, 32)],
                      [(8, 16), (8, 32), (16, 32), (32, 64)]][shape][size]
        x = attr1 & 511
        if x >= 256:
            x -= 512
        bank = attr2 >> 12
        if dimensions != tuple(PARAMETERS["sprite_size"]) or bank != PARAMETERS["palette_bank"] or x not in PARAMETERS["oam_x_positions"]:
            continue
        if attr0 & 0x0100:
            raise ValueError(f"Water OBJ {index} unexpectedly uses affine/double-size attributes")
        y = attr0 & 255
        sprite = decode_obj(vram, palette, attr2 & 1023, bank, *dimensions, one_dimensional)
        if attr1 & 0x1000:
            sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if attr1 & 0x2000:
            sprite = sprite.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        atlas_frame.paste(sprite, (x, 0), sprite)
        objects.append({
            "index": index, "x": x, "oam_y": y, "tile": attr2 & 1023,
            "palette": bank, "horizontal_flip": bool(attr1 & 0x1000),
            "vertical_flip": bool(attr1 & 0x2000),
            "sha256": hashlib.sha256(sprite.tobytes()).hexdigest(),
        })
    if sorted(obj["x"] for obj in objects) != PARAMETERS["oam_x_positions"]:
        raise ValueError(f"Expected two waterline OBJ pieces in frame {frame_number}; got {objects}")
    if len({obj["oam_y"] for obj in objects}) != 1:
        raise ValueError(f"Waterline OBJ pieces disagree on vertical position in frame {frame_number}")
    metadata = {
        "capture_frame": frame_number,
        "native_waterline_screen_y": objects[0]["oam_y"] + PARAMETERS["waterline_to_oam_top_pixels"],
        "objects": objects,
        "source_sha256": {
            suffix: hashlib.sha256(Path(str(prefix) + suffix).read_bytes()).hexdigest()
            for suffix in (".memory3", ".0x5000000", ".0x7000000", ".0x4000000")
        },
    }
    return atlas_frame, metadata


source = ROOT / PARAMETERS["source_run"]
source_metadata = json.loads((source / f"{PARAMETERS['source_name']}.json").read_text(encoding="utf-8"))
if source_metadata["writes"]:
    raise ValueError("The source trace must be an input-free, unmodified ROM run")
if source_metadata["frames"] < max(PARAMETERS["reference_capture_frames_by_phase"]):
    raise ValueError("The source trace does not contain the requested consecutive frames")

frames = []
records = []
for phase, number in enumerate(PARAMETERS["reference_capture_frames_by_phase"]):
    image, record = decode_frame(source, number)
    record["animation_phase"] = phase
    frames.append(image)
    records.append(record)

atlas = Image.new("RGBA", (PARAMETERS["field_width"], PARAMETERS["sprite_size"][1] * PARAMETERS["frames"]))
for index, frame in enumerate(frames):
    atlas.alpha_composite(frame, (0, index * PARAMETERS["sprite_size"][1]))

output = ROOT / "scripts" / "OUTPUT" / ("eggo-factory-water-surface_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
output.mkdir(parents=True)
sheet = Image.new("RGBA", (PARAMETERS["field_width"] * 5, PARAMETERS["sprite_size"][1] * 3), (24, 30, 36, 255))
for index, frame in enumerate(frames):
    sheet.alpha_composite(frame, ((index % 5) * PARAMETERS["field_width"],
                                  (index // 5) * PARAMETERS["sprite_size"][1]))
asset_path = ROOT / "renderer" / "games" / "eggo-mania" / "assets" / "factory-water-surface.png"
atlas.save(asset_path)
sheet.save(output / "frame-contact-sheet.png")
source_parameters = source_metadata.copy()
data = {
    "parameters": PARAMETERS,
    "rom_sha256": source_metadata.get("rom_sha256"),
    "core_sha256": source_metadata.get("core_sha256"),
    "source_initial_state_sha256": source_metadata.get("initial_state_sha256"),
    "atlas_size": list(atlas.size),
    "atlas_sha256": hashlib.sha256(asset_path.read_bytes()).hexdigest(),
    "unique_composite_frames": len({hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames}),
    "native_oam_surface_y_range": [min(row["native_waterline_screen_y"] for row in records),
                                    max(row["native_waterline_screen_y"] for row in records)],
    "frames": records,
    "source_parameters": source_parameters,
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
asset_metadata = {key: value for key, value in data.items() if key != "frames"}
asset_metadata["frame_pixel_hashes"] = [hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames]
(asset_path.with_suffix(".json")).write_text(json.dumps(asset_metadata, indent=2) + "\n", encoding="utf-8")
print(output)
