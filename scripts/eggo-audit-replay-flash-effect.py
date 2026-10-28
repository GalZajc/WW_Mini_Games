"""Compare replay pixel diffs with and without the removed whole-field flash.

This is an offline, deterministic comparison of a saved 600-frame Electron
sheet and the matching native screenshots. It overlays the removed renderer
flash on a no-flash capture to estimate its exact visual contribution; it does
not change or overwrite either capture.
Results are written beneath scripts/OUTPUT with hashed inputs and parameters.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json
import argparse

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_APP_RUN = Path("tests/OUTPUT/eggo-mania-visual_2026-10-07T20-17-34-052Z")
NATIVE_CAPTURE = Path("scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876")
NATIVE_PREFIX = "eggo-replay-full-graphics"
WIDTH, HEIGHT, FIELD_WIDTH, DIVIDER = 240, 160, 112, 16
FLASH_RGB = np.asarray([255, 245, 178], dtype=np.float64)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-run", type=Path, default=DEFAULT_APP_RUN,
                        help="Replay output directory containing the app frame sheet and report.")
    args = parser.parse_args()
    app_run = args.app_run if args.app_run.is_absolute() else ROOT / args.app_run
    app_run = app_run.resolve()
    app_dir = app_run
    sheet_path = app_dir / "input-replay-app-frames.png"
    report_path = app_dir / "input-replay-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    camera_series = report["cameraSeries"]
    sheet = Image.open(sheet_path).convert("RGB")
    if len(camera_series) != 2 or any(len(field) != 600 for field in camera_series):
        raise ValueError("Expected the complete 600-frame, two-field replay trace")

    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-replay-flash-audit_" + datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f")
    )
    output.mkdir(parents=True, exist_ok=False)
    rows: list[dict[str, int | float]] = []
    total_no_flash = total_with_flash = 0
    totals = {name: 0 for name in ("player", "divider", "cpu")}
    flashed_totals = dict(totals)

    for frame in range(1, 601):
        sx = ((frame - 1) % 10) * WIDTH
        sy = ((frame - 1) // 10) * HEIGHT
        app = np.asarray(sheet.crop((sx, sy, sx + WIDTH, sy + HEIGHT)), dtype=np.uint8)
        native_path = ROOT / NATIVE_CAPTURE / f"{NATIVE_PREFIX}.frame{frame:05d}.png"
        native = np.asarray(Image.open(native_path).convert("RGB"), dtype=np.uint8)
        if native.shape != (HEIGHT, WIDTH, 3):
            raise ValueError(f"Unexpected native frame dimensions at frame {frame}")

        no_flash_mask = np.any(app != native, axis=2)
        flashed = app.astype(np.float64)
        flashes = []
        for field_index, left in enumerate((0, FIELD_WIDTH + DIVIDER)):
            flash = float(camera_series[field_index][frame - 1]["appTowerFlash"] or 0)
            flashes.append(flash)
            alpha = min(1.0, max(0.0, flash * 0.2))
            if alpha <= 0.0:
                continue
            region = flashed[:, left:left + FIELD_WIDTH, :]
            region[:] = np.rint(region * (1.0 - alpha) + alpha * FLASH_RGB)
        flashed = np.clip(flashed, 0, 255).astype(np.uint8)
        flashed_mask = np.any(flashed != native, axis=2)
        regions = (("player", 0, FIELD_WIDTH), ("divider", FIELD_WIDTH, FIELD_WIDTH + DIVIDER),
                   ("cpu", FIELD_WIDTH + DIVIDER, WIDTH))
        record: dict[str, int | float] = {
            "frame": frame,
            "player_flash": flashes[0],
            "cpu_flash": flashes[1],
            "no_flash_differing_pixels": int(no_flash_mask.sum()),
            "with_flash_differing_pixels": int(flashed_mask.sum()),
        }
        total_no_flash += record["no_flash_differing_pixels"]
        total_with_flash += record["with_flash_differing_pixels"]
        for name, left, right in regions:
            no_flash_count = int(no_flash_mask[:, left:right].sum())
            with_flash_count = int(flashed_mask[:, left:right].sum())
            record[f"no_flash_{name}_diff"] = no_flash_count
            record[f"with_flash_{name}_diff"] = with_flash_count
            totals[name] += no_flash_count
            flashed_totals[name] += with_flash_count
        rows.append(record)
        if frame in (218, 231):
            Image.fromarray(flashed).save(output / f"frame{frame:03d}-with-flash.png")

    with (output / "frames.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    parameters = {
        "experiment": "Eggo Mania replay global flash removal diagnostic",
        "app_run": str(app_run.relative_to(ROOT)),
        "native_capture": str(NATIVE_CAPTURE),
        "frames": 600,
        "screen": {"width": WIDTH, "height": HEIGHT, "field_width": FIELD_WIDTH, "divider": DIVIDER},
        "flash_overlay": {"rgb": FLASH_RGB.astype(int).tolist(), "alpha": "appTowerFlash * 0.2"},
        "flash_composite": "round(app_rgb * (1 - alpha) + alpha * flash_rgb); clamp channels to 0..255",
        "random_seed": None,
        "audio_enabled": False,
        "inputs_sha256": {"app_frames": sha256(sheet_path), "replay_report": sha256(report_path)},
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
    results = {
        "frames": 600,
        "no_flash_differing_pixels": total_no_flash,
        "with_flash_differing_pixels": total_with_flash,
        "no_flash_by_region": totals,
        "with_flash_by_region": flashed_totals,
        "flash_added_differing_pixels": total_with_flash - total_no_flash,
        "reduction_fraction_without_flash": (total_with_flash - total_no_flash) / total_with_flash if total_with_flash else 0.0,
        "interpretation": "Diagnostic only; this isolates the visual contribution of the old overlay on this replay and does not account for other missing state.",
        "output_directory": str(output.relative_to(ROOT)),
    }
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
