"""Match 8x8 OAM art from the Hard replay against the native boots pickup capture."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import hashlib
import importlib.util
import json
import struct

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
TIMELINE_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-native-oam-timeline_2026-10-08_04-14-24"
BOOTS_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_19-42-07_494679"
BOOTS_PREFIX = "boots-catch-framewise"
FIRST_FRAME = 1
LAST_FRAME = 50
RAM_BASE = 0x02000000


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_compositor", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load OAM decoder {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sprite_hash(obj: dict) -> str:
    rgba = np.dstack((obj["pixels"], obj["visible"].astype(np.uint8) * 255))
    return hashlib.sha256(rgba.tobytes()).hexdigest()


def main() -> None:
    timeline_path = TIMELINE_DIRECTORY / "results.json"
    timeline = json.loads(timeline_path.read_text(encoding="utf-8-sig"))
    target_samples = [sample for sample in timeline["samples"]
                      if sample.get("active") and sample.get("width") == 8 and sample.get("height") == 8]
    targets: dict[str, list[dict]] = {}
    for sample in target_samples:
        targets.setdefault(sample["sprite_rgba_sha256"], []).append(sample)

    decoder = load_decoder()
    matches: dict[str, list[dict]] = {image_hash: [] for image_hash in targets}
    trace_digest = hashlib.sha256()
    for frame in range(FIRST_FRAME, LAST_FRAME + 1):
        stem = BOOTS_DIRECTORY / f"{BOOTS_PREFIX}.frame{frame:05d}"
        vram_path = stem.with_name(stem.name + ".memory3")
        palette_path = stem.with_name(stem.name + ".0x5000000")
        io_path = stem.with_name(stem.name + ".0x4000000")
        oam_path = stem.with_name(stem.name + ".0x7000000")
        ram_path = stem.with_name(stem.name + ".ram")
        vram, palette_raw, io, oam, ram = (path.read_bytes() for path in
                                          (vram_path, palette_path, io_path, oam_path, ram_path))
        for data in (vram, palette_raw, io, oam, ram):
            trace_digest.update(data)
        palette = decoder.palette_555(palette_raw)
        boots_timer = struct.unpack_from("<H", ram, 0x02004500 - RAM_BASE)[0]
        player_inventory = struct.unpack_from("<H", ram, 0x02004438 - RAM_BASE)[0]
        cpu_inventory = struct.unpack_from("<H", ram, 0x020057B4 - RAM_BASE)[0]

        for index in range(128):
            attr0, attr1, attr2 = struct.unpack_from("<HHH", oam, index * 8)
            if attr0 & 0x200 or (attr0 >> 14) == 3 or attr0 & 0x100:
                continue
            shape, size_index = attr0 >> 14, attr1 >> 14
            if shape != 0 or size_index != 0:
                continue
            obj = decoder.decode_object(vram, palette, io, oam, index)
            if obj is None or (obj["width"], obj["height"]) != (8, 8):
                continue
            digest = sprite_hash(obj)
            if digest not in matches:
                continue
            matches[digest].append({
                "boots_frame": frame,
                "oam_index": index,
                "x": obj["x"],
                "y": obj["y"],
                "tile": attr2 & 0x3FF,
                "palette": (attr2 >> 12) & 15,
                "visible_pixels": int(np.count_nonzero(obj["visible"])),
                "boots_timer": boots_timer,
                "player_inventory": player_inventory,
                "cpu_inventory": cpu_inventory,
            })

    output = ROOT / "scripts" / "OUTPUT" / ("eggo-boot-particle-oam-match_" +
             datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S"))
    output.mkdir(parents=True, exist_ok=False)
    matched_hashes = [image_hash for image_hash, samples in matches.items() if samples]
    parameters = {
        "experiment": "Exact 8x8 decoded OAM image match against native boots pickup frames",
        "created_local": datetime.now().astimezone().isoformat(),
        "timeline_directory": str(TIMELINE_DIRECTORY.relative_to(ROOT)).replace("\\", "/"),
        "boots_capture_directory": str(BOOTS_DIRECTORY.relative_to(ROOT)).replace("\\", "/"),
        "boots_capture_prefix": BOOTS_PREFIX,
        "boots_frames_inclusive": [FIRST_FRAME, LAST_FRAME],
        "boots_timer_address": "0x02004500",
        "inventory_addresses": {"player": "0x02004438", "cpu": "0x020057b4"},
        "target_hash_count": len(targets),
        "boots_capture_trace_sha256_in_frame_order": trace_digest.hexdigest(),
        "match_rule": "Exact SHA-256 of decoded 8x8 RGBA pixels after applying OAM flips; RGB channels use native 5-bit palette values.",
        "random_seed": None,
    }
    results = {
        "target_8x8_sample_count": len(target_samples),
        "unique_target_images": len(targets),
        "images_found_in_boots_capture": len(matched_hashes),
        "matched_frames": [
            {"sprite_rgba_sha256": image_hash,
             "hard_replay_samples": targets[image_hash],
             "boots_capture_samples": matches[image_hash]}
            for image_hash in matched_hashes
        ],
        "unmatched_images": [
            {"sprite_rgba_sha256": image_hash, "hard_replay_samples": samples}
            for image_hash, samples in targets.items() if not matches[image_hash]
        ],
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"target_8x8_sample_count": len(target_samples),
                      "unique_target_images": len(targets),
                      "images_found_in_boots_capture": len(matched_hashes),
                      "output_directory": str(output.relative_to(ROOT)).replace("\\", "/")}, indent=2))


if __name__ == "__main__":
    main()
