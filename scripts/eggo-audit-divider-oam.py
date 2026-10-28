"""Audit native GBA center-divider OAM placement against captured RAM state.

The screen-space formulas were transcribed from ROM routine 0x0801a380 and
checked against the saved frame-by-frame EWRAM and OAM dumps.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import json
import struct


ROOT = Path(__file__).resolve().parents[1]
TRACE_DIR = ROOT / "scripts" / "OUTPUT" / "eggo-reference_2026-10-07_13-02-24_227876"
CHECKPOINT_DIR = ROOT / "scripts" / "OUTPUT" / "eggo-reference_2026-10-03_01-01-06_741942"
FRAME_COUNT = 600
OBJECTS = (10, 11, 12, 13)


def u16(data: bytes, gba_address: int) -> int:
    return struct.unpack_from("<H", data, gba_address - 0x02000000)[0]


def s16(data: bytes, gba_address: int) -> int:
    return struct.unpack_from("<h", data, gba_address - 0x02000000)[0]


def s32(data: bytes, gba_address: int) -> int:
    return struct.unpack_from("<i", data, gba_address - 0x02000000)[0]


def y_for_waterline(waterline_integer: int) -> int:
    # ROM 0x0801a380: (27 * waterline_high_word) >> 7, then -16 + 7.
    return (27 * waterline_integer) // 128 - 9


def y_for_completed_floors(completed_floors: int) -> int:
    # ROM 0x0801a380: (27 * (0x2f - floor_count) * 16) >> 7, then -16 + 7.
    return (27 * (47 - completed_floors)) // 8 - 9


def read_frame(frame: int) -> dict[str, object]:
    prefix = TRACE_DIR / f"eggo-replay-full-graphics.frame{frame:05d}"
    ram = Path(str(prefix) + ".ram").read_bytes()
    oam = Path(str(prefix) + ".0x7000000").read_bytes()
    water = [s16(ram, address) for address in (0x02003BBA, 0x02004F36)]
    progress = [s32(ram, address) for address in (0x02004508, 0x02005884)]
    predicted = [y_for_waterline(value) for value in water]
    predicted += [y_for_completed_floors(value) for value in progress]
    entries = [struct.unpack_from("<HHH", oam, index * 8) for index in OBJECTS]
    actual = [entry[0] & 0xFF for entry in entries]
    x = [entry[1] & 0x1FF for entry in entries]
    tiles = [entry[2] & 0x3FF for entry in entries]
    return {
        "frame": frame,
        "player_waterline_integer": water[0],
        "cpu_waterline_integer": water[1],
        "player_completed_floors": progress[0],
        "cpu_completed_floors": progress[1],
        "predicted_y_10_13": predicted,
        "native_y_10_13": actual,
        "native_x_10_13": x,
        "tile_base_10_13": tiles,
        "exact": predicted == actual,
    }


def main() -> None:
    records = [read_frame(frame) for frame in range(1, FRAME_COUNT + 1)]
    checkpoint_ram = (CHECKPOINT_DIR / "bot-tower.frame00840.ram").read_bytes()
    checkpoint_oam = (CHECKPOINT_DIR / "bot-tower.frame00840.0x7000000").read_bytes()
    checkpoint_water = [s16(checkpoint_ram, address) for address in (0x02003BBA, 0x02004F36)]
    checkpoint_progress = [s32(checkpoint_ram, address) for address in (0x02004508, 0x02005884)]
    checkpoint_predicted = [y_for_waterline(value) for value in checkpoint_water]
    checkpoint_predicted += [y_for_completed_floors(value) for value in checkpoint_progress]
    checkpoint_actual = [
        struct.unpack_from("<H", checkpoint_oam, index * 8)[0] & 0xFF
        for index in OBJECTS
    ]

    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-divider-source-audit_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    trace_path = output / "frame-audit.csv"
    columns = [
        "frame", "player_waterline_integer", "cpu_waterline_integer",
        "player_completed_floors", "cpu_completed_floors",
        "predicted_y_10_13", "native_y_10_13", "native_x_10_13",
        "tile_base_10_13", "exact",
    ]
    with trace_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        for record in records:
            writer.writerow({**record,
                "predicted_y_10_13": json.dumps(record["predicted_y_10_13"]),
                "native_y_10_13": json.dumps(record["native_y_10_13"]),
                "native_x_10_13": json.dumps(record["native_x_10_13"]),
                "tile_base_10_13": json.dumps(record["tile_base_10_13"]),
            })

    mismatches = [record for record in records if not record["exact"]]
    summary = {
        "experiment": "Eggo Mania center-divider OAM placement source audit",
        "rom_routine": "0x0801a380",
        "trace_frames": FRAME_COUNT,
        "exact_trace_frames": FRAME_COUNT - len(mismatches),
        "mismatches": mismatches,
        "frame_840_checkpoint": {
            "waterline_integer": checkpoint_water,
            "completed_floors": checkpoint_progress,
            "predicted_y": checkpoint_predicted,
            "native_y": checkpoint_actual,
            "exact": checkpoint_predicted == checkpoint_actual,
        },
        "formulas": {
            "objects_10_11_y": "floor(27 * signed_waterline_q16_high_word / 128) - 9",
            "objects_12_13_y": "floor(27 * (47 - completed_floor_count) / 8) - 9",
            "objects_10_11_x": [112, 120],
            "objects_12_13_x": [112, 120],
        },
        "source_state": {
            "waterline_high_word_addresses": ["0x02003bba", "0x02004f36"],
            "completed_floor_addresses": ["0x02004508", "0x02005884"],
        },
        "limits": [
            "Frame 219 has a one-frame OAM update delay for the CPU completed-floor count.",
            "This checks four sprites' placement and does not prove other OAM objects or layers.",
        ],
        "random_seed": None,
        "trace_sha256": hashlib.sha256((TRACE_DIR / "eggo-replay-full-graphics.trace.csv").read_bytes()).hexdigest(),
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    (output / "parameters.json").write_text(json.dumps({
        "experiment": summary["experiment"],
        "capture_directory": TRACE_DIR.relative_to(ROOT).as_posix(),
        "checkpoint_ram": (CHECKPOINT_DIR / "bot-tower.frame00840.ram").relative_to(ROOT).as_posix(),
        "frames": FRAME_COUNT,
        "objects": OBJECTS,
        "random_seed": None,
        "output_directory": output.relative_to(ROOT).as_posix(),
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        "exact_trace_frames": summary["exact_trace_frames"],
        "mismatches": mismatches,
        "frame_840_exact": summary["frame_840_checkpoint"]["exact"],
    }, indent=2))


if __name__ == "__main__":
    main()
