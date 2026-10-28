"""Compare native factory BG3 pixels from idle and actively played traces."""
from datetime import datetime
from pathlib import Path
import hashlib
import json
import struct

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "layer": 3,
    "frames": [840, 2000, 2200, 2600, 3600],
    "same_trace_pairs": [
        {"trace": 0, "first_frame": 8, "second_frame": 840, "label": "idle-player-ground"},
        {"trace": 1, "first_frame": 544, "second_frame": 568, "label": "active-player-same-height"},
        {"trace": 1, "first_frame": 1376, "second_frame": 1424, "label": "active-cpu-same-height"},
    ],
    "actor_world_y_addresses": {"player": "0x3bd8", "cpu": "0x4f54"},
    "baseline_world_y": 720.0440673828125,
    "world_height_scale_pixels": 16,
    "traces": [
        {"directory": "scripts/OUTPUT/eggo-reference_2026-10-05_17-38-15_607301",
         "name": "factory-anim-60s", "kind": "no-input"},
        {"directory": "scripts/OUTPUT/eggo-reference_2026-10-05_17-59-34_990709",
         "name": "eggo-factory-active-bg", "kind": "model-player bot"},
    ],
    "normalization": "bake native BG3HOFS into image; compare decoded RGBA maps",
    "color_conversion": "RGB555 channels expanded with value*255//31; BG palette index zero transparent",
}


