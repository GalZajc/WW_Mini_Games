"""Compare the app's progress-portrait placement rule with captured native OAM."""
from __future__ import annotations

from collections import Counter
from datetime import datetime
from pathlib import Path
import csv
import json
import math
import struct


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania progress portrait OAM placement audit",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "initial_ram": "scripts/OUTPUT/eggo-reference_2026-10-07_05-25-02_007845/screen-replay-io.frame00000.ram",
    "frames": 600,
    "actors": {
        "player": {"ram_base": 0x02003BD4, "oam_object": 2},
        "cpu": {"ram_base": 0x02004F50, "oam_object": 3},
    },
    "ram_world_y_offset": 4,
    "native_actor_floor_pixels": 720,
    "pixels_per_cell": 16,
    "default_goal": 37,
    "native_round_height": 47,
    "progress_goal_padding": 7,
    "progress_start": 144,
    "progress_rise": 148,
    "progress_top_minimum": 4,
    "portrait_size": 16,
    "random_seed": None,
    "placement_rule": "native top = max(0, floor(27 * signed_integer_world_y_pixels / 128) - 16), derived from Ghidra routine 0x0801a380",
}


def read_s32(data: bytes, address: int) -> int:
    return struct.unpack_from("<i", data, address - 0x02000000)[0]


def read_oam_y(data: bytes, object_index: int) -> int:
    attr0 = struct.unpack_from("<H", data, object_index * 8)[0]
    return attr0 & 0xFF


def js_round(value: float) -> int:
    return math.floor(value + 0.5)


