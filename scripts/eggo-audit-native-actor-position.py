"""Verify that rendered actor origins use the GBA's pre-update OAM state."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse
import csv
import hashlib
import json
import math


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPLAY = Path("tests/OUTPUT/eggo-mania-visual_2026-10-08T01-51-10-021Z/input-replay-report.json")
DEFAULT_NATIVE_POSES = Path("scripts/OUTPUT/eggo-actor-pose-parity_2026-10-08_01-49-57/poses.csv")
FIELD_LEFT = {"player": 0, "cpu": 128}
TILE_PIXELS = 16
ACTOR_ANCHOR = (32, 56)
FIELD_FLOOR = 112


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replay-report", type=Path, default=DEFAULT_REPLAY)
    parser.add_argument("--native-poses", type=Path, default=DEFAULT_NATIVE_POSES)
    args = parser.parse_args()
    replay_path = args.replay_report if args.replay_report.is_absolute() else ROOT / args.replay_report
    poses_path = args.native_poses if args.native_poses.is_absolute() else ROOT / args.native_poses
    replay = json.loads(replay_path.read_text(encoding="utf-8"))
    camera_series = replay["cameraSeries"]

    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    output = ROOT / "scripts" / "OUTPUT" / f"eggo-native-actor-position_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    parameters = {
        "experiment": "Eggo Mania native actor OAM position audit",
        "created_local": datetime.now().astimezone().isoformat(),
        "replay_report": str(replay_path.relative_to(ROOT)),
        "replay_report_sha256": sha256(replay_path),
        "native_actor_pose_csv": str(poses_path.relative_to(ROOT)),
        "native_actor_pose_csv_sha256": sha256(poses_path),
        "frame_count": 600,
        "deterministic_replay_seed": 42,
        "screen": {"width": 240, "height": 160, "field_left_pixels": FIELD_LEFT,
                   "field_floor_pixels": FIELD_FLOOR},
        "actor": {"world_scale_pixels_per_tile": TILE_PIXELS,
                  "oam_anchor_pixels": ACTOR_ANCHOR,
                  "display_phase": "native OAM frame n uses actor position and camera from frame n-1"},
        "comparison": "Exact integer top-left equality against captured native 64x64 actor OAM",
        "random_seed": 42,
    }
    (output / "parameters.json").write_text(json.dumps(parameters, indent=2, ensure_ascii=False) + "\n",
                                             encoding="utf-8")

    records: list[dict[str, object]] = []
    with poses_path.open("r", encoding="utf-8-sig", newline="") as stream:
        for pose in csv.DictReader(stream):
            side = pose["side"]
            frame = int(pose["frame"])
            if side not in FIELD_LEFT or frame <= 1 or pose.get("native_actor_oam_found") != "True":
                continue
            native_position = pose.get("positions", "").split(";", 1)[0]
            if not native_position:
                continue
            native_x, native_y = map(int, native_position.split(":"))
            previous = camera_series[0 if side == "player" else 1][frame - 2]
            screen_x = FIELD_LEFT[side] + math.floor(float(previous["appEggX"]) * TILE_PIXELS)
            screen_y = math.floor(FIELD_FLOOR -
                                  (float(previous["actorY"]) - float(previous["appCamera"])) * TILE_PIXELS)
            predicted_x, predicted_y = screen_x - ACTOR_ANCHOR[0], screen_y - ACTOR_ANCHOR[1]
            records.append({
                "frame": frame,
                "side": side,
                "predicted_x": predicted_x,
                "predicted_y": predicted_y,
                "native_x": native_x,
                "native_y": native_y,
                "exact": predicted_x == native_x and predicted_y == native_y,
            })

    with (output / "actor-position-comparison.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    by_side = {}
    for side in FIELD_LEFT:
        samples = [row for row in records if row["side"] == side]
        mismatches = [row for row in samples if not row["exact"]]
        by_side[side] = {"samples": len(samples), "exact": len(samples) - len(mismatches),
                         "mismatches": mismatches[:20]}
    result = {"sample_count": len(records), "exact_count": sum(row["exact"] for row in records),
              "all_exact": all(row["exact"] for row in records), "by_side": by_side,
              "output_directory": str(output.relative_to(ROOT))}
    (output / "results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n",
                                         encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