def decode(vram, palette_bytes, io):
    layer = PARAMETERS["layer"]
    control = struct.unpack_from("<H", io, 8 + 2 * layer)[0]
    bpp = 8 if control & 0x80 else 4
    width = 256 * (1 + ((control >> 14) & 1))
    height = 256 * (1 + ((control >> 15) & 1))
    char_base = ((control >> 2) & 3) * 0x4000
    screen_base = ((control >> 8) & 31) * 0x800
    raw = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw & 31) * 255 // 31,
                        ((raw >> 5) & 31) * 255 // 31,
                        ((raw >> 10) & 31) * 255 // 31,
                        np.full(raw.shape, 255)), axis=-1).astype(np.uint8)
    image = np.zeros((height, width, 4), dtype=np.uint8)
    size = 64 if bpp == 8 else 32
    for tile_y in range(height // 8):
        for tile_x in range(width // 8):
            block = (tile_y // 32) * (width // 256) + tile_x // 32
            address = screen_base + (block * 1024 + (tile_y % 32) * 32 + tile_x % 32) * 2
            entry = struct.unpack_from("<H", vram, address)[0]
            start = char_base + (entry & 1023) * size
            packed = np.frombuffer(vram, dtype=np.uint8, count=size, offset=start)
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
    image = np.roll(image, -(hofs % width), axis=1)
    return Image.fromarray(image, "RGBA"), {
        "control": f"0x{control:04x}", "hofs": hofs, "vofs": vofs,
        "sha256": hashlib.sha256(image.tobytes()).hexdigest(),
    }


def read_trace_frame(trace, frame):
    directory = ROOT / trace["directory"]
    prefix = directory / f"{trace['name']}.frame{frame:05d}"
    image, registers = decode(Path(str(prefix) + ".memory3").read_bytes(),
                              Path(str(prefix) + ".0x5000000").read_bytes(),
                              Path(str(prefix) + ".0x4000000").read_bytes())
    ram = Path(str(prefix) + ".ram").read_bytes()
    registers["actors"] = {}
    for name, address in PARAMETERS["actor_world_y_addresses"].items():
        world_y = struct.unpack_from("<i", ram, int(address, 16))[0] / 65536
        registers["actors"][name] = {
            "world_y": world_y,
            "world_height": (PARAMETERS["baseline_world_y"] - world_y) /
                            PARAMETERS["world_height_scale_pixels"],
        }
    return image, registers


records = []
strips = []
for frame in PARAMETERS["frames"]:
    images = []
    registers = []
    for trace in PARAMETERS["traces"]:
        image, state = read_trace_frame(trace, frame)
        images.append(np.asarray(image))
        registers.append(state)
    if images[0].shape != images[1].shape:
        raise ValueError(f"BG3 dimensions differ at frame {frame}: {images[0].shape}, {images[1].shape}")
    difference = np.abs(images[0].astype(np.int16) - images[1].astype(np.int16))
    visible = (images[0][:, :, 3] > 0) | (images[1][:, :, 3] > 0)
    rgb_error = difference[:, :, :3][visible]
    record = {
        "frame": frame,
        "traces": [{**trace, **state} for trace, state in zip(PARAMETERS["traces"], registers)],
        "identical_decoded_map": registers[0]["sha256"] == registers[1]["sha256"],
        "mean_absolute_rgb_error": float(rgb_error.mean()) if rgb_error.size else 0.0,
        "alpha_mismatch_pixels": int(np.count_nonzero(images[0][:, :, 3] != images[1][:, :, 3])),
        "field_comparisons": {},
    }
    for field_name, x0 in (("player", 0), ("cpu", 128)):
        a = images[0][:, x0:x0 + 112]
        b = images[1][:, x0:x0 + 112]
        field_visible = (a[:, :, 3] > 0) | (b[:, :, 3] > 0)
        field_error = np.abs(a.astype(np.int16) - b.astype(np.int16))[:, :, :3][field_visible]
        record["field_comparisons"][field_name] = {
            "identical": hashlib.sha256(a.tobytes()).hexdigest() == hashlib.sha256(b.tobytes()).hexdigest(),
            "mean_absolute_rgb_error": float(field_error.mean()) if field_error.size else 0.0,
            "sha256": [hashlib.sha256(a.tobytes()).hexdigest(), hashlib.sha256(b.tobytes()).hexdigest()],
        }
    records.append(record)
    panels = Image.new("RGBA", (512, 272), (30, 35, 40, 255))
    panels.alpha_composite(Image.fromarray(images[0]), (0, 16))
    panels.alpha_composite(Image.fromarray(images[1]), (256, 16))
    draw = ImageDraw.Draw(panels)
    draw.text((4, 1), f"{frame} idle", fill=(255, 255, 255, 255))
    draw.text((260, 1), f"{frame} active", fill=(255, 255, 255, 255))
    strips.append(panels)

same_trace_pairs = []
same_height_strips = []
for pair in PARAMETERS["same_trace_pairs"]:
    trace = PARAMETERS["traces"][pair["trace"]]
    first, first_registers = read_trace_frame(trace, pair["first_frame"])
    second, second_registers = read_trace_frame(trace, pair["second_frame"])
    a, b = np.asarray(first), np.asarray(second)
    fields = {}
    for field_name, x0 in (("player", 0), ("cpu", 128)):
        left, right = a[:, x0:x0 + 112], b[:, x0:x0 + 112]
        visible = (left[:, :, 3] > 0) | (right[:, :, 3] > 0)
        error = np.abs(left.astype(np.int16) - right.astype(np.int16))[:, :, :3][visible]
        fields[field_name] = {
            "identical": hashlib.sha256(left.tobytes()).hexdigest() == hashlib.sha256(right.tobytes()).hexdigest(),
            "mean_absolute_rgb_error": float(error.mean()) if error.size else 0.0,
            "sha256": [hashlib.sha256(left.tobytes()).hexdigest(), hashlib.sha256(right.tobytes()).hexdigest()],
        }
    pair_record = {
        **pair,
        "trace_kind": trace["kind"],
        "first_state": first_registers,
        "second_state": second_registers,
        "field_comparisons": fields,
    }
    same_trace_pairs.append(pair_record)
    panels = Image.new("RGBA", (512, 272), (30, 35, 40, 255))
    panels.alpha_composite(first, (0, 16))
    panels.alpha_composite(second, (256, 16))
    draw = ImageDraw.Draw(panels)
    draw.text((4, 1), f"{pair['first_frame']} {pair['label']}", fill=(255, 255, 255, 255))
    draw.text((260, 1), f"{pair['second_frame']}", fill=(255, 255, 255, 255))
    same_height_strips.append(panels)

output = ROOT / "scripts" / "OUTPUT" / (
    "eggo-factory-background-trace-compare_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
output.mkdir(parents=True)
contact = Image.new("RGBA", (512, 272 * len(strips)), (20, 24, 30, 255))
for index, strip in enumerate(strips):
    contact.alpha_composite(strip, (0, index * 272))
contact.save(output / "decoded-bg3-comparison.png")
same_height_contact = Image.new("RGBA", (512, 272 * len(same_height_strips)), (20, 24, 30, 255))
for index, strip in enumerate(same_height_strips):
    same_height_contact.alpha_composite(strip, (0, index * 272))
same_height_contact.save(output / "same-trace-height-comparison.png")
(output / "parameters.json").write_text(json.dumps(PARAMETERS, indent=2) + "\n", encoding="utf-8")
(output / "measurements.json").write_text(json.dumps({
    "cross_trace_frames": records,
    "same_trace_height_pairs": same_trace_pairs,
}, indent=2) + "\n", encoding="utf-8")
print(output)
for record in records:
    print(f"frame={record['frame']} identical={record['identical_decoded_map']} "
          f"MAE={record['mean_absolute_rgb_error']:.3f} alphaMismatch={record['alpha_mismatch_pixels']}")
for pair in same_trace_pairs:
    print(f"same-height {pair['label']} frames={pair['first_frame']}/{pair['second_frame']} "
          f"player={pair['field_comparisons']['player']['mean_absolute_rgb_error']:.3f} "
          f"cpu={pair['field_comparisons']['cpu']['mean_absolute_rgb_error']:.3f}")
