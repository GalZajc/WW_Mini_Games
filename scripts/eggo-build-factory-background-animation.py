"""Build per-field factory BG3 maps indexed by captured native world height."""
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
import hashlib
import json
import struct

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "bg_layer": 3,
    "source_map_width": 256,
    "source_map_height": 256,
    "actor_world_y_addresses": {"player": "0x3bd8", "cpu": "0x4f54"},
    "baseline_world_y": 720.0440673828125,
    "native_pixels_per_height_unit": 16,
    "height_rounding_digits": 2,
    "runtime_height_tolerance": 1.0,
    "atlas_columns": 16,
    "field_crops": {"player": {"x": 0, "width": 112}, "cpu": {"x": 128, "width": 112}},
    "captures": [
        {
            "directory": "scripts/OUTPUT/eggo-reference_2026-10-05_17-11-52_156291",
            "name": "factory-anim-phase", "first_frame": 1, "last_frame": 32,
            "sample_every": 1, "kind": "no-input early phase",
        },
        {
            "directory": "scripts/OUTPUT/eggo-reference_2026-10-05_17-38-15_607301",
            "name": "factory-anim-60s", "first_frame": 40, "last_frame": 2000,
            "sample_every": 8, "kind": "no-input continuation; active through reviewed frame 2000",
        },
        {
            "directory": "scripts/OUTPUT/eggo-reference_2026-10-05_17-59-34_990709",
            "name": "eggo-factory-active-bg", "first_frame": 8, "last_frame": 3600,
            "sample_every": 8, "kind": "model-player bot trajectory",
        },
        {
            "directory": "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942",
            "name": "bot-tower", "frames": [120, 240, 360, 480, 600, 720, 840, 960,
                                                1080, 1200, 1320, 1440, 1560, 1680, 1800],
            "kind": "independent native tower checkpoints",
        },
    ],
    "color_conversion": "RGB555 channels expanded with value*255//31; BG palette index zero transparent",
    "horizontal_origin": "native BG3HOFS baked into each 112px field crop",
    "vertical_origin": "native BG3VOFS remains represented by the renderer's measured camera response",
    "selection": "nearest captured native actor height per field; static stage art when farther than runtime_height_tolerance",
    "same_state_overlap_frames": [8, 16, 24, 32],
}


def decode_bg3(vram: bytes, palette_bytes: bytes, io: bytes):
    layer = PARAMETERS["bg_layer"]
    control = struct.unpack_from("<H", io, 8 + 2 * layer)[0]
    bpp = 8 if control & 0x80 else 4
    size_code = control >> 14
    width = 256 * (1 + (size_code & 1))
    height = 256 * (1 + ((size_code >> 1) & 1))
    char_base = ((control >> 2) & 3) * 0x4000
    screen_base = ((control >> 8) & 31) * 0x800
    raw = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw & 31) * 255 // 31,
                        ((raw >> 5) & 31) * 255 // 31,
                        ((raw >> 10) & 31) * 255 // 31,
                        np.full(raw.shape, 255)), axis=-1).astype(np.uint8)
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
    hofs, vofs = struct.unpack_from("<HH", io, 0x10 + 4 * layer)
    if hofs:
        image = np.roll(image, -(hofs % width), axis=1)
    return Image.fromarray(image, "RGBA"), control, hofs, vofs


def capture_metadata(capture):
    directory = ROOT / capture["directory"]
    metadata = json.loads((directory / f"{capture['name']}.json").read_text(encoding="utf-8"))
    if metadata.get("writes"):
        raise ValueError(f"Capture {capture['name']} contains RAM writes")
    return metadata


def capture_frames(capture):
    if "frames" in capture:
        return capture["frames"]
    return range(capture["first_frame"], capture["last_frame"] + 1, capture["sample_every"])


