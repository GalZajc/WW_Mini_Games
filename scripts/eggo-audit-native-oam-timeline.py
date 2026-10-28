"""Track native OAM object 29 across the fixed Eggo Mania replay capture."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import hashlib
import importlib.util
import json
import struct

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
FIRST_FRAME = 1
LAST_FRAME = 600
OAM_INDEX = 29


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_native_compositor", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load OAM decoder {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    decoder = load_decoder()
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-native-oam-timeline_{stamp}"
    output.mkdir(parents=True, exist_ok=False)

    trace_digest = hashlib.sha256()
    samples = []
    grouped: dict[str, list[int]] = {}
    for frame in range(FIRST_FRAME, LAST_FRAME + 1):
        stem = CAPTURE_DIRECTORY / f"{CAPTURE_PREFIX}.frame{frame:05d}"
        vram_path = stem.with_name(stem.name + ".memory3")
        palette_path = stem.with_name(stem.name + ".0x5000000")
        io_path = stem.with_name(stem.name + ".0x4000000")
        oam_path = stem.with_name(stem.name + ".0x7000000")
        ram_path = stem.with_name(stem.name + ".ram")
        vram, palette_raw, io, oam, ram = (p.read_bytes() for p in (vram_path, palette_path, io_path, oam_path, ram_path))
        for data in (vram, palette_raw, io, oam, ram):
            trace_digest.update(data)
        obj = decoder.decode_object(vram, decoder.palette_555(palette_raw), io, oam, OAM_INDEX)
        if obj is None:
            samples.append({"frame": frame, "active": False})
            continue

        attr0, attr1, attr2 = struct.unpack_from("<HHH", oam, OAM_INDEX * 8)
        width, height = obj["width"], obj["height"]
        color_depth = 8 if attr0 & 0x2000 else 4
        tile_size = 64 if color_depth == 8 else 32
        tile_offset = 0x10000 + (attr2 & 0x3FF) * 32
        tile_bytes = vram[tile_offset:tile_offset + tile_size]
        tile_hash = sha256_bytes(tile_bytes)
        mask_hash = sha256_bytes(np.packbits(obj["visible"], bitorder="little").tobytes())
        rgba = np.dstack((obj["pixels"], obj["visible"].astype(np.uint8) * 255))
        sprite_hash = sha256_bytes(rgba.tobytes())
        palette_index = (attr2 >> 12) & 15
        identity = f"{width}x{height}:{color_depth}:{palette_index}:{sprite_hash}"
        grouped.setdefault(identity, []).append(frame)
        player_floors = struct.unpack_from("<I", ram, 0x02004508 - 0x02000000)[0]
        cpu_floors = struct.unpack_from("<I", ram, 0x02005884 - 0x02000000)[0]
        player_camera_y = struct.unpack_from("<I", ram, 0x02003914 - 0x02000000)[0] >> 16
        cpu_camera_y = struct.unpack_from("<I", ram, 0x02004C90 - 0x02000000)[0] >> 16
        field = "player" if obj["x"] < 112 else "cpu" if obj["x"] >= 128 else None
        camera_y = {"player": player_camera_y, "cpu": cpu_camera_y}.get(field)
        samples.append({
            "frame": frame,
            "active": True,
            "field": field,
            "x": obj["x"],
            "y": obj["y"],
            "camera_y": camera_y,
            "camera_adjusted_y_diagnostic": camera_y + obj["y"] if camera_y is not None else None,
            "width": width,
            "height": height,
            "tile": attr2 & 0x3FF,
            "palette": palette_index,
            "color_depth_bits": color_depth,
            "sprite_rgba_sha256": sprite_hash,
            "tile_data_sha256": tile_hash,
            "mask_sha256": mask_hash,
            "visible_pixels": int(np.count_nonzero(obj["visible"])),
            "completed_floors": {"player": player_floors, "cpu": cpu_floors},
            "attributes": [hex(attr0), hex(attr1), hex(attr2)],
        })

    run_summaries = []
    for identity, frames in grouped.items():
        spans = []
        start = previous = frames[0]
        for frame in frames[1:]:
            if frame != previous + 1:
                spans.append([start, previous])
                start = frame
            previous = frame
        spans.append([start, previous])
        run_summaries.append({"identity": identity, "sample_count": len(frames), "frame_spans": spans})
    run_summaries.sort(key=lambda item: (-item["sample_count"], item["frame_spans"][0][0]))

    parameters = {
        "experiment": "Eggo Mania native OAM object timeline",
        "created_local": datetime.now().astimezone().isoformat(),
        "capture_directory": str(CAPTURE_DIRECTORY.relative_to(ROOT)).replace("\\", "/"),
        "capture_prefix": CAPTURE_PREFIX,
        "frames_inclusive": [FIRST_FRAME, LAST_FRAME],
        "oam_index": OAM_INDEX,
        "input_trace_sha256_in_frame_order": trace_digest.hexdigest(),
        "floor_count_addresses": {"player": "0x02004508", "cpu": "0x02005884"},
        "camera_y_addresses": {"player": "0x02003914 (high 16 bits)", "cpu": "0x02004c90 (high 16 bits)"},
        "camera_adjusted_y_definition": "camera_y + OAM screen y; diagnostic only, useful for spotting stationary world-space objects.",
        "sprite_identity": "Full decoded RGBA sprite pixels and dimensions, color depth, and palette; not only the first tile.",
        "random_seed": None,
    }
    results = {
        "active_frames": sum(bool(sample["active"]) for sample in samples),
        "inactive_frames": sum(not sample["active"] for sample in samples),
        "unique_art_identities": len(grouped),
        "art_identity_runs": run_summaries,
        "samples": samples,
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in results.items() if key != "samples"}, indent=2, ensure_ascii=False))
    print(f"Output: {output.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
