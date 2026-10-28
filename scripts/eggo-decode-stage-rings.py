"""Decode and verify the Survival stages' native graphics resources.

The decoder follows the ARM routine copied to IWRAM at 0x03000110. It writes
the decoded rings and a reproducible audit record into a timestamped OUTPUT
folder. The source ROM is read-only.
"""
from datetime import datetime
from pathlib import Path
import argparse
import csv
import hashlib
import json
import struct


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "rom": Path("C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba"),
    "ewram_base": 0x02000000,
    "stage_id_address": 0x02003294,
    "field_objects": {"player": 0x02003910, "cpu": 0x02004C8C},
    "object_config_offset": 0x20,
    "object_source_ring_offset": 0x40,
    "rom_base": 0x08000000,
    "stages": {
        "beanstalk": {
            "stage_id": 0,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_11-11-18_098381",
            "capture_name": "beanstalk-landed", "capture_frame": 20,
            "configs": {"player": 0x0821CF7C, "cpu": 0x0821CF98},
        },
        "factory": {
            "stage_id": 1,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-05_18-51-49_188487",
            "capture_name": "eggo-factory-map-row", "capture_frame": 1,
            "configs": {"player": 0x0821CFB4, "cpu": 0x0821CFD0},
        },
        "dragon": {
            "stage_id": 2,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_576376",
            "capture_name": "dragon-landed", "capture_frame": 20,
            "configs": {"player": 0x0821D094, "cpu": 0x0821D0B0},
        },
        "castle": {
            "stage_id": 3,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_514995",
            "capture_name": "castle-landed", "capture_frame": 20,
            "configs": {"player": 0x0821D0CC, "cpu": 0x0821D0E8},
        },
        "pirate": {
            "stage_id": 4,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_580151",
            "capture_name": "pirate-landed", "capture_frame": 20,
            "configs": {"player": 0x0821D104, "cpu": 0x0821D120},
        },
        "space": {
            "stage_id": 5,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_404434",
            "capture_name": "space-landed", "capture_frame": 20,
            "configs": {"player": 0x0821D05C, "cpu": 0x0821D078},
        },
        "jungle": {
            "stage_id": 6,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_417436",
            "capture_name": "jungle-landed", "capture_frame": 20,
            "configs": {"player": 0x0821D024, "cpu": 0x0821D040},
        },
        "park": {
            "stage_id": 7,
            "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_425429",
            "capture_name": "park-landed", "capture_frame": 20,
            "configs": {"player": 0x0821CFEC, "cpu": 0x0821D008},
        },
    },
    "ring": {"bytes_per_tile": 64},
    "native_visuals": {
        "palette_bytes": 0x200,
        "native_palette_offset": 0,
        "static_char_bytes": 0x800,
        "native_static_char_offset": 0x4C00,
        "rewritten_palette_indices": [0, 16, 32, 48],
    },
    "decoder": {
        "iwram_address": 0x03000110,
        "terminal_token": "short back-reference with zero distance",
        "flag_order": "least-significant bit first",
    },
    "method": (
        "Decode each Survival arena's ROM streams with the ARM routine "
        "observed at 0x03000110; compare directly with the corresponding "
        "player/CPU ring bytes in native captured EWRAM."
    ),
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def decode_ring(rom, source_address, maximum_size):
    """Port of the native IWRAM LZ-style decoder at 0x03000110."""
    source_offset = source_address - PARAMETERS["rom_base"]
    source = memoryview(rom)[source_offset:]
    source_pos = 0
    output = bytearray()

    def read_source_byte():
        nonlocal source_pos
        if source_pos >= len(source):
            raise ValueError("Compressed stream ended before its terminator")
        value = source[source_pos]
        source_pos += 1
        return value

    while True:
        flags = read_source_byte()
        for bit in range(8):
            if flags & (1 << bit):
                token = read_source_byte()
                if token >= 0x60:
                    # Native code copies two bytes from output - (0x100-token).
                    distance = 0x100 - token
                    length = 2
                else:
                    distance = ((token & 0x0F) << 8) | read_source_byte()
                    if distance == 0:
                        return bytes(output), source_pos
                    length = (token >> 4) + 3
                    if token >= 0x50:
                        # Long form adds one byte to the length's high nibble.
                        length += read_source_byte()
                if distance > len(output):
                    raise ValueError(
                        f"Invalid back-reference distance {distance} "
                        f"at output offset {len(output)}"
                    )
                for _ in range(length):
                    output.append(output[-distance])
                    if len(output) > maximum_size:
                        raise ValueError(
                            f"Decoded stream exceeds expected size {maximum_size}"
                        )
            else:
                output.append(read_source_byte())
                if len(output) > maximum_size:
                    raise ValueError(
                        f"Decoded stream exceeds expected size {maximum_size}"
                    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rom", type=Path, default=PARAMETERS["rom"])
    parser.add_argument("--stage", choices=tuple(PARAMETERS["stages"]),
                        action="append", help="Decode one arena; repeat to select several")
    args = parser.parse_args()

    rom = args.rom.read_bytes()
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
    out = ROOT / "scripts" / "OUTPUT" / f"eggo-decode-stage-rings_{stamp}"
    out.mkdir(parents=True)
    stages = args.stage or list(PARAMETERS["stages"])
    stage_results = {}
    row_records = []

    for stage in stages:
        stage_source = PARAMETERS["stages"][stage]
        capture_stem = stage_source["capture_dir"] / (
            f"{stage_source['capture_name']}.frame"
            f"{stage_source['capture_frame']:05d}"
        )
        capture_path = Path(str(capture_stem) + ".ram")
        ram = capture_path.read_bytes()
        if len(ram) != 0x40000:
            raise ValueError(f"Unexpected EWRAM capture size: {capture_path}")
        native_stage_id = struct.unpack_from(
            "<I", ram, PARAMETERS["stage_id_address"] - PARAMETERS["ewram_base"]
        )[0]
        if native_stage_id != stage_source["stage_id"]:
            raise AssertionError(
                f"{stage}: expected native stage {stage_source['stage_id']}, "
                f"captured {native_stage_id}"
            )

        native_palette_path = Path(str(capture_stem) + ".0x5000000")
        native_vram_path = Path(str(capture_stem) + ".memory3")
        native_palette = native_palette_path.read_bytes()
        native_vram = native_vram_path.read_bytes()
        if len(native_palette) != 0x400 or len(native_vram) != 0x18000:
            raise ValueError(f"Unexpected palette/VRAM capture size for {stage}")

        config_addresses = stage_source["configs"]
        player_config_offset = config_addresses["player"] - PARAMETERS["rom_base"]
        cpu_config_offset = config_addresses["cpu"] - PARAMETERS["rom_base"]
        palette_address = struct.unpack_from("<I", rom, player_config_offset + 0x0C)[0]
        cpu_palette_address = struct.unpack_from("<I", rom, cpu_config_offset + 0x0C)[0]
        static_char_address = struct.unpack_from("<I", rom, player_config_offset + 0x10)[0]
        cpu_static_char_address = struct.unpack_from("<I", rom, cpu_config_offset + 0x10)[0]
        if palette_address != cpu_palette_address or static_char_address != cpu_static_char_address:
            raise AssertionError(f"{stage}: player/CPU shared visual pointers differ")

        palette_size = PARAMETERS["native_visuals"]["palette_bytes"]
        palette_offset = palette_address - PARAMETERS["rom_base"]
        stage_palette = rom[palette_offset:palette_offset + palette_size]
        captured_palette = native_palette[
            PARAMETERS["native_visuals"]["native_palette_offset"]:
            PARAMETERS["native_visuals"]["native_palette_offset"] + palette_size
        ]
        palette_mismatches = [
            index for index in range(palette_size // 2)
            if stage_palette[index * 2:index * 2 + 2] !=
            captured_palette[index * 2:index * 2 + 2]
        ]
        allowed_palette_mismatches = set(
            PARAMETERS["native_visuals"]["rewritten_palette_indices"]
        )
        if not set(palette_mismatches).issubset(allowed_palette_mismatches):
            raise AssertionError(
                f"{stage}: palette differs outside known transparent slots: "
                f"{palette_mismatches}"
            )
        palette_mismatch_values = [
            {
                "index": index,
                "rom_bgr555": f"0x{int.from_bytes(stage_palette[index * 2:index * 2 + 2], 'little'):04x}",
                "native_bgr555": f"0x{int.from_bytes(captured_palette[index * 2:index * 2 + 2], 'little'):04x}",
            }
            for index in palette_mismatches
        ]
        palette_path = out / f"palette-{stage}.bin"
        palette_path.write_bytes(stage_palette)

        static_char_size = PARAMETERS["native_visuals"]["static_char_bytes"]
        static_char_offset = static_char_address - PARAMETERS["rom_base"]
        static_char_data = rom[static_char_offset:static_char_offset + static_char_size]
        native_static_offset = PARAMETERS["native_visuals"]["native_static_char_offset"]
        if native_vram[native_static_offset:native_static_offset + static_char_size] != static_char_data:
            raise AssertionError(f"{stage}: static character chunk differs from native VRAM")
        static_char_path = out / f"static-char-{stage}.bin"
        static_char_path.write_bytes(static_char_data)
        stage_visuals = {
            "palette_address": f"0x{palette_address:08x}",
            "palette_bytes": palette_size,
            "palette_exact_entries": palette_size // 2 - len(palette_mismatches),
            "palette_native_mismatch_indices": palette_mismatches,
            "palette_native_mismatch_values": palette_mismatch_values,
            "palette_sha256": sha256(stage_palette),
            "palette_capture_sha256": sha256(captured_palette),
            "palette_file": palette_path.name,
            "static_char_address": f"0x{static_char_address:08x}",
            "static_char_bytes": static_char_size,
            "native_vram_offset": f"0x{native_static_offset:04x}",
            "static_char_exact_match": True,
            "static_char_sha256": sha256(static_char_data),
            "static_char_file": static_char_path.name,
        }

        field_results = {}
        for field, object_address in PARAMETERS["field_objects"].items():
            object_offset = object_address - PARAMETERS["ewram_base"]
            config_address = stage_source["configs"][field]
            active_config = struct.unpack_from(
                "<I", ram, object_offset + PARAMETERS["object_config_offset"]
            )[0]
            if active_config != config_address:
                raise AssertionError(
                    f"{stage}/{field}: capture uses config 0x{active_config:08x}, "
                    f"expected 0x{config_address:08x}"
                )

            config_offset = config_address - PARAMETERS["rom_base"]
            width_tiles, rows = struct.unpack_from("<II", rom, config_offset)
            compressed_address = struct.unpack_from("<I", rom, config_offset + 8)[0]
            flags = struct.unpack_from("<I", rom, config_offset + 0x18)[0]
            if not flags & 2:
                raise AssertionError(f"{stage}/{field}: ring decoder flag is absent")
            row_stride = width_tiles * PARAMETERS["ring"]["bytes_per_tile"]
            expected_size = row_stride * rows
            decoded, compressed_bytes = decode_ring(
                rom, compressed_address, expected_size
            )
            ring_address = struct.unpack_from(
                "<I", ram, object_offset + PARAMETERS["object_source_ring_offset"]
            )[0]
            ram_offset = ring_address - PARAMETERS["ewram_base"]
            captured = ram[ram_offset:ram_offset + expected_size]
            if len(decoded) != expected_size or len(captured) != expected_size:
                raise AssertionError(
                    f"{stage}/{field}: ring length decoded={len(decoded)}, "
                    f"captured={len(captured)}, expected={expected_size}"
                )
            if decoded != captured:
                first = next(index for index, (left, right) in
                             enumerate(zip(decoded, captured)) if left != right)
                raise AssertionError(
                    f"{stage}/{field}: native EWRAM differs at offset 0x{first:x}"
                )

            ring_path = out / f"ring-{stage}-{field}.bin"
            ring_path.write_bytes(decoded)
            field_results[field] = {
                "config_address": f"0x{config_address:08x}",
                "compressed_address": f"0x{compressed_address:08x}",
                "ring_address": f"0x{ring_address:08x}",
                "width_tiles": width_tiles,
                "rows": rows,
                "compressed_bytes_consumed": compressed_bytes,
                "decoded_bytes": len(decoded),
                "native_ewram_match": True,
                "decoded_sha256": sha256(decoded),
                "native_ewram_sha256": sha256(captured),
                "output_file": ring_path.name,
            }
            for row in range(rows):
                start = row * row_stride
                row_data = decoded[start:start + row_stride]
                row_records.append({
                    "stage": stage,
                    "stage_id": native_stage_id,
                    "field": field,
                    "row": row,
                    "bytes": len(row_data),
                    "sha256": sha256(row_data),
                })

        stage_results[stage] = {
            "stage_id": native_stage_id,
            "capture_file": str(capture_path),
            "capture_sha256": sha256(ram),
            "native_palette_capture_file": str(native_palette_path),
            "native_palette_capture_sha256": sha256(native_palette),
            "native_vram_capture_file": str(native_vram_path),
            "native_vram_capture_sha256": sha256(native_vram),
            "visual_resources": stage_visuals,
            "fields": field_results,
        }

    def json_value(value):
        if isinstance(value, Path):
            return str(value)
        if isinstance(value, dict):
            return {key: json_value(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [json_value(item) for item in value]
        return value

    parameters = json_value({
        **PARAMETERS,
        "rom": args.rom,
        "rom_bytes": len(rom),
        "rom_sha256": sha256(rom),
        "selected_stages": stages,
        "output_dir": out,
    })
    (out / "parameters.json").write_text(
        json.dumps(parameters, indent=2) + "\n", encoding="utf-8"
    )
    summary = {
        "stages": stage_results,
        "all_rings_match_native_ewram": all(
            field["native_ewram_match"]
            for stage in stage_results.values()
            for field in stage["fields"].values()
        ),
        "all_static_char_chunks_match_native_vram": all(
            stage["visual_resources"]["static_char_exact_match"]
            for stage in stage_results.values()
        ),
        "all_stage_palettes_match_except_native_rewritten_slots": all(
            set(stage["visual_resources"]["palette_native_mismatch_indices"]).issubset(
                set(PARAMETERS["native_visuals"]["rewritten_palette_indices"])
            )
            for stage in stage_results.values()
        ),
        "row_hashes": len(row_records),
        "rings_verified": sum(len(stage["fields"]) for stage in stage_results.values()),
        "output": str(out),
    }
    (out / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    with (out / "row-hashes.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            fieldnames=["stage", "stage_id", "field", "row", "bytes", "sha256"],
        )
        writer.writeheader()
        writer.writerows(row_records)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