def load_sample(capture, capture_metadata_row, frame):
    directory = ROOT / capture["directory"]
    prefix = directory / f"{capture['name']}.frame{frame:05d}"
    vram_path = Path(str(prefix) + ".memory3")
    palette_path = Path(str(prefix) + ".0x5000000")
    io_path = Path(str(prefix) + ".0x4000000")
    ram_path = Path(str(prefix) + ".ram")
    vram, palette_bytes, io, ram = (vram_path.read_bytes(), palette_path.read_bytes(),
                                    io_path.read_bytes(), ram_path.read_bytes())
    if len(vram) != 0x18000 or len(palette_bytes) != 0x400:
        raise ValueError(f"Unexpected graphics-memory size at {prefix}")
    image, control, hofs, vofs = decode_bg3(vram, palette_bytes, io)
    frame_hashes = {suffix: hashlib.sha256(path.read_bytes()).hexdigest()
                    for suffix, path in ((".memory3", vram_path),
                                         (".0x5000000", palette_path),
                                         (".0x4000000", io_path), (".ram", ram_path))}
    samples = {}
    for field, crop in PARAMETERS["field_crops"].items():
        world_y = struct.unpack_from("<i", ram, int(PARAMETERS["actor_world_y_addresses"][field], 16))[0] / 65536
        world_height = (PARAMETERS["baseline_world_y"] - world_y) / PARAMETERS["native_pixels_per_height_unit"]
        field_image = image.crop((crop["x"], 0, crop["x"] + crop["width"], PARAMETERS["source_map_height"]))
        samples[field] = {
            "world_y": world_y,
            "world_height": world_height,
            "image": field_image,
            "pixels_sha256": hashlib.sha256(field_image.tobytes()).hexdigest(),
        }
    record = {
        "capture": capture["name"], "capture_kind": capture["kind"], "frame": frame,
        "bg3_control": f"0x{control:04x}", "bg3_hofs": hofs, "bg3_vofs": vofs,
        "field_samples": {field: {key: value for key, value in sample.items() if key != "image"}
                          for field, sample in samples.items()},
        "input_hashes": frame_hashes,
        "rom_sha256": capture_metadata_row.get("rom_sha256"),
        "core_sha256": capture_metadata_row.get("core_sha256"),
    }
    return samples, record


capture_metadata_rows = [capture_metadata(capture) for capture in PARAMETERS["captures"]]
rom_hashes = {row.get("rom_sha256") for row in capture_metadata_rows}
core_hashes = {row.get("core_sha256") for row in capture_metadata_rows}
if len(rom_hashes) != 1 or len(core_hashes) != 1:
    raise ValueError("The factory background sources do not share one ROM/core")
for index, frame in enumerate(PARAMETERS["same_state_overlap_frames"]):
    first_capture = PARAMETERS["captures"][0]
    second_capture = PARAMETERS["captures"][1]
    first, _ = load_sample(first_capture, capture_metadata_rows[0], frame)
    second, _ = load_sample(second_capture, capture_metadata_rows[1], frame)
    for field in PARAMETERS["field_crops"]:
        if first[field]["pixels_sha256"] != second[field]["pixels_sha256"]:
            raise ValueError(f"Overlapping {field} map differs at native frame {frame}")

asset_dir = ROOT / "renderer" / "games" / "eggo-mania" / "assets"
field_candidates = {field: [] for field in PARAMETERS["field_crops"]}
frame_records = []
unique_images = []
image_indices = {}
for capture, metadata in zip(PARAMETERS["captures"], capture_metadata_rows):
    for frame in capture_frames(capture):
        samples, record = load_sample(capture, metadata, frame)
        for field, sample in samples.items():
            digest = sample["pixels_sha256"]
            if digest not in image_indices:
                image_indices[digest] = len(unique_images)
                unique_images.append(sample["image"])
            field_candidates[field].append({
                "world_height": sample["world_height"],
                "height_key": round(sample["world_height"], PARAMETERS["height_rounding_digits"]),
                "atlas_index": image_indices[digest],
                "pixels_sha256": digest,
                "capture": capture["name"],
                "frame": frame,
            })
        frame_records.append(record)

