"""Compare Survival actor OAM textures with the decoded actor pose atlases."""
from __future__ import annotations

from collections import Counter
from datetime import datetime
from pathlib import Path
import csv
import importlib.util
import json
import argparse
import struct

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
REPLAY_REPORT = ROOT / "tests/OUTPUT/eggo-mania-visual_2026-10-07T22-33-13-058Z/input-replay-report.json"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
ACTORS = [
    {"side": "player", "atlas": "yolko-player-poses.png", "field": 0,
     "actor_base": 0x3BD4, "x_min": -128, "x_max": 112},
    {"side": "cpu", "atlas": "factory-rival-poses.png", "field": 1,
     "actor_base": 0x4F50, "x_min": 96, "x_max": 256},
]
SCREEN_PALETTE_ADDRESS = 0x05000000
SCREEN_OAM_ADDRESS = 0x07000000
SCREEN_IO_ADDRESS = 0x04000000


def load_decoder():
    path = ROOT / "scripts/eggo-compose-native-layers.py"
    spec = importlib.util.spec_from_file_location("eggo_compose_native_layers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load decoder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def atlas_rgb_from_rgb555(channels: np.ndarray) -> np.ndarray:
    values = channels.astype(np.uint16)
    return (values * 255 // 31).astype(np.uint8)


def atlas_frames(path: Path, sheet_name: str):
    atlas = np.asarray(Image.open(path).convert("RGBA"))
    if atlas.shape[0] % 64 or atlas.shape[1] % 64:
        raise ValueError(f"Atlas is not a 64px grid: {path} {atlas.shape}")
    rows, columns = atlas.shape[0] // 64, atlas.shape[1] // 64
    frames = []
    masks = {}
    for row in range(rows):
        for frame in range(columns):
            crop = atlas[row * 64:(row + 1) * 64, frame * 64:(frame + 1) * 64]
            mask = crop[..., 3] > 0
            if not mask.any():
                continue
            record = {"sheet": sheet_name, "row": row, "frame": frame, "mask": mask,
                      "rgb": crop[..., :3]}
            frames.append(record)
            masks.setdefault(mask.tobytes(), []).append(record)
    return frames, masks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replay-report", type=Path, default=REPLAY_REPORT,
                        help="input-replay-report.json produced by tests/eggo-mania-visual.mjs")
    args = parser.parse_args()
    decoder = load_decoder()
    replay_path = args.replay_report if args.replay_report.is_absolute() else ROOT / args.replay_report
    replay = json.loads(replay_path.read_text(encoding="utf-8"))
    atlas_data = {}
    for actor in ACTORS:
        path = ROOT / "renderer/games/eggo-mania/assets" / actor["atlas"]
        frames, masks = atlas_frames(path, actor["atlas"])
        if actor["side"] == "player":
            resource_path = ROOT / "renderer/games/eggo-mania/assets/yolko-native-poses.png"
            resource_frames, resource_masks = atlas_frames(resource_path, resource_path.stem)
            for mask, candidates in resource_masks.items():
                masks.setdefault(mask, []).extend(candidates)
            frames.extend(resource_frames)
        else:
            resource_path = ROOT / "renderer/games/eggo-mania/assets/factory-rival-native.png"
            resource_frames, resource_masks = atlas_frames(resource_path, resource_path.stem)
            for mask, candidates in resource_masks.items():
                masks.setdefault(mask, []).extend(candidates)
            frames.extend(resource_frames)
        atlas_data[actor["side"]] = (frames, masks)

    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    output = ROOT / "scripts/OUTPUT" / f"eggo-actor-pose-parity_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Eggo Mania native OAM actor pose parity",
        "capture_directory": str(CAPTURE_DIR.relative_to(ROOT)),
        "capture_prefix": CAPTURE_PREFIX,
        "replay_report": str(replay_path.relative_to(ROOT)),
        "frames": 600,
        "actors": ACTORS,
        "atlas_cell_pixels": [64, 64],
        "native_oam_orientation_normalized": "Undo OAM horizontal and vertical flips before matching raw OBJ tiles to atlas images.",
        "audioOutputMuted": True,
        "native_actor_animation_fields": {
            "source": "per-frame EWRAM snapshots",
            "base_by_field": {actor["side"]: hex(actor["actor_base"]) for actor in ACTORS},
            "offsets": {"selector": "0x854", "state": "0x858", "phase": "0x85c",
                        "animation_table": "0x84c", "animation_frame": "0x850",
                        "random_step": "0x860", "flags": "0x86c",
                        "actor_state": "0x874", "next_actor_state": "0x878"},
        },
        "atlas_color_conversion": "Expand each decoded GBA RGB555 channel to RGB8 with channel*255//31; native screenshot RGB565 expansion is not used for atlas matching.",
        "random_seed": None,
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2), encoding="utf-8")

    rows = []
    for frame in range(1, 601):
        base = CAPTURE_DIR / f"{CAPTURE_PREFIX}.frame{frame:05d}"
        # The compact 0x3000000 dump contains only the first 32 KiB. OBJ
        # character data begins at VRAM offset 0x10000, so OAM decoding needs
        # the full 0x18000-byte memory3 capture.
        vram = (base.with_name(base.name + ".memory3")).read_bytes()
        ram = base.with_name(base.name + ".ram").read_bytes()
        palette_raw = (base.with_name(base.name + ".0x5000000")).read_bytes()
        io = (base.with_name(base.name + ".0x4000000")).read_bytes()
        oam = (base.with_name(base.name + ".0x7000000")).read_bytes()
        palette = decoder.palette_555(palette_raw)
        objects = []
        for index in range(128):
            obj = decoder.decode_object(vram, palette, io, oam, index)
            if obj is not None and obj["pixels"].shape == (64, 64, 3):
                _, attr1, _ = struct.unpack_from("<HHH", oam, index * 8)
                obj["hflip"] = bool(attr1 & 0x1000)
                obj["vflip"] = bool(attr1 & 0x2000)
                # decode_object returns the pixels after OAM transforms. The
                # captured atlas is built from raw OBJ tiles, so undo those
                # transforms before identifying the native pose image.
                obj["canonical_pixels"] = obj["pixels"]
                obj["canonical_visible"] = obj["visible"]
                if obj["hflip"]:
                    obj["canonical_pixels"] = obj["canonical_pixels"][:, ::-1]
                    obj["canonical_visible"] = obj["canonical_visible"][:, ::-1]
                if obj["vflip"]:
                    obj["canonical_pixels"] = obj["canonical_pixels"][::-1, :]
                    obj["canonical_visible"] = obj["canonical_visible"][::-1, :]
                objects.append(obj)

        for actor in ACTORS:
            native_animation = {
                name: int.from_bytes(ram[actor["actor_base"] + offset:
                                          actor["actor_base"] + offset + 4], "little")
                for name, offset in (("animation_table", 0x84C),
                                     ("animation_frame", 0x850),
                                     ("selector", 0x854), ("state", 0x858),
                                     ("phase", 0x85C), ("random_step", 0x860),
                                     ("flags", 0x86C), ("actor_state", 0x874),
                                     ("next_actor_state", 0x878))
            }
            _, masks = atlas_data[actor["side"]]
            matched_objects = []
            for obj in objects:
                if not actor["x_min"] <= obj["x"] < actor["x_max"]:
                    continue
                candidates = masks.get(obj["canonical_visible"].tobytes(), [])
                if not candidates:
                    continue
                # Atlases are authored from GBA RGB555 palette values.
                native_rgb = atlas_rgb_from_rgb555(obj["canonical_pixels"])
                scored = []
                for candidate in candidates:
                    errors = int(np.count_nonzero(np.any(
                        native_rgb[obj["canonical_visible"]] != candidate["rgb"][obj["canonical_visible"]], axis=1)))
                    scored.append((errors, candidate["row"], candidate["frame"], candidate))
                scored.sort(key=lambda item: (item[0], item[1], item[2]))
                exact_color = [item[3] for item in scored if item[0] == 0]
                pose_candidates = exact_color or candidates
                matched_objects.append({"index": obj["index"], "x": obj["x"], "y": obj["y"],
                    "hflip": obj["hflip"], "vflip": obj["vflip"],
                    "candidates": pose_candidates, "exact": bool(exact_color),
                    "best_errors": scored[0][0] if scored else None})

            # There is one actor sprite per split field. If duplicate art is
            # present, prefer the only exact-palette object, otherwise retain
            # all candidates instead of guessing from OAM order.
            exact_objects = [obj for obj in matched_objects if obj["exact"]]
            chosen = exact_objects if exact_objects else matched_objects
            unique_candidates = {(item["sheet"], item["row"], item["frame"])
                                 for obj in chosen for item in obj["candidates"]}
            pose_candidates = [{"row": row, "frame": pose_frame}
                               for _sheet, row, pose_frame in sorted(unique_candidates)]
            for candidate, (sheet, _row, _frame) in zip(pose_candidates, sorted(unique_candidates)):
                candidate["sheet"] = sheet
            exact_pose = pose_candidates[0] if len(pose_candidates) == 1 else None
            app_pose = replay["cameraSeries"][actor["field"]][frame - 1]
            prior_pose = replay["cameraSeries"][actor["field"]][max(0, frame - 2)]
            if app_pose.get("nativeAnimationSelector") != native_animation["selector"]:
                raise ValueError(f"{actor['side']} frame {frame}: native selector does not match its EWRAM snapshot")
            app_sheet = app_pose.get("appSpritePoseResourceSheet") or actor["atlas"]
            app_sheet_key = Path(app_sheet).stem
            app_row = (app_pose.get("appSpritePoseResourceRow") if app_sheet != actor["atlas"]
                       else app_pose.get("appSpritePoseRow"))
            app_frame = (app_pose.get("appSpritePoseResourceColumn") if app_sheet != actor["atlas"]
                         else app_pose.get("appSpritePoseFrame"))
            # Runtime resource keys omit `.png`, while atlas audit candidates
            # use filenames. Compare the asset stem so equivalent sheets do
            # not become false mismatches solely because of that suffix.
            matches_app = any(Path(item["sheet"]).stem == app_sheet_key and item["row"] == app_row and
                              item["frame"] == app_frame
                              for item in pose_candidates)
            rows.append({
                "frame": frame,
                "side": actor["side"],
                "oam_indices": ";".join(str(obj["index"]) for obj in chosen),
                "positions": ";".join(f"{obj['x']}:{obj['y']}" for obj in chosen),
                "native_pose_row": exact_pose["row"] if exact_pose else (pose_candidates[0]["row"] if len(pose_candidates) == 1 else None),
                "native_pose_frame": exact_pose["frame"] if exact_pose else (pose_candidates[0]["frame"] if len(pose_candidates) == 1 else None),
                "native_pose_source": exact_pose["sheet"] if exact_pose else (pose_candidates[0]["sheet"] if len(pose_candidates) == 1 else None),
                "native_exact_asset_match": any(obj["exact"] for obj in chosen),
                "native_pose_identified": exact_pose is not None,
                "native_pose_candidates": ";".join(f"{item['sheet']}:{item['row']}:{item['frame']}" for item in pose_candidates),
                "app_pose_source": app_sheet,
                "native_actor_oam_found": bool(chosen),
                "native_hflip_x": ";".join(str(obj["hflip"]).lower() for obj in chosen),
                "native_vflip_y": ";".join(str(obj["vflip"]).lower() for obj in chosen),
                "app_pose_row": app_row,
                "app_pose_frame": app_frame,
                "app_pose_state": (app_pose.get("appNativeRivalPoseState") if actor["side"] == "cpu"
                                   else app_pose.get("appActorPoseState")),
                "app_native_rival_phase": app_pose.get("appNativeRivalAnimationPhase"),
                "app_pose_matches_native_mask": bool(matches_app),
                "app_native_hflip_prediction": (
                    bool(prior_pose.get("appActorWalking") and prior_pose.get("appEggFacing", 1) < 0
                         and prior_pose.get("appNativeRivalPoseState") in {"walk", "rise", "float", "fall"})
                    if actor["side"] == "cpu" else None),
                "app_native_hflip_matches": (
                    bool(chosen) and all(obj["hflip"] == bool(prior_pose.get("appActorWalking")
                         and prior_pose.get("appEggFacing", 1) < 0
                         and prior_pose.get("appNativeRivalPoseState") in {"walk", "rise", "float", "fall"})
                         for obj in chosen)
                    if actor["side"] == "cpu" else None),
                "best_color_pixel_errors": min((obj["best_errors"] for obj in chosen if obj["best_errors"] is not None), default=None),
                "app_actor_y": app_pose.get("actorY"),
                "app_camera": app_pose.get("appCamera"),
                "native_animation_selector": app_pose.get("nativeAnimationSelector"),
                "native_animation_state": native_animation["state"],
                "native_animation_table": f"0x{native_animation['animation_table']:08x}",
                "native_animation_frame": f"0x{native_animation['animation_frame']:08x}",
                "native_animation_phase": native_animation["phase"],
                "native_animation_random_step": native_animation["random_step"],
                "native_animation_flags": native_animation["flags"],
                "native_action_state": app_pose.get("nativeActionState"),
                "native_actor_state": native_animation["actor_state"],
                "native_next_actor_state": native_animation["next_actor_state"],
                "app_held": app_pose.get("appHeld"),
                "app_actor_ground": app_pose.get("appActorGround"),
                "app_actor_walking": app_pose.get("appActorWalking"),
                "app_actor_vy": app_pose.get("appActorVy"),
            })

    fieldnames = list(rows[0])
    with (output / "poses.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    summary = {}
    for side in ("player", "cpu"):
        group = [row for row in rows if row["side"] == side]
        identified = [row for row in group if row["native_pose_identified"]]
        mismatches = [row for row in identified if not row["app_pose_matches_native_mask"]]
        state_counts = Counter(row["app_pose_state"] for row in mismatches)
        pair_counts = Counter((row["native_pose_row"], row["native_pose_frame"],
                               row["app_pose_row"], row["app_pose_frame"], row["app_pose_state"])
                              for row in mismatches)
        summary[side] = {
            "frames": len(group),
            "native_actor_oam_found": sum(row["native_actor_oam_found"] for row in group),
            "native_pose_exactly_identified": len(identified),
            "native_art_pixels_match_atlas": sum(row["native_exact_asset_match"] for row in group),
            "app_pose_matches_native_atlas": sum(row["app_pose_matches_native_mask"] for row in group),
            "native_hflip_checked_frames": sum(row["native_actor_oam_found"] and
                                                row["app_native_hflip_prediction"] is not None
                                                for row in group),
            "native_hflip_matches_app_prediction": sum(row["native_actor_oam_found"] and
                                                        row["app_native_hflip_matches"] is True
                                                        for row in group),
            "native_app_pose_mismatches": len(mismatches),
            "mismatch_app_states": dict(state_counts),
            "most_common_mismatches": [
                {"native_row": key[0], "native_frame": key[1], "app_row": key[2],
                 "app_frame": key[3], "app_state": key[4], "frames": count}
                for key, count in pair_counts.most_common(30)
            ],
        }
    result = {"parameters": parameters, "summary": summary,
              "method": "Decoded native 64x64 OAM alpha masks are transformed back to raw OBJ orientation before atlas matching; the CPU flip prediction is checked against the prior reconstructed movement state."}
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "summary": summary}, indent=2))


if __name__ == "__main__":
    main()
