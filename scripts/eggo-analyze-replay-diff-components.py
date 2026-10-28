#!/usr/bin/env python3
"""Group pixel differences in one saved Eggo Mania native/app replay frame."""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from pathlib import Path
import argparse
import csv
import hashlib
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PARITY = "scripts/OUTPUT/eggo-replay-screen-parity_2026-10-08_07-06-18_246993"
NEIGHBORS = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0),
             (-1, 1), (0, 1), (1, 1))
REGIONS = ((0, 112, "player"), (112, 128, "divider"), (128, 240, "cpu"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parity-directory", default=DEFAULT_PARITY,
                        help="Parity output directory containing frameNNNNN-{native,app}.png")
    parser.add_argument("--frame", type=int, default=191)
    args = parser.parse_args()
    parity = Path(args.parity_directory)
    if not parity.is_absolute():
        parity = ROOT / parity
    stem = f"frame{args.frame:05d}"
    native_path, app_path = parity / f"{stem}-native.png", parity / f"{stem}-app.png"
    native = np.asarray(Image.open(native_path).convert("RGB"))
    app = np.asarray(Image.open(app_path).convert("RGB"))
    if native.shape != (160, 240, 3) or app.shape != native.shape:
        raise ValueError(f"Unexpected screenshot sizes: native={native.shape}, app={app.shape}")
    mismatch = np.any(native != app, axis=2)
    visited = np.zeros(mismatch.shape, dtype=bool)
    components: list[dict[str, object]] = []
    component_map = np.zeros((160, 240, 3), dtype=np.uint8)
    for y0, x0 in zip(*np.nonzero(mismatch)):
        if visited[y0, x0]:
            continue
        queue = deque([(int(x0), int(y0))])
        visited[y0, x0] = True
        pixels: list[tuple[int, int]] = []
        while queue:
            x, y = queue.popleft()
            pixels.append((x, y))
            for dx, dy in NEIGHBORS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < 240 and 0 <= ny < 160 and mismatch[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((nx, ny))
        xs = [point[0] for point in pixels]
        ys = [point[1] for point in pixels]
        component_id = len(components) + 1
        region = next(name for left, right, name in REGIONS if left <= min(xs) < right)
        native_colors = CounterColor(native[y, x] for x, y in pixels)
        app_colors = CounterColor(app[y, x] for x, y in pixels)
        components.append({
            "id": component_id, "pixels": len(pixels), "region": region,
            "bounds": [min(xs), min(ys), max(xs), max(ys)],
            "native_common_rgb": native_colors,
            "app_common_rgb": app_colors,
        })
        color = ((component_id * 73) % 251 + 1,
                 (component_id * 151) % 251 + 1,
                 (component_id * 199) % 251 + 1)
        for x, y in pixels:
            component_map[y, x] = color

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-replay-diff-components_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    Image.fromarray(component_map).save(output / "components.png")
    zoom_components = sorted(components, key=lambda item: int(item["pixels"]), reverse=True)[:5]
    diff_rgb = np.zeros_like(native)
    diff_rgb[mismatch] = (255, 0, 255)
    diff_rgb[~mismatch] = (24, 24, 24)
    margin = 2
    scale = 3
    crops = []
    for component in zoom_components:
        left, top, right, bottom = component["bounds"]
        box = (max(0, left - margin), max(0, top - margin),
               min(240, right + margin + 1), min(160, bottom + margin + 1))
        crops.append((component, [Image.fromarray(pixels).crop(box).resize(
            ((box[2] - box[0]) * scale, (box[3] - box[1]) * scale), Image.Resampling.NEAREST)
            for pixels in (native, app, diff_rgb)]))
    zoom_width = max(crop.width for _, row in crops for crop in row)
    zoom_height = sum(max(crop.height for crop in row) + 8 for _, row in crops)
    zoom = Image.new("RGB", (zoom_width * 3 + 16, zoom_height), (12, 12, 12))
    y_cursor = 0
    zoom_manifest = []
    for component, row in crops:
        row_height = max(crop.height for crop in row)
        for column, crop in enumerate(row):
            zoom.paste(crop, (column * (zoom_width + 8), y_cursor))
        zoom_manifest.append({"id": component["id"], "bounds": component["bounds"],
                              "crop_source_order": ["native", "app", "difference"],
                              "magnification": scale})
        y_cursor += row_height + 8
    zoom.save(output / "largest-components-zoom.png")
    with (output / "components.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=("id", "pixels", "region", "bounds",
                                                  "native_common_rgb", "app_common_rgb"))
        writer.writeheader()
        writer.writerows(components)
    params = {
        "experiment": "Connected components of native/app replay pixel differences",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parity_directory": parity.relative_to(ROOT).as_posix(),
        "frame": args.frame,
        "connectivity": 8,
        "screenshot_size": [240, 160],
        "random_seed": None,
        "audioOutputMuted": True,
        "input_sha256": {str(path.relative_to(ROOT)): sha256(path)
                         for path in (native_path, app_path)},
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    results = {
        "frame": args.frame,
        "different_pixels": int(mismatch.sum()),
        "component_count": len(components),
        "largest_components": sorted(components, key=lambda item: int(item["pixels"]), reverse=True)[:30],
        "component_image": "components.png",
        "component_csv": "components.csv",
        "largest_components_zoom": "largest-components-zoom.png",
        "zoom_layout": zoom_manifest,
    }
    (output / "parameters.json").write_text(json.dumps(params, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), **results}, indent=2))


def CounterColor(pixels):
    counts: dict[tuple[int, int, int], int] = {}
    for pixel in pixels:
        key = tuple(int(channel) for channel in pixel)
        counts[key] = counts.get(key, 0) + 1
    return [{"rgb": list(rgb), "count": count}
            for rgb, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:5]]


if __name__ == "__main__":
    main()
