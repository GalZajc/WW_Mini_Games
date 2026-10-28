"""Audit native 8x8 OAM objects around automatic boots pickup."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_19-42-07_494679"
CAPTURE_PREFIX = "boots-catch-framewise"
FIRST_FRAME = 17
LAST_FRAME = 34
PLAYER_REGION = (28, 64, 92, 132)
SCALE = 3
RAM_BASE = 0x02000000
BOOTS_TIMER_ADDRESS = 0x02004500
PLAYER_INVENTORY_ADDRESS = 0x02004438


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
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-boots-catch-oam_" + datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)

    parameters = {
        "experiment": "Native OAM audit around automatic boots pickup",
        "created_local": datetime.now().astimezone().isoformat(),
        "capture_directory": CAPTURE_DIRECTORY.relative_to(ROOT).as_posix(),
        "capture_prefix": CAPTURE_PREFIX,
        "frames_inclusive": [FIRST_FRAME, LAST_FRAME],
        "player_crop_xyxy": list(PLAYER_REGION),
        "crop_scale": SCALE,
        "boots_timer_address": hex(BOOTS_TIMER_ADDRESS),
        "player_inventory_address": hex(PLAYER_INVENTORY_ADDRESS),
        "random_seed": None,
    }
    (output / "parameters.json").write_text(
        json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    left, top, right, bottom = PLAYER_REGION
    crop_width, crop_height = right - left, bottom - top
    label_height = 18
    sheet = Image.new("RGB", (crop_width * SCALE * 3, (crop_height * SCALE + label_height) * 6), (35, 38, 45))
    draw = ImageDraw.Draw(sheet)
    rows = []
    trace_hash = hashlib.sha256()
    for frame in range(FIRST_FRAME, LAST_FRAME + 1):
        stem = CAPTURE_DIRECTORY / f"{CAPTURE_PREFIX}.frame{frame:05d}"
        screenshot_path = stem.with_suffix(".png")
        vram_path = stem.with_name(stem.name + ".memory3")
        palette_path = stem.with_name(stem.name + ".0x5000000")
        io_path = stem.with_name(stem.name + ".0x4000000")
        oam_path = stem.with_name(stem.name + ".0x7000000")
        ram_path = stem.with_name(stem.name + ".ram")
        screenshot = Image.open(screenshot_path).convert("RGB")
        vram, palette_raw, io, oam, ram = (
            path.read_bytes() for path in (vram_path, palette_path, io_path, oam_path, ram_path)
        )
        for data in (vram, palette_raw, io, oam, ram):
            trace_hash.update(data)
        palette = decoder.palette_555(palette_raw)
        boots_timer = struct.unpack_from("<H", ram, BOOTS_TIMER_ADDRESS - RAM_BASE)[0]
        inventory = struct.unpack_from("<H", ram, PLAYER_INVENTORY_ADDRESS - RAM_BASE)[0]
        cell = frame - FIRST_FRAME
        column, row = cell % 3, cell // 3
        x0, y0 = column * crop_width * SCALE, row * (crop_height * SCALE + label_height)
        crop = screenshot.crop(PLAYER_REGION).resize((crop_width * SCALE, crop_height * SCALE), Image.Resampling.NEAREST)
        sheet.paste(crop, (x0, y0 + label_height))
        draw.text((x0 + 2, y0 + 2), f"f{frame} timer={boots_timer} inv={inventory:04x}", fill=(240, 240, 240))

        for index in range(128):
            obj = decoder.decode_object(vram, palette, io, oam, index)
            if obj is None or (obj["width"], obj["height"]) != (8, 8):
                continue
            sx, sy = int(obj["x"]), int(obj["y"])
            if sx >= right or sy >= bottom or sx + 8 <= left or sy + 8 <= top:
                continue
            attr0, attr1, attr2 = struct.unpack_from("<HHH", oam, index * 8)
            rgba = np.dstack((obj["pixels"], obj["visible"].astype(np.uint8) * 255))
            rows.append({
                "frame": frame,
                "oam_index": index,
                "x": sx,
                "y": sy,
                "tile": attr2 & 0x3FF,
                "palette": (attr2 >> 12) & 15,
                "boots_timer": boots_timer,
                "player_inventory": inventory,
                "visible_pixels": int(np.count_nonzero(obj["visible"])),
                "sprite_rgba_sha256": hashlib.sha256(rgba.tobytes()).hexdigest(),
                "attributes": ";".join((hex(attr0), hex(attr1), hex(attr2))),
            })

    sheet_path = output / "player-field-crops.png"
    sheet.save(sheet_path)
    with (output / "objects.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    results = {
        "captured_oam_rows": len(rows),
        "source_register_ram_vram_oam_sha256_in_frame_order": trace_hash.hexdigest(),
        "sheet": sheet_path.relative_to(ROOT).as_posix(),
        "csv": (output / "objects.csv").relative_to(ROOT).as_posix(),
        "interpretation": "The crop and OAM records are observational; matching art or proximity alone does not identify an effect's cause.",
    }
    (output / "results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({**results, "output_directory": output.relative_to(ROOT).as_posix()}, indent=2))


if __name__ == "__main__":
    main()
