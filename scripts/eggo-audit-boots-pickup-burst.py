"""Compare native 8x8 OAM objects around both automatic boots pickups."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import math
import struct

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-08_04-38-43_203059"
CAPTURE_PREFIX = "boots-catch-extended"
FIRST_FRAME = 1
LAST_FRAME = 70
FIELD_CROPS = {"player": (28, 32, 92, 144), "cpu": (168, 0, 232, 112)}
SHEET_SCALE = 2
SHEET_COLUMNS = 7
RAM_BASE = 0x02000000
FIELD_STATE = {
    "player": {"timer": 0x02004500, "inventory": 0x02004438},
    "cpu": {"timer": 0x0200587C, "inventory": 0x020057B4},
}


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_compositor", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load native OAM decoder {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    decoder = load_decoder()
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-boots-pickup-burst_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    source_metadata = CAPTURE_DIRECTORY / f"{CAPTURE_PREFIX}.json"
    capture_metadata = json.loads(source_metadata.read_text(encoding="utf-8-sig"))

    parameters = {
        "experiment": "Native OAM sequence around automatic boots pickup on both fields",
        "created_local": datetime.now().astimezone().isoformat(),
        "capture_directory": CAPTURE_DIRECTORY.relative_to(ROOT).as_posix(),
        "capture_prefix": CAPTURE_PREFIX,
        "frames_inclusive": [FIRST_FRAME, LAST_FRAME],
        "field_crops_xyxy": {key: list(value) for key, value in FIELD_CROPS.items()},
        "field_timer_addresses": {key: hex(value["timer"]) for key, value in FIELD_STATE.items()},
        "field_inventory_addresses": {key: hex(value["inventory"]) for key, value in FIELD_STATE.items()},
        "audio_enabled": capture_metadata.get("audio_enabled", False),
        "input_steps": capture_metadata.get("steps"),
        "random_seed": capture_metadata.get("random_seed", "encoded in the initial emulator state"),
    }

    event_frames: dict[str, int | None] = {field: None for field in FIELD_STATE}
    previous_timers: dict[str, int] = {field: 0 for field in FIELD_STATE}
    rows = []
    trace_digest = hashlib.sha256()
    frame_images = []
    chip_images = []
    chip_labels = []

    for frame in range(FIRST_FRAME, LAST_FRAME + 1):
        stem = CAPTURE_DIRECTORY / f"{CAPTURE_PREFIX}.frame{frame:05d}"
        screenshot = Image.open(stem.with_suffix(".png")).convert("RGB")
        vram = stem.with_name(stem.name + ".memory3").read_bytes()
        palette_raw = stem.with_name(stem.name + ".0x5000000").read_bytes()
        io = stem.with_name(stem.name + ".0x4000000").read_bytes()
        oam = stem.with_name(stem.name + ".0x7000000").read_bytes()
        ram = stem.with_name(stem.name + ".ram").read_bytes()
        for data in (vram, palette_raw, io, oam, ram):
            trace_digest.update(data)
        palette = decoder.palette_555(palette_raw)
        timers = {}
        inventories = {}
        for field, addresses in FIELD_STATE.items():
            timer = struct.unpack_from("<H", ram, addresses["timer"] - RAM_BASE)[0]
            inventory = struct.unpack_from("<H", ram, addresses["inventory"] - RAM_BASE)[0]
            timers[field] = timer
            inventories[field] = inventory
            if previous_timers[field] == 0 and timer > 0 and event_frames[field] is None:
                event_frames[field] = frame
            previous_timers[field] = timer

            x0, y0, x1, y1 = FIELD_CROPS[field]
            crop = screenshot.crop((x0, y0, x1, y1)).resize(
                ((x1 - x0) * SHEET_SCALE, (y1 - y0) * SHEET_SCALE), Image.Resampling.NEAREST
            )
            frame_images.append((field, frame, timer, crop))

        for index in range(128):
            obj = decoder.decode_object(vram, palette, io, oam, index)
            if obj is None or (obj["width"], obj["height"]) != (8, 8):
                continue
            x, y = int(obj["x"]), int(obj["y"])
            field = "player" if 0 <= x < 112 else "cpu" if 128 <= x < 240 else None
            if field is None:
                continue
            x0, y0, x1, y1 = FIELD_CROPS[field]
            if x + 8 <= x0 or x >= x1 or y + 8 <= y0 or y >= y1:
                continue
            attr0, attr1, attr2 = struct.unpack_from("<HHH", oam, index * 8)
            rgba = np.dstack((obj["pixels"], obj["visible"].astype(np.uint8) * 255))
            image_hash = hashlib.sha256(rgba.tobytes()).hexdigest()
            event_frame = event_frames[field]
            rows.append({
                "frame": frame,
                "field": field,
                "frames_from_pickup_timer": frame - event_frame if event_frame else None,
                "oam_index": index,
                "x": x,
                "y": y,
                "tile": attr2 & 0x3FF,
                "palette": (attr2 >> 12) & 15,
                "timer": timers[field],
                "inventory": f"0x{inventories[field]:04x}",
                "visible_pixels": int(np.count_nonzero(obj["visible"])),
                "sprite_rgba_sha256": image_hash,
                "attributes": ";".join((hex(attr0), hex(attr1), hex(attr2))),
            })
            if event_frame and 0 <= frame - event_frame <= 24:
                chip = Image.fromarray(rgba, mode="RGBA").resize((32, 32), Image.Resampling.NEAREST)
                chip_images.append(chip)
                chip_labels.append(
                    f"{field[0].upper()} +{frame - event_frame} f{frame} @{x},{y} t{timers[field]}"
                )

    crop_w = next(iter(FIELD_CROPS.values()))[2] - next(iter(FIELD_CROPS.values()))[0]
    crop_h = max(y1 - y0 for x0, y0, x1, y1 in FIELD_CROPS.values())
    cell_w, cell_h = crop_w * SHEET_SCALE, crop_h * SHEET_SCALE + 18
    sheet_rows = math.ceil(len(frame_images) / SHEET_COLUMNS)
    sheet = Image.new("RGB", (SHEET_COLUMNS * cell_w, sheet_rows * cell_h), (35, 38, 45))
    draw = ImageDraw.Draw(sheet)
    for i, (field, frame, timer, crop) in enumerate(frame_images):
        col, row = i % SHEET_COLUMNS, i // SHEET_COLUMNS
        x, y = col * cell_w, row * cell_h
        sheet.paste(crop, (x, y + 18))
        draw.text((x + 2, y + 2), f"{field} f{frame} timer={timer}", fill=(240, 240, 240))
    sheet.save(output / "field-crops.png")

    chip_cell_w, chip_cell_h = 150, 48
    chip_columns = 6
    chip_rows_count = math.ceil(len(chip_images) / chip_columns)
    chips = Image.new("RGB", (chip_columns * chip_cell_w, max(1, chip_rows_count) * chip_cell_h), (35, 38, 45))
    draw = ImageDraw.Draw(chips)
    for i, (chip, label) in enumerate(zip(chip_images, chip_labels)):
        col, row = i % chip_columns, i // chip_columns
        x, y = col * chip_cell_w, row * chip_cell_h
        chips.paste(chip, (x, y), chip)
        draw.text((x + 36, y + 8), label, fill=(240, 240, 240))
    chips.save(output / "nearby-8x8-objects.png")

    with (output / "objects.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (output / "parameters.json").write_text(
        json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    results = {
        "event_frames_from_timer_transition": event_frames,
        "audio_enabled": capture_metadata.get("audio_enabled", False),
        "nearby_8x8_oam_samples": len(rows),
        "unique_nearby_sprite_images": len({row["sprite_rgba_sha256"] for row in rows}),
        "source_ram_vram_oam_palette_trace_sha256": trace_digest.hexdigest(),
        "field_crop_sheet": (output / "field-crops.png").relative_to(ROOT).as_posix(),
        "nearby_sprite_sheet": (output / "nearby-8x8-objects.png").relative_to(ROOT).as_posix(),
        "objects_csv": (output / "objects.csv").relative_to(ROOT).as_posix(),
        "interpretation": "Timer transitions anchor events; nearby 8x8 objects are candidates, not causal labels.",
    }
    (output / "results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({**results, "output_directory": output.relative_to(ROOT).as_posix()}, indent=2))


if __name__ == "__main__":
    main()
