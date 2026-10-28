"""Check frame-840 divider pixels using the four captured native OAM sprites.

This is a diagnostic only. It deliberately does not change the game renderer:
the sprites' state-dependent placement must be understood before integration.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania frame-840 divider OAM overlay diagnostic",
    "native_reference": "tests/OUTPUT/eggo-mania-visual_2026-10-07T17-09-16-900Z/reference-fullscreen.source.png",
    "app_render": "tests/OUTPUT/eggo-mania-visual_2026-10-07T17-09-16-900Z/reference-fullscreen.render.png",
    "sprite_directory": "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.frame00840.sprites",
    "oam_objects": [
        {"index": 10, "x": 112, "y": 151, "size": [8, 32]},
        {"index": 11, "x": 120, "y": 151, "size": [8, 32]},
        {"index": 12, "x": 112, "y": 149, "size": [8, 32]},
        {"index": 13, "x": 120, "y": 139, "size": [8, 32]},
    ],
    "composition_order": [13, 12, 11, 10],
    "display_region": [112, 0, 128, 160],
    "color_conversion": "Recover g5=round(g8*31/255), then encode RGB565 green as (g5*2*255//63).",
    "random_seed": None,
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pixel_differences(left: np.ndarray, right: np.ndarray, x0: int, x1: int) -> int:
    return int(np.any(left[:, x0:x1] != right[:, x0:x1], axis=2).sum())


def main() -> None:
    native_path = ROOT / PARAMETERS["native_reference"]
    app_path = ROOT / PARAMETERS["app_render"]
    sprite_root = ROOT / PARAMETERS["sprite_directory"]
    native = Image.open(native_path).convert("RGB")
    app = Image.open(app_path).convert("RGBA")
    if native.size != (240, 160) or app.size != native.size:
        raise ValueError(f"Expected 240×160 captures; got native={native.size}, app={app.size}")

    sprite_records = []
    sprites: dict[int, tuple[Image.Image, dict[str, int]]] = {}
    for item in PARAMETERS["oam_objects"]:
        index = item["index"]
        source = sprite_root / f"{index:03d}.png"
        sprite = Image.open(source).convert("RGBA")
        if list(sprite.size) != item["size"]:
            raise ValueError(f"Object {index} size changed: {sprite.size}")
        pixels = np.asarray(sprite).copy()
        # These extracted OAM PNGs use RGB555 expansion, while mGBA's captured
        # framebuffer stores the five-bit GBA green channel in RGB565.
        green5 = np.rint(pixels[..., 1].astype(np.float64) * 31 / 255).astype(np.uint16)
        pixels[..., 1] = ((green5 * 2) * 255 // 63).astype(np.uint8)
        sprites[index] = (Image.fromarray(pixels, "RGBA"), item)
        sprite_records.append({
            **item,
            "source": source.relative_to(ROOT).as_posix(),
            "sha256": sha256(source),
        })

    for index in PARAMETERS["composition_order"]:
        sprite, item = sprites[index]
        app.alpha_composite(sprite, (item["x"], item["y"]))

    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-divider-oam-overlay_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
    )
    output.mkdir(parents=True, exist_ok=False)
    app_path_out = output / "app-with-oam.png"
    diff_path = output / "difference-mask.png"
    native.save(output / "native-reference.png")
    app.save(app_path_out)
    native_pixels = np.asarray(native)
    app_pixels = np.asarray(app.convert("RGB"))
    difference = np.any(native_pixels != app_pixels, axis=2)
    mask = np.zeros((160, 240, 4), dtype=np.uint8)
    mask[..., :3] = native_pixels
    mask[..., 3] = 255
    mask[difference, :3] = (255, 0, 255)
    Image.fromarray(mask, "RGBA").save(diff_path)

    before = np.asarray(Image.open(app_path).convert("RGB"))
    results = {
        "frame": 840,
        "before": {
            "whole_screen_pixels": int(np.any(native_pixels != before, axis=2).sum()),
            "divider_pixels": pixel_differences(native_pixels, before, 112, 128),
            "cpu_pixels": pixel_differences(native_pixels, before, 128, 240),
        },
        "after": {
            "whole_screen_pixels": int(difference.sum()),
            "divider_pixels": pixel_differences(native_pixels, app_pixels, 112, 128),
            "cpu_pixels": pixel_differences(native_pixels, app_pixels, 128, 240),
        },
        "limits": [
            "This offline overlay does not establish state-dependent runtime placement.",
            "The remaining CPU-field mismatches require a separate layer-order investigation.",
        ],
    }
    metadata = {
        **PARAMETERS,
        "native_sha256": sha256(native_path),
        "app_sha256": sha256(app_path),
        "sprites": sprite_records,
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    (output / "parameters.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **results}, indent=2))


if __name__ == "__main__":
    main()
