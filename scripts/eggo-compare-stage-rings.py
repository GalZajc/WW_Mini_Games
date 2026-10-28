"""Render decoded Survival background rings and align them with captured BG3 maps."""
from datetime import datetime
from pathlib import Path
import hashlib
import json
import struct

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIRECTORY = ROOT / "renderer" / "games" / "eggo-mania" / "assets"
PARAMETERS = {
    "decoded_rings": "scripts/OUTPUT/eggo-decode-stage-rings_2026-10-05_20-16-21_320136",
    "rom": "C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba",
    "native_layer": 3,
    "global_frame_counter": 0x02011A9C,
    "field_object_addresses": {"player": 0x02003910, "cpu": 0x02004C8C},
    "field_object_offsets": {"config_pointer": 0x20, "camera_y": 0x70,
                             "row_descriptors": 0x74, "row_descriptor_stride": 8},
    "config_offsets": {"row_count": 0x04, "row_table_pointer": 0x14},
    "stream_scan_rows": 21,
    "native_screen_height": 160,
    "palette_source": "first 256 entries of the matching native palette-RAM capture",
    "ring_tile_width": 14,
    "tile_pixels": 8,
    "field_crops": {"player": 0, "cpu": 128},
    "comparison_height": 256,
    "method": (
        "Convert the native 64-row 8bpp tile ring into pixels, decode the same "
        "frame's BG3 tile map, then find the circular vertical offset and "
        "horizontal orientation with the smallest RGBA error."
    ),
}


