#!/usr/bin/env python3
"""Search the muted replay image for the factory secondary's ROM sprite pose."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import argparse
import csv
import hashlib
import importlib.util
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
ASSET = ROOT / "renderer/games/eggo-mania/assets/factory-secondary.png"
FRAME = 191
OAM_INDEX = 29


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def native_rgb565(rgb: np.ndarray) -> np.ndarray:
    rgb5 = np.rint(rgb.astype(np.float32) * (31 / 255)).astype(np.uint16)
    converted = np.empty_like(rgb5, dtype=np.uint8)
    converted[..., 0] = (rgb5[..., 0] * 255 // 31).astype(np.uint8)
    converted[..., 1] = ((rgb5[..., 1] << 1) * 255 // 63).astype(np.uint8)
    converted[..., 2] = (rgb5[..., 2] * 255 // 31).astype(np.uint8)
    return converted


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_layers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load native graphics decoder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-sheet", type=Path, required=True,
                        help="600-frame Electron replay contact sheet")
    args = parser.parse_args()
    app_sheet_path = args.app_sheet.resolve()
    app_parameters_path = app_sheet_path.parent / "parameters.json"
    app_parameters = json.loads(app_parameters_path.read_text(encoding="utf-8"))
    if app_parameters.get("audioOutputMuted") is not True:
        raise ValueError(f"Electron capture was not confirmed muted: {app_parameters_path}")

    stem = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{FRAME:05d}"
    vram_path, palette_path, io_path, oam_path = (
        stem.with_name(stem.name + suffix) for suffix in
        (".memory3", ".0x5000000", ".0x4000000", ".0x7000000"))
    decoder = load_decoder()
    vram, palette_raw, io, oam = (path.read_bytes() for path in
                                  (vram_path, palette_path, io_path, oam_path))
    obj = decoder.decode_object(vram, decoder.palette_555(palette_raw), io, oam, OAM_INDEX)
    if obj is None or (obj["width"], obj["height"]) != (64, 64):
        raise RuntimeError("The selected native factory sprite is not an active 64×64 object")

    sheet = Image.open(app_sheet_path).convert("RGB")
    sheet_x = ((FRAME - 1) % 10) * 240
    sheet_y = ((FRAME - 1) // 10) * 160
    app = np.asarray(sheet.crop((sheet_x, sheet_y, sheet_x + 240, sheet_y + 160)))
    atlas = np.asarray(Image.open(ASSET).convert("RGBA"))
    native_sprite = decoder.color5_to_rgb8(obj["pixels"])
    native_sprite_mask = obj["visible"]

    # Search the region where the CPU field can display the sprite. The score
    # counts matching opaque texels; background and overlapping sprites can
    # hide some matches, so this is an alignment diagnostic rather than proof.
    candidates = []
    scores = []
    for phase in range(atlas.shape[1] // 64):
        source = atlas[:, phase * 64:(phase + 1) * 64]
        rgba = source
        rgb = native_rgb565(rgba[..., :3])
        mask = rgba[..., 3] > 0
        for y in range(0, 97):
            for x in range(90, 177):
                visible = mask[:min(64, 160 - y), :min(64, 240 - x)]
                if not np.any(visible):
                    continue
                patch = app[y:y + visible.shape[0], x:x + visible.shape[1]]
                source_rgb = rgb[:visible.shape[0], :visible.shape[1]]
                matches = int(np.count_nonzero(np.all(patch == source_rgb, axis=2) & visible))
                scores.append({"phase": phase, "x": x, "y": y, "exact_rgb_texels": matches,
                               "opaque_texels_in_screen": int(visible.sum())})
        native_mask_errors = int(np.count_nonzero(mask != native_sprite_mask))
        native_rgb_errors = int(np.count_nonzero(
            np.any(rgb != native_sprite, axis=2) & native_sprite_mask))
        candidates.append({"phase": phase, "native_mask_errors": native_mask_errors,
                           "native_rgb_errors": native_rgb_errors})

    scores.sort(key=lambda row: (-row["exact_rgb_texels"], row["phase"], row["y"], row["x"]))
    expected = next((row for row in scores if row["x"] == obj["x"] and row["y"] == obj["y"]), None)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-factory-sprite-offset-search_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Frame-191 factory secondary sprite pose and position search",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "replay_frame": FRAME,
        "oam_index": OAM_INDEX,
        "app_frame_sheet": app_sheet_path.relative_to(ROOT).as_posix(),
        "app_audio_output_muted": True,
        "native_screen_position": [obj["x"], obj["y"]],
        "searched_position_bounds_inclusive": {"x": [90, 176], "y": [0, 96]},
        "search_metric": "Exact RGB matches on opaque sprite texels, with 16 atlas poses",
        "interpretation_limit": "Nearby scene layers can cover sprite texels; a high score is alignment evidence, not identity by RGB alone.",
        "random_seed": None,
        "input_sha256": {
            app_sheet_path.relative_to(ROOT).as_posix(): sha256(app_sheet_path),
            str(Path("renderer/games/eggo-mania/assets/factory-secondary.png")): sha256(ASSET),
            **{path.relative_to(ROOT).as_posix(): sha256(path) for path in
               (vram_path, palette_path, io_path, oam_path)},
        },
    }
    result = {
        "native_object_pose_matches": candidates,
        "top_app_matches": scores[:40],
        "app_match_score_at_native_xy": expected,
        "native_sprite_visible_texels": int(native_sprite_mask.sum()),
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with (output / "offset-scores.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(scores[0]))
        writer.writeheader()
        writer.writerows(scores)
    print(json.dumps({"output": result["output_directory"],
                      "native_object_pose_matches": candidates,
                      "app_match_score_at_native_xy": expected,
                      "top_app_matches": scores[:10]}, indent=2))


if __name__ == "__main__":
    main()
