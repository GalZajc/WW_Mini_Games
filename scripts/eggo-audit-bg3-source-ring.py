"""Check whether the factory BG3 EWRAM source rings change during the Hard tape."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import json
import struct


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
FIRST_FRAME = 1
LAST_FRAME = 600
RAM_BASE = 0x02000000
FIELD_OBJECTS = {"player": 0x02003910, "cpu": 0x02004C8C}
SOURCE_BASE_OFFSET = 0x40
BUFFER_ROWS_OFFSET = 0x24
ROW_STRIDE_BYTES = 0x380


def main() -> None:
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-bg3-source-ring-audit_" + datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    baseline: dict[str, bytes] = {}
    baseline_pointers: dict[str, int] = {}
    records = []
    raw_digest = hashlib.sha256()

    for frame in range(FIRST_FRAME, LAST_FRAME + 1):
        path = CAPTURE_DIRECTORY / f"{CAPTURE_PREFIX}.frame{frame:05d}.ram"
        ram = path.read_bytes()
        raw_digest.update(ram)
        for field, address in FIELD_OBJECTS.items():
            obj = address - RAM_BASE
            pointer = struct.unpack_from("<I", ram, obj + SOURCE_BASE_OFFSET)[0]
            row_count = struct.unpack_from("<I", ram, obj + BUFFER_ROWS_OFFSET)[0]
            size = row_count * ROW_STRIDE_BYTES
            start = pointer - RAM_BASE
            data = ram[start:start + size]
            if row_count != 64 or len(data) != size:
                raise ValueError(f"Unexpected {field} source ring at frame {frame}")
            if field not in baseline:
                baseline[field] = data
                baseline_pointers[field] = pointer
            changed = sum(a != b for a, b in zip(baseline[field], data))
            records.append({
                "frame": frame,
                "field": field,
                "source_pointer": f"0x{pointer:08x}",
                "pointer_matches_frame1": pointer == baseline_pointers[field],
                "byte_count": size,
                "changed_bytes_from_frame1": changed,
                "source_ring_sha256": hashlib.sha256(data).hexdigest(),
            })

    parameters = {
        "experiment": "Factory BG3 EWRAM source-ring stability across native Hard replay",
        "created_local": datetime.now().astimezone().isoformat(),
        "capture_directory": CAPTURE_DIRECTORY.relative_to(ROOT).as_posix(),
        "capture_prefix": CAPTURE_PREFIX,
        "frames_inclusive": [FIRST_FRAME, LAST_FRAME],
        "field_object_addresses": {key: hex(value) for key, value in FIELD_OBJECTS.items()},
        "source_base_offset": hex(SOURCE_BASE_OFFSET),
        "buffer_rows_offset": hex(BUFFER_ROWS_OFFSET),
        "row_stride_bytes": hex(ROW_STRIDE_BYTES),
        "random_seed": None,
    }
    (output / "parameters.json").write_text(
        json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    with (output / "per-frame.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)

    fields = {}
    for field in FIELD_OBJECTS:
        field_records = [record for record in records if record["field"] == field]
        fields[field] = {
            "frames_compared": len(field_records),
            "stable_pointer_frames": sum(record["pointer_matches_frame1"] for record in field_records),
            "frames_exactly_equal_to_frame1": sum(record["changed_bytes_from_frame1"] == 0 for record in field_records),
            "max_changed_bytes": max(record["changed_bytes_from_frame1"] for record in field_records),
            "unique_source_ring_hashes": len({record["source_ring_sha256"] for record in field_records}),
            "frame1_pointer": f"0x{baseline_pointers[field]:08x}",
            "frame1_sha256": hashlib.sha256(baseline[field]).hexdigest(),
        }
    results = {
        "capture_ram_sha256_in_frame_order": raw_digest.hexdigest(),
        "fields": fields,
        "per_frame_csv": (output / "per-frame.csv").relative_to(ROOT).as_posix(),
        "interpretation": "This checks EWRAM source bytes only; BG map entries, VRAM tile rings, palette, registers and layer composition remain separate.",
    }
    (output / "results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({**results, "output_directory": output.relative_to(ROOT).as_posix()}, indent=2))


if __name__ == "__main__":
    main()
