"""Search native Eggo Mania OAM pixels against the decoded game asset atlas."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
FRAME = 600
OAM_INDEX = 29
ASSET_DIRECTORY = ROOT / "renderer/games/eggo-mania/assets"
KNOWN_SPARKLE_CAPTURE = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.frame00840.memory3"
TILE_SIZE = 8


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_compositor", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load OAM decoder {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def native_rgb5(rgb: np.ndarray) -> np.ndarray:
    result = np.empty_like(rgb, dtype=np.uint8)
    result[..., 0] = np.rint(rgb[..., 0] * 31 / 255).astype(np.uint8)
    result[..., 1] = np.rint(rgb[..., 1] * 63 / 255 / 2).astype(np.uint8)
    result[..., 2] = np.rint(rgb[..., 2] * 31 / 255).astype(np.uint8)
    return result


def asset_rgb5(rgb: np.ndarray, green_mode: str) -> np.ndarray:
    result = np.empty_like(rgb, dtype=np.uint8)
    result[..., 0] = np.rint(rgb[..., 0] * 31 / 255).astype(np.uint8)
    result[..., 2] = np.rint(rgb[..., 2] * 31 / 255).astype(np.uint8)
    if green_mode == "rgb565":
        result[..., 1] = np.rint(rgb[..., 1] * 63 / 255 / 2).astype(np.uint8)
    else:
        result[..., 1] = np.rint(rgb[..., 1] * 31 / 255).astype(np.uint8)
    return result


def main() -> None:
    decoder = load_decoder()
    stem = CAPTURE_DIRECTORY / f"{CAPTURE_PREFIX}.frame{FRAME:05d}"
    vram_path = stem.with_name(stem.name + ".memory3")
    palette_path = stem.with_name(stem.name + ".0x5000000")
    io_path = stem.with_name(stem.name + ".0x4000000")
    oam_path = stem.with_name(stem.name + ".0x7000000")
    vram, palette_raw, io, oam = (p.read_bytes() for p in (vram_path, palette_path, io_path, oam_path))
    palette = decoder.palette_555(palette_raw)
    obj = decoder.decode_object(vram, palette, io, oam, OAM_INDEX)
    if obj is None:
        raise RuntimeError(f"Native OAM object {OAM_INDEX} is disabled at captured frame {FRAME}")
    if obj["width"] != TILE_SIZE or obj["height"] != TILE_SIZE:
        raise RuntimeError(f"Expected an 8x8 sprite, got {obj['width']}x{obj['height']}")
    visible = obj["visible"]
    target = native_rgb5(obj["pixels"])
    target[~visible] = 0
    rgba = np.dstack((obj["pixels"], visible.astype(np.uint8) * 255))

    attr0, attr1, attr2 = struct.unpack_from("<HHH", oam, OAM_INDEX * 8)
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-native-oam-asset_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    Image.fromarray(rgba, "RGBA").save(output / "native-object.png")

    matches = []
    nearest = []
    asset_paths = sorted(ASSET_DIRECTORY.glob("*.png"))
    color_depth = 8 if attr0 & 0x2000 else 4
    tile_data_size = 64 if color_depth == 8 else 32
    tile_byte_offset = 0x10000 + (attr2 & 0x3FF) * 32
    tile_raw = vram[tile_byte_offset:tile_byte_offset + tile_data_size]
    tile_data = np.frombuffer(tile_raw,
                              dtype=np.uint8)
    if color_depth == 8:
        indices = tile_data.reshape(TILE_SIZE, TILE_SIZE)
        palette_base = 256
    else:
        indices = np.stack((tile_data & 15, tile_data >> 4), axis=1).reshape(TILE_SIZE, TILE_SIZE)
        palette_base = 256 + ((attr2 >> 12) & 15) * 16
    color_indices = sorted(int(value) for value in np.unique(indices[visible]))
    index_pattern = ["".join("." if not visible[y, x] else f"{indices[y, x]:X}"
                            for x in range(TILE_SIZE)) for y in range(TILE_SIZE)]
    palette_colors = {str(index): palette[palette_base + index].tolist() for index in color_indices}
    known_sparkle_raw = None
    if KNOWN_SPARKLE_CAPTURE.is_file():
        known_vram = KNOWN_SPARKLE_CAPTURE.read_bytes()
        known_sparkle_raw = known_vram[tile_byte_offset:tile_byte_offset + tile_data_size]
    for path in asset_paths:
        image = np.asarray(Image.open(path).convert("RGBA"))
        if image.shape[0] < TILE_SIZE or image.shape[1] < TILE_SIZE:
            continue
        asset_mask = image[..., 3] > 0
        for y in range(0, image.shape[0] - TILE_SIZE + 1, TILE_SIZE):
            for x in range(0, image.shape[1] - TILE_SIZE + 1, TILE_SIZE):
                mask = asset_mask[y:y + TILE_SIZE, x:x + TILE_SIZE]
                mask_errors = int(np.count_nonzero(mask != visible))
                if mask_errors > 0:
                    continue
                rgb = image[y:y + TILE_SIZE, x:x + TILE_SIZE, :3]
                for green_mode in ("rgb555", "rgb565"):
                    colors = asset_rgb5(rgb, green_mode)
                    comparable = visible & mask
                    color_errors = int(np.count_nonzero(~mask[visible])) + int(
                        np.count_nonzero(np.any(colors[comparable] != target[comparable], axis=1)))
                    record = {"asset": str(path.relative_to(ROOT)).replace("\\", "/"),
                              "x": x, "y": y, "green_mode": green_mode,
                              "visible_mask_errors": mask_errors,
                              "visible_color_errors": color_errors,
                              "combined_errors": mask_errors + color_errors}
                    nearest.append(record)
                    if mask_errors == 0 and color_errors == 0:
                        matches.append(record)
    nearest.sort(key=lambda row: (row["combined_errors"], row["visible_mask_errors"],
                                  row["visible_color_errors"], row["asset"], row["y"], row["x"]))

    parameters = {
        "experiment": "Eggo Mania native OAM source asset search",
        "created_local": datetime.now().astimezone().isoformat(),
        "capture_directory": str(CAPTURE_DIRECTORY.relative_to(ROOT)).replace("\\", "/"),
        "capture_prefix": CAPTURE_PREFIX,
        "replay_frame": FRAME,
        "oam_index": OAM_INDEX,
        "screen_origin": [obj["x"], obj["y"]],
        "tile": attr2 & 0x3FF,
        "tile_data_offset_vram": hex(tile_byte_offset),
        "tile_data_sha256": hashlib.sha256(tile_raw).hexdigest(),
        "tile_data_hex": tile_raw.hex(),
        "known_floor_sparkle_capture": str(KNOWN_SPARKLE_CAPTURE.relative_to(ROOT)).replace("\\", "/"),
        "known_floor_sparkle_tile_sha256": hashlib.sha256(known_sparkle_raw).hexdigest() if known_sparkle_raw else None,
        "same_tile_data_as_known_floor_sparkle": bool(known_sparkle_raw == tile_raw) if known_sparkle_raw else None,
        "palette": (attr2 >> 12) & 15,
        "oam_attributes": [hex(attr0), hex(attr1), hex(attr2)],
        "visible_pixels": int(np.count_nonzero(visible)),
        "color_depth_bits": color_depth,
        "pixel_index_pattern": index_pattern,
        "palette_rgb5_by_index": palette_colors,
        "assets_scanned": len(asset_paths),
        "search_grid_pixels": TILE_SIZE,
        "color_match": "Exact 5-bit RGB after converting native RGB565 screenshots and RGB555/RGB565-decoded assets",
        "input_hashes": {str(p.relative_to(ROOT)).replace("\\", "/"): sha256(p)
                         for p in (vram_path, palette_path, io_path, oam_path)},
        "random_seed": None,
    }
    result = {"exact_matches": matches, "nearest_asset_tiles": nearest[:50],
              "output_directory": str(output.relative_to(ROOT)).replace("\\", "/")}
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n",
                                             encoding="utf-8")
    (output / "results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n",
                                          encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