columns = PARAMETERS["atlas_columns"]
cell_width = PARAMETERS["field_crops"]["player"]["width"]
cell_height = PARAMETERS["source_map_height"]
rows = (len(unique_images) + columns - 1) // columns
atlas = Image.new("RGBA", (columns * cell_width, rows * cell_height))
for index, image in enumerate(unique_images):
    atlas.alpha_composite(image, ((index % columns) * cell_width,
                                  (index // columns) * cell_height))
asset_path = asset_dir / "factory-background-atlas.png"
atlas.save(asset_path, optimize=True)

field_samples = {}
height_diagnostics = {}
for field, candidates in field_candidates.items():
    grouped = defaultdict(Counter)
    traces_for_hash = defaultdict(lambda: defaultdict(list))
    for sample in candidates:
        grouped[sample["height_key"]][sample["pixels_sha256"]] += 1
        traces_for_hash[sample["height_key"]][sample["pixels_sha256"]].append(sample)
    chosen = []
    choice_measurements = []
    for height_key in sorted(grouped):
        counts = grouped[height_key]
        chosen_hash = max(counts, key=lambda digest: (counts[digest],
                         -min(row["frame"] for row in traces_for_hash[height_key][digest])))
        examples = traces_for_hash[height_key][chosen_hash]
        chosen.append([height_key, examples[0]["atlas_index"]])
        choice_measurements.append({
            "height": height_key, "atlas_index": examples[0]["atlas_index"],
            "selected_occurrences": counts[chosen_hash],
            "available_occurrences": sum(counts.values()),
            "selected_from": [{"capture": row["capture"], "frame": row["frame"]}
                               for row in examples[:8]],
            "candidate_maps": [{"sha256": digest, "count": count}
                               for digest, count in counts.most_common()],
        })
    heights = [sample[0] for sample in chosen]
    gaps = [right - left for left, right in zip(heights, heights[1:])]
    field_samples[field] = chosen
    height_diagnostics[field] = {
        "samples": len(candidates), "height_bands": len(chosen),
        "minimum_height": min(heights), "maximum_height": max(heights),
        "largest_height_gap": max(gaps, default=0),
        "height_choices": choice_measurements,
    }

timeline_path = asset_dir / "factory-background-timeline.js"
timeline_path.write_text(
    "// Generated from decoded native BG3 maps; provenance is in factory-background-atlas.json.\n"
    "export const FACTORY_BACKGROUND_FIELD_SAMPLES = Object.freeze(" +
    json.dumps(field_samples, separators=(",", ":")) + ");\n"
    "export const FACTORY_BACKGROUND_ATLAS_COLUMNS = " + str(columns) + ";\n"
    "export const FACTORY_BACKGROUND_HEIGHT_TOLERANCE = " +
    str(PARAMETERS["runtime_height_tolerance"]) + ";\n",
    encoding="utf-8")

output = ROOT / "scripts" / "OUTPUT" / (
    "eggo-factory-background-animation_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
output.mkdir(parents=True)
contact_columns = 8
contact_rows = (len(unique_images) + contact_columns - 1) // contact_columns
contact = Image.new("RGBA", (contact_columns * 112, contact_rows * 272), (22, 28, 34, 255))
draw = ImageDraw.Draw(contact)
representatives = {}
for field, choices in field_samples.items():
    for height, atlas_index in choices:
        representatives.setdefault((field, atlas_index), height)
for index, image in enumerate(unique_images):
    x, y = (index % contact_columns) * 112, (index // contact_columns) * 272
    contact.alpha_composite(image, (x, y + 16))
    labels = [f"{field} {height:.2f}" for (field, atlas_index), height in representatives.items()
              if atlas_index == index]
    draw.text((x + 2, y + 1), ", ".join(labels[:2]) or f"map {index}", fill=(240, 240, 240, 255))
contact.save(output / "field-height-map-contact-sheet.png")

asset_hash = hashlib.sha256(asset_path.read_bytes()).hexdigest()
data = {
    "parameters": PARAMETERS,
    "rom_sha256": next(iter(rom_hashes)),
    "core_sha256": next(iter(core_hashes)),
    "asset_sha256": asset_hash,
    "asset_size": list(atlas.size),
    "decoded_samples": len(frame_records),
    "unique_field_maps": len(unique_images),
    "field_height_diagnostics": height_diagnostics,
    "field_samples": field_samples,
    "frames": frame_records,
    "capture_metadata": capture_metadata_rows,
}
(output / "parameters.json").write_text(json.dumps(PARAMETERS, indent=2) + "\n", encoding="utf-8")
(output / "measurements.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
asset_metadata = {key: value for key, value in data.items()
                  if key in ("parameters", "rom_sha256", "core_sha256", "asset_sha256", "asset_size",
                             "decoded_samples", "unique_field_maps", "field_height_diagnostics", "field_samples")}
(asset_dir / "factory-background-atlas.json").write_text(
    json.dumps(asset_metadata, indent=2) + "\n", encoding="utf-8")
print(output)
print(f"samples={len(frame_records)} uniqueFieldMaps={len(unique_images)} "
      f"atlas={atlas.width}x{atlas.height} sha256={asset_hash}")
for field, details in height_diagnostics.items():
    print(f"{field}: bands={details['height_bands']} range="
          f"{details['minimum_height']:.2f}..{details['maximum_height']:.2f} "
          f"largestGap={details['largest_height_gap']:.2f}")
