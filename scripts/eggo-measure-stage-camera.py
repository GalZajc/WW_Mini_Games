"""Measure native stage camera objects against the GBA's BG3 scroll registers."""
from datetime import datetime
from pathlib import Path
import argparse
import csv
import hashlib
import json
import struct
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "capture_dir": ROOT / "scripts/OUTPUT/eggo-reference_2026-10-05_18-51-49_188487",
    "capture_name": "eggo-factory-map-row",
    "first_frame": 1,
    "last_frame": 240,
    "stage_id_address": 0x02003294,
    "field_objects": {"player": 0x02003910, "cpu": 0x02004C8C},
    "actor_world_y_addresses": {"player": 0x02003BD8, "cpu": 0x02004F54},
    "object_fields": {"camera_position": 0x04, "camera_scale": 0x2C, "graphics_base": 0x38,
                      "tile_base": 0x3C, "map_base": 0x34, "backward_map_offset": 0x44,
                      "forward_map_offset": 0x48, "backward_tile_offset": 0x4C,
                      "forward_tile_offset": 0x50, "camera_y": 0x70,
                      "orientation_flag": 0x274},
    "io_registers": {"bg3_control": 0x0E, "bg3_hofs": 0x1C, "bg3_vofs": 0x1E},
    "native_baseline_world_y": 720.0440673828125,
    "pixels_per_height_unit": 16,
    "rom": Path("C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba"),
    "meaning": "Compares exact object fixed-point camera Y with BG3 register scroll and actor world Y.",
}
parser = argparse.ArgumentParser()
parser.add_argument("--capture-dir", type=Path, default=PARAMETERS["capture_dir"])
parser.add_argument("--name", default=PARAMETERS["capture_name"])
parser.add_argument("--first-frame", type=int, default=PARAMETERS["first_frame"])
parser.add_argument("--last-frame", type=int, default=PARAMETERS["last_frame"])
args = parser.parse_args()
if args.first_frame < 1 or args.last_frame < args.first_frame:
    parser.error("Frame range must be positive and ordered")

capture_metadata_path = args.capture_dir / f"{args.name}.json"
capture_metadata = json.loads(capture_metadata_path.read_text(encoding="utf-8"))
rows = []
control_values = set()
stage_values = set()
for frame in range(args.first_frame, args.last_frame + 1):
    stem = args.capture_dir / f"{args.name}.frame{frame:05d}"
    ram_path, io_path = Path(str(stem) + ".ram"), Path(str(stem) + ".0x4000000")
    ram, io = ram_path.read_bytes(), io_path.read_bytes()
    stage_id = struct.unpack_from("<I", ram, PARAMETERS["stage_id_address"] - 0x02000000)[0]
    stage_values.add(stage_id)
    bg3_control, hofs, vofs = (
        struct.unpack_from("<H", io, PARAMETERS["io_registers"][key])[0]
        for key in ("bg3_control", "bg3_hofs", "bg3_vofs"))
    control_values.add(bg3_control)
    global_counter = struct.unpack_from("<I", ram, 0x02011A9C - 0x02000000)[0]
    for field, object_address in PARAMETERS["field_objects"].items():
        obj = object_address - 0x02000000
        camera_position = struct.unpack_from("<i", ram, obj + PARAMETERS["object_fields"]["camera_position"])[0]
        camera_scale = struct.unpack_from("<i", ram, obj + PARAMETERS["object_fields"]["camera_scale"])[0]
        camera_y = struct.unpack_from("<i", ram, obj + PARAMETERS["object_fields"]["camera_y"])[0]
        object_state = {
            key: (ram[obj + offset] if key == "orientation_flag" else
                  struct.unpack_from("<I", ram, obj + offset)[0])
            for key, offset in PARAMETERS["object_fields"].items()
            if key not in ("camera_position", "camera_scale", "camera_y")
        }
        calculated_y = (camera_position * camera_scale) >> 32
        if camera_y != calculated_y:
            raise AssertionError(f"fixed-point camera mismatch at frame {frame}, field {field}")
        world_y = struct.unpack_from("<i", ram,
                                     PARAMETERS["actor_world_y_addresses"][field] - 0x02000000)[0] / 65536
        actor_height = (PARAMETERS["native_baseline_world_y"] - world_y) / PARAMETERS["pixels_per_height_unit"]
        rows.append({
            "frame": frame, "stage_id": stage_id, "global_counter": global_counter,
            "field": field, "actor_world_y": world_y, "actor_height_units": actor_height,
            "camera_position_q16": camera_position, "camera_scale_q16": camera_scale,
            "camera_y": camera_y, "computed_camera_y": calculated_y,
            **{key: f"0x{value:08x}" if key.endswith("base") else value
               for key, value in object_state.items()},
            "camera_y_mod_256": camera_y % 256, "bg3_control": f"0x{bg3_control:04x}",
            "bg3_hofs": hofs, "bg3_vofs": vofs,
            "bg3_vofs_matches_camera_y_mod_256": vofs == camera_y % 256,
            "ram_sha256": hashlib.sha256(ram).hexdigest(),
            "io_sha256": hashlib.sha256(io).hexdigest(),
        })

