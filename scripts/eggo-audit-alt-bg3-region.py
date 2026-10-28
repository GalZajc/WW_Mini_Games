"""Audit the factory CPU field's alternate BG3 region in native captures.

The ROM switches BG3 into a small text map only below the prior CPU waterline.
This compares exactly the pixels that can be visible after that scanline and
aligns each capture at the fixed BG3 source row used at the split.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
PREFIX = "eggo-replay-full-graphics"
IO_BG3CNT = 0x0E
RAM_BASE = 0x02000000
WATERLINE_Q16 = 0x02004F34
CAMERA_Q16 = 0x02004C90
WATERLINE_SCREEN_Y_OFFSET = 15
CPU_LEFT, CPU_RIGHT, HEIGHT = 128, 240, 160
MAX_REGION_HEIGHT = 18


def read_u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def load_decoder():
    path = Path(__file__).with_name("eggo-compose-native-layers.py")
    spec = importlib.util.spec_from_file_location("eggo_compose_native_layers", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def capture_path(frame: int, suffix: str) -> Path:
    return CAPTURE / f"{PREFIX}.frame{frame:05d}.{suffix}"


def waterline_y(ram: bytes) -> int:
    water = struct.unpack_from("<i", ram, WATERLINE_Q16 - RAM_BASE)[0]
    camera = struct.unpack_from("<i", ram, CAMERA_Q16 - RAM_BASE)[0]
    return ((water - camera) >> 16) + WATERLINE_SCREEN_Y_OFFSET


def as_rgb565_rgba(colors: np.ndarray, visible: np.ndarray) -> np.ndarray:
    result = np.zeros((*visible.shape, 4), dtype=np.uint8)
    result[..., 0] = colors[..., 0].astype(np.uint16).__mul__(255).__floordiv__(31).astype(np.uint8)
    result[..., 1] = (colors[..., 1].astype(np.uint16) * 2 * 255 // 63).astype(np.uint8)
    result[..., 2] = colors[..., 2].astype(np.uint16).__mul__(255).__floordiv__(31).astype(np.uint8)
    result[..., 3] = visible.astype(np.uint8) * 255
    return result


def main() -> None:
    decoder = load_decoder()
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-alt-bg3-region_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
    )
    output.mkdir(parents=True, exist_ok=False)

    alternate_frames = []
    for frame in range(1, 601):
        io = capture_path(frame, "0x4000000").read_bytes()
        if read_u16(io, IO_BG3CNT) == 0x0B01:
            alternate_frames.append(frame)

    aligned: dict[int, np.ndarray] = {}
    records = []
    for frame in alternate_frames:
        state_frame = frame - 1
        io = capture_path(frame, "0x4000000").read_bytes()
        vram = capture_path(frame, "memory3").read_bytes()
        palette = decoder.palette_555(capture_path(frame, "0x5000000").read_bytes())
        previous_ram = capture_path(state_frame, "ram").read_bytes()
        previous_y = waterline_y(previous_ram)
        split_y = max(0, min(HEIGHT, previous_y + 1))
        colors, visible, control, hofs, vofs = decoder.decode_text_bg(vram, palette, io, 3)

        region = np.zeros((MAX_REGION_HEIGHT, CPU_RIGHT - CPU_LEFT, 4), dtype=np.uint8)
        available = min(MAX_REGION_HEIGHT, HEIGHT - split_y)
        if available:
            # At screen y=split, VOFS maps the split to BG3 source row 80.
            # Align the region at the split so all captures share this origin.
            rgba = as_rgb565_rgba(colors[split_y:split_y + available,
                                         CPU_LEFT:CPU_RIGHT],
                                  visible[split_y:split_y + available,
                                          CPU_LEFT:CPU_RIGHT])
            region[:available] = rgba
        aligned[frame] = region

        native_frame = struct.unpack_from("<I", previous_ram, 0x02011A9C - RAM_BASE)[0]
        records.append({
            "frame": frame,
            "previous_native_frame": native_frame,
            "previous_waterline_y": previous_y,
            "split_y": split_y,
            "visible_region_height": available,
            "bg3cnt": f"0x{control:04x}",
            "bg3hofs": hofs,
            "bg3vofs_raw": vofs,
            "aligned_source_y_start": (split_y + vofs) & 0xFF,
            "nontransparent_pixels": int(np.count_nonzero(region[..., 3])),
            "rgba_sha256": hashlib.sha256(region.tobytes()).hexdigest(),
            "different_pixels_vs_first": None,
            "different_pixels_vs_previous_alt": None,
        })

    baseline = aligned[alternate_frames[0]]
    previous = None
    for row in records:
        region = aligned[row["frame"]]
        row["different_pixels_vs_first"] = int(np.count_nonzero(
            np.any(region != baseline, axis=2)))
        if previous is not None:
            row["different_pixels_vs_previous_alt"] = int(np.count_nonzero(
                np.any(region != aligned[previous], axis=2)))
        previous = row["frame"]

    with (output / "per-frame.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)

    atlas = Image.new("RGBA", (CPU_RIGHT - CPU_LEFT, len(records) * MAX_REGION_HEIGHT),
                      (32, 32, 32, 255))
    for index, row in enumerate(records):
        atlas.alpha_composite(Image.fromarray(aligned[row["frame"]]),
                              (0, index * MAX_REGION_HEIGHT))
    atlas.save(output / "aligned-waterline-regions.png")

    params = {
        "experiment": "Eggo Mania alternate BG3 visible-region audit",
        "capture_directory": str(CAPTURE.relative_to(ROOT)),
        "capture_prefix": PREFIX,
        "capture_metadata_sha256": hashlib.sha256(
            (CAPTURE / f"{PREFIX}.json").read_bytes()).hexdigest(),
        "frame_range": [1, 600],
        "alternate_bg3cnt": "0x0b01",
        "split_rule": "previous CPU waterline screen Y + 1, clamped to [0,160]",
        "aligned_map_origin": "The first visible row maps to BG3 source row 80.",
        "cpu_crop": [CPU_LEFT, CPU_RIGHT, 0, HEIGHT],
        "max_region_height": MAX_REGION_HEIGHT,
        "native_video_pixel_format": "RGB565",
        "audio_enabled": False,
        "random_seed": None,
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "parameters.json").write_text(json.dumps(params, indent=2), encoding="utf-8")
    period_checks = []
    for period in range(1, 65):
        checked_pairs = exact_pairs = 0
        maximum_changed_pixels = 0
        for left_index, left_row in enumerate(records):
            left_frame = left_row["frame"]
            left_native = left_row["previous_native_frame"]
            for right_row in records[left_index + 1:]:
                if left_native % period != right_row["previous_native_frame"] % period:
                    continue
                right_frame = right_row["frame"]
                overlap = min(left_row["visible_region_height"],
                              right_row["visible_region_height"])
                if overlap <= 0:
                    continue
                checked_pairs += 1
                changed = int(np.count_nonzero(np.any(
                    aligned[left_frame][:overlap] != aligned[right_frame][:overlap],
                    axis=2)))
                exact_pairs += changed == 0
                maximum_changed_pixels = max(maximum_changed_pixels, changed)
        if checked_pairs:
            period_checks.append({
                "native_frame_period": period,
                "compared_pairs": checked_pairs,
                "exact_pairs": exact_pairs,
                "mismatched_pairs": checked_pairs - exact_pairs,
                "maximum_changed_pixels": maximum_changed_pixels,
            })

    result = {
        "alternate_frames": len(records),
        "visible_region_height_min": min(row["visible_region_height"] for row in records),
        "visible_region_height_max": max(row["visible_region_height"] for row in records),
        "unique_aligned_regions": len({row["rgba_sha256"] for row in records}),
        "frames_differing_from_first": sum(row["different_pixels_vs_first"] > 0 for row in records),
        "maximum_changed_pixels_vs_first": max(row["different_pixels_vs_first"] for row in records),
        "aligned_source_rows": sorted({row["aligned_source_y_start"] for row in records}),
        "native_frame_period_checks": period_checks,
        "audio_enabled": False,
    }
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
