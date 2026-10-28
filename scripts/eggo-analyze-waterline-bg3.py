"""Decode the native BG3 layer around Survival waterline transitions."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import csv
import hashlib
import json
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania waterline-triggered BG3 layer analysis",
    "capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "capture_prefix": "eggo-replay-full-graphics",
    "frames": [72, 73, 74, 75, 90, 91, 92, 160, 161, 162, 202, 203, 204,
               360, 361, 362, 363, 364],
    "screen": {"width": 240, "height": 160, "cpu_left": 128, "cpu_right": 240},
    "register_offsets": {
        "bg2cnt": 0x0C, "bg2hofs": 0x18, "bg2vofs": 0x1A,
        "bg3cnt": 0x0E, "bg3hofs": 0x1C, "bg3vofs": 0x1E,
        "win1h": 0x42, "win1v": 0x46, "winin": 0x48,
        "bldcnt": 0x50, "bldalpha": 0x52,
    },
    "ram_addresses": {
        "player_field_waterline_q16": 0x02003BB8,
        "player_camera_q16": 0x02003914,
        "cpu_field_waterline_q16": 0x02004F34,
        "cpu_camera_q16": 0x02004C90,
    },
    "window": {"x_start": 128, "x_end": 240, "y_start": 0, "y_end": 160},
    "gba_color": "RGB555; palette index zero is transparent for text backgrounds",
    "random_seed": None,
}


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def i32(data: bytes, address: int) -> int:
    return struct.unpack_from("<i", data, address - 0x02000000)[0]


def rgb555(color: int) -> tuple[int, int, int]:
    return tuple(((color >> shift) & 31) * 255 // 31 for shift in (0, 5, 10))


def rgb8_to_5(values: np.ndarray) -> np.ndarray:
    return (values.astype(np.uint16) * 31 + 127) // 255


def decode_text_bg(vram: bytes, palette: bytes, control: int,
                   hofs: int, vofs: int, source_map: bool = False) -> np.ndarray:
    char_base = (control >> 2) & 3
    eight_bpp = bool(control & 0x80)
    screen_base = (control >> 8) & 31
    size_code = (control >> 14) & 3
    tiles_wide = 32 << (size_code & 1)
    tiles_high = 32 << (size_code >> 1)
    width, height = tiles_wide * 8, tiles_high * 8
    color_count = 256
    colors = np.asarray([(*rgb555(u16(palette, i * 2)), 255)
                         for i in range(color_count)], dtype=np.uint8)
    output_width, output_height = ((width, height) if source_map else
                                   (256, PARAMETERS["screen"]["height"]))
    output = np.zeros((output_height, output_width, 4), dtype=np.uint8)
    screen_base_offset = screen_base * 0x800
    char_base_offset = char_base * 0x4000
    bytes_per_tile = 64 if eight_bpp else 32
    for y in range(output.shape[0]):
        map_y = (y + (0 if source_map else vofs)) % height
        tile_y, pixel_y = divmod(map_y, 8)
        for x in range(output.shape[1]):
            map_x = (x + (0 if source_map else hofs)) % width
            tile_x, pixel_x = divmod(map_x, 8)
            # Text BG maps use separate 32x32 screen blocks. For 512x256 BG2,
            # the right half is a second block, not the next columns in a
            # flattened 64-tile-wide array.
            block_x, tile_in_block_x = divmod(tile_x, 32)
            block_y, tile_in_block_y = divmod(tile_y, 32)
            blocks_wide = tiles_wide // 32
            block_index = block_y * blocks_wide + block_x
            map_offset = (screen_base_offset + block_index * 0x800 +
                          (tile_in_block_y * 32 + tile_in_block_x) * 2)
            entry = u16(vram, map_offset)
            tile = entry & 0x3FF
            if entry & 0x400:
                pixel_x = 7 - pixel_x
            if entry & 0x800:
                pixel_y = 7 - pixel_y
            tile_offset = char_base_offset + tile * bytes_per_tile
            if eight_bpp:
                index = vram[tile_offset + pixel_y * 8 + pixel_x]
            else:
                packed = vram[tile_offset + pixel_y * 4 + pixel_x // 2]
                index = (packed >> (4 if pixel_x & 1 else 0)) & 15
                if index:
                    index += ((entry >> 12) & 15) * 16
            if index:
                output[y, x] = colors[index]
    return output


def main() -> None:
    source = ROOT / PARAMETERS["capture_directory"]
    prefix = PARAMETERS["capture_prefix"]
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-waterline-bg3-analysis_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)

    decoded: dict[int, np.ndarray] = {}
    source_maps: dict[int, np.ndarray] = {}
    rows = []
    for frame_number in PARAMETERS["frames"]:
        stem = f"{prefix}.frame{frame_number:05d}"
        vram = (source / f"{stem}.memory3").read_bytes()
        palette = (source / f"{stem}.0x5000000").read_bytes()
        io = (source / f"{stem}.0x4000000").read_bytes()
        ram = (source / f"{stem}.ram").read_bytes()
        control = u16(io, PARAMETERS["register_offsets"]["bg3cnt"])
        hofs = u16(io, PARAMETERS["register_offsets"]["bg3hofs"])
        vofs = u16(io, PARAMETERS["register_offsets"]["bg3vofs"])
        layer = decode_text_bg(vram, palette, control, hofs, vofs)
        decoded[frame_number] = layer
        source_map = decode_text_bg(vram, palette, control, hofs, vofs,
                                    source_map=True)
        source_maps[frame_number] = source_map
        image_path = output / f"frame{frame_number:05d}-bg3.png"
        Image.fromarray(layer, "RGBA").save(image_path)
        Image.fromarray(source_map, "RGBA").save(output / f"frame{frame_number:05d}-source.png")
        water_positions = {}
        for field, position_name, camera_name in (
                ("player", "player_field_waterline_q16", "player_camera_q16"),
                ("cpu", "cpu_field_waterline_q16", "cpu_camera_q16")):
            address = PARAMETERS["ram_addresses"][position_name]
            camera_address = PARAMETERS["ram_addresses"][camera_name]
            y = ((i32(ram, address) - i32(ram, camera_address)) >> 16) + 15
            water_positions[field] = y
        cpu_pixels = layer[:, PARAMETERS["screen"]["cpu_left"]:
                           PARAMETERS["screen"]["cpu_right"]]
        nontransparent = int(np.count_nonzero(cpu_pixels[:, :, 3]))
        bg2_control = u16(io, PARAMETERS["register_offsets"]["bg2cnt"])
        bg2 = decode_text_bg(vram, palette, bg2_control,
                             u16(io, PARAMETERS["register_offsets"]["bg2hofs"]),
                             u16(io, PARAMETERS["register_offsets"]["bg2vofs"]))
        Image.fromarray(bg2, "RGBA").save(output / f"frame{frame_number:05d}-bg2.png")
        cpu_left, cpu_right = (PARAMETERS["screen"]["cpu_left"],
                               PARAMETERS["screen"]["cpu_right"])
        bg2_cpu = bg2[:, cpu_left:cpu_right]
        bg3_cpu = cpu_pixels[:, :cpu_right - cpu_left]
        candidate_cpu = np.array(bg2_cpu, copy=True)
        blend_control = u16(io, PARAMETERS["register_offsets"]["bldcnt"])
        blend_alpha = u16(io, PARAMETERS["register_offsets"]["bldalpha"])
        winin = u16(io, PARAMETERS["register_offsets"]["winin"])
        blend_active = (control == 0x0B01 and blend_control == 0x1748 and
                        blend_alpha == 0x040C and (winin >> 8) & 0x20)
        if blend_active:
            source_mask = bg3_cpu[:, :, 3] != 0
            source5 = rgb8_to_5(bg3_cpu[:, :, :3])
            target5 = rgb8_to_5(bg2_cpu[:, :, :3])
            blended5 = np.minimum(31, (12 * source5 + 4 * target5) // 16)
            blended8 = (blended5 * 255 // 31).astype(np.uint8)
            candidate_cpu[:, :, :3][source_mask] = blended8[source_mask]
        candidate_cpu[:, :, 3] = 255
        candidate = np.zeros((PARAMETERS["screen"]["height"],
                              PARAMETERS["screen"]["width"], 4), dtype=np.uint8)
        candidate[:, cpu_left:cpu_right] = candidate_cpu
        candidate_path = output / f"frame{frame_number:05d}-bg2-bg3-candidate.png"
        Image.fromarray(candidate, "RGBA").save(candidate_path)
        native = np.asarray(Image.open(source / f"{stem}.png").convert("RGBA"))
        native_cpu = native[:, cpu_left:cpu_right, :3]
        candidate_rgb = candidate_cpu[:, :, :3]
        error_mask = np.any(native_cpu != candidate_rgb, axis=2)
        error_values = np.abs(native_cpu.astype(np.int16) -
                              candidate_rgb.astype(np.int16))
        rows.append({
            "frame": frame_number,
            "bg3cnt": f"0x{control:04x}",
            "hofs": hofs,
            "vofs_raw": vofs,
            "vofs_map": vofs % (256 << ((control >> 15) & 1)),
            "player_waterline_screen_y": water_positions["player"],
            "cpu_waterline_screen_y": water_positions["cpu"],
            "cpu_bg3_nontransparent_pixels": nontransparent,
            "cpu_bg2_nontransparent_pixels": int(np.count_nonzero(
                bg2[:, cpu_left:cpu_right, 3])),
            "win1h": f"0x{u16(io, PARAMETERS['register_offsets']['win1h']):04x}",
            "win1v": f"0x{u16(io, PARAMETERS['register_offsets']['win1v']):04x}",
            "winin": f"0x{u16(io, PARAMETERS['register_offsets']['winin']):04x}",
            "bldcnt": f"0x{u16(io, PARAMETERS['register_offsets']['bldcnt']):04x}",
            "bldalpha": f"0x{u16(io, PARAMETERS['register_offsets']['bldalpha']):04x}",
            "bg2_bg3_blend_active": bool(blend_active),
            "bg2_bg3_candidate_changed_cpu_pixels": int(error_mask.sum()),
            "bg2_bg3_candidate_mean_absolute_rgb_error": float(error_values.mean()),
            "decoded_layer_sha256": hashlib.sha256(layer.tobytes()).hexdigest(),
            "image": image_path.name,
            "composite_candidate": candidate_path.name,
        })

    comparisons = []
    for left, right in zip(PARAMETERS["frames"], PARAMETERS["frames"][1:]):
        if right != left + 1:
            continue
        a = decoded[left][:, PARAMETERS["screen"]["cpu_left"]:
                          PARAMETERS["screen"]["cpu_right"]]
        b = decoded[right][:, PARAMETERS["screen"]["cpu_left"]:
                          PARAMETERS["screen"]["cpu_right"]]
        comparisons.append({
            "first_frame": left,
            "second_frame": right,
            "changed_cpu_pixels": int(np.count_nonzero(np.any(a != b, axis=2))),
            "changed_source_map_pixels": int(np.count_nonzero(np.any(
                source_maps[left] != source_maps[right], axis=2))),
        })

    with (output / "per-frame.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    with (output / "adjacent-comparisons.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(comparisons[0]))
        writer.writeheader()
        writer.writerows(comparisons)
    record = {
        **PARAMETERS,
        "created_local": datetime.now().astimezone().isoformat(),
        "capture_manifest_sha256": hashlib.sha256(
            (source / f"{prefix}.json").read_bytes()
        ).hexdigest(),
        "output_directory": str(output.relative_to(ROOT)),
        "method": "Decode the captured GBA text BG3 directly from VRAM, palette, and IO registers; compare the CPU-window pixels across adjacent states.",
    }
    (output / "parameters.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    result = {
        "frame_count": len(rows),
        "alternate_mode_frames": sum(row["bg3cnt"] == "0x0b01" for row in rows),
        "frames": rows,
        "adjacent_comparisons": comparisons,
    }
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "frames": len(rows),
                      "adjacent_comparisons": len(comparisons)}, indent=2))


if __name__ == "__main__":
    main()
