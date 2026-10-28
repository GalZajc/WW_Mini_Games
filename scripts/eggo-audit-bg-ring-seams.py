"""Audit the vertical wrap boundary in the decoded native BG3 ring images."""
from datetime import datetime
from pathlib import Path
import csv
import hashlib
import json
import platform

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "renderer" / "games" / "eggo-mania" / "assets"
OUTPUT = ROOT / "scripts" / "OUTPUT"
STAGES = ("beanstalk", "factory", "dragon", "castle", "pirate", "space", "jungle", "park")
FIELDS = ("player", "cpu")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S_%f")
    out = OUTPUT / f"eggo-bg-ring-seam-audit_{stamp}"
    out.mkdir(parents=True, exist_ok=False)
    rows = []
    inputs = []
    previews = []

    for stage in STAGES:
        for field in FIELDS:
            path = ASSETS / f"bg3-{stage}-{field}.png"
            if not path.exists():
                continue
            with Image.open(path) as image:
                rgba = np.asarray(image.convert("RGBA"), dtype=np.int16)
            height, width, _ = rgba.shape
            if height < 2:
                continue
            rgb = rgba[:, :, :3]
            row_delta = np.abs(rgb[1:] - rgb[:-1]).mean(axis=(1, 2))
            wrap_delta = float(np.abs(rgb[0] - rgb[-1]).mean())
            rows.append({
                "stage": stage,
                "field": field,
                "width": width,
                "height": height,
                "wrap_mean_abs_rgb_delta": wrap_delta,
                "interior_median_row_delta": float(np.median(row_delta)),
                "interior_p95_row_delta": float(np.percentile(row_delta, 95)),
                "interior_max_row_delta": float(np.max(row_delta)),
                "wrap_to_interior_p95_ratio": wrap_delta / max(float(np.percentile(row_delta, 95)), 1e-9),
            })
            inputs.append({
                "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                "sha256": sha256(path),
                "width": width,
                "height": height,
            })
            strip = np.concatenate((rgba[-16:], rgba[:16]), axis=0).astype(np.uint8)
            previews.append((f"{stage} / {field}", Image.fromarray(strip, "RGBA")))

    if not rows:
        raise RuntimeError(f"No BG3 ring images found in {ASSETS}")

    with (out / "metrics.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    columns = 4
    cell_w, cell_h, label_h = 112, 32, 18
    contact = Image.new("RGBA", (columns * cell_w, ((len(previews) + columns - 1) // columns) * (cell_h + label_h)), (32, 36, 42, 255))
    draw = ImageDraw.Draw(contact)
    for index, (label, image) in enumerate(previews):
        x = (index % columns) * cell_w
        y = (index // columns) * (cell_h + label_h)
        contact.alpha_composite(image, (x, y + label_h))
        draw.text((x + 2, y + 2), label, fill=(255, 255, 255, 255))
        draw.line((x, y + label_h + 16, x + cell_w - 1, y + label_h + 16), fill=(255, 80, 80, 255))
    contact.save(out / "wrap-contact-sheet.png")

    parameters = {
        "audit": "decoded BG3 ring vertical wrap seam",
        "created_local": datetime.now().astimezone().isoformat(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "inputs": inputs,
        "method": "Compare RGB row 0 against row height-1; compare that mean absolute pixel delta with the distribution of all adjacent interior-row deltas. Red line in contact sheet marks the ring wrap.",
        "random_seed": None,
        "notes": "Deterministic asset audit; no emulator process, gameplay input, or random sampling used.",
    }
    (out / "parameters.json").write_text(json.dumps(parameters, indent=2), encoding="utf-8")
    print(out)
    for row in sorted(rows, key=lambda item: item["wrap_to_interior_p95_ratio"], reverse=True):
        print(f"{row['stage']:10} {row['field']:6} wrap={row['wrap_mean_abs_rgb_delta']:6.2f} "
              f"p95={row['interior_p95_row_delta']:6.2f} ratio={row['wrap_to_interior_p95_ratio']:5.2f}")


if __name__ == "__main__":
    main()
