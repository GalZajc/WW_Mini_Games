"""Verify the player's BG1 ring scroll against the prior native camera sample.

This offline audit reads the existing 600-frame GBA capture. It tests only
normal BG1 text-map mode; the alternate water layer has a different scroll.
All measurements and source hashes are saved beneath scripts/OUTPUT.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json
import struct


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
PREFIX = "eggo-replay-full-graphics"
TRACE_PATH = CAPTURE_DIR / f"{PREFIX}.trace.json"
IO_BG1CNT = 0x0A
IO_BG1HOFS = 0x14
IO_BG1VOFS = 0x16
NORMAL_BG1CNT = 0x1F87
RING_MAP_ORIGIN = 256


def main() -> None:
    trace = json.loads(TRACE_PATH.read_text(encoding="utf-8"))
    rows = []
    for index, sample in enumerate(trace):
        frame = index + 1
        io_path = CAPTURE_DIR / f"{PREFIX}.frame{frame:05d}.0x4000000"
        io = io_path.read_bytes()
        bg1cnt, hofs, vofs = (struct.unpack_from("<H", io, offset)[0]
                              for offset in (IO_BG1CNT, IO_BG1HOFS, IO_BG1VOFS))
        camera_y = sample["native_cameras"]["player"]["camera_y"]
        previous_camera_y = trace[index - 1]["native_cameras"]["player"]["camera_y"] if index else None
        normal = bg1cnt == NORMAL_BG1CNT
        if not normal or previous_camera_y is None:
            continue
        vofs_low = vofs & 0xFF
        previous_low = previous_camera_y & 0xFF
        current_low = camera_y & 0xFF
        rows.append({
            "frame": frame,
            "bg1cnt": f"0x{bg1cnt:04x}",
            "bg1hofs": hofs,
            "bg1vofs_raw": vofs,
            "bg1vofs_low": vofs_low,
            "previous_player_camera_y": previous_camera_y,
            "previous_camera_low": previous_low,
            "current_player_camera_y": camera_y,
            "current_camera_low": current_low,
            "expected_ring_source_y": RING_MAP_ORIGIN + vofs_low,
            "previous_camera_source_y": RING_MAP_ORIGIN + previous_low,
            "current_camera_source_y": RING_MAP_ORIGIN + current_low,
            "matches_previous_camera": vofs_low == previous_low,
            "matches_current_camera": vofs_low == current_low,
        })

    output = ROOT / "scripts/OUTPUT" / (
        "eggo-player-bg1-camera-phase_" +
        datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f"))
    output.mkdir(parents=True, exist_ok=False)
    with (output / "frame-values.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    parameters = {
        "experiment": "Eggo Mania player BG1 ring camera phase audit",
        "capture_directory": str(CAPTURE_DIR),
        "trace_file": str(TRACE_PATH),
        "capture_frames": len(trace),
        "normal_bg1cnt": f"0x{NORMAL_BG1CNT:04x}",
        "ring_map_origin_pixels": RING_MAP_ORIGIN,
        "comparison": "BG1VOFS low byte against prior/current player camera_y low byte",
        "random_seed": None,
        "audio_enabled": False,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "trace_sha256": hashlib.sha256(TRACE_PATH.read_bytes()).hexdigest(),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    prior_matches = sum(row["matches_previous_camera"] for row in rows)
    current_matches = sum(row["matches_current_camera"] for row in rows)
    result = {
        "normal_player_bg1_frames": len(rows),
        "previous_camera_low_byte_matches": prior_matches,
        "current_camera_low_byte_matches": current_matches,
        "first_prior_camera_mismatch": next((row for row in rows if not row["matches_previous_camera"]), None),
        "first_current_camera_mismatch": next((row for row in rows if not row["matches_current_camera"]), None),
        "limits": [
            "Alternate BG1 mode 0x0b01 is excluded because it uses the water map.",
            "This verifies register timing and ring scroll, not full-screen pixel parity.",
        ],
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
