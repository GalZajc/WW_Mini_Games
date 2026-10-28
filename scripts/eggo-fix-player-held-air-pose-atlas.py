"""Replace held airborne pose rows with their measured native ROM cels."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "renderer/games/eggo-mania/assets"
CHARACTERS_PATH = ASSETS / "characters.json"
CHARACTER_DATA = json.loads(CHARACTERS_PATH.read_text(encoding="utf-8"))
RESOURCE_DIR = ROOT / CHARACTER_DATA["parameters"]["decoded"]
POSE_TEMPLATES = CHARACTER_DATA["parameters"]["pose_templates"]
SOURCE_GROUP = 9
ROW_SOURCES = {
    "rise": (0, 0, 1, 1),
    # In the Hard replay, moving held float uses group-9 picture 1 on app cel
    # 1, then returns to picture 0 on app cel 2. Group 7 only appeared in one
    # stationary transition frame.
    "float": (0, 1, 0, 0),
}
POSE_ROWS = {state: list(POSE_TEMPLATES).index(state) for state in ROW_SOURCES}
OUTPUT_ROOT = ROOT / "scripts/OUTPUT"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    output = OUTPUT_ROOT / f"eggo-held-air-atlas_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    names = sorted(CHARACTER_DATA["characters"])
    atlas_paths = [ASSETS / f"{name}-player-poses.png" for name in names]
    fallback_path = ASSETS / "yolko-poses.png"
    all_paths = [*atlas_paths, fallback_path, CHARACTERS_PATH]
    before_hashes = {path.relative_to(ROOT).as_posix(): sha256(path) for path in all_paths}

    parameters = {
        "experiment": "Eggo Mania held airborne pose atlas correction",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "source_resource_sheet_directory": RESOURCE_DIR.relative_to(ROOT).as_posix(),
        "character_atlases": [path.relative_to(ROOT).as_posix() for path in atlas_paths],
        "fallback_atlas": fallback_path.relative_to(ROOT).as_posix(),
        "native_animation_state": {"selector": 5, "state": 2, "held": True},
        "native_pose_resource": {"group": SOURCE_GROUP, "pictures": [0, 1]},
        "target_pose_rows": POSE_ROWS,
        "target_frame_sources": {state: list(pictures) for state, pictures in ROW_SOURCES.items()},
        "source_frame": "GBA-decoded character resource group 9, pictures 0 and 1",
        "color_space": "Copy RGBA source cels without resampling or color conversion.",
        "audio_output": False,
        "random_seed": None,
        "input_sha256": before_hashes,
    }
    (output / "parameters.json").write_text(
        json.dumps(parameters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    for atlas_path in atlas_paths:
        character = atlas_path.name.removesuffix("-player-poses.png")
        resources = Image.open(RESOURCE_DIR / f"{character}.png").convert("RGBA")
        atlas = Image.open(atlas_path).convert("RGBA")
        if atlas.width < 4 * 64 or atlas.height < (max(POSE_ROWS.values()) + 1) * 64:
            raise ValueError(f"Unexpected player pose atlas size: {atlas_path} {atlas.size}")
        for state, source_pictures in ROW_SOURCES.items():
            pose_row = POSE_ROWS[state]
            for frame, source_picture in enumerate(source_pictures):
                source_box = (source_picture * 64, (SOURCE_GROUP - 1) * 64,
                              (source_picture + 1) * 64, SOURCE_GROUP * 64)
                atlas.paste(resources.crop(source_box), (frame * 64, pose_row * 64))
        atlas.save(atlas_path, optimize=True)

    yolko_resources = Image.open(RESOURCE_DIR / "yolko.png").convert("RGBA")
    fallback = Image.open(fallback_path).convert("RGBA")
    for state, source_pictures in ROW_SOURCES.items():
        pose_row = POSE_ROWS[state]
        for frame, source_picture in enumerate(source_pictures):
            source_box = (source_picture * 64, (SOURCE_GROUP - 1) * 64,
                          (source_picture + 1) * 64, SOURCE_GROUP * 64)
            fallback.paste(yolko_resources.crop(source_box), (frame * 64, pose_row * 64))
    fallback.save(fallback_path, optimize=True)

    for state, source_pictures in ROW_SOURCES.items():
        POSE_TEMPLATES[state] = [[SOURCE_GROUP, picture] for picture in source_pictures]
    CHARACTERS_PATH.write_text(
        json.dumps(CHARACTER_DATA, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    results = {
        "updated_character_atlases": len(atlas_paths),
        "corrected_rows": list(ROW_SOURCES),
        "resource_group": SOURCE_GROUP,
        "source_pictures_by_row": {state: list(pictures) for state, pictures in ROW_SOURCES.items()},
        "output_sha256": {path.relative_to(ROOT).as_posix(): sha256(path) for path in all_paths},
    }
    (output / "results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.relative_to(ROOT).as_posix(), **results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
