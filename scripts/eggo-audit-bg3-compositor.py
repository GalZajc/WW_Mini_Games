"""Audit BG3, window, and blend register states in a captured GBA replay."""
from collections import Counter
from datetime import datetime
from pathlib import Path
import csv
import hashlib
import json
import struct


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania BG3 split-field compositor register audit",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "first_frame": 1,
    "last_frame": 600,
    "io_file_offset": 0,
    "ram_addresses": {
        "cpu_waterline_q16": 0x02004F34,
        "cpu_camera_q16": 0x02004C90,
    },
    "waterline_screen_y_offset": 15,
    "alternate_waterline_threshold_screen_y": 160,
    "alternate_bg3_waterline_source_y": 0x4F,
    "register_offsets": {
        "dispcnt": 0x00,
        "bg3cnt": 0x0E,
        "bg3hofs": 0x1C,
        "bg3vofs": 0x1E,
        "win1h": 0x42,
        "win1v": 0x46,
        "winin": 0x48,
        "winout": 0x4A,
        "bldcnt": 0x50,
        "bldalpha": 0x52,
        "bldy": 0x54,
    },
    "normal_bg3cnt": 0x1F87,
    "alternate_bg3cnt": 0x0B01,
    "random_seed": None,
}


def read_u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def read_s32(data: bytes, address: int) -> int:
    return struct.unpack_from("<i", data, address - 0x02000000)[0]


def frame_intervals(frames: list[int]) -> list[list[int]]:
    if not frames:
        return []
    intervals = []
    first = previous = frames[0]
    for frame in frames[1:]:
        if frame != previous + 1:
            intervals.append([first, previous])
            first = frame
        previous = frame
    intervals.append([first, previous])
    return intervals


def main() -> None:
    source = ROOT / PARAMETERS["capture_directory"]
    prefix = PARAMETERS["capture_prefix"]
    rows = []
    previous_cpu_waterline_y = None
    for frame in range(PARAMETERS["first_frame"], PARAMETERS["last_frame"] + 1):
        path = source / f"{prefix}.frame{frame:05d}.0x4000000"
        raw = path.read_bytes()
        values = {name: read_u16(raw, offset)
                  for name, offset in PARAMETERS["register_offsets"].items()}
        ram_path = source / f"{prefix}.frame{frame:05d}.ram"
        ram = ram_path.read_bytes()
        waterline_q16 = read_s32(ram, PARAMETERS["ram_addresses"]["cpu_waterline_q16"])
        camera_q16 = read_s32(ram, PARAMETERS["ram_addresses"]["cpu_camera_q16"])
        cpu_waterline_y = ((waterline_q16 - camera_q16) >> 16) + \
            PARAMETERS["waterline_screen_y_offset"]
        expected_alternate = (previous_cpu_waterline_y is not None and
                              previous_cpu_waterline_y <
                              PARAMETERS["alternate_waterline_threshold_screen_y"])
        expected_vofs = (PARAMETERS["alternate_bg3_waterline_source_y"] -
                         previous_cpu_waterline_y) & 0xFF \
            if previous_cpu_waterline_y is not None else None
        values.update({
            "frame": frame,
            "cpu_waterline_screen_y": cpu_waterline_y,
            "previous_cpu_waterline_screen_y": previous_cpu_waterline_y,
            "expected_alternate_from_previous_waterline": expected_alternate,
            "expected_bg3_vofs_low_byte": expected_vofs,
            "actual_bg3_vofs_low_byte": values["bg3vofs"] & 0xFF,
            "source_file": path.name,
        })
        rows.append(values)
        previous_cpu_waterline_y = cpu_waterline_y

    alt_frames = [row["frame"] for row in rows
                  if row["bg3cnt"] == PARAMETERS["alternate_bg3cnt"]]
    normal_frames = [row["frame"] for row in rows
                     if row["bg3cnt"] == PARAMETERS["normal_bg3cnt"]]
    alt = [row for row in rows if row["frame"] in set(alt_frames)]
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-bg3-compositor-audit_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)

    parameter_record = {
        **PARAMETERS,
        "created_local": datetime.now().astimezone().isoformat(),
        "source_io_files": len(rows),
        "source_capture_metadata_sha256": hashlib.sha256(
            (source / f"{prefix}.json").read_bytes()
        ).hexdigest(),
        "output_directory": str(output.relative_to(ROOT)),
        "method": "Read captured GBA IO registers directly; no emulation or state mutation.",
    }
    register_names = list(PARAMETERS["register_offsets"])
    with (output / "per-frame-registers.csv").open("w", newline="", encoding="utf-8") as file:
        extra_names = [
            "cpu_waterline_screen_y",
            "previous_cpu_waterline_screen_y",
            "expected_alternate_from_previous_waterline",
            "expected_bg3_vofs_low_byte",
            "actual_bg3_vofs_low_byte",
        ]
        writer = csv.DictWriter(file, fieldnames=["frame", *register_names,
                                                  *extra_names, "source_file"])
        writer.writeheader()
        writer.writerows(rows)

    result = {
        "frames": len(rows),
        "normalBg3Frames": len(normal_frames),
        "alternateBg3Frames": len(alt_frames),
        "alternateIntervals": frame_intervals(alt_frames),
        "alternateRegisterValues": {
            name: {f"0x{value:04x}": count for value, count in Counter(row[name] for row in alt).items()}
            for name in register_names if name != "frame"
        },
        "unclassifiedBg3Frames": [row["frame"] for row in rows
                                  if row["bg3cnt"] not in (PARAMETERS["normal_bg3cnt"],
                                                          PARAMETERS["alternate_bg3cnt"])],
        "alternateFramesHaveExpectedCompositeRegisters": all(
            row["bldcnt"] == 0x1748 and row["bldalpha"] == 0x040C
            and row["winin"] == 0x3C13 and row["win1h"] == 0x80F0
            and row["win1v"] == 0x00A0 and row["bg3hofs"] == 8
            and 432 <= row["bg3vofs"] <= 450
            for row in alt
        ),
        "alternateRawVofsRange": [
            min(row["bg3vofs"] for row in alt), max(row["bg3vofs"] for row in alt)
        ] if alt else None,
        "alternateEffectiveVofs": sorted({row["bg3vofs"] % 256 for row in alt}),
        "waterlineTriggerTestedTransitions": sum(
            row["previous_cpu_waterline_screen_y"] is not None for row in rows
        ),
        "waterlineTriggerMatchesPreviousFrame": sum(
            row["previous_cpu_waterline_screen_y"] is not None and
            (row["bg3cnt"] == PARAMETERS["alternate_bg3cnt"]) ==
            row["expected_alternate_from_previous_waterline"]
            for row in rows
        ),
        "waterlineTriggerMismatchFrames": [
            row["frame"] for row in rows
            if row["previous_cpu_waterline_screen_y"] is not None and
            (row["bg3cnt"] == PARAMETERS["alternate_bg3cnt"]) !=
            row["expected_alternate_from_previous_waterline"]
        ],
        "alternateVofsMatchesPreviousWaterline": sum(
            row["bg3cnt"] == PARAMETERS["alternate_bg3cnt"] and
            row["bg3vofs"] % 256 == row["expected_bg3_vofs_low_byte"]
            for row in rows
        ),
        "alternateVofsMismatchFrames": [
            row["frame"] for row in alt
            if row["bg3vofs"] % 256 != row["expected_bg3_vofs_low_byte"]
        ],
    }
    (output / "parameters.json").write_text(
        json.dumps(parameter_record, indent=2), encoding="utf-8"
    )
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
