"""Trace the native player's ROM animation-table selection from captured RAM."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import struct
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CAPTURE = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
DEFAULT_POSES = ROOT / "scripts/OUTPUT/eggo-actor-pose-parity_2026-10-08_10-50-28/poses.csv"
DEFAULT_ROM = Path(r"C:\Users\galza\Igre\nintendo\gba\Eggo Mania (E) (M6).gba")
ROM_BASE = 0x08000000
FIELD_OFFSETS = {
    "animation_root": 0x838,
    "animation_state": 0x840,
    "animation_period": 0x848,
    "animation_table": 0x84C,
    "animation_frame": 0x850,
    "selector": 0x854,
    "selector_state": 0x858,
    "phase": 0x85C,
    "phase_step": 0x860,
    "flags": 0x86C,
    "actor_state": 0x874,
    "next_actor_state": 0x878,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_u32(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        return 0
    return struct.unpack_from("<I", data, offset)[0]


def rom_offset(address: int, rom_size: int) -> int | None:
    offset = address - ROM_BASE
    return offset if 0 <= offset < rom_size else None


def table_frame_indices(rom: bytes, table_address: int, frame_address: int, limit: int) -> list[int]:
    table_offset = rom_offset(table_address, len(rom))
    if table_offset is None:
        return []
    matches = []
    for index in range(limit):
        offset = table_offset + index * 4
        if offset + 4 > len(rom):
            break
        value = read_u32(rom, offset)
        if value == frame_address:
            matches.append(index)
        # ROM animation resources use pointers into the ROM image. Stop once the
        # scan leaves the contiguous pointer list, rather than decoding data as entries.
        if not ROM_BASE <= value < ROM_BASE + len(rom):
            break
    return matches


def load_pose_rows(path: Path) -> dict[int, dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return {
            int(row["frame"]): row
            for row in csv.DictReader(stream)
            if row.get("side") == "player"
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-dir", type=Path, default=DEFAULT_CAPTURE)
    parser.add_argument("--capture-prefix", default="eggo-replay-full-graphics")
    parser.add_argument("--poses-csv", type=Path, default=DEFAULT_POSES)
    parser.add_argument("--rom", type=Path, default=DEFAULT_ROM)
    parser.add_argument("--actor-base", type=lambda value: int(value, 0), default=0x3BD4)
    parser.add_argument("--table-search-entries", type=int, default=48)
    args = parser.parse_args()

    capture_dir = args.capture_dir.resolve()
    poses_path = args.poses_csv.resolve()
    rom_path = args.rom.resolve()
    for path in (capture_dir, poses_path, rom_path):
        if not path.exists():
            raise FileNotFoundError(path)

    rom = rom_path.read_bytes()
    poses = load_pose_rows(poses_path)
    ram_files = sorted(capture_dir.glob(f"{args.capture_prefix}.frame*.ram"))
    if not ram_files:
        raise FileNotFoundError(f"No per-frame RAM captures found in {capture_dir}")

    rows: list[dict[str, object]] = []
    states: Counter[tuple[object, ...]] = Counter()
    table_frames: dict[tuple[int, int, int], Counter[tuple[str, str, str]]] = defaultdict(Counter)
    for ram_path in ram_files:
        suffix = ram_path.name.removeprefix(f"{args.capture_prefix}.frame").removesuffix(".ram")
        frame_number = int(suffix)
        pose = poses.get(frame_number, {})
        ram = ram_path.read_bytes()
        frame_data = {
            name: read_u32(ram, args.actor_base + offset)
            for name, offset in FIELD_OFFSETS.items()
        }

        root_offset = rom_offset(frame_data["animation_root"], len(rom))
        descriptor = read_u32(rom, root_offset + frame_data["animation_state"] * 4) if root_offset is not None else 0
        descriptor_offset = rom_offset(descriptor, len(rom)
        ) if descriptor else None
        descriptor_period = read_u32(rom, descriptor_offset) if descriptor_offset is not None else 0
        descriptor_table = read_u32(rom, descriptor_offset + 4) if descriptor_offset is not None else 0
        indices = table_frame_indices(
            rom, frame_data["animation_table"], frame_data["animation_frame"], args.table_search_entries
        )
        phase = frame_data["phase"]
        phase_step = frame_data["phase_step"]
        phase_modulus = descriptor_period << 16
        phase_index_current = (phase >> 16) % descriptor_period if descriptor_period else ""
        phase_before_oam = (phase - phase_step) % phase_modulus if phase_modulus else 0
        phase_index_before_oam = (phase_before_oam >> 16) if phase_modulus else ""
        asset_source = pose.get("native_pose_source", "")
        asset_row = pose.get("native_pose_row", "")
        asset_frame = pose.get("native_pose_frame", "")
        app_pose_state = pose.get("app_pose_state", "")
        actual_table = frame_data["animation_table"]
        frame_index = indices[0] if indices else ""
        row = {
            "frame": frame_number,
            **{key: f"0x{value:08x}" for key, value in frame_data.items()},
            "descriptor": f"0x{descriptor:08x}" if descriptor else "",
            "descriptor_period": descriptor_period,
            "descriptor_table": f"0x{descriptor_table:08x}" if descriptor_table else "",
            "descriptor_table_delta_bytes": actual_table - descriptor_table if descriptor_table else "",
            "descriptor_table_matches": actual_table == descriptor_table if descriptor_table else "",
            "frame_indices": ";".join(map(str, indices)),
            "frame_index": frame_index,
            "phase_index_current": phase_index_current,
            "phase_index_before_oam": phase_index_before_oam,
            "phase_index_matches_frame_pointer": (
                phase_index_before_oam == frame_index if indices and phase_modulus else ""
            ),
            "native_pose_source": asset_source,
            "native_pose_row": asset_row,
            "native_pose_frame": asset_frame,
            "native_pose_candidates": pose.get("native_pose_candidates", ""),
            "native_pose_identified": pose.get("native_pose_identified", ""),
            "app_pose_state": app_pose_state,
            "app_pose_row": pose.get("app_pose_row", ""),
            "app_pose_frame": pose.get("app_pose_frame", ""),
            "app_pose_matches_native": pose.get("app_pose_matches_native_mask", ""),
        }
        rows.append(row)
        state_key = (
            frame_data["animation_state"], frame_data["selector"], frame_data["selector_state"],
            actual_table, descriptor_table, app_pose_state, asset_source, asset_row,
        )
        states[state_key] += 1
        if indices:
            table_frames[(frame_data["animation_state"], actual_table, indices[0])][
                (asset_source, asset_row, asset_frame)
            ] += 1

    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-native-player-animation-tables_{stamp}"
    output.mkdir(parents=True, exist_ok=False)

    with (output / "frames.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    with (output / "state-summary.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        fields = [
            "animation_state", "selector", "selector_state", "actual_table", "descriptor_table",
            "app_pose_state", "native_pose_source", "native_pose_row", "frames",
        ]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for key, count in sorted(states.items(), key=lambda item: (item[0][0], item[0][1], item[0][3], item[0][5])):
            state, selector, selector_state, table, descriptor_table, app_state, source, art_row = key
            writer.writerow({
                "animation_state": state,
                "selector": selector,
                "selector_state": selector_state,
                "actual_table": f"0x{table:08x}",
                "descriptor_table": f"0x{descriptor_table:08x}",
                "app_pose_state": app_state,
                "native_pose_source": source,
                "native_pose_row": art_row,
                "frames": count,
            })

    with (output / "table-frames.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        fields = ["animation_state", "actual_table", "frame_index", "native_pose_source", "native_pose_row", "native_pose_frame", "frames"]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for (state, table, frame_index), assets in sorted(table_frames.items()):
            for (source, art_row, art_frame), count in sorted(assets.items()):
                writer.writerow({
                    "animation_state": state,
                    "actual_table": f"0x{table:08x}",
                    "frame_index": frame_index,
                    "native_pose_source": source,
                    "native_pose_row": art_row,
                    "native_pose_frame": art_frame,
                    "frames": count,
                })

    # The actor OAM is assembled before the animation handler advances RAM.
    # Therefore the OAM in capture frame N uses the frame resource pointer
    # left in RAM by frame N-1. Keep this mapping keyed by all three native
    # values: animation state, selected table and frame resource pointer.
    pose_pointer_map: dict[tuple[str, str, str], Counter[tuple[str, str, str, str, str]]] = defaultdict(Counter)
    pose_pointer_samples: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    pose_index_map: dict[tuple[str, str, str], Counter[tuple[str, str, str, str, str]]] = defaultdict(Counter)
    pose_index_samples: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for row in rows:
        oam_pose = poses.get(int(row["frame"]) + 1, {})
        if oam_pose.get("native_pose_identified") != "True":
            continue
        key = (str(row["animation_state"]), str(row["animation_table"]), str(row["animation_frame"]))
        index_key = (str(row["animation_state"]), str(row["animation_table"]), str(row["frame_index"]))
        pose_key = (
            str(oam_pose.get("native_pose_source", "")),
            str(oam_pose.get("native_pose_row", "")),
            str(oam_pose.get("native_pose_frame", "")),
            str(oam_pose.get("native_hflip_x", "")),
            str(oam_pose.get("native_vflip_y", "")),
        )
        pose_pointer_map[key][pose_key] += 1
        pose_pointer_samples[key].append(int(row["frame"]) + 1)
        pose_index_map[index_key][pose_key] += 1
        pose_index_samples[index_key].append(int(row["frame"]) + 1)

    pointer_map_fields = [
        "animation_state", "animation_table", "animation_frame_pointer",
        "oam_pose_source", "oam_pose_row", "oam_pose_frame", "native_hflip_x",
        "native_vflip_y", "sample_frames", "sample_count", "unique_pose_count", "unique_art_count",
    ]
    with (output / "animation-oam-pointer-map.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=pointer_map_fields)
        writer.writeheader()
        for key, assets in sorted(pose_pointer_map.items()):
            for (source, art_row, art_frame, hflip, vflip), count in sorted(assets.items()):
                writer.writerow({
                    "animation_state": key[0],
                    "animation_table": key[1],
                    "animation_frame_pointer": key[2],
                    "oam_pose_source": source,
                    "oam_pose_row": art_row,
                    "oam_pose_frame": art_frame,
                    "native_hflip_x": hflip,
                    "native_vflip_y": vflip,
                    "sample_frames": ";".join(map(str, pose_pointer_samples[key])),
                    "sample_count": count,
                    "unique_pose_count": len(assets),
                    "unique_art_count": len({pose[:3] for pose in assets}),
                })

    index_map_fields = [
        "animation_state", "animation_table", "frame_index", "oam_pose_source",
        "oam_pose_row", "oam_pose_frame", "native_hflip_x", "native_vflip_y",
        "sample_frames", "sample_count", "unique_pose_count", "unique_art_count",
    ]
    with (output / "animation-oam-index-map.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=index_map_fields)
        writer.writeheader()
        for key, assets in sorted(pose_index_map.items()):
            for (source, art_row, art_frame, hflip, vflip), count in sorted(assets.items()):
                writer.writerow({
                    "animation_state": key[0],
                    "animation_table": key[1],
                    "frame_index": key[2],
                    "oam_pose_source": source,
                    "oam_pose_row": art_row,
                    "oam_pose_frame": art_frame,
                    "native_hflip_x": hflip,
                    "native_vflip_y": vflip,
                    "sample_frames": ";".join(map(str, pose_index_samples[key])),
                    "sample_count": count,
                    "unique_pose_count": len(assets),
                    "unique_art_count": len({pose[:3] for pose in assets}),
                })

    identified = [row for row in rows if row["native_pose_identified"] == "True"]
    mismatches = [row for row in identified if row["app_pose_matches_native"] == "False"]
    summary = {
        "experiment": "Eggo Mania native player animation table audit",
        "frame_count": len(rows),
        "player_actor_base": f"0x{args.actor_base:08x}",
        "animation_fields": {key: f"0x{value:x}" for key, value in FIELD_OFFSETS.items()},
        "identified_native_pose_frames": len(identified),
        "identified_app_pose_mismatches": len(mismatches),
        "unique_animation_states": sorted({int(row["animation_state"], 16) for row in rows}),
        "distinct_actual_tables": sorted({row["animation_table"] for row in rows}),
        "descriptor_table_match_frames": sum(row["descriptor_table_matches"] is True for row in rows),
        "descriptor_table_mismatch_frames": sum(row["descriptor_table_matches"] is False for row in rows),
        "frames_without_a_table_index_match": sum(not row["frame_indices"] for row in rows),
        "phase_previous_index_matches_frame_pointer": sum(
            row["phase_index_matches_frame_pointer"] is True for row in rows
        ),
        "phase_index_compared_frames": sum(bool(row["frame_indices"]) and bool(row["descriptor_period"]) for row in rows),
        "animation_oam_pointer_keys": len(pose_pointer_map),
        "animation_oam_pointer_keys_with_one_art_cell": sum(
            len({pose[:3] for pose in assets}) == 1 for assets in pose_pointer_map.values()
        ),
        "animation_oam_pointer_keys_with_multiple_art_cells": sum(
            len({pose[:3] for pose in assets}) > 1 for assets in pose_pointer_map.values()
        ),
        "animation_oam_pointer_keys_with_multiple_hflip_values": sum(
            len({pose[3] for pose in assets}) > 1 for assets in pose_pointer_map.values()
        ),
        "animation_oam_pointer_samples": sum(sum(assets.values()) for assets in pose_pointer_map.values()),
        "animation_oam_index_keys": len(pose_index_map),
        "animation_oam_index_keys_with_one_art_cell": sum(
            len({pose[:3] for pose in assets}) == 1 for assets in pose_index_map.values()
        ),
        "animation_oam_index_keys_with_multiple_art_cells": sum(
            len({pose[:3] for pose in assets}) > 1 for assets in pose_index_map.values()
        ),
        "animation_oam_index_samples": sum(sum(assets.values()) for assets in pose_index_map.values()),
        "note": "The captured ROM frame pointer index matches the previous 16.16 phase modulo the animation period on every frame. Native OAM images map to the prior RAM frame pointer when keyed by animation state and table. This audit does not inject native state or art into runtime rendering.",
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    parameters = {
        "experiment": summary["experiment"],
        "capture_directory": str(capture_dir),
        "capture_prefix": args.capture_prefix,
        "poses_csv": str(poses_path),
        "source_rom": str(rom_path),
        "rom_sha256": sha256(rom_path),
        "poses_csv_sha256": sha256(poses_path),
        "actor_base": f"0x{args.actor_base:08x}",
        "table_search_entries": args.table_search_entries,
        "oam_pointer_capture_lag_frames": 1,
        "audio_output": "No Electron or audio playback is used by this offline audit.",
        "random_seed": None,
        "output": str(output),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**summary, "output": str(output)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
