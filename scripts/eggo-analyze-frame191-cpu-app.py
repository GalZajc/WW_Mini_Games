#!/usr/bin/env python3
"""Compare replay frame 191 with its HBlank-reconstructed CPU field."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
APP_SHEET = ROOT / "tests/OUTPUT/eggo-mania-visual_2026-10-08T07-05-55-482Z/input-replay-app-frames.png"
FRAME = 191
CPU_LEFT, CPU_RIGHT = 128, 240
RAM_BASE = 0x02000000
WATERLINE_Q16 = 0x02004F34
CAMERA_Q16 = 0x02004C90
CPU_CAMERA_Y = 0x02004CFC


def load_scanline_module():
    path = ROOT / "scripts/eggo-compose-native-scanline.py"
    spec = importlib.util.spec_from_file_location("eggo_native_scanline", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mismatch_summary(reference: np.ndarray, candidate: np.ndarray) -> dict[str, object]:
    mask = np.any(reference != candidate, axis=2)
    ys, xs = np.nonzero(mask)
    return {
        "different_pixels": int(mask.sum()),
        "bounds": None if not len(xs) else [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "row_counts": [int(value) for value in mask.sum(axis=1)],
        "mask": mask,
    }


def main() -> None:
    scanline = load_scanline_module()
    prefix = CAPTURE_PREFIX
    current_stem = f"{prefix}.frame{FRAME:05d}"
    previous_stem = f"{prefix}.frame{FRAME - 1:05d}"
    normal_stem = f"{prefix}.frame{160:05d}"
    current_io = (CAPTURE_DIR / f"{current_stem}.0x4000000").read_bytes()
    normal_io = bytearray((CAPTURE_DIR / f"{normal_stem}.0x4000000").read_bytes())
    previous_ram = (CAPTURE_DIR / f"{previous_stem}.ram").read_bytes()
    vram = (CAPTURE_DIR / f"{current_stem}.memory3").read_bytes()
    palette = (CAPTURE_DIR / f"{current_stem}.0x5000000").read_bytes()
    oam = (CAPTURE_DIR / f"{current_stem}.0x7000000").read_bytes()
    native = np.asarray(Image.open(CAPTURE_DIR / f"{current_stem}.png").convert("RGB"))

    prior_waterline = struct.unpack_from("<i", previous_ram, WATERLINE_Q16 - RAM_BASE)[0]
    prior_camera = struct.unpack_from("<i", previous_ram, CAMERA_Q16 - RAM_BASE)[0]
    prior_waterline_screen_y = ((prior_waterline - prior_camera) >> 16) + 15
    split_y = max(0, min(160, prior_waterline_screen_y + 1))
    current_bg2_vofs = struct.unpack_from("<H", current_io, 0x1A)[0]
    prior_cpu_camera_y = struct.unpack_from("<I", previous_ram, CPU_CAMERA_Y - RAM_BASE)[0]
    effective_normal_bg3_vofs = prior_cpu_camera_y & 0xFF
    struct.pack_into("<H", normal_io, 0x1A, current_bg2_vofs)
    struct.pack_into("<H", normal_io, 0x1E, effective_normal_bg3_vofs)

    compositor = scanline.load_compositor()
    normal = scanline.compose(compositor, bytes(normal_io), vram, palette, oam)
    alternate = scanline.compose(compositor, current_io, vram, palette, oam)
    hybrid = normal.copy()
    hybrid[split_y:] = alternate[split_y:]
    native_cpu = native[:, CPU_LEFT:CPU_RIGHT]
    hybrid_cpu = hybrid[:, CPU_LEFT:CPU_RIGHT]
    native_ppu = mismatch_summary(native_cpu, hybrid_cpu)

    sheet = Image.open(APP_SHEET).convert("RGB")
    app_full = np.asarray(sheet.crop(((FRAME - 1) % 10 * 240,
                                     (FRAME - 1) // 10 * 160,
                                     ((FRAME - 1) % 10 + 1) * 240,
                                     ((FRAME - 1) // 10 + 1) * 160)))
    app_cpu = app_full[:, CPU_LEFT:CPU_RIGHT]
    app_result = mismatch_summary(native_cpu, app_cpu)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-frame191-cpu-app_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    for name, pixels in (("native-cpu.png", native_cpu),
                         ("hblank-composite-cpu.png", hybrid_cpu),
                         ("app-cpu.png", app_cpu)):
        Image.fromarray(pixels).save(output / name)
    diff = np.where(app_result["mask"][..., None],
                    np.array([255, 0, 255], dtype=np.uint8),
                    np.array([24, 24, 24], dtype=np.uint8))
    Image.fromarray(diff).save(output / "app-native-difference.png")
    with (output / "app-mismatch-rows.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=("screen_y", "different_pixels_in_cpu_field"))
        writer.writeheader()
        writer.writerows({"screen_y": y, "different_pixels_in_cpu_field": count}
                         for y, count in enumerate(app_result["row_counts"]) if count)

    inputs = [CAPTURE_DIR / f"{current_stem}.png", CAPTURE_DIR / f"{current_stem}.memory3",
              CAPTURE_DIR / f"{current_stem}.0x4000000", CAPTURE_DIR / f"{current_stem}.0x5000000",
              CAPTURE_DIR / f"{current_stem}.0x7000000", CAPTURE_DIR / f"{previous_stem}.ram",
              CAPTURE_DIR / f"{normal_stem}.0x4000000", APP_SHEET]
    parameters = {
        "experiment": "Frame-191 CPU app comparison with HBlank-native layer reconstruction",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "capture_directory": CAPTURE_DIR.relative_to(ROOT).as_posix(),
        "capture_prefix": CAPTURE_PREFIX,
        "frame": FRAME,
        "normal_register_frame": 160,
        "previous_ram_frame": FRAME - 1,
        "app_frame_sheet": APP_SHEET.relative_to(ROOT).as_posix(),
        "app_sheet_columns": 10,
        "cpu_crop": [CPU_LEFT, 0, CPU_RIGHT, 160],
        "scanline_split_y": split_y,
        "prior_cpu_waterline_screen_y": prior_waterline_screen_y,
        "normal_bg3vofs": effective_normal_bg3_vofs,
        "normal_bg2vofs": current_bg2_vofs,
        "scanline_rule": "normal registers through previous CPU waterline screen Y; current alternate registers from the next scanline",
        "random_seed": None,
        "audioOutputMuted": True,
        "input_sha256": {str(path.relative_to(ROOT)): sha256(path) for path in inputs},
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    results = {
        "native_hblank_compositor": {key: value for key, value in native_ppu.items() if key != "mask"},
        "app_vs_native_cpu": {key: value for key, value in app_result.items() if key != "mask"},
        "native_hblank_compositor_exact": native_ppu["different_pixels"] == 0,
        "interpretation": "The native HBlank composite is a pixel oracle only after it matches the captured CPU screenshot; app differences are then attributed to app rendering, not the static PPU probe.",
        "artifacts": ["native-cpu.png", "hblank-composite-cpu.png", "app-cpu.png",
                      "app-native-difference.png", "app-mismatch-rows.csv"],
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), **results}, indent=2))


if __name__ == "__main__":
    main()
