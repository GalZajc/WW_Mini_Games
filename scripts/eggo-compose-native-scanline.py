"""Audit the native CPU-field BG3 HBlank split across all alternate frames.

This offline diagnostic uses captured video/graphics/RAM data only. It does not
launch the emulator or audio output. Results and representative PNGs are saved
under scripts/OUTPUT with the full capture source and reconstruction parameters.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
COMPOSITOR_PATH = Path(__file__).with_name("eggo-compose-native-layers.py")
CAPTURE_DIRECTORY = "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
CPU_LEFT, CPU_RIGHT = 128, 240
WATERLINE_Q16 = 0x02004F34
CAMERA_Q16 = 0x02004C90
CPU_CAMERA_Y = 0x02004CFC
RAM_BASE = 0x02000000
WATERLINE_SCREEN_Y_OFFSET = 15
SPLIT_THRESHOLD_Y = 160
ALT_BG3CNT = 0x0B01


def load_compositor():
    spec = importlib.util.spec_from_file_location("eggo_native_compositor", COMPOSITOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {COMPOSITOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def waterline_y(ram: bytes) -> int:
    waterline = struct.unpack_from("<i", ram, WATERLINE_Q16 - RAM_BASE)[0]
    camera = struct.unpack_from("<i", ram, CAMERA_Q16 - RAM_BASE)[0]
    return ((waterline - camera) >> 16) + WATERLINE_SCREEN_Y_OFFSET


def compose(comp, io: bytes, vram: bytes, palette_raw: bytes, oam_raw: bytes) -> np.ndarray:
    """Render BG2/BG3/OBJ using one captured register phase."""
    palette = comp.palette_555(palette_raw)
    dispcnt = u16(io, 0)
    win0h, win1h = u16(io, 0x40), u16(io, 0x42)
    win0v, win1v = u16(io, 0x44), u16(io, 0x46)
    winin, winout = u16(io, 0x48), u16(io, 0x4A)
    bldcnt, bldalpha = u16(io, 0x50), u16(io, 0x52)
    layers = []
    for bg in (2, 3):
        if dispcnt & (1 << (8 + bg)):
            colors, visible, control, _, _ = comp.decode_text_bg(vram, palette, io, bg)
            layers.append((control & 3, 128 + bg, "bg", bg, colors, visible))

    for index in range(128):
        obj = comp.decode_object(vram, palette, io, oam_raw, index)
        if obj is None or obj["mode"] == 2:
            continue
        color_canvas = np.zeros((160, 240, 3), dtype=np.uint8)
        alpha_canvas = np.zeros((160, 240), dtype=bool)
        x0, y0 = obj["x"], obj["y"]
        sx0, sy0 = max(0, -x0), max(0, -y0)
        dx0, dy0 = max(0, x0), max(0, y0)
        width = min(obj["width"] - sx0, 240 - dx0)
        height = min(obj["height"] - sy0, 160 - dy0)
        if width > 0 and height > 0:
            color_canvas[dy0:dy0 + height, dx0:dx0 + width] = \
                obj["pixels"][sy0:sy0 + height, sx0:sx0 + width]
            alpha_canvas[dy0:dy0 + height, dx0:dx0 + width] = \
                obj["visible"][sy0:sy0 + height, sx0:sx0 + width]
        layers.append((obj["priority"], obj["index"], "obj", index,
                       color_canvas, alpha_canvas, obj["mode"]))

    # On equal priority, OAM precedes BG2/BG3; lower OAM indices win ties.
    layers.sort(key=lambda item: (item[0], item[1]))
    top_color = np.broadcast_to(palette[0], (160, 240, 3)).copy()
    top_kind = np.full((160, 240), "bd", dtype="<U3")
    top_id = np.full((160, 240), -1, dtype=np.int16)
    second_color = np.zeros((160, 240, 3), dtype=np.uint8)
    second_kind = np.full((160, 240), "", dtype="<U3")
    second_id = np.full((160, 240), -1, dtype=np.int16)
    top_set = np.zeros((160, 240), dtype=bool)
    second_set = np.zeros((160, 240), dtype=bool)
    win_mask = np.zeros((160, 240), dtype=np.uint8)
    for y in range(160):
        for x in range(240):
            if dispcnt & 0x2000 and comp.inside_window(x, y, win0h, win0v):
                win_mask[y, x] = winin & 0x3F
            elif dispcnt & 0x4000 and comp.inside_window(x, y, win1h, win1v):
                win_mask[y, x] = (winin >> 8) & 0x3F
            else:
                win_mask[y, x] = winout & 0x3F
    for layer in layers:
        _, _, kind, layer_id, colors, visible = layer[:6]
        enabled_bit = 4 if kind == "obj" else layer_id
        visible = visible & ((win_mask & (1 << enabled_bit)) != 0)
        first = visible & ~top_set
        second = visible & top_set & ~second_set
        top_color[first], top_kind[first], top_id[first] = colors[first], kind, layer_id
        top_set[first] = True
        second_color[second], second_kind[second], second_id[second] = \
            colors[second], kind, layer_id
        second_set[second] = True

    effects_enabled = (win_mask & 0x20) != 0
    eva, evb = min(bldalpha & 31, 16), min((bldalpha >> 8) & 31, 16)
    target1_bg, target2_bg = bldcnt & 0x3F, (bldcnt >> 8) & 0x3F
    target1_obj, target2_obj = bool(bldcnt & 0x10), bool(bldcnt & 0x1000)
    is_target1 = np.zeros((160, 240), dtype=bool)
    is_target2 = np.zeros((160, 240), dtype=bool)
    for bg in range(4):
        is_target1 |= (top_kind == "bg") & (top_id == bg) & bool(target1_bg & (1 << bg))
        is_target2 |= (second_kind == "bg") & (second_id == bg) & bool(target2_bg & (1 << bg))
    is_target1 |= (top_kind == "obj") & target1_obj
    is_target2 |= (second_kind == "obj") & target2_obj
    blend = (((bldcnt >> 6) & 3) == 1) & effects_enabled & is_target1 & is_target2 & second_set
    composite5 = top_color.astype(np.uint16).copy()
    composite5[blend] = np.minimum(
        31,
        (eva * top_color[blend].astype(np.uint16) +
         evb * second_color[blend].astype(np.uint16)) // 16,
    ).astype(np.uint8)
    return comp.color5_to_rgb8(composite5)


def main() -> None:
    comp = load_compositor()
    source = ROOT / CAPTURE_DIRECTORY
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-scanline-generalization_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    records = []
    representatives = {}
    last_normal_frame = 1
    for frame in range(2, 601):
        stem = f"{CAPTURE_PREFIX}.frame{frame:05d}"
        io_alt = (source / f"{stem}.0x4000000").read_bytes()
        if u16(io_alt, 0x0E) != ALT_BG3CNT:
            last_normal_frame = frame
            continue
        normal_stem = f"{CAPTURE_PREFIX}.frame{last_normal_frame:05d}"
        previous_stem = f"{CAPTURE_PREFIX}.frame{frame - 1:05d}"
        io_normal = bytearray((source / f"{normal_stem}.0x4000000").read_bytes())
        current_bg2_vofs = u16(io_alt, 0x1A)
        struct.pack_into("<H", io_normal, 0x1A, current_bg2_vofs)
        ram_previous = (source / f"{previous_stem}.ram").read_bytes()
        previous_y = waterline_y(ram_previous)
        # The normal BG3 register is one frame behind the CPU camera object.
        # The game's camera_y field is at field-root + 0x70 (0x02004cfc).
        normal_bg3_vofs = struct.unpack_from(
            "<I", ram_previous, CPU_CAMERA_Y - RAM_BASE
        )[0] & 0xFF
        struct.pack_into("<H", io_normal, 0x1E, normal_bg3_vofs)
        split_y = max(0, min(160, previous_y + 1))
        vram = (source / f"{stem}.memory3").read_bytes()
        palette = (source / f"{stem}.0x5000000").read_bytes()
        oam = (source / f"{stem}.0x7000000").read_bytes()
        native = np.asarray(Image.open(source / f"{stem}.png").convert("RGB"))
        normal = compose(comp, bytes(io_normal), vram, palette, oam)
        alternate = compose(comp, io_alt, vram, palette, oam)
        hybrid = normal.copy()
        hybrid[split_y:] = alternate[split_y:]
        native_cpu = native[:, CPU_LEFT:CPU_RIGHT]
        hybrid_cpu = hybrid[:, CPU_LEFT:CPU_RIGHT]
        pixel_diff = np.any(native_cpu != hybrid_cpu, axis=2)
        count = int(pixel_diff.sum())
        ys, xs = np.nonzero(pixel_diff)
        records.append({
            "frame": frame,
            "normal_register_state_frame": last_normal_frame,
            "previous_cpu_waterline_y": previous_y,
            "split_y": split_y,
            "normal_bg2_vofs": current_bg2_vofs,
            "normal_bg3_vofs": normal_bg3_vofs,
            "previous_cpu_camera_y": struct.unpack_from(
                "<I", ram_previous, CPU_CAMERA_Y - RAM_BASE
            )[0],
            "alternate_bg3_vofs_low": u16(io_alt, 0x1E) & 0xFF,
            "different_cpu_pixels": count,
            "first_diff_x_screen": int(xs[0] + CPU_LEFT) if count else None,
            "first_diff_y": int(ys[0]) if count else None,
            "exact_cpu_field": count == 0,
        })
        if frame == 73 or count > 0:
            representatives[frame] = (native, hybrid, pixel_diff)

    if not records:
        raise RuntimeError("No alternate BG3 frames found in capture")
    with (output / "per-frame-scanline-results.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    diagnostic_frames = {records[0]["frame"], 73, 191,
                         max(records, key=lambda row: row["different_cpu_pixels"])["frame"]}
    for frame in sorted(diagnostic_frames):
        if frame not in representatives:
            record = next(row for row in records if row["frame"] == frame)
            stem = f"{CAPTURE_PREFIX}.frame{frame:05d}"
            normal_stem = f"{CAPTURE_PREFIX}.frame{record['normal_register_state_frame']:05d}"
            io_alt = (source / f"{stem}.0x4000000").read_bytes()
            io_normal = bytearray((source / f"{normal_stem}.0x4000000").read_bytes())
            struct.pack_into("<H", io_normal, 0x1A, record["normal_bg2_vofs"])
            struct.pack_into("<H", io_normal, 0x1E, record["normal_bg3_vofs"])
            vram = (source / f"{stem}.memory3").read_bytes()
            palette = (source / f"{stem}.0x5000000").read_bytes()
            oam = (source / f"{stem}.0x7000000").read_bytes()
            native = np.asarray(Image.open(source / f"{stem}.png").convert("RGB"))
            normal = compose(comp, bytes(io_normal), vram, palette, oam)
            alternate = compose(comp, io_alt, vram, palette, oam)
            hybrid = normal.copy()
            hybrid[record["split_y"]:] = alternate[record["split_y"]:]
            representatives[frame] = (native, hybrid,
                                      np.any(native[:, CPU_LEFT:CPU_RIGHT] !=
                                             hybrid[:, CPU_LEFT:CPU_RIGHT], axis=2))
        native, hybrid, diff = representatives[frame]
        Image.fromarray(native[:, CPU_LEFT:CPU_RIGHT]).save(output / f"frame-{frame:05d}-native-cpu.png")
        Image.fromarray(hybrid[:, CPU_LEFT:CPU_RIGHT]).save(output / f"frame-{frame:05d}-hybrid-cpu.png")
        Image.fromarray((diff.astype(np.uint8) * 255)).save(output / f"frame-{frame:05d}-difference-mask.png")

    result = {
        "alternate_frames_checked": len(records),
        "exact_cpu_frames": sum(row["exact_cpu_field"] for row in records),
        "frames_with_differences": [row["frame"] for row in records if not row["exact_cpu_field"]],
        "total_different_cpu_pixels": sum(row["different_cpu_pixels"] for row in records),
        "maximum_different_cpu_pixels": max(row["different_cpu_pixels"] for row in records),
        "maximum_difference_frame": max(records, key=lambda row: row["different_cpu_pixels"])["frame"],
        "frame_73_different_cpu_pixels": next(row["different_cpu_pixels"] for row in records
                                                 if row["frame"] == 73),
        "audio_enabled": False,
        "limits": [
            "Compositor decodes the captured BG2/BG3/OAM subset, not every GBA layer.",
            "Normal BG3VOFS is the previous frame's CPU camera_y low byte; the camera object stores camera_y at field-root + 0x70.",
        ],
    }
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    capture_json = source / f"{CAPTURE_PREFIX}.json"
    params = {
        "experiment": "Eggo Mania alternate BG3 HBlank scanline generalization",
        "capture_directory": CAPTURE_DIRECTORY,
        "capture_prefix": CAPTURE_PREFIX,
        "capture_metadata_sha256": hashlib.sha256(capture_json.read_bytes()).hexdigest(),
        "frame_range": [2, 600],
        "cpu_field_crop": [CPU_LEFT, CPU_RIGHT, 0, 160],
        "split_rule": "previous CPU waterline screen Y + 1, clamped to [0,160]",
        "normal_register_phase": "last preceding normal BG3 register state; current BG2VOFS and previous CPU camera_y low byte for BG3VOFS",
        "alternate_register_phase": "current frame",
        "graphics_phase": "current frame VRAM/palette/OAM for both register phases",
        "native_video_pixel_format": "RGB565",
        "audio_enabled": False,
        "random_seed": None,
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "parameters.json").write_text(json.dumps(params, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
