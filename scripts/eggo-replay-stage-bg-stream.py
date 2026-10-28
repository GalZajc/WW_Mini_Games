"""Replay native factory BG3 map and ROM tile streaming against frame captures."""
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
    "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-05_18-51-49_188487",
    "capture_name": "eggo-factory-map-row",
    "first_frame": 1,
    "last_frame": 240,
    "stage_id_address": 0x02003294,
    "global_frame_counter": 0x02011A9C,
    "dma_queue": 0x02011AE8,
    "field_objects": {"player": 0x02003910, "cpu": 0x02004C8C},
    "object_fields": {"camera_position": 0x04, "config_pointer": 0x20, "buffer_rows": 0x24,
                      "camera_scale": 0x2C, "graphics_base": 0x38, "source_base": 0x40,
                      "tile_row_offset": 0x4C,
                      "map_base": 0x34, "tile_base": 0x3C,
                      "backward_map_offset": 0x44, "forward_map_offset": 0x48,
                      "forward_tile_offset": 0x50, "orientation_flag": 0x274,
                      "camera_y": 0x70,
                      "row_records": 0x74, "row_stride": 8},
    "config_fields": {"row_count": 0x04, "row_table_pointer": 0x14},
    "map": {"map_ring_words": 0x400, "map_step_words": 0x20,
            "tile_ring_bytes": 0x4980, "tile_step_bytes": 0x380,
            "visible_tiles": 14, "horizontal_flip_flag": 0x400},
    "stream": {"tile_bytes": 64, "row_stride_bytes": 0x380,
               "row_offset_wrap_threshold": 0x497F, "row_offset_wrap_period": 0x4980,
               "max_rows": 64, "visible_row_lookahead": 0x15, "dma_records": 128},
    "method": "Boots from frame 1 VRAM and replays only the captured ROM-derived map writes and queued tile-row copies; checks against every adjacent native capture.",
}
parser = argparse.ArgumentParser()
parser.add_argument("--rom", type=Path, default=PARAMETERS["rom"])
parser.add_argument("--capture-dir", type=Path, default=PARAMETERS["capture_dir"])
parser.add_argument("--name", default=PARAMETERS["capture_name"])
parser.add_argument("--first-frame", type=int, default=PARAMETERS["first_frame"])
parser.add_argument("--last-frame", type=int, default=PARAMETERS["last_frame"])
args = parser.parse_args()
if args.first_frame < 1 or args.last_frame <= args.first_frame:
    parser.error("Replay needs at least two ordered positive frame numbers")
rom = args.rom.read_bytes()
rom_hash = hashlib.sha256(rom).hexdigest()

def capture(frame, suffix):
    stem = args.capture_dir / f"{args.name}.frame{frame:05d}"
    return Path(str(stem) + suffix).read_bytes()

def u32(data, address):
    return struct.unpack_from("<I", data, address - 0x02000000)[0]

def i32(data, offset):
    return struct.unpack_from("<i", data, offset)[0]

def read_field_config(ram, obj):
    config_pointer = struct.unpack_from("<I", ram, obj + 0x20)[0]
    config_offset = config_pointer - 0x08000000
    count = struct.unpack_from("<I", rom, config_offset + PARAMETERS["config_fields"]["row_count"])[0]
    table = struct.unpack_from("<I", rom, config_offset + PARAMETERS["config_fields"]["row_table_pointer"])[0]
    if count != PARAMETERS["stream"]["max_rows"]:
        raise AssertionError(f"unexpected row count at {config_pointer:#x}: {count}")
    records = []
    for row in range(count):
        ram_at = obj + PARAMETERS["object_fields"]["row_records"] + row * PARAMETERS["object_fields"]["row_stride"]
        rom_at = table - 0x08000000 + row * PARAMETERS["object_fields"]["row_stride"]
        ram_record = ram[ram_at:ram_at + 8]
        rom_record = rom[rom_at:rom_at + 8]
        if ram_record != rom_record:
            raise AssertionError(f"row descriptor differs from ROM at {config_pointer:#x}, row {row}")
        x, width, rate, period = struct.unpack_from("<4B", ram_record)
        pointer_table = struct.unpack_from("<I", ram_record, 4)[0]
        records.append((x, width, rate, period, pointer_table))
    return config_pointer, records

