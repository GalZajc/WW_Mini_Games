#!/usr/bin/env python3
"""Check whether app pixels at frame-191 CPU mismatches match native OAM art.

Uses an existing muted Electron replay image and captured GBA RAM/VRAM/OAM.
It does not launch Electron or emit audio. All audit artifacts go under
scripts/OUTPUT with source hashes and the register-phase split recorded.
"""
from __future__ import annotations

from collections import Counter, deque
from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import importlib.util
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
NORMAL_LAYER_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-26"
ALTERNATE_LAYER_DIR = ROOT / "scripts/OUTPUT/eggo-native-ppu-frame_2026-10-08_09-22-09"
APP_SHEET = ROOT / "tests/OUTPUT/eggo-mania-visual_2026-10-08T12-42-18-231Z/input-replay-app-frames.png"
FRAME = 191
CPU_LEFT, CPU_RIGHT = 128, 240
SPLIT_Y = 142


def load_compositor():
    path = Path(__file__).with_name("eggo-compose-native-layers.py")
    spec = importlib.util.spec_from_file_location("eggo_native_layers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def layer_name(code: np.ndarray) -> str:
    kind, encoded_id = int(code[0]), int(code[1])
    if kind == 1:
        return f"BG{encoded_id - 1}"
    if kind == 2:
        return f"OBJ{encoded_id - 1}"
    return "backdrop"


def window_mask(compositor, io: bytes, x: int, y: int) -> int:
    u16 = compositor.u16
    dispcnt = u16(io, compositor.PARAMETERS["io"]["dispcnt"])
    win0h = u16(io, compositor.PARAMETERS["io"]["win0h"])
    win1h = u16(io, compositor.PARAMETERS["io"]["win1h"])
    win0v = u16(io, compositor.PARAMETERS["io"]["win0v"])
    win1v = u16(io, compositor.PARAMETERS["io"]["win1v"])
    winin = u16(io, compositor.PARAMETERS["io"]["winin"])
    winout = u16(io, compositor.PARAMETERS["io"]["winout"])
    if dispcnt & 0x2000 and compositor.inside_window(x, y, win0h, win0v):
        return winin & 0x3F
    if dispcnt & 0x4000 and compositor.inside_window(x, y, win1h, win1v):
        return (winin >> 8) & 0x3F
    return winout & 0x3F


def largest_component(mask: np.ndarray) -> int:
    visited = np.zeros(mask.shape, dtype=bool)
    largest = 0
    height, width = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if visited[y, x]:
            continue
        queue = deque([(int(y), int(x))])
        visited[y, x] = True
        size = 0
        while queue:
            cy, cx = queue.popleft()
            size += 1
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if (0 <= ny < height and 0 <= nx < width and mask[ny, nx] and
                        not visited[ny, nx]):
                    visited[ny, nx] = True
                    queue.append((ny, nx))
        largest = max(largest, size)
    return largest


def main() -> None:
    compositor = load_compositor()
    stem = f"{CAPTURE_PREFIX}.frame{FRAME:05d}"
    normal_results = json.loads((NORMAL_LAYER_DIR / "results.json").read_text(encoding="utf-8"))
    alternate_results = json.loads((ALTERNATE_LAYER_DIR / "results.json").read_text(encoding="utf-8"))
    if normal_results.get("frame") != FRAME or alternate_results.get("frame") != FRAME:
        raise ValueError("The selected native layer captures do not target frame 191")
    normal_state_frame = int(normal_results["graphics_state_frame"])
    alternate_state_frame = int(alternate_results["graphics_state_frame"])
    normal_io_path = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{normal_state_frame:05d}.0x4000000"
    alternate_io_path = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{alternate_state_frame:05d}.0x4000000"
    vram_path = CAPTURE_DIR / f"{stem}.memory3"
    palette_path = CAPTURE_DIR / f"{stem}.0x5000000"
    oam_path = CAPTURE_DIR / f"{stem}.0x7000000"
    native_path = CAPTURE_DIR / f"{stem}.png"
    input_files = [APP_SHEET, native_path, normal_io_path, alternate_io_path,
                   vram_path, palette_path, oam_path,
                   NORMAL_LAYER_DIR / "top-layer-map.png",
                   ALTERNATE_LAYER_DIR / "top-layer-map.png",
                   NORMAL_LAYER_DIR / "results.json",
                   ALTERNATE_LAYER_DIR / "results.json"]
    app_parameters_path = APP_SHEET.parent / "parameters.json"
    app_parameters = json.loads(app_parameters_path.read_text(encoding="utf-8"))
    if app_parameters.get("audioOutputMuted") is not True:
        raise ValueError(f"The selected Electron capture is not confirmed muted: {app_parameters_path}")

    sheet = Image.open(APP_SHEET).convert("RGB")
    x0 = ((FRAME - 1) % 10) * 240
    y0 = ((FRAME - 1) // 10) * 160
    app = np.asarray(sheet.crop((x0, y0, x0 + 240, y0 + 160)))
    native = np.asarray(Image.open(native_path).convert("RGB"))
    mismatch = np.any(native[:, CPU_LEFT:CPU_RIGHT] != app[:, CPU_LEFT:CPU_RIGHT], axis=2)
    normal_map = np.asarray(Image.open(NORMAL_LAYER_DIR / "top-layer-map.png").convert("RGBA"))
    alternate_map = np.asarray(Image.open(ALTERNATE_LAYER_DIR / "top-layer-map.png").convert("RGBA"))
    hblank_map = normal_map.copy()
    hblank_map[SPLIT_Y:, CPU_LEFT:CPU_RIGHT] = alternate_map[SPLIT_Y:, CPU_LEFT:CPU_RIGHT]

    normal_io, alternate_io = normal_io_path.read_bytes(), alternate_io_path.read_bytes()
    vram, palette_raw, oam = vram_path.read_bytes(), palette_path.read_bytes(), oam_path.read_bytes()
    palette = compositor.palette_555(palette_raw)
    objects = []
    for index in range(128):
        obj = compositor.decode_object(vram, palette, alternate_io, oam, index)
        if obj is None or obj["mode"] == 2:
            continue
        obj["rgb"] = compositor.color5_to_rgb8(obj["pixels"])
        objects.append(obj)

    object_enabled = []
    for phase_io in (normal_io_path.read_bytes(), alternate_io_path.read_bytes()):
        object_enabled.append(np.array([
            [bool(window_mask(compositor, phase_io, x, y) & 0x10) for x in range(240)]
            for y in range(160)
        ], dtype=bool))

    rows = []
    mismatches_matching_oam = 0
    matches_by_native_layer: Counter[str] = Counter()
    matches_by_object: Counter[str] = Counter()
    object_evidence = []
    for y, local_x in zip(*np.nonzero(mismatch)):
        x = int(local_x + CPU_LEFT)
        phase_io = normal_io if y < SPLIT_Y else alternate_io
        visible_obj_layer = bool(window_mask(compositor, phase_io, x, int(y)) & 0x10)
        app_rgb = app[y, x]
        matching_objects = []
        if visible_obj_layer:
            for obj in objects:
                dx, dy = x - obj["x"], int(y) - obj["y"]
                if (0 <= dx < obj["width"] and 0 <= dy < obj["height"] and
                        obj["visible"][dy, dx] and np.array_equal(app_rgb, obj["rgb"][dy, dx])):
                    matching_objects.append(f"{obj['index']}:p{obj['priority']}")
        top = layer_name(hblank_map[y, x])
        if matching_objects:
            mismatches_matching_oam += 1
            matches_by_native_layer[top] += 1
            matches_by_object.update(matching_objects)
        rows.append({
            "screen_x": x,
            "screen_y": int(y),
            "register_phase": "normal" if y < SPLIT_Y else "alternate",
            "native_top_layer": top,
            "native_rgb": ",".join(map(str, native[y, x].tolist())),
            "app_rgb": ",".join(map(str, app[y, x].tolist())),
            "app_matches_visible_native_oam": ";".join(matching_objects),
        })

    for obj in objects:
        object_id = f"OBJ{obj['index']}"
        hidden_rgb_candidates = np.zeros((160, CPU_RIGHT - CPU_LEFT), dtype=bool)
        top_layer_pixels = app_exact_top_layer_pixels = 0
        for dy in range(obj["height"]):
            y = obj["y"] + dy
            if not 0 <= y < 160:
                continue
            phase_index = 0 if y < SPLIT_Y else 1
            for dx in range(obj["width"]):
                x = obj["x"] + dx
                if not CPU_LEFT <= x < CPU_RIGHT or not obj["visible"][dy, dx]:
                    continue
                if not object_enabled[phase_index][y, x]:
                    continue
                local_x = x - CPU_LEFT
                native_top = layer_name(hblank_map[y, x])
                if native_top == object_id:
                    top_layer_pixels += 1
                    if np.array_equal(app[y, x], obj["rgb"][dy, dx]):
                        app_exact_top_layer_pixels += 1
                elif mismatch[y, local_x] and np.array_equal(app[y, x], obj["rgb"][dy, dx]):
                    hidden_rgb_candidates[y, local_x] = True
        hidden_count = int(hidden_rgb_candidates.sum())
        if top_layer_pixels or hidden_count:
            object_evidence.append({
                "object": obj["index"],
                "priority": obj["priority"],
                "native_top_layer_pixels": top_layer_pixels,
                "app_matches_object_where_native_top": app_exact_top_layer_pixels,
                "mismatch_pixels_app_matches_object_under_other_native_layer": hidden_count,
                "largest_contiguous_hidden_rgb_match": largest_component(hidden_rgb_candidates),
            })

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts/OUTPUT" / f"eggo-hblank-app-oam-matches_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    object_artifacts = []
    for obj in objects:
        if obj["index"] not in {29, 30, 31, 32, 38, 39}:
            continue
        rgba = np.zeros((obj["height"], obj["width"], 4), dtype=np.uint8)
        rgba[..., :3] = obj["rgb"]
        rgba[..., 3] = obj["visible"].astype(np.uint8) * 255
        filename = f"native-obj{obj['index']:02d}-p{obj['priority']}.png"
        Image.fromarray(rgba).save(output / filename)
        object_artifacts.append(filename)
    with (output / "mismatch-oam-matches.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else (
            "screen_x", "screen_y", "register_phase", "native_top_layer", "native_rgb",
            "app_rgb", "app_matches_visible_native_oam"))
        writer.writeheader()
        writer.writerows(rows)
    input_hashes = {str(path.relative_to(ROOT)): sha256(path) for path in input_files}
    parameters = {
        "experiment": "Frame-191 app pixel to visible native OAM attribution",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "frame": FRAME,
        "hblank_split_y": SPLIT_Y,
        "normal_register_frame": normal_state_frame,
        "alternate_register_frame": alternate_state_frame,
        "app_frame_sheet": APP_SHEET.relative_to(ROOT).as_posix(),
        "app_audio_output_muted": True,
        "native_capture": CAPTURE_DIR.relative_to(ROOT).as_posix(),
        "random_seed": None,
        "input_sha256": input_hashes,
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    results = {
        "cpu_field_mismatch_pixels": int(mismatch.sum()),
        "mismatches_where_app_rgb_matches_a_visible_native_oam_pixel": mismatches_matching_oam,
        "rgb_candidates_by_native_top_layer": dict(matches_by_native_layer),
        "rgb_candidates_by_object_and_priority": dict(matches_by_object),
        "object_position_and_mask_evidence": object_evidence,
        "color_match_is_object_identity": False,
        "interpretation": "RGB equality is only a candidate: palette colors repeat across sprites and layers. The position/mask table restricts candidates to captured OAM coordinates and visible texels, but still needs contiguous full-mask agreement before an object-order cause is confirmed; unmatched colors need separate sprite-art/position or layer-composition analysis.",
        "artifacts": ["mismatch-oam-matches.csv", *object_artifacts],
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), **results}, indent=2))


if __name__ == "__main__":
    main()
