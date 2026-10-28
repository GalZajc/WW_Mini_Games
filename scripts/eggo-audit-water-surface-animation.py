"""Validate the native 15-frame factory water-surface cycle against captures."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania native water-surface animation cycle audit",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "phase_audit": "scripts/OUTPUT/eggo-native-water-surface-phase_2026-10-08_06-31-44/per-frame-phase-results.csv",
    "reference_capture_frames_by_phase": [1, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54],
    "native_frame_counter_address": "0x02011a9c",
    "phase_formula": "((nativeFrame + 39) modulo 60) floor-divided by 4",
    "period_native_frames": 60,
    "ticks_per_art_frame": 4,
    "checkpoint_prefix": "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.frame00840",
    "checkpoint_label": "frame-840-native-reference",
    "random_seed": None,
    "audio_enabled": False,
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_decoder():
    path = ROOT / "scripts" / "eggo-audit-native-water-surface-phase.py"
    spec = importlib.util.spec_from_file_location("eggo_native_water_phase", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load the native sprite decoder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.decode_surface


def main() -> None:
    decode_surface = load_decoder()
    capture_dir = ROOT / PARAMETERS["capture_directory"]
    phase_path = ROOT / PARAMETERS["phase_audit"]
    with phase_path.open(newline="", encoding="utf-8") as file:
        phase_rows = [row for row in csv.DictReader(file) if row["capture_frame"].isdigit()]

    def prefix_for(frame: int) -> Path:
        return capture_dir / f"{PARAMETERS['capture_prefix']}.frame{frame:05d}"

    atlas_frames = []
    for expected_phase, capture_frame in enumerate(PARAMETERS["reference_capture_frames_by_phase"]):
        native, _, _ = decode_surface(prefix_for(capture_frame))
        if native is None:
            raise ValueError(f"No water-surface OAM pair in reference capture {capture_frame}")
        atlas_frames.append(Image.fromarray(native, "RGBA"))

    rows = []
    for record in phase_rows:
        frame = int(record["capture_frame"])
        native, _, _ = decode_surface(prefix_for(frame))
        if native is None:
            continue
        ram = Path(str(prefix_for(frame)) + ".ram").read_bytes()
        native_frame = struct.unpack_from("<I", ram, 0x11A9C)[0]
        phase = ((native_frame + 39) % 60) // 4
        expected = np.asarray(atlas_frames[phase], dtype=np.uint8)
        different = int(np.count_nonzero(np.any(native != expected, axis=2)))
        image_hash = hashlib.sha256(native.tobytes()).hexdigest()
        rows.append({
            "capture_frame": frame,
            "native_frame": native_frame,
            "predicted_phase": phase,
            "different_pixels": different,
            "native_image_sha256": image_hash,
            "source_atlas_frame": PARAMETERS["reference_capture_frames_by_phase"][phase],
        })

    checkpoint_prefix = ROOT / PARAMETERS["checkpoint_prefix"]
    checkpoint_image, _, _ = decode_surface(checkpoint_prefix)
    if checkpoint_image is None:
        raise ValueError("The frame-840 checkpoint has no water-surface OAM pair")
    checkpoint_ram = Path(str(checkpoint_prefix) + ".ram").read_bytes()
    checkpoint_native_frame = struct.unpack_from("<I", checkpoint_ram, 0x11A9C)[0]
    checkpoint_phase = ((checkpoint_native_frame + 39) % 60) // 4
    checkpoint_expected = np.asarray(atlas_frames[checkpoint_phase], dtype=np.uint8)
    checkpoint_different = int(np.count_nonzero(np.any(checkpoint_image != checkpoint_expected, axis=2)))

    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-water-surface-animation_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    with (output / "frame-phase-validation.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    atlas = Image.new("RGBA", (112, 32 * len(atlas_frames)))
    for phase, frame in enumerate(atlas_frames):
        atlas.alpha_composite(frame, (0, phase * 32))
    atlas.save(output / "derived-15-frame-atlas.png")

    results = {
        "captured_surface_samples": len(rows),
        "exact_phase_predictions": sum(row["different_pixels"] == 0 for row in rows),
        "mismatched_samples": sum(row["different_pixels"] != 0 for row in rows),
        "maximum_different_pixels": max(row["different_pixels"] for row in rows),
        "unique_native_images": len({row["native_image_sha256"] for row in rows}),
        "frame_840_checkpoint": {
            "native_frame": checkpoint_native_frame,
            "predicted_phase": checkpoint_phase,
            "different_pixels": checkpoint_different,
        },
        "phase_formula": PARAMETERS["phase_formula"],
        "derived_atlas_sha256": hashlib.sha256((output / "derived-15-frame-atlas.png").read_bytes()).hexdigest(),
        "audio_enabled": False,
    }
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    parameters = {
        **PARAMETERS,
        "capture_metadata_sha256": sha256(capture_dir / f"{PARAMETERS['capture_prefix']}.json"),
        "phase_audit_sha256": sha256(phase_path),
        "checkpoint_ram_sha256": sha256(Path(str(checkpoint_prefix) + ".ram")),
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **results}, indent=2))


if __name__ == "__main__":
    main()
