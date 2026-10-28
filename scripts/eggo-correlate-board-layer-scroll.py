#!/usr/bin/env python3
"""Check whether replay pixel errors track the native duplicate-board BG scroll."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import json
import struct

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
PARITY_DIR = ROOT / "scripts/OUTPUT/eggo-replay-screen-parity_2026-10-08_02-42-05_922850"
FRAME_COUNT = 600


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def corr(a: list[float], b: list[float]) -> float | None:
    if len(a) < 2 or np.std(a) == 0 or np.std(b) == 0:
        return None
    return float(np.corrcoef(np.asarray(a), np.asarray(b))[0, 1])


def main() -> None:
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-board-scroll-correlation_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    )
    output.mkdir(parents=True, exist_ok=False)
    with (PARITY_DIR / "frame-differences.csv").open(encoding="utf-8", newline="") as file:
        parity_rows = {int(row["frame"]): row for row in csv.DictReader(file)}

    records = []
    for frame in range(1, FRAME_COUNT + 1):
        path = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{frame:05d}.0x4000000"
        io = path.read_bytes()
        bg0vofs, bg1vofs, bg2vofs, bg3vofs = (u16(io, offset) for offset in (0x12, 0x16, 0x1A, 0x1E))
        registers = [u16(io, offset) for offset in (0x0A, 0x0C, 0x0E)]
        diff = parity_rows[frame]
        records.append({
            "frame": frame,
            "bg1cnt": hex(registers[0]), "bg2cnt": hex(registers[1]), "bg3cnt": hex(registers[2]),
            "bg0vofs": bg0vofs, "bg2vofs": bg2vofs,
            "bg2_minus_bg0_vofs_signed": ((bg2vofs - bg0vofs + 128) & 255) - 128,
            "bg2_minus_bg0_vofs_abs": abs(((bg2vofs - bg0vofs + 128) & 255) - 128),
            "bg1vofs": bg1vofs, "bg3vofs_low": bg3vofs & 255,
            "different_pixels": int(diff["different_pixels"]),
            "player_pixels": int(diff["player_pixels"]),
            "cpu_pixels": int(diff["cpu_pixels"]),
        })

    bg_delta = [row["bg2_minus_bg0_vofs_abs"] for row in records]
    total_diff = [row["different_pixels"] for row in records]
    player_diff = [row["player_pixels"] for row in records]
    cpu_diff = [row["cpu_pixels"] for row in records]
    groups: dict[str, list[dict]] = {}
    for row in records:
        key = f"{row['bg2_minus_bg0_vofs_abs']:03d}"
        groups.setdefault(key, []).append(row)
    grouped = [{
        "absolute_bg0_bg2_scroll_delta": int(key),
        "frames": len(rows),
        "mean_different_pixels": float(np.mean([r["different_pixels"] for r in rows])),
        "median_different_pixels": float(np.median([r["different_pixels"] for r in rows])),
        "maximum_different_pixels": max(r["different_pixels"] for r in rows),
    } for key, rows in sorted(groups.items())]

    with (output / "per-frame.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    with (output / "grouped-by-scroll-delta.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(grouped[0]))
        writer.writeheader()
        writer.writerows(grouped)
    (output / "parameters.json").write_text(json.dumps({
        "experiment": "Correlate app pixel parity with duplicate BG0/BG2 board scroll separation",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "capture_directory": CAPTURE_DIR.relative_to(ROOT).as_posix(),
        "capture_prefix": CAPTURE_PREFIX,
        "parity_directory": PARITY_DIR.relative_to(ROOT).as_posix(),
        "frames": FRAME_COUNT,
        "scroll_registers": {"BG0VOFS": "0x12", "BG1VOFS": "0x16", "BG2VOFS": "0x1a", "BG3VOFS": "0x1e"},
        "wrap_delta": "signed 8-bit difference BG2VOFS - BG0VOFS",
        "random_seed": None,
        "audio_enabled": False,
    }, indent=2) + "\n", encoding="utf-8")
    result = {
        "frames": FRAME_COUNT,
        "correlation_abs_bg0_bg2_scroll_delta_vs_all_diff": corr(bg_delta, total_diff),
        "correlation_abs_bg0_bg2_scroll_delta_vs_player_diff": corr(bg_delta, player_diff),
        "correlation_abs_bg0_bg2_scroll_delta_vs_cpu_diff": corr(bg_delta, cpu_diff),
        "maximum_scroll_delta_frames": [row for row in records if row["bg2_minus_bg0_vofs_abs"] == max(bg_delta)][:10],
        "largest_pixel_mismatch_frames": sorted(records, key=lambda row: row["different_pixels"], reverse=True)[:10],
        "grouped_by_scroll_delta": grouped,
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    (output / "results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
