"""Compare each reconstructed replay screenshot with its native GBA frame."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse
import csv
import json
import hashlib

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "experiment": "Eggo Mania 600-frame screenshot parity audit",
    "app_contact_sheet": "tests/OUTPUT/eggo-mania-visual_2026-10-07T19-18-11-923Z/input-replay-app-frames.png",
    "native_capture_directory": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
    "native_frame_prefix": "eggo-replay-full-graphics.frame",
    "frame_count": 600,
    "frame_size_pixels": [240, 160],
    "contact_sheet_columns": 10,
    "comparison": "Exact RGB equality; no scaling or tolerance",
    "input_tape": "tests/OUTPUT/eggo-input-replay_2026-10-07_03-16-26_086460/steps.json",
    "random_seed": 42,
    "electron_audio_muted": True,
    "replay_scope": "Read from the associated replay report when available",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-sheet", default=PARAMETERS["app_contact_sheet"],
                        help="Project-relative or absolute 10-column app screenshot sheet")
    parser.add_argument("--native-directory", default=PARAMETERS["native_capture_directory"],
                        help="Directory containing the native PNG frames")
    parser.add_argument("--frame-count", type=int, default=PARAMETERS["frame_count"],
                        help="Number of frames to compare")
    parser.add_argument("--native-prefix", default=PARAMETERS["native_frame_prefix"],
                        help="Native filename prefix including the .frame suffix")
    args = parser.parse_args()
    PARAMETERS["app_contact_sheet"] = args.app_sheet
    PARAMETERS["native_capture_directory"] = args.native_directory
    PARAMETERS["frame_count"] = args.frame_count
    PARAMETERS["native_frame_prefix"] = args.native_prefix
    PARAMETERS["experiment"] = f'Eggo Mania {args.frame_count}-frame screenshot parity audit'

    width, height = PARAMETERS["frame_size_pixels"]
    columns = PARAMETERS["contact_sheet_columns"]
    app_path = Path(PARAMETERS["app_contact_sheet"])
    if not app_path.is_absolute():
        app_path = ROOT / app_path
    native_dir = Path(PARAMETERS["native_capture_directory"])
    if not native_dir.is_absolute():
        native_dir = ROOT / native_dir
    app_sheet = Image.open(app_path).convert("RGB")
    report_path = app_path.parent / "input-replay-report.json"
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
        PARAMETERS["replay_scope"] = report.get("replayCoverage", PARAMETERS["replay_scope"])
        PARAMETERS["input_tape"] = report.get("replayCoverage", {}).get("inputSource", PARAMETERS["input_tape"])
    source_paths = sorted(path for path in (ROOT / "renderer/games/eggo-mania").rglob("*")
                          if path.is_file() and path.suffix in (".js", ".json", ".png"))
    source_paths += [ROOT / "tests/eggo-mania-visual.mjs", Path(__file__)]
    source_paths += [ROOT / PARAMETERS["input_tape"], app_path]
    PARAMETERS["sha256"] = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                             for path in source_paths}
    native_parameters = native_dir / (PARAMETERS["native_frame_prefix"].removesuffix(".frame") + ".json")
    if native_parameters.exists():
        PARAMETERS["native_capture_parameters"] = json.loads(native_parameters.read_text(encoding="utf-8"))
    expected_size = (columns * width, ((PARAMETERS["frame_count"] + columns - 1) // columns) * height)
    if app_sheet.size != expected_size:
        raise ValueError(f"Expected app contact sheet {expected_size}, got {app_sheet.size}")

    records: list[dict[str, int | str]] = []
    first_mismatch: dict[str, int | list[int]] | None = None
    worst_frame: dict[str, int | list[int]] | None = None
    alignment_diagnostics: list[dict[str, int | float]] = []
    total_different = 0
    exact_frames = 0
    mismatch_frequency = np.zeros((height, width), dtype=np.uint16)
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S_%f")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-replay-frame-diff_{stamp}"
    output.mkdir(parents=True, exist_ok=False)

    for index in range(PARAMETERS["frame_count"]):
        frame = index + 1
        x0 = (index % columns) * width
        y0 = (index // columns) * height
        app = np.asarray(app_sheet.crop((x0, y0, x0 + width, y0 + height)))
        native_path = native_dir / f"{PARAMETERS['native_frame_prefix']}{frame:05d}.png"
        with Image.open(native_path) as image:
            native = np.asarray(image.convert("RGB"))
        if native.shape != app.shape:
            raise ValueError(f"Frame {frame}: app/native dimensions differ: {app.shape}/{native.shape}")

        if frame in (1, 219, 231, 600):
            Image.fromarray(app, "RGB").save(output / f"frame-{frame:03d}-app.png")
            Image.fromarray(native, "RGB").save(output / f"frame-{frame:03d}-native.png")

        different = np.any(app != native, axis=2)
        mismatch_frequency += different
        count = int(np.count_nonzero(different))
        channel_error = np.abs(app.astype(np.int16) - native.astype(np.int16))
        if frame in (1, 219, 231, 600):
            candidates = []
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    ax = slice(max(128, 128 + dx), min(width, 240 + min(dx, 0)))
                    nx = slice(max(128, 128 - dx), min(width, 240 - max(dx, 0)))
                    ay = slice(max(0, dy), min(height, height + min(dy, 0)))
                    ny = slice(max(0, -dy), min(height, height - max(dy, 0)))
                    a_shifted, n_reference = app[ay, ax], native[ny, nx]
                    pixel_diff = np.any(a_shifted != n_reference, axis=2)
                    candidates.append({
                        "dx": dx,
                        "dy": dy,
                        "different_pixels": int(np.count_nonzero(pixel_diff)),
                        "mean_abs_channel_error": float(np.mean(np.abs(a_shifted.astype(np.int16) - n_reference.astype(np.int16)))),
                    })
            best_alignment = min(candidates, key=lambda item: (item["different_pixels"], item["mean_abs_channel_error"]))
            alignment_diagnostics.append({"frame": frame, **best_alignment})
        if frame in (1, 219, 231, 600):
            diff = np.zeros((height, width, 3), dtype=np.uint8)
            diff[~different] = native[~different]
            diff[different] = [255, 0, 255]
            Image.fromarray(diff, "RGB").save(output / f"frame-{frame:03d}-diff.png")
            if frame == 600:
                ys, xs = np.where(different)
                with (output / "frame-600-mismatch-pixels.csv").open(
                        "w", newline="", encoding="utf-8") as stream:
                    writer = csv.writer(stream)
                    writer.writerow(["x", "y", "region", "app_r", "app_g", "app_b",
                                     "native_r", "native_g", "native_b"])
                    for y, x in zip(ys.tolist(), xs.tolist()):
                        region = "player" if x < 112 else "divider" if x < 128 else "cpu"
                        writer.writerow([x, y, region, *app[y, x].tolist(),
                                         *native[y, x].tolist()])
        total_different += count
        if count == 0:
            exact_frames += 1
            bbox: tuple[int, int, int, int] | None = None
            first_xy: tuple[int, int] | None = None
        else:
            ys, xs = np.where(different)
            bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
            first_xy = (int(xs[0]), int(ys[0]))
            first = {"frame": frame, "x": first_xy[0], "y": first_xy[1], "app_rgb": app[first_xy[1], first_xy[0]].tolist(),
                     "native_rgb": native[first_xy[1], first_xy[0]].tolist(), "different_pixels": count}
            if first_mismatch is None:
                first_mismatch = first
                crop_box = (max(0, first_xy[0] - 8), max(0, first_xy[1] - 8),
                            min(width, first_xy[0] + 9), min(height, first_xy[1] + 9))
                crop_size = (crop_box[2] - crop_box[0], crop_box[3] - crop_box[1])
                crop_comparison = Image.new("RGB", (crop_size[0] * 16, crop_size[1] * 8))
                crop_comparison.paste(Image.fromarray(app).crop(crop_box).resize((crop_size[0] * 8, crop_size[1] * 8), Image.Resampling.NEAREST), (0, 0))
                crop_comparison.paste(Image.fromarray(native).crop(crop_box).resize((crop_size[0] * 8, crop_size[1] * 8), Image.Resampling.NEAREST), (crop_size[0] * 8, 0))
                crop_comparison.save(output / "first-mismatch-app-left-native-right.png")
            if worst_frame is None or count > int(worst_frame["different_pixels"]):
                worst_frame = {"frame": frame, "different_pixels": count, "first_xy": list(first_xy), "bbox": list(bbox)}
                diff = np.zeros((height, width, 3), dtype=np.uint8)
                diff[~different] = native[~different]
                diff[different] = [255, 0, 255]
                Image.fromarray(app, "RGB").save(output / "worst-frame-app.png")
                Image.fromarray(native, "RGB").save(output / "worst-frame-native.png")
                Image.fromarray(diff, "RGB").save(output / "worst-frame-diff.png")
            if frame == first_mismatch["frame"]:
                diff = np.zeros((height, width, 3), dtype=np.uint8)
                diff[~different] = native[~different]
                diff[different] = [255, 0, 255]
                Image.fromarray(diff, "RGB").save(output / "first-mismatch-frame-diff.png")

        def region_count(start: int, end: int) -> int:
            return int(np.count_nonzero(different[:, start:end]))

        def region_channel_error(start: int, end: int) -> float:
            return float(np.mean(channel_error[:, start:end]))

        records.append({
            "frame": frame,
            "different_pixels": count,
            "exact": int(count == 0),
            "player_pixels": region_count(0, 112),
            "divider_pixels": region_count(112, 128),
            "cpu_pixels": region_count(128, 240),
            "player_mean_abs_channel_error": region_channel_error(0, 112),
            "divider_mean_abs_channel_error": region_channel_error(112, 128),
            "cpu_mean_abs_channel_error": region_channel_error(128, 240),
            "first_x": first_xy[0] if first_xy else "",
            "first_y": first_xy[1] if first_xy else "",
            "min_x": bbox[0] if bbox else "",
            "min_y": bbox[1] if bbox else "",
            "max_x": bbox[2] if bbox else "",
            "max_y": bbox[3] if bbox else "",
        })

    with (output / "frame-differences.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)

    total_pixels = PARAMETERS["frame_count"] * width * height
    frequency_rgb = np.zeros((height, width, 3), dtype=np.uint8)
    # Blue marks occasional mismatches; red marks pixels that disagree on
    # nearly every frame. This separates moving-sprite errors from fixed scene
    # layer errors without treating either as a parity score.
    ratio = mismatch_frequency.astype(np.float32) / max(1, PARAMETERS["frame_count"])
    frequency_rgb[..., 0] = np.rint(255 * ratio).astype(np.uint8)
    frequency_rgb[..., 2] = np.rint(255 * (1 - ratio)).astype(np.uint8)
    Image.fromarray(frequency_rgb, "RGB").save(output / "pixel-mismatch-frequency.png")
    summary = {
        "experiment": PARAMETERS["experiment"],
        "frames_compared": PARAMETERS["frame_count"],
        "exact_frames": exact_frames,
        "different_pixels_over_all_frames": total_different,
        "pixels_compared_over_all_frames": total_pixels,
        "exact_pixel_fraction": (total_pixels - total_different) / total_pixels,
        "unique_pixels_different_at_least_once": int(np.count_nonzero(mismatch_frequency)),
        "pixels_different_on_every_frame": int(np.count_nonzero(mismatch_frequency == PARAMETERS["frame_count"])),
        "pixel_mismatch_frequency_image": (output / "pixel-mismatch-frequency.png").relative_to(ROOT).as_posix(),
        "first_mismatch": first_mismatch,
        "worst_frame": worst_frame,
        "best_cpu_translation_within_two_pixels": alignment_diagnostics,
        "frame_difference_csv": (output / "frame-differences.csv").relative_to(ROOT).as_posix(),
        "output_directory": output.relative_to(ROOT).as_posix(),
    }
    (output / "parameters.json").write_text(json.dumps(PARAMETERS, indent=2) + "\n", encoding="utf-8")
    (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