def schedule_stream(ram, frame, counter_override=None, verify_queue=True):
    counter = (u32(ram, PARAMETERS["global_frame_counter"])
               if counter_override is None else counter_override)
    queue_at = PARAMETERS["dma_queue"] - 0x02000000
    queue_count = struct.unpack_from("<I", ram, queue_at)[0]
    queue = {struct.unpack_from("<III", ram, queue_at + 0x0C + index * 12)
             for index in range(min(queue_count, PARAMETERS["stream"]["dma_records"]))}
    copies = []
    for field, info in field_descriptors.items():
        obj = info["object_offset"]
        camera_y = i32(ram, obj + PARAMETERS["object_fields"]["camera_y"])
        row_start = min(64, max(0, camera_y >> 3))
        row_end = min(64, row_start + PARAMETERS["stream"]["visible_row_lookahead"])
        base = struct.unpack_from("<I", ram, obj + PARAMETERS["object_fields"]["graphics_base"])[0]
        row_offset = (struct.unpack_from("<I", ram, obj + PARAMETERS["object_fields"]["tile_row_offset"])[0] +
                      PARAMETERS["stream"]["row_stride_bytes"])
        for row in range(row_start, row_end):
            x, width, rate, period, pointer_table = info["records"][row]
            if width and pointer_table and rate and period:
                while row_offset > PARAMETERS["stream"]["row_offset_wrap_threshold"]:
                    row_offset -= PARAMETERS["stream"]["row_offset_wrap_period"]
                index = (counter // rate) % period
                source = struct.unpack_from("<I", rom,
                                            pointer_table - 0x08000000 + index * 4)[0]
                destination = base + row_offset + x * PARAMETERS["stream"]["tile_bytes"]
                size = width * PARAMETERS["stream"]["tile_bytes"]
                if verify_queue and (source, destination, size) not in queue:
                    raise AssertionError(f"DMA queue mismatch at frame {frame}, {field}, row {row}")
                data = rom[source - 0x08000000:source - 0x08000000 + size]
                copies.append({"issued_frame": frame, "field": field, "row": row,
                               "global_counter": counter, "frame_index": index,
                               "source": source, "destination": destination,
                               "size": size, "data": data})
            row_offset += PARAMETERS["stream"]["row_stride_bytes"]
    return copies

first_ram = capture(args.first_frame, ".ram")
first_vram = capture(args.first_frame, ".memory3")
vram = bytearray(first_vram)
if len(vram) != 0x18000:
    raise ValueError("Unexpected VRAM size in the bootstrap frame")
stage = u32(first_ram, PARAMETERS["stage_id_address"])
if stage != 1:
    raise ValueError(f"Expected the captured factory stage ID 1, got {stage}")
field_descriptors = {}
bootstrap_fields = {}
source_ring_data = {}
for field, address in PARAMETERS["field_objects"].items():
    obj = address - 0x02000000
    config, records = read_field_config(first_ram, obj)
    field_descriptors[field] = {"address": address, "object_offset": obj,
                                "config": config, "records": records}
    offsets = {"camera_position": 0x04, "config_pointer": 0x20, "buffer_rows": 0x24,
               "camera_scale": 0x2C, "map_base": 0x34, "graphics_base": 0x38,
               "tile_base": 0x3C, "source_base": 0x40, "backward_map_offset": 0x44,
               "forward_map_offset": 0x48, "backward_tile_offset": 0x4C,
               "forward_tile_offset": 0x50, "backward_source_offset": 0x54,
               "forward_source_offset": 0x58, "previous_camera_y": 0x6C,
               "camera_y": 0x70}
    bootstrap_fields[field] = {
        "object_address": f"0x{address:08x}",
        "rom_config": f"0x{config:08x}",
        "row_table": f"0x{struct.unpack_from('<I', rom, config - 0x08000000 + PARAMETERS['config_fields']['row_table_pointer'])[0]:08x}",
        "rom_config_words": [f"0x{x:08x}" for x in struct.unpack_from("<8I", rom, config - 0x08000000)],
        "field_values": {key: struct.unpack_from("<i" if key in ("camera_position", "camera_scale") else "<I",
                                                    first_ram, obj + offset)[0]
                         for key, offset in offsets.items()},
    }
    ring_base = bootstrap_fields[field]["field_values"]["source_base"]
    ring_size = bootstrap_fields[field]["field_values"]["buffer_rows"] * PARAMETERS["stream"]["row_stride_bytes"]
    ring_start = ring_base - 0x02000000
    ring_data = first_ram[ring_start:ring_start + ring_size]
    source_ring_data[field] = ring_data
    raw_row_rom_offsets = []
    row_bytes = PARAMETERS["stream"]["row_stride_bytes"]
    for row in range(bootstrap_fields[field]["field_values"]["buffer_rows"]):
        row_data = ring_data[row * row_bytes:(row + 1) * row_bytes]
        location = rom.find(row_data)
        raw_row_rom_offsets.append(f"0x{location:08x}" if location >= 0 else None)
    bootstrap_fields[field]["source_ring"] = {
        "ram_address": f"0x{ring_base:08x}", "size_bytes": len(ring_data),
        "sha256": hashlib.sha256(ring_data).hexdigest(),
        "contiguous_rom_offset": (f"0x{rom.find(ring_data):08x}" if rom.find(ring_data) >= 0 else None),
        "raw_row_rom_offsets": raw_row_rom_offsets,
    }

first_counter = u32(first_ram, PARAMETERS["global_frame_counter"])
initial_stream_copies = schedule_stream(first_ram, args.first_frame)
constructor_stream_copies = schedule_stream(first_ram, args.first_frame,
                                             counter_override=first_counter - 1,
                                             verify_queue=False)

# Replay the ROM constructor's 21 initial rows from its EWRAM source ring.
bootstrap_rows = []
for field, address in PARAMETERS["field_objects"].items():
    obj = address - 0x02000000
    values = bootstrap_fields[field]["field_values"]
    camera_row = values["camera_y"] >> 3
    buffer_bytes = values["buffer_rows"] * PARAMETERS["stream"]["row_stride_bytes"]
    map_offset = ((camera_row + 21) * PARAMETERS["map"]["map_step_words"]) % PARAMETERS["map"]["map_ring_words"]
    tile_offset = ((camera_row + 21) * PARAMETERS["stream"]["row_stride_bytes"]) % PARAMETERS["map"]["tile_ring_bytes"]
    source_offset = ((camera_row + 21) * PARAMETERS["stream"]["row_stride_bytes"]) % buffer_bytes
    mirrored = bool(first_ram[obj + PARAMETERS["object_fields"]["orientation_flag"]])
    for step in range(21):
        map_offset = (map_offset - PARAMETERS["map"]["map_step_words"]) % PARAMETERS["map"]["map_ring_words"]
        tile_offset = (tile_offset - PARAMETERS["stream"]["row_stride_bytes"]) % PARAMETERS["map"]["tile_ring_bytes"]
        source_offset = (source_offset - PARAMETERS["stream"]["row_stride_bytes"]) % buffer_bytes
        first_tile = values["tile_base"] + (tile_offset >> 6)
        entries = ([(first_tile + 13 - index) | PARAMETERS["map"]["horizontal_flip_flag"]
                    for index in range(PARAMETERS["map"]["visible_tiles"])] if mirrored else
                   [first_tile + index for index in range(PARAMETERS["map"]["visible_tiles"])] )
        expected_map = b"".join(struct.pack("<H", value & 0xFFFF) for value in entries)
        map_destination = values["map_base"] + map_offset * 2
        map_start = map_destination - 0x06000000
        native_map = first_vram[map_start:map_start + len(expected_map)]
        source_address = values["source_base"] + source_offset
        source_start = source_address - 0x02000000
        source_data = first_ram[source_start:source_start + PARAMETERS["stream"]["row_stride_bytes"]]
        tile_destination = values["graphics_base"] + tile_offset
        tile_start = tile_destination - 0x06000000
        native_tiles = first_vram[tile_start:tile_start + PARAMETERS["stream"]["row_stride_bytes"]]
        map_match = expected_map == native_map
        tile_match = len(source_data) == PARAMETERS["stream"]["row_stride_bytes"] and source_data == native_tiles
        after_stream = bytearray(source_data)
        overlaid_rows = []
        for copy in constructor_stream_copies:
            overlap_start = max(tile_destination, copy["destination"])
            overlap_end = min(tile_destination + len(after_stream),
                              copy["destination"] + copy["size"])
            if overlap_start < overlap_end:
                target_start = overlap_start - tile_destination
                copy_start = overlap_start - copy["destination"]
                count = overlap_end - overlap_start
                after_stream[target_start:target_start + count] = copy["data"][copy_start:copy_start + count]
                overlaid_rows.append(copy["row"])
        tile_match_after_stream = bytes(after_stream) == native_tiles
        x, width, rate, period, pointer_table = field_descriptors[field]["records"][camera_row + 20 - step]
        matching_stream_indices = []
        if width and pointer_table and rate and period:
            for candidate_index in range(period):
                source = struct.unpack_from("<I", rom,
                                            pointer_table - 0x08000000 + candidate_index * 4)[0]
                destination = tile_destination + x * PARAMETERS["stream"]["tile_bytes"]
                data = rom[source - 0x08000000:source - 0x08000000 +
                           width * PARAMETERS["stream"]["tile_bytes"]]
                candidate = bytearray(source_data)
                begin = destination - tile_destination
                candidate[begin:begin + len(data)] = data
                if bytes(candidate) == native_tiles:
                    matching_stream_indices.append(candidate_index)
        bootstrap_rows.append({
            "field": field, "constructor_step": step,
            "camera_world_row": camera_row + 20 - step,
            "map_offset": map_offset, "tile_offset": tile_offset,
            "source_offset": source_offset,
            "map_destination": f"0x{map_destination:08x}",
            "tile_destination": f"0x{tile_destination:08x}",
            "source_address": f"0x{source_address:08x}",
            "map_entries_match": map_match, "tile_bytes_match": tile_match,
            "stream_rows_overlaid": " ".join(map(str, overlaid_rows)),
            "tile_bytes_match_after_previous_frame_stream": tile_match_after_stream,
            "stream_variant_match_indices": " ".join(map(str, matching_stream_indices)),
        })

pending = [dict(item) for item in initial_stream_copies]
map_rows = []
stream_copies = []
for frame in range(args.first_frame + 1, args.last_frame + 1):
    previous_ram = capture(frame - 1, ".ram")
    ram = capture(frame, ".ram")
    native_vram = capture(frame, ".memory3")
    if u32(ram, PARAMETERS["stage_id_address"]) != stage:
        raise AssertionError(f"stage changed during replay at frame {frame}")

    # The graphics DMA queue issued on the previous update becomes visible now.
    for item in pending:
        destination_offset = item["destination"] - 0x06000000
        vram[destination_offset:destination_offset + item["size"]] = item["data"]
        predicted = bytes(vram[destination_offset:destination_offset + item["size"]])
        native = native_vram[destination_offset:destination_offset + item["size"]]
        match = predicted == native == item["data"]
        item["visible_frame"] = frame
        item["visible_match"] = match
        stream_copies.append(item)
    pending_mismatches = [item for item in pending if not item.get("visible_match")]
    if pending_mismatches:
        first = pending_mismatches[0]
        raise AssertionError(f"queued tile copy did not replay at frame {frame}: {first}")
    pending = []

    for field, info in field_descriptors.items():
        obj = info["object_offset"]
        current_y = i32(ram, obj + PARAMETERS["object_fields"]["camera_y"])
        previous_y = i32(previous_ram, obj + PARAMETERS["object_fields"]["camera_y"])
        delta_rows = (current_y >> 3) - (previous_y >> 3)
        if not delta_rows:
            continue
        forward = delta_rows > 0
        map_field = (PARAMETERS["object_fields"]["forward_map_offset"] if forward else
                     PARAMETERS["object_fields"]["backward_map_offset"])
        tile_field = (PARAMETERS["object_fields"]["forward_tile_offset"] if forward else
                      PARAMETERS["object_fields"]["tile_row_offset"])
        map_offset = struct.unpack_from("<I", previous_ram, obj + map_field)[0]
        tile_offset = struct.unpack_from("<I", previous_ram, obj + tile_field)[0]
        map_base = struct.unpack_from("<I", ram, obj + PARAMETERS["object_fields"]["map_base"])[0]
        tile_base = struct.unpack_from("<I", ram, obj + PARAMETERS["object_fields"]["tile_base"])[0]
        mirrored = bool(ram[obj + PARAMETERS["object_fields"]["orientation_flag"]])
        for step in range(abs(delta_rows)):
            first_tile = tile_base + (tile_offset >> 6)
            if mirrored:
                entries = [(first_tile + 13 - index) | PARAMETERS["map"]["horizontal_flip_flag"]
                           for index in range(PARAMETERS["map"]["visible_tiles"])]
            else:
                entries = [first_tile + index for index in range(PARAMETERS["map"]["visible_tiles"])]
            expected = b"".join(struct.pack("<H", value & 0xFFFF) for value in entries)
            destination = map_base + map_offset * 2
            start = destination - 0x06000000
            vram[start:start + len(expected)] = expected
            native = native_vram[start:start + len(expected)]
            match = expected == native
            map_rows.append({"frame": frame, "field": field, "step": step,
                             "delta_rows": delta_rows, "camera_y": current_y,
                             "map_offset": map_offset, "tile_offset": tile_offset,
                             "destination": f"0x{destination:08x}",
                             "first_tile": first_tile, "mirrored": mirrored,
                             "expected_entries": " ".join(f"0x{x & 0xffff:04x}" for x in entries),
                             "native_entries": " ".join(f"0x{x:04x}" for x in struct.unpack("<14H", native)),
                             "match": match})
            if not match:
                raise AssertionError(f"tile-map row mismatch at frame {frame}, {field}: {map_rows[-1]}")
            direction = 1 if forward else -1
            map_offset = (map_offset + direction * PARAMETERS["map"]["map_step_words"]) % PARAMETERS["map"]["map_ring_words"]
            tile_offset = (tile_offset + direction * PARAMETERS["map"]["tile_step_bytes"]) % PARAMETERS["map"]["tile_ring_bytes"]
        if (map_offset != struct.unpack_from("<I", ram, obj + map_field)[0] or
                tile_offset != struct.unpack_from("<I", ram, obj + tile_field)[0]):
            raise AssertionError(f"map ring offset mismatch at frame {frame}, {field}")

    pending = schedule_stream(ram, frame)

summary = {
    "frames": args.last_frame - args.first_frame,
    "constructor_background_counter": first_counter - 1,
    "constructor_rows_replayed": len(bootstrap_rows),
    "constructor_map_rows_matched": sum(row["map_entries_match"] for row in bootstrap_rows),
    "constructor_tile_rows_matched": sum(row["tile_bytes_match"] for row in bootstrap_rows),
    "constructor_tile_rows_matched_after_previous_frame_stream": sum(
        row["tile_bytes_match_after_previous_frame_stream"] for row in bootstrap_rows),
    "map_rows_replayed": len(map_rows), "map_rows_matched": sum(row["match"] for row in map_rows),
    "stream_copies_replayed": len(stream_copies),
    "stream_copies_matched": sum(item.get("visible_match", False) for item in stream_copies),
    "stream_copies_scheduled": len(stream_copies) + len(pending),
    "unflushed_final_frame_queue": len(pending),
}

out = ROOT / "scripts/OUTPUT" / ("eggo-stage-bg-replay_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
out.mkdir(parents=True, exist_ok=False)
metadata = json.loads((args.capture_dir / f"{args.name}.json").read_text(encoding="utf-8"))
parameters = {**PARAMETERS, "rom": str(args.rom), "rom_sha256": rom_hash,
              "capture_dir": str(args.capture_dir), "capture_name": args.name,
              "first_frame": args.first_frame, "last_frame": args.last_frame,
              "bootstrap_ram_sha256": hashlib.sha256(first_ram).hexdigest(),
              "bootstrap_vram_sha256": hashlib.sha256(first_vram).hexdigest(),
              "capture_metadata_sha256": hashlib.sha256((args.capture_dir / f"{args.name}.json").read_bytes()).hexdigest(),
              "capture_rom_sha256": metadata.get("rom_sha256"),
              "capture_core_sha256": metadata.get("core_sha256")}
(out / "parameters.json").write_text(json.dumps(parameters, indent=2, default=str) + "\n", encoding="utf-8")
(out / "bootstrap-fields.json").write_text(json.dumps(bootstrap_fields, indent=2) + "\n", encoding="utf-8")
for field, data in source_ring_data.items():
    (out / f"source-ring-{field}.bin").write_bytes(data)
with (out / "bootstrap-rows.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=list(bootstrap_rows[0]))
    writer.writeheader()
    writer.writerows(bootstrap_rows)
with (out / "tilemap-rows.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=list(map_rows[0]))
    writer.writeheader()
    writer.writerows(map_rows)
with (out / "stream-copies.csv").open("w", encoding="utf-8", newline="") as stream:
    columns = ["issued_frame", "visible_frame", "field", "row", "global_counter", "frame_index",
               "source", "destination", "size", "visible_match"]
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for item in stream_copies:
        writer.writerow({key: item[key] for key in columns})
summary["output"] = str(out)
(out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