def main() -> None:
    capture_dir = ROOT / PARAMETERS["capture_directory"]
    goal = PARAMETERS["default_goal"] + (PARAMETERS["native_round_height"] - 47)
    denominator = goal + PARAMETERS["progress_goal_padding"]
    records: list[dict[str, int | float | str]] = []
    by_field: dict[str, list[int]] = {name: [] for name in PARAMETERS["actors"]}
    heights: dict[str, dict[int, float]] = {name: {} for name in PARAMETERS["actors"]}
    world_y_pixels: dict[str, dict[int, int]] = {name: {} for name in PARAMETERS["actors"]}

    start_ram = (ROOT / PARAMETERS["initial_ram"]).read_bytes()
    for field, actor in PARAMETERS["actors"].items():
        world_y_q16 = read_s32(start_ram, actor["ram_base"] + PARAMETERS["ram_world_y_offset"])
        heights[field][0] = (PARAMETERS["native_actor_floor_pixels"] - world_y_q16 / 65536) / PARAMETERS["pixels_per_cell"]
        world_y_pixels[field][0] = world_y_q16 // 65536

    for frame in range(1, PARAMETERS["frames"] + 1):
        prefix = capture_dir / f"eggo-replay-full-graphics.frame{frame:05d}"
        ram = Path(str(prefix) + ".ram").read_bytes()
        oam = Path(str(prefix) + ".0x7000000").read_bytes()
        for field, actor in PARAMETERS["actors"].items():
            world_y_q16 = read_s32(ram, actor["ram_base"] + PARAMETERS["ram_world_y_offset"])
            height_cells = (PARAMETERS["native_actor_floor_pixels"] - world_y_q16 / 65536) / PARAMETERS["pixels_per_cell"]
            heights[field][frame] = height_cells
            world_y_pixels[field][frame] = world_y_q16 // 65536
            center_y = js_round(PARAMETERS["progress_start"] - max(0.0, height_cells) / denominator * PARAMETERS["progress_rise"])
            app_top_y = max(PARAMETERS["progress_top_minimum"], center_y - PARAMETERS["portrait_size"] // 2)
            native_top_y = read_oam_y(oam, actor["oam_object"])
            signed_error = app_top_y - native_top_y
            native_formula_top_y = max(0, (27 * world_y_pixels[field][frame]) // 128 - 16)
            by_field[field].append(signed_error)
            records.append({
                "frame": frame,
                "field": field,
                "world_y_q16": world_y_q16,
                "actor_height_cells": height_cells,
                "native_top_y": native_top_y,
                "native_formula_top_y": native_formula_top_y,
                "native_formula_error_pixels": native_formula_top_y - native_top_y,
                "native_formula_exact": int(native_formula_top_y == native_top_y),
                "app_top_y": app_top_y,
                "signed_error_pixels": signed_error,
                "exact": int(signed_error == 0),
            })

    def app_top(height_cells: float, rounding: str) -> int:
        raw_center = PARAMETERS["progress_start"] - max(0.0, height_cells) / denominator * PARAMETERS["progress_rise"]
        center = math.floor(raw_center) if rounding == "floor" else js_round(raw_center)
        return max(PARAMETERS["progress_top_minimum"], center - PARAMETERS["portrait_size"] // 2)

    for row in records:
        field = str(row["field"])
        frame = int(row["frame"])
        native_top = int(row["native_top_y"])
        for name, offset in (("previous", -1), ("current", 0), ("next", 1)):
            world_y = world_y_pixels[field].get(frame + offset)
            predicted = max(0, (27 * world_y) // 128 - 16) if world_y is not None else None
            key = f"source_{name}"
            row[f"{key}_top_y"] = predicted if predicted is not None else ""
            row[f"{key}_error_pixels"] = predicted - native_top if predicted is not None else ""
            row[f"{key}_exact"] = int(predicted == native_top) if predicted is not None else ""
        for name, offset in (("previous", -1), ("current", 0), ("next", 1)):
            height_cells = heights[field].get(frame + offset)
            for rounding in ("round", "floor"):
                predicted = app_top(height_cells, rounding) if height_cells is not None else None
                key = f"{name}_{rounding}"
                row[f"{key}_app_top_y"] = predicted if predicted is not None else ""
                row[f"{key}_error_pixels"] = predicted - native_top if predicted is not None else ""
                row[f"{key}_exact"] = int(predicted == native_top) if predicted is not None else ""

    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-progress-indicator-audit_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    with (output / "portrait-positions.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)

    summary = {
        "experiment": PARAMETERS["experiment"],
        "frames": PARAMETERS["frames"],
        "compared_positions": len(records),
        "exact_positions": sum(int(row["exact"]) for row in records),
        "source_formula_exact_positions": sum(int(row["native_formula_exact"]) for row in records),
        "source_formula_error_histogram_pixels": {
            str(error): count for error, count in sorted(Counter(
                int(row["native_formula_error_pixels"]) for row in records
            ).items())
        },
        "source_formula_frame_lag_candidates": {
            f"source_{name}": {
                "compared": sum(row[f"source_{name}_error_pixels"] != "" for row in records),
                "exact": sum(row[f"source_{name}_exact"] == 1 for row in records),
                "error_histogram_pixels": {
                    str(error): count for error, count in sorted(Counter(
                        int(row[f"source_{name}_error_pixels"])
                        for row in records if row[f"source_{name}_error_pixels"] != ""
                    ).items())
                },
            }
            for name in ("previous", "current", "next")
        },
        "error_histograms_pixels": {
            field: {str(error): count for error, count in sorted(Counter(errors).items())}
            for field, errors in by_field.items()
        },
        "mean_signed_error_pixels": {
            field: sum(errors) / len(errors) for field, errors in by_field.items()
        },
        "max_absolute_error_pixels": {
            field: max(abs(error) for error in errors) for field, errors in by_field.items()
        },
        "lag_and_rounding_candidates": {
            key: {
                "compared": sum(row[f"{key}_error_pixels"] != "" for row in records),
                "exact": sum(row[f"{key}_exact"] == 1 for row in records),
                "error_histogram_pixels": {
                    str(error): count for error, count in sorted(Counter(
                        int(row[f"{key}_error_pixels"])
                        for row in records if row[f"{key}_error_pixels"] != ""
                    ).items())
                },
            }
            for key in ("previous_round", "previous_floor", "current_round", "current_floor", "next_round", "next_floor")
        },
        "first_source_formula_mismatches": [row for row in records if row["native_formula_error_pixels"] != 0][:12],
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    (output / "parameters.json").write_text(json.dumps({
        **PARAMETERS,
        "resolved_goal": goal,
        "output_directory": output.relative_to(ROOT).as_posix(),
    }, indent=2) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        key: value for key, value in summary.items()
        if key not in {
            "error_histograms_pixels", "mean_signed_error_pixels", "max_absolute_error_pixels",
            "lag_and_rounding_candidates", "first_source_formula_mismatches",
        }
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
