#!/usr/bin/env python3
"""Create a contact sheet of decoded native OAM objects for one replay frame."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
OBJECTS = range(26, 40)


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_compositor", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load native decoder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rgb555_asset_to_native_rgb565(image: np.ndarray) -> np.ndarray:
    """Map decoded RGB555 PNG colors to the RGB565 values used by the core."""
    rgb5 = np.rint(image[..., :3].astype(np.float32) * (31 / 255)).astype(np.uint16)
    converted = np.empty_like(rgb5, dtype=np.uint8)
    converted[..., 0] = (rgb5[..., 0] * 255 // 31).astype(np.uint8)
    converted[..., 1] = ((rgb5[..., 1] << 1) * 255 // 63).astype(np.uint8)
    converted[..., 2] = (rgb5[..., 2] * 255 // 31).astype(np.uint8)
    return converted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frame", type=int, default=189)
    parser.add_argument("--first-object", type=int, default=26)
    parser.add_argument("--last-object", type=int, default=39)
    args = parser.parse_args()
    if not 1 <= args.frame <= 600 or not 0 <= args.first_object <= args.last_object < 128:
        raise ValueError("Frame or OAM object range is outside the capture limits")

    stem = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{args.frame:05d}"
    paths = {name: stem.with_name(stem.name + suffix) for name, suffix in {
        "vram": ".memory3", "palette": ".0x5000000", "io": ".0x4000000",
        "oam": ".0x7000000"}.items()}
    decoder = load_decoder()
    vram, palette_raw, io, oam = (paths[name].read_bytes() for name in ("vram", "palette", "io", "oam"))
    palette = decoder.palette_555(palette_raw)
    body_asset = np.asarray(Image.open(ROOT / "renderer/games/eggo-mania/assets/factory-secondary.png").convert("RGBA"))
    wing_asset = np.asarray(Image.open(ROOT / "renderer/games/eggo-mania/assets/factory-secondary-wings.png").convert("RGBA"))

    columns, cell = 4, 144
    rows = (args.last_object - args.first_object + columns) // columns
    sheet = Image.new("RGB", (columns * cell, rows * cell), (28, 29, 34))
    draw = ImageDraw.Draw(sheet)
    records = []
    for index in range(args.first_object, args.last_object + 1):
        obj = decoder.decode_object(vram, palette, io, oam, index)
        if obj is None:
            records.append({"index": index, "active": False})
            continue
        attr0, attr1, attr2 = struct.unpack_from("<HHH", oam, index * 8)
        native_rgb = decoder.color5_to_rgb8(obj["pixels"])
        rgba = np.dstack((native_rgb, obj["visible"].astype(np.uint8) * 255))
        image = Image.fromarray(rgba, "RGBA")
        scale = min(2, max(1, 112 // max(obj["width"], obj["height"])))
        image = image.resize((obj["width"] * scale, obj["height"] * scale), Image.Resampling.NEAREST)
        x = (index - args.first_object) % columns * cell
        y = (index - args.first_object) // columns * cell
        sheet.paste(image, (x + (cell - image.width) // 2, y + 20), image)
        draw.text((x + 5, y + 4), f"OAM {index}  [{obj['x']},{obj['y']}]  {obj['width']}x{obj['height']}", fill=(235, 235, 240))
        record = {
            "index": index, "active": True, "x": obj["x"], "y": obj["y"],
            "width": obj["width"], "height": obj["height"],
            "priority": obj["priority"], "mode": obj["mode"],
            "attr0": f"0x{attr0:04x}", "attr1": f"0x{attr1:04x}",
            "attr2": f"0x{attr2:04x}", "tile": attr2 & 0x3ff,
            "palette": (attr2 >> 12) & 15,
            "visible_pixels": int(np.count_nonzero(obj["visible"])),
            "visible_rgba_sha256": hashlib.sha256(rgba.tobytes()).hexdigest(),
        }
        if index in (26, 29) and obj["width"] == obj["height"] == 64:
            comparisons = []
            for phase in range(body_asset.shape[1] // 64):
                source = body_asset[:, phase * 64:(phase + 1) * 64]
                for transform, crop in (("none", source), ("hflip", source[:, ::-1]),
                                         ("vflip", source[::-1, :]), ("hvflip", source[::-1, ::-1])):
                    mask_errors = int(np.count_nonzero((crop[..., 3] > 0) != obj["visible"]))
                    for conversion, rgb in (("rgb555", crop[..., :3]),
                                            ("rgb565", rgb555_asset_to_native_rgb565(crop))):
                        color_errors = int(np.count_nonzero(np.any(rgb != native_rgb, axis=2) & obj["visible"]))
                        comparisons.append({"phase": phase, "transform": transform,
                                            "conversion": conversion, "mask_errors": mask_errors,
                                            "color_errors": color_errors})
            record["factory_body_atlas_matches"] = comparisons
        elif index in (27, 28, 30, 31) and obj["width"] == 32 and obj["height"] == 16:
            half = 0 if index in (27, 30) else 1
            comparisons = []
            for phase in range(wing_asset.shape[1] // 64):
                source = wing_asset[:, phase * 64 + half * 32:phase * 64 + (half + 1) * 32]
                for transform, crop in (("none", source), ("hflip", source[:, ::-1]),
                                         ("vflip", source[::-1, :]), ("hvflip", source[::-1, ::-1])):
                    mask_errors = int(np.count_nonzero((crop[..., 3] > 0) != obj["visible"]))
                    for conversion, rgb in (("rgb555", crop[..., :3]),
                                            ("rgb565", rgb555_asset_to_native_rgb565(crop))):
                        color_errors = int(np.count_nonzero(np.any(rgb != native_rgb, axis=2) & obj["visible"]))
                        comparisons.append({"phase": phase, "transform": transform,
                                            "conversion": conversion, "mask_errors": mask_errors,
                                            "color_errors": color_errors})
            record["factory_wing_atlas_matches"] = comparisons
        records.append(record)

    output = ROOT / "scripts/OUTPUT" / f"eggo-oam-object-sheet_{datetime.now().astimezone():%Y-%m-%d_%H-%M-%S}"
    output.mkdir(parents=True, exist_ok=False)
    sheet.save(output / "oam-objects.png")
    # Preserve raw native pixels for exact per-object comparison with the atlases.
    for index in range(args.first_object, args.last_object + 1):
        obj = decoder.decode_object(vram, palette, io, oam, index)
        if obj is None:
            continue
        rgba = np.dstack((decoder.color5_to_rgb8(obj["pixels"]), obj["visible"].astype(np.uint8) * 255))
        Image.fromarray(rgba, "RGBA").save(output / f"oam-{index:03d}.png")
    parameters = {
        "experiment": "Eggo Mania native OAM object contact sheet",
        "capture_directory": CAPTURE_DIR.relative_to(ROOT).as_posix(),
        "capture_prefix": CAPTURE_PREFIX,
        "frame": args.frame,
        "object_range": [args.first_object, args.last_object],
        "columns": columns,
        "cell_pixels": cell,
        "random_seed": None,
        "audioOutputMuted": True,
        "audio_note": "Offline image decoding; no audio device or audio playback is used.",
        "sha256": {name: digest(path) for name, path in paths.items()},
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "objects.json").write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), "active_objects": sum(row["active"] for row in records)}, indent=2))


if __name__ == "__main__":
    main()
