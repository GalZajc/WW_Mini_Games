"""Search captured GBA RAM for a scalar clock matching native water OBJ art."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json
import struct

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania native water-surface clock audit",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "phase_audit": "scripts/OUTPUT/eggo-native-water-surface-phase_2026-10-08_06-31-44/per-frame-phase-results.csv",
    "phase_sample_rule": "all captured player-water frames whose native 112x32 sprite exactly equals at least one frame in the current atlas",
    "checkpoint_prefix": "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.frame00840",
    "checkpoint_label": "native frame 1403, exact OBJ atlas phase 0",
    "memory_regions": [
        {"name": "EWRAM", "base": "0x02000000", "suffix": ".ram"},
        {"name": "IWRAM", "base": "0x03000000", "suffix": ".0x3000000"},
    ],
    "native_frame_counter_address": "0x02011a9c",
    "candidate_width_bytes": [1, 2, 4],
    "counter_shifts_bits": "all shifts retaining at least five bits",
    "candidate_rule": "((RAM_value >> shift) - phase_delta) modulo 32 belongs to every exact-atlas native art phase set; also checkpoint-tested where a dump exists",
    "required_checkpoint_phase": 0,
    "audio_enabled": False,
    "random_seed": None,
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    capture_dir = ROOT / PARAMETERS["capture_directory"]
    phase_path = ROOT / PARAMETERS["phase_audit"]
    with phase_path.open(newline="", encoding="utf-8") as file:
        phase_rows = {int(row["capture_frame"]): row for row in csv.DictReader(file)
                      if row["capture_frame"].isdigit()}

    capture_frames = sorted(
        int(row["capture_frame"])
        for row in phase_rows.values()
        if row["capture_frame"].isdigit() and int(row["different_sprite_pixels"]) == 0
    )
    if not capture_frames:
        raise ValueError("The phase audit contains no exact atlas-matching capture frames")
    allowed_phases = np.zeros((len(capture_frames), 32), dtype=bool)
    native_frames = []
    for row_index, capture_frame in enumerate(capture_frames):
        row = phase_rows[capture_frame]
        phase_set = [int(value) for value in row["best_atlas_phases"].split(";")]
        allowed_phases[row_index, phase_set] = True
        stem = capture_dir / f"{PARAMETERS['capture_prefix']}.frame{capture_frame:05d}"
        ram = Path(str(stem) + ".ram").read_bytes()
        native_frames.append(struct.unpack_from("<I", ram, 0x11A9C)[0])

    candidates = []
    frame_indices = np.arange(len(capture_frames), dtype=np.int32)[:, None]

    regions = []
    checkpoint_prefix = ROOT / PARAMETERS["checkpoint_prefix"]
    for region in PARAMETERS["memory_regions"]:
        ram_frames = []
        for capture_frame in capture_frames:
            stem = capture_dir / f"{PARAMETERS['capture_prefix']}.frame{capture_frame:05d}"
            ram_frames.append(Path(str(stem) + region["suffix"]).read_bytes())
        checkpoint_path = Path(str(checkpoint_prefix) + region["suffix"])
        checkpoint = checkpoint_path.read_bytes() if checkpoint_path.is_file() else None
        ram_base = int(region["base"], 16)
        region_start = len(candidates)
        for width in PARAMETERS["candidate_width_bytes"]:
            dtype = {1: np.dtype("u1"), 2: np.dtype("<u2"), 4: np.dtype("<u4")}[width]
            stacked = np.stack([np.frombuffer(ram, dtype=dtype) for ram in ram_frames])
            bit_count = width * 8
            for shift in range(bit_count - 4):
                values = (stacked >> shift) & 31
                for first_phase in np.flatnonzero(allowed_phases[0]):
                    delta = (values[0] - first_phase) & 31
                    phase_values = (values - delta[None, :]) & 31
                    matches = allowed_phases[frame_indices, phase_values]
                    exact = np.flatnonzero(matches.all(axis=0))
                    for element_index in exact:
                        offset = int(element_index) * width
                        candidate_delta = int(delta[element_index])
                        checkpoint_value = None
                        predicted_phase = None
                        matches_checkpoint = None
                        if checkpoint is not None:
                            checkpoint_value = int.from_bytes(
                                checkpoint[offset:offset + width], "little", signed=False)
                            predicted_phase = int(((checkpoint_value >> shift) - candidate_delta) & 31)
                            matches_checkpoint = predicted_phase == PARAMETERS["required_checkpoint_phase"]
                        initial_value = int.from_bytes(
                            ram_frames[0][offset:offset + width], "little", signed=False)
                        final_value = int.from_bytes(
                            ram_frames[-1][offset:offset + width], "little", signed=False)
                        candidates.append({
                            "ram_region": region["name"],
                            "checkpoint_dump_available": checkpoint is not None,
                            "matches_checkpoint_phase": matches_checkpoint,
                            "ram_address": hex(ram_base + offset),
                            "ram_offset": hex(offset),
                            "width_bytes": width,
                            "shift_bits": shift,
                            "phase_delta": candidate_delta,
                            "initial_value": initial_value,
                            "final_value": final_value,
                            "checkpoint_value": checkpoint_value,
                            "predicted_checkpoint_phase": predicted_phase,
                            "matched_capture_frames": len(capture_frames),
                        })
        regions.append({
            "name": region["name"],
            "base": region["base"],
            "capture_bytes_per_frame": len(ram_frames[0]),
            "checkpoint_bytes": len(checkpoint) if checkpoint is not None else None,
            "checkpoint_validation_available": checkpoint is not None,
            "exact_art_phase_candidates": len(candidates) - region_start,
            "checkpoint_phase_matches": sum(
                candidate["matches_checkpoint_phase"] is True for candidate in candidates[region_start:]),
        })

    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-native-water-surface-clock_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    fieldnames = list(candidates[0]) if candidates else [
        "ram_region", "checkpoint_dump_available", "matches_checkpoint_phase", "ram_address", "ram_offset", "width_bytes", "shift_bits", "phase_delta",
        "initial_value", "final_value", "checkpoint_value", "predicted_checkpoint_phase",
        "matched_capture_frames",
    ]
    with (output / "candidate-clocks.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(candidates)

    results = {
        "capture_frames_checked": len(capture_frames),
        "memory_regions_scanned": regions,
        "candidate_clocks_matching_all_exact_art_samples": len(candidates),
        "checkpoint_validated_candidates": sum(candidate["matches_checkpoint_phase"] is True for candidate in candidates),
        "native_frames": [native_frames[0], native_frames[-1]],
        "checkpoint_required_phase": PARAMETERS["required_checkpoint_phase"],
        "candidate_limit": (
            "Scans aligned EWRAM and IWRAM 1-, 2-, and 4-byte values and fixed bit shifts. "
            "It will not find a clock derived from multiple fields, arithmetic state, "
            "or a timer that resets between the two captures."
        ),
        "audio_enabled": False,
    }
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    parameters = {
        **PARAMETERS,
        "capture_memory_sha256": {
            region["name"]: {
                "first": sha256(Path(str(capture_dir / f"{PARAMETERS['capture_prefix']}.frame{capture_frames[0]:05d}") + region["suffix"])),
                "last": sha256(Path(str(capture_dir / f"{PARAMETERS['capture_prefix']}.frame{capture_frames[-1]:05d}") + region["suffix"])),
            }
            for region in PARAMETERS["memory_regions"]
        },
        "phase_audit_sha256": sha256(phase_path),
        "checkpoint_memory_sha256": {
            region["name"]: sha256(path) if path.is_file() else None
            for region in PARAMETERS["memory_regions"]
            for path in [Path(str(checkpoint_prefix) + region["suffix"])]
        },
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **results,
                      "candidates": candidates[:20]}, indent=2))


if __name__ == "__main__":
    main()