def decode_native_bg3(vram, palette_bytes, io):
    layer = PARAMETERS["native_layer"]
    control = struct.unpack_from("<H", io, 8 + layer * 2)[0]
    bpp = 8 if control & 0x80 else 4
    width = 256 * (1 + ((control >> 14) & 1))
    height = 256 * (1 + ((control >> 15) & 1))
    char_base = ((control >> 2) & 3) * 0x4000
    screen_base = ((control >> 8) & 31) * 0x800
    raw = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw & 31) * 255 // 31,
                        ((raw >> 5) & 31) * 255 // 31,
                        ((raw >> 10) & 31) * 255 // 31,
                        np.full(raw.shape, 255)), axis=-1).astype(np.uint8)
    image = np.zeros((height, width, 4), dtype=np.uint8)
    tile_bytes = 64 if bpp == 8 else 32
    for tile_y in range(height // 8):
        for tile_x in range(width // 8):
            block = (tile_y // 32) * (width // 256) + tile_x // 32
            entry_at = screen_base + (block * 1024 + (tile_y % 32) * 32 + tile_x % 32) * 2
            entry = struct.unpack_from("<H", vram, entry_at)[0]
            packed = np.frombuffer(vram, dtype=np.uint8, count=tile_bytes,
                                   offset=char_base + (entry & 1023) * tile_bytes)
            if bpp == 8:
                indices = packed.reshape(8, 8)
                colors = palette[indices].copy()
            else:
                indices = np.stack((packed & 15, packed >> 4), axis=1).reshape(8, 8)
                colors = palette[indices + ((entry >> 12) & 15) * 16].copy()
            if entry & 0x400:
                colors = colors[:, ::-1]
            if entry & 0x800:
                colors = colors[::-1, :]
            colors[indices == 0, 3] = 0
            image[tile_y * 8:tile_y * 8 + 8,
                  tile_x * 8:tile_x * 8 + 8] = colors
    hofs = struct.unpack_from("<H", io, 0x10 + layer * 4)[0]
    if hofs:
        image = np.roll(image, -(hofs % width), axis=1)
    vofs = struct.unpack_from("<H", io, 0x12 + layer * 4)[0]
    return image, {"control": f"0x{control:04x}", "hofs": hofs, "vofs": vofs,
                   "width": width, "height": height}


def ring_pixels(data, palette_bytes, rows):
    width_tiles = PARAMETERS["ring_tile_width"]
    tile_pixels = PARAMETERS["tile_pixels"]
    stride = width_tiles * tile_pixels * tile_pixels
    if len(data) != rows * stride:
        raise ValueError(f"Unexpected ring size {len(data)} for {rows} rows")
    indices = np.empty((rows * tile_pixels, width_tiles * tile_pixels), dtype=np.uint8)
    for row in range(rows):
        tiles = np.frombuffer(data, dtype=np.uint8,
                              count=width_tiles * 64, offset=row * stride)
        indices[row * 8:(row + 1) * 8] = tiles.reshape(width_tiles, 8, 8).transpose(1, 0, 2).reshape(8, -1)
    raw = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw & 31) * 255 // 31,
                        ((raw >> 5) & 31) * 255 // 31,
                        ((raw >> 10) & 31) * 255 // 31,
                        np.full(raw.shape, 255)), axis=-1).astype(np.uint8)
    image = palette[indices].copy()
    image[indices == 0, 3] = 0
    return image


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def compare(native, ring):
    height = PARAMETERS["comparison_height"]
    native = native[:height]
    if len(ring) < height:
        ring = np.tile(ring, (height // len(ring) + 1, 1, 1))
    choices = []
    for flipped in (False, True):
        source = ring[:, ::-1] if flipped else ring
        # Tile-map rows move in 8-pixel units; sub-tile offsets are the BG
        # scroll register and are intentionally applied after this alignment.
        for offset in range(0, len(source), PARAMETERS["tile_pixels"]):
            candidate = source[offset:offset + height]
            if len(candidate) < height:
                candidate = np.concatenate((candidate, source[:height - len(candidate)]), axis=0)
            visible = (native[:, :, 3] > 0) | (candidate[:, :, 3] > 0)
            rgb_error = np.abs(native[:, :, :3].astype(np.int16) - candidate[:, :, :3].astype(np.int16))
            mean_rgb = float(rgb_error[visible].mean()) if visible.any() else 0.0
            alpha_error = float(np.mean(native[:, :, 3] != candidate[:, :, 3]))
            choices.append((mean_rgb, alpha_error, offset, flipped))
    return min(choices)


def score_initialized_window(native, ring, rows, camera_row, offset, flipped):
    """Measure only tile rows initialized for this field in the captured frame."""
    source = ring[:, ::-1] if flipped else ring
    map_origin_row = (offset // 8) % 32
    errors = []
    exact_rows = []
    compared_rows = []
    for scan_row in range(min(rows, PARAMETERS["stream_scan_rows"])):
        world_row = (camera_row + scan_row) % rows
        map_row = (world_row - map_origin_row) % 32
        native_row = native[map_row * 8:map_row * 8 + 8]
        source_row = source[(world_row % rows) * 8:(world_row % rows) * 8 + 8]
        if len(native_row) != 8 or len(source_row) != 8:
            continue
        visible = (native_row[:, :, 3] > 0) | (source_row[:, :, 3] > 0)
        rgb_error = np.abs(native_row[:, :, :3].astype(np.int16) -
                           source_row[:, :, :3].astype(np.int16))
        error = float(rgb_error[visible].mean()) if visible.any() else 0.0
        errors.append(error)
        exact_rows.append(bool(np.array_equal(native_row, source_row)))
        compared_rows.append({"world_row": world_row, "map_row": map_row,
                              "source_row": world_row % rows,
                              "mean_visible_rgb_error": error,
                              "exact_rgba_match": bool(np.array_equal(native_row, source_row))})
    return {"mean_visible_rgb_error": float(np.mean(errors)) if errors else None,
            "exact_rows": sum(exact_rows), "row_count": len(exact_rows),
            "rows": compared_rows}


def score_visible_initialized_window(native, ring, rows, camera_row, offset,
                                     flipped, vofs):
    """Compare only BG3 pixels the native display can show from initialized rows."""
    source = ring[:, ::-1] if flipped else ring
    map_origin_row = (offset // 8) % 32
    world_by_map_row = {
        (world_row - map_origin_row) % 32: world_row
        for scan_row in range(min(rows, PARAMETERS["stream_scan_rows"]))
        for world_row in [(camera_row + scan_row) % rows]
    }
    screen_height = PARAMETERS["native_screen_height"]
    screen_pixels = []
    exact_rows = []
    visible_map_rows = set()
    for screen_y in range(screen_height):
        map_y = (vofs + screen_y) % 256
        map_row, pixel_in_row = divmod(map_y, 8)
        world_row = world_by_map_row.get(map_row)
        if world_row is None:
            continue
        ring_y = (world_row % rows) * 8 + pixel_in_row
        native_line = native[map_y]
        source_line = source[ring_y]
        visible = (native_line[:, 3] > 0) | (source_line[:, 3] > 0)
        rgb_error = np.abs(native_line[:, :3].astype(np.int16) -
                           source_line[:, :3].astype(np.int16))
        if visible.any():
            screen_pixels.extend(rgb_error[visible].reshape(-1).tolist())
        exact_rows.append(bool(np.array_equal(native_line, source_line)))
        visible_map_rows.add(map_row)
    return {
        "native_bg3_vofs": vofs,
        "visible_initialized_map_rows": sorted(visible_map_rows),
        "visible_screen_lines_compared": len(exact_rows),
        "exact_screen_lines": sum(exact_rows),
        "mean_visible_rgb_error": float(np.mean(screen_pixels)) if screen_pixels else None,
    }


def overlay_streamed_rows(pixels, palette_bytes, field, ram, rom, counter_delta):
    """Apply the selected ROM tile-row chunks to their native circular ring rows."""
    rows, width_pixels = pixels.shape[0] // 8, pixels.shape[1]
    object_address = PARAMETERS["field_object_addresses"][field]
    object_offset = object_address - 0x02000000
    config = struct.unpack_from("<I", ram, object_offset + PARAMETERS["field_object_offsets"]["config_pointer"])[0]
    config_offset = config - 0x08000000
    record_count = struct.unpack_from("<I", rom, config_offset + PARAMETERS["config_offsets"]["row_count"])[0]
    table = struct.unpack_from("<I", rom, config_offset + PARAMETERS["config_offsets"]["row_table_pointer"])[0]
    if record_count != rows:
        raise ValueError(f"{field}: config has {record_count} row records but ring has {rows}")
    camera_y = struct.unpack_from("<i", ram, object_offset + PARAMETERS["field_object_offsets"]["camera_y"])[0]
    camera_row = (camera_y >> 3) % record_count
    counter = struct.unpack_from("<I", ram, PARAMETERS["global_frame_counter"] - 0x02000000)[0] + counter_delta
    raw_palette = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw_palette & 31) * 255 // 31,
                        ((raw_palette >> 5) & 31) * 255 // 31,
                        ((raw_palette >> 10) & 31) * 255 // 31,
                        np.full(raw_palette.shape, 255)), axis=-1).astype(np.uint8)
    applied = []
    for scan_row in range(min(record_count, PARAMETERS["stream_scan_rows"])):
        world_row = (camera_row + scan_row) % record_count
        descriptor_at = object_offset + PARAMETERS["field_object_offsets"]["row_descriptors"] + world_row * PARAMETERS["field_object_offsets"]["row_descriptor_stride"]
        x, tile_width, rate, period = struct.unpack_from("<4B", ram, descriptor_at)
        pointer_table = struct.unpack_from("<I", ram, descriptor_at + 4)[0]
        if not (tile_width and rate and period and pointer_table):
            continue
        index = (counter // rate) % period
        source = struct.unpack_from("<I", rom, pointer_table - 0x08000000 + index * 4)[0]
        byte_count = tile_width * 64
        raw = np.frombuffer(rom, dtype=np.uint8, count=byte_count, offset=source - 0x08000000)
        source_pixels = raw.reshape(tile_width, 8, 8).transpose(1, 0, 2).reshape(8, tile_width * 8)
        ring_y = (world_row % rows) * 8
        x_pixels = x * 8
        if x_pixels + tile_width * 8 > width_pixels:
            raise ValueError(f"{field} row {world_row}: streamed span exceeds ring width")
        colors = palette[source_pixels].copy()
        colors[source_pixels == 0, 3] = 0
        pixels[ring_y:ring_y + 8, x_pixels:x_pixels + tile_width * 8] = colors
        applied.append({"world_row": world_row, "ring_row": world_row % rows,
                        "x": x, "width_tiles": tile_width,
                        "rate": rate, "period": period, "selected_index": index,
                        "rom_address": f"0x{source:08x}"})
    return pixels, {"counter": counter, "camera_y": camera_y,
                    "camera_row": camera_row, "applied_rows": applied}


def export_stream_atlas(stage, field, ram, rom, palette_bytes, row_count):
    """Decode complete ROM animation tables for the stage's streamed tile rows."""
    object_address = PARAMETERS["field_object_addresses"][field]
    object_offset = object_address - 0x02000000
    raw_palette = np.frombuffer(palette_bytes, dtype="<u2")
    palette = np.stack(((raw_palette & 31) * 255 // 31,
                        ((raw_palette >> 5) & 31) * 255 // 31,
                        ((raw_palette >> 10) & 31) * 255 // 31,
                        np.full(raw_palette.shape, 255)), axis=-1).astype(np.uint8)
    atlas_rows = []
    descriptors = []
    next_y = 0
    for ring_row in range(row_count):
        descriptor_at = (object_offset + PARAMETERS["field_object_offsets"]["row_descriptors"] +
                         ring_row * PARAMETERS["field_object_offsets"]["row_descriptor_stride"])
        x, tile_width, rate, period = struct.unpack_from("<4B", ram, descriptor_at)
        pointer_table = struct.unpack_from("<I", ram, descriptor_at + 4)[0]
        if not (tile_width and rate and period and pointer_table):
            continue
        if x + tile_width > PARAMETERS["ring_tile_width"]:
            raise ValueError(f"{stage}/{field} row {ring_row}: streamed span exceeds ring width")
        table_offset = pointer_table - 0x08000000
        variant_y = next_y
        source_addresses = []
        for variant in range(period):
            source = struct.unpack_from("<I", rom, table_offset + variant * 4)[0]
            source_offset = source - 0x08000000
            byte_count = tile_width * 64
            if source_offset < 0 or source_offset + byte_count > len(rom):
                raise ValueError(f"{stage}/{field} row {ring_row}: invalid ROM tile pointer {source:#010x}")
            indices = np.frombuffer(rom, dtype=np.uint8, count=byte_count,
                                    offset=source_offset).reshape(tile_width, 8, 8)
            indices = indices.transpose(1, 0, 2).reshape(8, tile_width * 8)
            pixels = palette[indices].copy()
            pixels[indices == 0, 3] = 0
            atlas_rows.append((next_y, pixels))
            source_addresses.append(f"0x{source:08x}")
            next_y += 8
        descriptors.append({
            "ring_row": ring_row, "x_tiles": x, "width_tiles": tile_width,
            "rate": rate, "period": period, "atlas_y": variant_y,
            "pointer_table": f"0x{pointer_table:08x}",
            "source_addresses": source_addresses,
        })
    atlas = Image.new("RGBA", (PARAMETERS["ring_tile_width"] * 8, max(1, next_y)),
                      (0, 0, 0, 0))
    for y, pixels in atlas_rows:
        atlas.paste(Image.fromarray(pixels), (0, y))
    path = ASSET_DIRECTORY / f"bg3-streams-{stage}-{field}.png"
    atlas.save(path)
    return path, descriptors


def main():
    decoded = ROOT / PARAMETERS["decoded_rings"]
    manifest = json.loads((decoded / "parameters.json").read_text(encoding="utf-8"))
    decoded_summary = json.loads((decoded / "summary.json").read_text(encoding="utf-8"))
    rom = Path(PARAMETERS["rom"]).read_bytes()
    out = ROOT / "scripts" / "OUTPUT" / (
        "eggo-stage-ring-comparison_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
    out.mkdir(parents=True, exist_ok=False)
    records = []
    previews = []
    runtime_assets = {}
    runtime_streams = {}
    stages = manifest["stages"]
    for stage, info in stages.items():
        capture = Path(info["capture_dir"])
        stem = capture / f'{info["capture_name"]}.frame{info["capture_frame"]:05d}'
        capture_files = {suffix: Path(str(stem) + suffix).read_bytes()
                         for suffix in (".ram", ".memory3", ".0x5000000", ".0x4000000")}
        ram = capture_files[".ram"]
        native, registers = decode_native_bg3(
            capture_files[".memory3"], capture_files[".0x5000000"],
            capture_files[".0x4000000"])
        rows = decoded_summary["stages"][stage]["fields"]["player"]["rows"]
        palette = capture_files[".0x5000000"][:512]
        fields = {}
        canvas = Image.new("RGBA", (256, rows * 8), (0, 0, 0, 0))
        for field, x in PARAMETERS["field_crops"].items():
            ring = ring_pixels((decoded / f"ring-{stage}-{field}.bin").read_bytes(), palette, rows)
            ring_path = out / f"ring-{stage}-{field}.png"
            Image.fromarray(ring).save(ring_path)
            crop = native[:, x:x + ring.shape[1]]
            variants = []
            for counter_delta in (-1, 0):
                streamed = ring.copy()
                streamed, stream_info = overlay_streamed_rows(
                    streamed, palette, field, ram, rom, counter_delta)
                error, alpha_error, offset, flipped = compare(crop, streamed)
                initialized = score_initialized_window(
                    crop, streamed, rows, stream_info["camera_row"], offset, flipped)
                visible = score_visible_initialized_window(
                    crop, streamed, rows, stream_info["camera_row"], offset,
                    flipped, registers["vofs"])
                variants.append((visible["mean_visible_rgb_error"], error,
                                 alpha_error, offset, flipped, counter_delta,
                                 stream_info, initialized, visible, streamed))
            (initialized_error, error, alpha_error, offset, flipped,
             counter_delta, stream_info, initialized, visible, streamed) = min(variants)
            streamed_path = out / f"ring-{stage}-{field}-streamed.png"
            Image.fromarray(streamed).save(streamed_path)
            runtime_asset = ASSET_DIRECTORY / f"bg3-{stage}-{field}.png"
            Image.fromarray(streamed).save(runtime_asset)
            stream_asset, descriptors = export_stream_atlas(
                stage, field, ram, rom, palette, rows)
            runtime_assets.setdefault(stage, {})[field] = {
                "file": runtime_asset.name,
                "sha256": sha256(runtime_asset.read_bytes()),
                "source_capture": stem.relative_to(ROOT).as_posix(),
                "native_frame_counter": stream_info["counter"],
                "stream_counter_delta": counter_delta,
                "native_camera_y": stream_info["camera_y"],
                "ring_rows": rows,
                "width_pixels": int(streamed.shape[1]),
                "height_pixels": int(streamed.shape[0]),
            }
            runtime_streams.setdefault(stage, {})[field] = {
                "file": stream_asset.name,
                "sha256": sha256(stream_asset.read_bytes()),
                "native_frame_counter": stream_info["counter"],
                "stream_counter_delta": counter_delta,
                "source_capture": stem.relative_to(ROOT).as_posix(),
                "rows": descriptors,
            }
            object_address = PARAMETERS["field_object_addresses"][field]
            obj = object_address - manifest["ewram_base"]
            orientation = ram[obj + 0x274]
            fields[field] = {
                "native_object": f"0x{object_address:08x}",
                "native_orientation_flag": orientation,
                "ring_rows": rows,
                "ring_source_sha256": decoded_summary["stages"][stage]["fields"][field]["decoded_sha256"],
                "pixel_asset": ring_path.name,
                "best_vertical_offset": offset,
                "best_horizontal_flip": flipped,
                "stream_counter_delta": counter_delta,
                "stream_counter": stream_info["counter"],
                "stream_rows": stream_info["applied_rows"],
                "mean_visible_rgb_error": error,
                "initialized_window": initialized,
                "visible_initialized_window": visible,
                "alpha_mismatch_fraction": alpha_error,
            }
            canvas.alpha_composite(Image.fromarray(ring), (x, 0))
        canvas_path = out / f"ring-{stage}-fields.png"
        canvas.save(canvas_path)
        record = {"stage": stage, "native_capture": stem.relative_to(ROOT).as_posix(),
                  "input_hashes": {"rom_sha256": sha256(rom),
                                   "native_ram_sha256": sha256(capture_files[".ram"]),
                                   "native_vram_sha256": sha256(capture_files[".memory3"]),
                                   "native_palette_sha256": sha256(capture_files[".0x5000000"]),
                                   "native_registers_sha256": sha256(capture_files[".0x4000000"])},
                  "native_bg3": registers, "fields": fields,
                  "combined_asset": canvas_path.name}
        records.append(record)
        previews.append((stage, canvas.copy()))
    preview = Image.new("RGBA", (256, 512 * len(previews)), (30, 35, 40, 255))
    draw = ImageDraw.Draw(preview)
    for index, (stage, image) in enumerate(previews):
        preview.alpha_composite(image, (0, index * 512))
        draw.text((4, index * 512 + 4), stage, fill=(255, 255, 255, 255))
    preview.save(out / "all-stage-ring-previews.png")
    output_parameters = {**PARAMETERS, "rom_sha256": sha256(rom),
                         "decoded_parameters_sha256": sha256((decoded / "parameters.json").read_bytes()),
                         "decoded_summary_sha256": sha256((decoded / "summary.json").read_bytes())}
    (out / "parameters.json").write_text(json.dumps(output_parameters, indent=2) + "\n", encoding="utf-8")
    (out / "comparison.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    background_manifest = {
        "method": "Native 8bpp BG3 ring with per-row ROM pointer-table variants.",
        "assets": runtime_assets,
        "streams": runtime_streams,
    }
    (ASSET_DIRECTORY / "background-rings.json").write_text(
        json.dumps(background_manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8")
    module_data = {
        stage: {
            field: {"nativeFrameCounter": values["native_frame_counter"],
                    "rows": [{"ringRow": row["ring_row"], "xTiles": row["x_tiles"],
                              "widthTiles": row["width_tiles"], "rate": row["rate"],
                              "period": row["period"], "atlasY": row["atlas_y"]}
                             for row in values["rows"]]}
            for field, values in fields.items()
        }
        for stage, fields in runtime_streams.items()
    }
    (ASSET_DIRECTORY / "background-rings.js").write_text(
        "// Generated by scripts/eggo-compare-stage-rings.py from the reference ROM.\n"
        "export const BG3_STREAMS = Object.freeze(" +
        json.dumps(module_data, separators=(",", ":"), ensure_ascii=False) + ");\n" +
        "export const BG3_RING_ROWS = Object.freeze(" +
        json.dumps({stage: {field: values['ring_rows'] for field, values in fields.items()}
                    for stage, fields in runtime_assets.items()}, separators=(",", ":")) + ");\n",
        encoding="utf-8")
    print(json.dumps({"stages": len(records), "output": str(out),
                      "best_matches": {record["stage"]: {
                          field: round(values["mean_visible_rgb_error"], 3)
                          for field, values in record["fields"].items()}
                          for record in records}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
