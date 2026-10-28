"""Build the completed-floor sparkle from captured native GBA OAM art."""
from datetime import datetime
from pathlib import Path
import hashlib
import json

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942"
CAPTURE = "bot-tower.frame00840"
SPRITES = SOURCE / f"{CAPTURE}.sprites"
OBJECT_IDS = list(range(29, 36))
OUTPUT_ASSET = ROOT / "renderer/games/eggo-mania/assets/completed-floor-star.png"
OUTPUT_METADATA = ROOT / "renderer/games/eggo-mania/assets/completed-floor-star.json"

objects_path = SPRITES / "objects.json"
objects = {entry["id"]: entry for entry in json.loads(objects_path.read_text(encoding="utf-8"))}
images = [Image.open(SPRITES / f"{object_id:03}.png").convert("RGBA") for object_id in OBJECT_IDS]
assert all(image.size == (8, 8) for image in images), "Expected 8×8 completed-floor objects"
assert all(ImageChops.difference(images[0], image).getbbox() is None for image in images[1:]), \
    "The seven native floor-sparkle objects should share one exact texture"
assert [objects[i]["x"] for i in OBJECT_IDS] == list(range(132, 237, 16))
assert all(objects[i]["y"] == 148 for i in OBJECT_IDS)

OUTPUT_ASSET.parent.mkdir(parents=True, exist_ok=True)
images[0].save(OUTPUT_ASSET)
source_files = [SPRITES / f"{object_id:03}.png" for object_id in OBJECT_IDS]
metadata = {
    "source_capture": str((SOURCE / f"{CAPTURE}.png").relative_to(ROOT)),
    "source_oam": str((SOURCE / f"{CAPTURE}.0x7000000").relative_to(ROOT)),
    "source_objects": str(objects_path.relative_to(ROOT)),
    "object_ids": OBJECT_IDS,
    "native_positions": [
        {"id": object_id, "x": objects[object_id]["x"], "y": objects[object_id]["y"],
         "tile": objects[object_id]["tile"], "palette": objects[object_id]["palette"]}
        for object_id in OBJECT_IDS
    ],
    "source_sha256": {
        str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in [SOURCE / f"{CAPTURE}.png", SOURCE / f"{CAPTURE}.0x7000000", objects_path, *source_files]
    },
    "asset_sha256": hashlib.sha256(OUTPUT_ASSET.read_bytes()).hexdigest(),
    "dimensions": [8, 8],
    "scope": "ROM-decoded sparkle texture only; event timing and OAM-slot limits are handled by gameplay state.",
}
OUTPUT_METADATA.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

output = ROOT / "scripts/OUTPUT" / ("eggo-completion-star_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f"))
output.mkdir(parents=True, exist_ok=False)
parameters = {"source": str(SPRITES.relative_to(ROOT)), "object_ids": OBJECT_IDS, "output_asset": str(OUTPUT_ASSET.relative_to(ROOT))}
(output / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")
(output / "verification.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
images[0].save(output / "asset.png")
print(output)
