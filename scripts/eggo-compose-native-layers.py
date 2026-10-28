"""Recompose a captured Mode-0 GBA frame from text BG and OAM data.

This is a diagnostic for the Survival waterline's alternate CPU window, not a
runtime renderer. It writes all artifacts beneath scripts/OUTPUT.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import argparse
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania native Mode-0 CPU-window layer recomposition",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "frame": 73,
    "screen": {"width": 240, "height": 160, "cpu_left": 128, "cpu_right": 240},
    "io": {
        "dispcnt": 0x00,
        "bgcnt": 0x08,
        "bghofs": 0x10,
        "bgvofs": 0x12,
        "win0h": 0x40,
        "win1h": 0x42,
        "win0v": 0x44,
        "win1v": 0x46,
        "winin": 0x48,
        "winout": 0x4A,
        "bldcnt": 0x50,
        "bldalpha": 0x52,
    },
    "random_seed": None,
    "native_video_pixel_format": "RGB565",
    "color_conversion": "Blend in GBA RGB555; pack green as g5<<1 for libretro RGB565, then expand R/B by *255//31 and G by *255//63.",
}


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def color5_to_rgb8(values: np.ndarray) -> np.ndarray:
    channels = values.astype(np.uint16)
    rgb565 = np.stack((channels[..., 0] * 255 // 31,
                       (channels[..., 1] << 1) * 255 // 63,
                       channels[..., 2] * 255 // 31), axis=-1)
    return rgb565.astype(np.uint8)


def palette_555(raw: bytes) -> np.ndarray:
    words = np.frombuffer(raw, dtype="<u2")
    return np.stack((words & 31, (words >> 5) & 31, (words >> 10) & 31), axis=1).astype(np.uint8)


def decode_text_bg(vram: bytes, palette: np.ndarray, io: bytes, bg: int):
    control = u16(io, PARAMETERS["io"]["bgcnt"] + 2 * bg)
    hofs = u16(io, PARAMETERS["io"]["bghofs"] + 4 * bg)
    vofs = u16(io, PARAMETERS["io"]["bgvofs"] + 4 * bg)
    char_base = ((control >> 2) & 3) * 0x4000
    screen_base = ((control >> 8) & 31) * 0x800
    bpp = 8 if control & 0x80 else 4
    size_code = (control >> 14) & 3
    width, height = 256 << (size_code & 1), 256 << (size_code >> 1)
    tiles_wide = width // 8
    colors = np.zeros((160, 240, 3), dtype=np.uint8)
    visible = np.zeros((160, 240), dtype=bool)
    cache = {}
    tile_bytes = 64 if bpp == 8 else 32
    blocks_wide = tiles_wide // 32
    for y in range(160):
        map_y = (y + vofs) % height
        tile_y, pixel_y = divmod(map_y, 8)
        for x in range(240):
            map_x = (x + hofs) % width
            tile_x, pixel_x = divmod(map_x, 8)
            block_x, local_x = divmod(tile_x, 32)
            block_y, local_y = divmod(tile_y, 32)
            block = block_y * blocks_wide + block_x
            address = screen_base + block * 0x800 + (local_y * 32 + local_x) * 2
            entry = u16(vram, address)
            tile = entry & 0x3FF
            px = 7 - pixel_x if entry & 0x400 else pixel_x
            py = 7 - pixel_y if entry & 0x800 else pixel_y
            key = (tile, (entry >> 12) & 15 if bpp == 4 else 0)
            if key not in cache:
                start = char_base + tile * tile_bytes
                data = np.frombuffer(vram[start:start + tile_bytes], dtype=np.uint8)
                if bpp == 8:
                    indices = data.reshape(8, 8)
                    pal_indices = indices.astype(np.uint16)
                else:
                    indices = np.stack((data & 15, data >> 4), axis=1).reshape(8, 8)
                    pal_indices = indices.astype(np.uint16) + key[1] * 16
                cache[key] = (palette[pal_indices], indices != 0)
            tile_colors, tile_visible = cache[key]
            if tile_visible[py, px]:
                colors[y, x] = tile_colors[py, px]
                visible[y, x] = True
    return colors, visible, control, hofs, vofs


def decode_object(vram: bytes, palette: np.ndarray, io: bytes, oam: bytes, index: int):
    a0, a1, a2 = struct.unpack_from("<HHH", oam, index * 8)
    affine = bool(a0 & 0x100)
    # Bit 9 disables only regular objects. For affine objects it doubles
    # the output bounds; skipping those objects invalidates layer attribution.
    if (not affine and a0 & 0x200) or (a0 >> 14) == 3:
        return None
    shape, size_index = a0 >> 14, a1 >> 14
    sizes = [
        [(8, 8), (16, 16), (32, 32), (64, 64)],
        [(16, 8), (32, 8), (32, 16), (64, 32)],
        [(8, 16), (8, 32), (16, 32), (32, 64)],
    ]
    width, height = sizes[shape][size_index]
    bpp = 8 if a0 & 0x2000 else 4
    tile_step = 2 if bpp == 8 else 1
    tile_base = a2 & 0x3FF
    mapping_1d = bool(u16(io, 0) & 0x40)
    pixels = np.zeros((height, width, 3), dtype=np.uint8)
    visible = np.zeros((height, width), dtype=bool)
    tile_size = 64 if bpp == 8 else 32
    for ty in range(height // 8):
        for tx in range(width // 8):
            stride = (width // 8) * tile_step if mapping_1d else 32
            number = tile_base + ty * stride + tx * tile_step
            if bpp == 8:
                number &= ~1
            start = 0x10000 + number * 32
            raw = np.frombuffer(vram[start:start + tile_size], dtype=np.uint8)
            if len(raw) != tile_size:
                continue
            if bpp == 8:
                indices = raw.reshape(8, 8)
                palette_indices = 256 + indices.astype(np.uint16)
            else:
                indices = np.stack((raw & 15, raw >> 4), axis=1).reshape(8, 8)
                palette_indices = 256 + (a2 >> 12) * 16 + indices.astype(np.uint16)
            ys, xs = slice(ty * 8, ty * 8 + 8), slice(tx * 8, tx * 8 + 8)
            pixels[ys, xs] = palette[palette_indices]
            visible[ys, xs] = indices != 0
    mode = (a0 >> 10) & 3
    if affine:
        double = bool(a0 & 0x200)
        out_w, out_h = (width * 2, height * 2) if double else (width, height)
        matrix_index = (a1 >> 9) & 31
        pa, pb, pc, pd = (struct.unpack_from("<h", oam, matrix_index * 32 + off)[0]
                          for off in (6, 14, 22, 30))
        transformed = np.zeros((out_h, out_w, 3), dtype=np.uint8)
        transformed_visible = np.zeros((out_h, out_w), dtype=bool)
        for y in range(out_h):
            for x in range(out_w):
                dx, dy = x - out_w // 2, y - out_h // 2
                sx = ((dx * pa + dy * pb) >> 8) + width // 2
                sy = ((dx * pc + dy * pd) >> 8) + height // 2
                if 0 <= sx < width and 0 <= sy < height and visible[sy, sx]:
                    transformed[y, x] = pixels[sy, sx]
                    transformed_visible[y, x] = True
        pixels, visible, width, height = transformed, transformed_visible, out_w, out_h
    else:
        if a1 & 0x1000:
            pixels, visible = pixels[:, ::-1], visible[:, ::-1]
        if a1 & 0x2000:
            pixels, visible = pixels[::-1, :], visible[::-1, :]
    x, y = a1 & 0x1FF, a0 & 0xFF
    if x >= 256:
        x -= 512
    if y >= 160:
        y -= 256
    return {
        "index": index,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "priority": (a2 >> 10) & 3,
        "mode": mode,
        "pixels": pixels,
        "visible": visible,
    }


def inside_window(x: int, y: int, h: int, v: int) -> bool:
    start_x, end_x = (h >> 8) & 0xFF, h & 0xFF
    start_y, end_y = (v >> 8) & 0xFF, v & 0xFF
    in_x = start_x <= x < end_x if start_x <= end_x else x >= start_x or x < end_x
    in_y = start_y <= y < end_y if start_y <= end_y else y >= start_y or y < end_y
    return in_x and in_y


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-directory", default=PARAMETERS["capture_directory"],
                        help="Project-relative or absolute native memory capture directory")
    parser.add_argument("--capture-prefix", default=PARAMETERS["capture_prefix"],
                        help="Capture filename prefix before .frameNNNNN")
    parser.add_argument("--frame", type=int, default=PARAMETERS["frame"],
                        help="PNG frame to compare against.")
    parser.add_argument("--state-offset", type=int, default=0,
                        help="Use display-register state from this many frames relative to the PNG frame.")
    parser.add_argument("--graphics-offset", type=int,
                        help="Use VRAM/palette/OAM from this many frames relative to the PNG frame (defaults to --state-offset).")
    parser.add_argument("--bg3-vofs", type=lambda value: int(value, 0),
                        help="Override BG3VOFS in the captured register set (decimal or 0x-prefixed).")
    parser.add_argument("--bg2-vofs", type=lambda value: int(value, 0),
                        help="Override BG2VOFS in the captured register set (decimal or 0x-prefixed).")
    parser.add_argument("--include-all-bgs", action="store_true",
                        help="Include enabled BG0/BG1 as well as BG2/BG3 in the composition.")
    parser.add_argument("--app-frame-sheet", type=Path,
                        help="Optional 10-column app replay sheet to compare this frame against the native composition.")
    args = parser.parse_args()
    source = Path(args.capture_directory)
    if not source.is_absolute():
        source = ROOT / source
    PARAMETERS["capture_directory"] = args.capture_directory
    PARAMETERS["capture_prefix"] = args.capture_prefix
    target_frame = args.frame
    state_frame = target_frame + args.state_offset
    graphics_offset = args.state_offset if args.graphics_offset is None else args.graphics_offset
    graphics_frame = target_frame + graphics_offset
    PARAMETERS.update({
        "frame": target_frame,
        "state_frame": state_frame,
        "state_offset": args.state_offset,
        "graphics_frame": graphics_frame,
        "graphics_offset": graphics_offset,
    })
    target_stem = f"{args.capture_prefix}.frame{target_frame:05d}"
    state_stem = f"{args.capture_prefix}.frame{state_frame:05d}"
    graphics_stem = f"{args.capture_prefix}.frame{graphics_frame:05d}"
    io = (source / f"{state_stem}.0x4000000").read_bytes()
    if args.bg2_vofs is not None or args.bg3_vofs is not None:
        io = bytearray(io)
        if args.bg2_vofs is not None:
            struct.pack_into("<H", io, 0x1A, args.bg2_vofs & 0xFFFF)
        if args.bg3_vofs is not None:
            struct.pack_into("<H", io, 0x1E, args.bg3_vofs & 0xFFFF)
        io = bytes(io)
    vram = (source / f"{graphics_stem}.memory3").read_bytes()
    palette_raw = (source / f"{graphics_stem}.0x5000000").read_bytes()
    oam_raw = (source / f"{graphics_stem}.0x7000000").read_bytes()
    native = np.asarray(Image.open(source / f"{target_stem}.png").convert("RGB"))
    palette = palette_555(palette_raw)
    dispcnt = u16(io, PARAMETERS["io"]["dispcnt"])
    win0h, win1h = (u16(io, PARAMETERS["io"][k]) for k in ("win0h", "win1h"))
    win0v, win1v = (u16(io, PARAMETERS["io"][k]) for k in ("win0v", "win1v"))
    winin, winout = u16(io, PARAMETERS["io"]["winin"]), u16(io, PARAMETERS["io"]["winout"])
    bldcnt, bldalpha = u16(io, PARAMETERS["io"]["bldcnt"]), u16(io, PARAMETERS["io"]["bldalpha"])
    layers = []
    layer_images = {}
    for bg in range(4):
        if not dispcnt & (1 << (8 + bg)):
            continue
        colors, visible, control, hofs, vofs = decode_text_bg(vram, palette, io, bg)
        layer_images[f"BG{bg}"] = (colors, visible)
        if args.include_all_bgs or bg in (2, 3):
            priority = control & 3
            layers.append((priority, 128 + bg, "bg", bg, colors, visible))
    objects = []
    for index in range(128):
        obj = decode_object(vram, palette, io, oam_raw, index)
        if obj is None or obj["mode"] == 2:
            continue
        objects.append({key: value for key, value in obj.items() if key not in ("pixels", "visible")})
        rank = obj["index"]
        # OBJ pixels win equal-priority ties against backgrounds; lower OAM
        # indices win ties against later objects.
        color_canvas = np.zeros((160, 240, 3), dtype=np.uint8)
        alpha_canvas = np.zeros((160, 240), dtype=bool)
        x0, y0 = obj["x"], obj["y"]
        sx0, sy0 = max(0, -x0), max(0, -y0)
        dx0, dy0 = max(0, x0), max(0, y0)
        w = min(obj["width"] - sx0, 240 - dx0)
        h = min(obj["height"] - sy0, 160 - dy0)
        if w > 0 and h > 0:
            color_canvas[dy0:dy0+h, dx0:dx0+w] = obj["pixels"][sy0:sy0+h, sx0:sx0+w]
            alpha_canvas[dy0:dy0+h, dx0:dx0+w] = obj["visible"][sy0:sy0+h, sx0:sx0+w]
        layers.append((obj["priority"], rank, "obj", index, color_canvas, alpha_canvas,
                       obj["mode"]))

    # GBA tie order: objects precede BG0, then BG1..BG3 at equal priority.
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
            if dispcnt & 0x2000 and inside_window(x, y, win0h, win0v):
                win_mask[y, x] = winin & 0x3F
            elif dispcnt & 0x4000 and inside_window(x, y, win1h, win1v):
                win_mask[y, x] = (winin >> 8) & 0x3F
            else:
                win_mask[y, x] = winout & 0x3F

    for layer in layers:
        priority, order, kind, layer_id, colors, visible = layer[:6]
        enabled_bit = 4 if kind == "obj" else layer_id
        enabled = (win_mask & (1 << enabled_bit)) != 0
        visible = visible & enabled
        first = visible & ~top_set
        second = visible & top_set & ~second_set
        top_color[first] = colors[first]
        top_kind[first] = kind
        top_id[first] = layer_id
        top_set[first] = True
        second_color[second] = colors[second]
        second_kind[second] = kind
        second_id[second] = layer_id
        second_set[second] = True

    effects_enabled = (win_mask & 0x20) != 0
    eva, evb = bldalpha & 31, (bldalpha >> 8) & 31
    eva, evb = min(eva, 16), min(evb, 16)
    target1_bg = (bldcnt & 0x3F)
    target2_bg = (bldcnt >> 8) & 0x3F
    target1_obj = bool(bldcnt & (1 << 4))
    target2_obj = bool(bldcnt & (1 << 12))
    is_target1 = np.zeros((160, 240), dtype=bool)
    is_target2 = np.zeros((160, 240), dtype=bool)
    for bg in range(4):
        is_target1 |= (top_kind == "bg") & (top_id == bg) & bool(target1_bg & (1 << bg))
        is_target2 |= (second_kind == "bg") & (second_id == bg) & bool(target2_bg & (1 << bg))
    is_target1 |= (top_kind == "obj") & target1_obj
    is_target2 |= (second_kind == "obj") & target2_obj
    alpha_blend = ((bldcnt >> 6) & 3) == 1
    do_blend = alpha_blend & effects_enabled & is_target1 & is_target2 & second_set
    composite5 = top_color.astype(np.uint16).copy()
    composite5[do_blend] = np.minimum(
        31,
        (eva * top_color[do_blend].astype(np.uint16) +
         evb * second_color[do_blend].astype(np.uint16)) // 16,
    ).astype(np.uint8)
    composite = color5_to_rgb8(composite5)

    out = ROOT / "scripts" / "OUTPUT" / (
        "eggo-native-ppu-frame_" + datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S_%f")
    )
    out.mkdir(parents=True, exist_ok=False)
    cpu_left, cpu_right = PARAMETERS["screen"]["cpu_left"], PARAMETERS["screen"]["cpu_right"]
    Image.fromarray(native).save(out / "native.png")
    Image.fromarray(composite).save(out / "composite.png")
    Image.fromarray(native[:, cpu_left:cpu_right]).save(out / "native-cpu.png")
    Image.fromarray(composite[:, cpu_left:cpu_right]).save(out / "composite-cpu.png")
    diff = np.abs(native.astype(np.int16) - composite.astype(np.int16)).astype(np.uint8)
    Image.fromarray(diff).save(out / "absolute-difference.png")
    mismatch = np.any(native != composite, axis=2)
    Image.fromarray((mismatch.astype(np.uint8) * 255)).save(out / "difference-mask.png")
    layer_codes = np.zeros((160, 240, 4), dtype=np.uint8)
    layer_codes[..., 0] = np.where(top_kind == "bg", 1, np.where(top_kind == "obj", 2, 0))
    layer_codes[..., 1] = np.clip(top_id.astype(np.int32) + 1, 0, 255).astype(np.uint8)
    layer_codes[..., 3] = 255
    Image.fromarray(layer_codes).save(out / "top-layer-map.png")
    top_layer_pixels = {}
    for kind, layer_id in sorted(set(zip(top_kind.ravel().tolist(), top_id.ravel().tolist()))):
        label = f"{kind}{layer_id}" if kind != "bd" else "backdrop"
        top_layer_pixels[label] = int(np.count_nonzero((top_kind == kind) & (top_id == layer_id)))
    mismatch_by_top_layer = {}
    for kind, layer_id in sorted(set(zip(top_kind[mismatch].tolist(),
                                         top_id[mismatch].tolist()))):
        label = f"{kind}{layer_id}" if kind != "bd" else "backdrop"
        mismatch_by_top_layer[label] = int(np.count_nonzero(
            mismatch & (top_kind == kind) & (top_id == layer_id)))
    app_comparison = None
    if args.app_frame_sheet is not None:
        sheet = Image.open(args.app_frame_sheet).convert("RGBA")
        columns = 10
        sheet_x = ((target_frame - 1) % columns) * 240
        sheet_y = ((target_frame - 1) // columns) * 160
        app_image = sheet.crop((sheet_x, sheet_y, sheet_x + 240, sheet_y + 160))
        if app_image.size != (240, 160):
            raise ValueError("App frame sheet does not contain the requested 240×160 frame")
        app = np.asarray(app_image.convert("RGB"))
        Image.fromarray(app).save(out / "app.png")
        app_mismatch = np.any(native != app, axis=2)
        Image.fromarray((app_mismatch.astype(np.uint8) * 255)).save(out / "app-difference-mask.png")
        app_by_top_layer = {}
        for kind, layer_id in sorted(set(zip(top_kind[app_mismatch].tolist(),
                                             top_id[app_mismatch].tolist()))):
            label = f"{kind}{layer_id}" if kind != "bd" else "backdrop"
            app_by_top_layer[label] = int(np.count_nonzero(
                app_mismatch & (top_kind == kind) & (top_id == layer_id)))
        ys, xs = np.nonzero(app_mismatch)
        app_comparison = {
            "app_frame_sheet": str(args.app_frame_sheet.resolve()),
            "app_sheet_frame": target_frame,
            "different_pixels": int(app_mismatch.sum()),
            "different_by_screen_region": {
                "player": int(app_mismatch[:, :112].sum()),
                "divider": int(app_mismatch[:, 112:128].sum()),
                "cpu": int(app_mismatch[:, 128:].sum()),
            },
            "bounds": ([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
                       if len(xs) else None),
            "app_mismatches_over_native_top_layer": app_by_top_layer,
        }
    layer_rows = []
    for name, (colors, visible) in layer_images.items():
        img = np.zeros((160, 240, 4), dtype=np.uint8)
        img[:, :, :3] = color5_to_rgb8(colors)
        img[:, :, 3] = visible.astype(np.uint8) * 255
        Image.fromarray(img).save(out / f"{name.lower()}.png")
        layer_rows.append({"layer": name, "cpu_nontransparent_pixels": int(visible[:, cpu_left:cpu_right].sum())})
    results = {
        "frame": target_frame,
        "graphics_state_frame": state_frame,
        "graphics_state_offset": args.state_offset,
        "graphics_data_frame": graphics_frame,
        "graphics_data_offset": graphics_offset,
        "bg2_vofs_override": args.bg2_vofs,
        "bg3_vofs_override": args.bg3_vofs,
        "include_all_bgs": args.include_all_bgs,
        "registers": {"dispcnt": f"0x{dispcnt:04x}", "win1h": f"0x{win1h:04x}",
                      "win1v": f"0x{win1v:04x}", "winin": f"0x{winin:04x}",
                      "winout": f"0x{winout:04x}", "bldcnt": f"0x{bldcnt:04x}",
                      "bldalpha": f"0x{bldalpha:04x}"},
        "active_oam_objects": len(objects),
        "blended_pixels_cpu": int(do_blend[:, cpu_left:cpu_right].sum()),
        "cpu_differing_pixels": int(np.any(native[:, cpu_left:cpu_right] !=
                                               composite[:, cpu_left:cpu_right], axis=2).sum()),
        "cpu_mae_rgb": float(np.abs(native[:, cpu_left:cpu_right].astype(np.int16) -
                                     composite[:, cpu_left:cpu_right].astype(np.int16)).mean()),
        "full_differing_pixels": int(mismatch.sum()),
        "mismatches_by_composited_top_layer": mismatch_by_top_layer,
        "composited_top_layer_pixels": top_layer_pixels,
        "app_comparison": app_comparison,
        "layers": layer_rows,
        "objects": objects,
        "limitations": ["Affine sprite sampling uses a direct 8.8 transform and has not been parity-validated.",
                        "This probe models one captured frame and does not model scanline-timed register/VRAM changes."],
    }
    (out / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    with (out / "parameters.json").open("w", encoding="utf-8") as file:
        json.dump({**PARAMETERS,
                   "capture_hashes": {
                       "vram": hashlib.sha256((source / f"{graphics_stem}.memory3").read_bytes()).hexdigest(),
                       "palette": hashlib.sha256((source / f"{graphics_stem}.0x5000000").read_bytes()).hexdigest(),
                       "oam": hashlib.sha256((source / f"{graphics_stem}.0x7000000").read_bytes()).hexdigest(),
                       "io": hashlib.sha256((source / f"{state_stem}.0x4000000").read_bytes()).hexdigest()},
                   "target_png_sha256": hashlib.sha256((source / f"{target_stem}.png").read_bytes()).hexdigest(),
                   "output_directory": str(out.relative_to(ROOT)),
                   "method": "Decode Mode-0 text backgrounds and OAM from graphics_state_frame, apply its GBA window masks and blend registers, then compare against the PNG from frame.",
                   "include_all_bgs": args.include_all_bgs,
                   "app_frame_sheet": str(args.app_frame_sheet.resolve()) if args.app_frame_sheet else None},
                  file, indent=2)
    with (out / "layers.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(layer_rows[0]))
        writer.writeheader()
        writer.writerows(layer_rows)
    print(json.dumps({"output": str(out), **{key: results[key] for key in
                      ("active_oam_objects", "blended_pixels_cpu", "cpu_differing_pixels", "cpu_mae_rgb")}}, indent=2))


if __name__ == "__main__":
    main()