cpu_by_frame = {row["frame"]: row for row in rows if row["field"] == "cpu"}
for row in rows:
    previous_cpu = cpu_by_frame.get(row["frame"] - 1)
    row["previous_cpu_camera_y_mod_256"] = (
        previous_cpu["camera_y_mod_256"] if previous_cpu else None)
    row["bg3_vofs_matches_previous_cpu_camera"] = bool(
        previous_cpu and row["bg3_control"] == previous_cpu["bg3_control"] == "0x1f87" and
        row["bg3_vofs"] == previous_cpu["camera_y_mod_256"])

out = ROOT / "scripts/OUTPUT" / ("eggo-stage-camera_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
out.mkdir(parents=True, exist_ok=False)
parameters = {**PARAMETERS, "capture_dir": str(args.capture_dir), "capture_name": args.name,
              "first_frame": args.first_frame, "last_frame": args.last_frame,
              "capture_metadata_sha256": hashlib.sha256(capture_metadata_path.read_bytes()).hexdigest(),
              "capture_rom_sha256": capture_metadata.get("rom_sha256"),
              "capture_core_sha256": capture_metadata.get("core_sha256")}
(out / "parameters.json").write_text(json.dumps(parameters, indent=2, default=str) + "\n", encoding="utf-8")
with (out / "camera-registers.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
by_field = {}
for field in PARAMETERS["field_objects"]:
    field_rows = [row for row in rows if row["field"] == field]
    offsets = Counter((row["bg3_vofs"] - row["camera_y_mod_256"]) % 256 for row in field_rows)
    by_field[field] = {
        "comparisons": len(field_rows),
        "bg3_vofs_matches_camera_y_mod_256": sum(row["bg3_vofs_matches_camera_y_mod_256"] for row in field_rows),
        "most_common_vofs_minus_camera_y_mod_256": [
            {"offset": offset, "count": count} for offset, count in offsets.most_common(8)],
        "first_samples": [{key: row[key] for key in (
            "frame", "actor_height_units", "camera_y", "camera_y_mod_256", "bg3_vofs", "bg3_control")}
                           for row in field_rows[:4]],
    }
summary = {
    "frames": args.last_frame - args.first_frame + 1,
    "stage_ids": sorted(stage_values),
    "bg3_control_values": [f"0x{value:04x}" for value in sorted(control_values)],
    "camera_register_matches": sum(row["bg3_vofs_matches_camera_y_mod_256"] for row in rows),
    "camera_register_comparisons": len(rows),
    "bg3_vofs_matches_previous_cpu_camera": sum(
        row["bg3_vofs_matches_previous_cpu_camera"] and row["field"] == "cpu" for row in rows),
    "previous_cpu_camera_comparisons": sum(
        row["field"] == "cpu" and row["previous_cpu_camera_y_mod_256"] is not None and
        row["bg3_control"] == "0x1f87" and
        cpu_by_frame[row["frame"] - 1]["bg3_control"] == "0x1f87"
        for row in rows),
    "by_field": by_field,
    "output": str(out),
}
(out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
