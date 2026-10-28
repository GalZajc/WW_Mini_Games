"""Find the normal-phase BG3VOFS used above an alternate CPU waterline split."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse
import csv
import importlib.util
import json
import struct
import sys

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
CPU_LEFT, CPU_RIGHT = 128, 240
ALT_BG3CNT = 0x0B01


def import_file(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frame", type=int, action="append", dest="frames",
                        help="Alternate-mode frame to search; may be supplied more than once.")
    parser.add_argument("--all-alternate-frames", action="store_true",
                        help="Search every captured frame with the alternate BG3 mode.")
    parser.add_argument("--delta-min", type=int, default=-32)
    parser.add_argument("--delta-max", type=int, default=32)
    args = parser.parse_args()
    scanline = import_file("eggo_scanline", Path(__file__).with_name("eggo-compose-native-scanline.py"))
    comp = scanline.load_compositor()
    source = ROOT / CAPTURE_DIRECTORY
    if args.all_alternate_frames:
        frames = []
        for candidate_frame in range(2, 601):
            candidate_io = (source / f"{CAPTURE_PREFIX}.frame{candidate_frame:05d}.0x4000000").read_bytes()
            if struct.unpack_from("<H", candidate_io, 0x0E)[0] == ALT_BG3CNT:
                frames.append(candidate_frame)
    else:
        frames = args.frames or [74, 82, 91, 161, 162, 180, 203, 361, 362, 363]
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-waterline-scroll-search_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    all_rows = []
    best_by_frame = []
    for frame_index, frame in enumerate(frames, start=1):
        stem = f"{CAPTURE_PREFIX}.frame{frame:05d}"
        io_alt = (source / f"{stem}.0x4000000").read_bytes()
        if struct.unpack_from("<H", io_alt, 0x0E)[0] != ALT_BG3CNT:
            raise ValueError(f"Frame {frame} is not in the alternate BG3 mode")
        last_normal_frame = frame - 1
        while last_normal_frame > 0:
            candidate = source / f"{CAPTURE_PREFIX}.frame{last_normal_frame:05d}.0x4000000"
            if struct.unpack_from("<H", candidate.read_bytes(), 0x0E)[0] != ALT_BG3CNT:
                break
            last_normal_frame -= 1
        if last_normal_frame <= 0:
            raise ValueError("No preceding normal BG3 register state")
        base = bytearray((source / f"{CAPTURE_PREFIX}.frame{last_normal_frame:05d}.0x4000000").read_bytes())
        current_bg2_vofs = struct.unpack_from("<H", io_alt, 0x1A)[0]
        struct.pack_into("<H", base, 0x1A, current_bg2_vofs)
        ram_previous = (source / f"{CAPTURE_PREFIX}.frame{frame - 1:05d}.ram").read_bytes()
        previous_y = scanline.waterline_y(ram_previous)
        split_y = max(0, min(160, previous_y + 1))
        vram = (source / f"{stem}.memory3").read_bytes()
        palette = (source / f"{stem}.0x5000000").read_bytes()
        oam = (source / f"{stem}.0x7000000").read_bytes()
        native = np.asarray(Image.open(source / f"{stem}.png").convert("RGB"))
        alt = scanline.compose(comp, io_alt, vram, palette, oam)
        frame_rows = []
        best = None
        for delta in range(args.delta_min, args.delta_max + 1):
            normal_vofs = (current_bg2_vofs + delta) & 0xFF
            io_normal = bytearray(base)
            struct.pack_into("<H", io_normal, 0x1E, normal_vofs)
            normal = scanline.compose(comp, bytes(io_normal), vram, palette, oam)
            hybrid = normal.copy()
            hybrid[split_y:] = alt[split_y:]
            diff = np.any(native[:, CPU_LEFT:CPU_RIGHT] != hybrid[:, CPU_LEFT:CPU_RIGHT], axis=2)
            score = int(diff.sum())
            row = {"frame": frame, "last_normal_state_frame": last_normal_frame,
                   "previous_cpu_waterline_y": previous_y, "split_y": split_y,
                   "current_bg2_vofs": current_bg2_vofs, "bg3_vofs": normal_vofs,
                   "delta_from_bg2_vofs": delta, "different_cpu_pixels": score}
            frame_rows.append(row)
            all_rows.append(row)
            if best is None or score < best["different_cpu_pixels"]:
                best = {**row, "hybrid": hybrid, "difference_mask": diff}
        best_by_frame.append({key: value for key, value in best.items()
                              if key not in ("hybrid", "difference_mask")})
        Image.fromarray(native[:, CPU_LEFT:CPU_RIGHT]).save(output / f"frame-{frame:05d}-native-cpu.png")
        Image.fromarray(best["hybrid"][:, CPU_LEFT:CPU_RIGHT]).save(output / f"frame-{frame:05d}-best-hybrid-cpu.png")
        Image.fromarray(best["difference_mask"].astype(np.uint8) * 255).save(
            output / f"frame-{frame:05d}-difference-mask.png")
        print(f"Searched frame {frame_index}/{len(frames)} ({frame})", file=sys.stderr)

    with (output / "scores.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(all_rows[0]))
        writer.writeheader()
        writer.writerows(all_rows)
    params = {
        "experiment": "Search normal-phase BG3VOFS for captured alternate waterline frames",
        "frames": frames,
        "searched_bg3_offset_delta": [args.delta_min, args.delta_max],
        "graphics_state_frame": "each target frame",
        "output_directory": str(output.relative_to(ROOT)),
        "audio_enabled": False,
        "random_seed": None,
    }
    result = {"best_per_frame": best_by_frame,
              "exact_frames": [row["frame"] for row in best_by_frame
                              if row["different_cpu_pixels"] == 0],
              "audio_enabled": False}
    (output / "parameters.json").write_text(json.dumps(params, indent=2), encoding="utf-8")
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
