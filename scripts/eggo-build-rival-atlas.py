"""Build stage-specific actor clips from native, frame-exact ROM captures."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "sources": {
        "factory": "scripts/OUTPUT/eggo-reference_2026-10-08_01-20-23_304106",
        "dragon": "scripts/OUTPUT/eggo-reference_2026-10-06_10-32-56_026148",
        "castle": "scripts/OUTPUT/eggo-reference_2026-10-06_10-33-01_627069",
        "pirate": "scripts/OUTPUT/eggo-reference_2026-10-06_10-33-06_364737",
        "space": "scripts/OUTPUT/eggo-reference_2026-10-06_10-33-10_891479",
        "jungle": "scripts/OUTPUT/eggo-reference_2026-10-06_10-33-15_121146",
        "park": "scripts/OUTPUT/eggo-reference_2026-10-06_10-33-18_849109",
        "beanstalk": "scripts/OUTPUT/eggo-reference_2026-10-06_10-33-23_016021",
    },
    "size": 64,
    "states": [
        "idle", "walk", "air", "throw", "idle-free", "walk-free", "air-free",
        "air-moving", "air-still", "air-free-moving", "air-free-still",
        "rise-moving", "rise-still", "rise-free-moving", "rise-free-still",
        "fall-moving", "fall-still", "fall-free-moving", "fall-free-still",
    ],
    "loop_states": [
        "idle", "walk", "idle-free", "walk-free",
    ],
    # These native selector/state pairs keep one-frame velocity changes from
    # admitting airborne poses into grounded animations.
    "animation_sequences": {
        "idle": [[2, 2]], "idle-free": [[2, 2]],
        "walk": [[3, 3], [4, 4]], "walk-free": [[3, 3], [4, 4]],
        "throw": [[1, 1], [8, 8]],
    },
    # Selector 5 uses a shared 16-step phase accumulator while the ROM swaps
    # these frame tables for vertical direction, inventory and movement.
    "animation_tables": {
        "fall-still": "0x083f2f08", "fall-moving": "0x083f2f18",
        "fall-free-still": "0x083f2f00", "fall-free-moving": "0x083f2f10",
        "rise-still": "0x083f2ee8", "rise-moving": "0x083f2ef8",
        "rise-free-still": "0x083f2ee0", "rise-free-moving": "0x083f2ef0",
    },
    "animation_phase": {"step": 0x2000, "period": 0x20000},
    # Selector 8 uses the Factory free-air art table. These phase bins are
    # measured from the 600-frame Hard replay's native OAM and EWRAM trace;
    # the ROM animation-frame pointer identifies row-6 cels where masks are
    # otherwise shared by several atlas entries.
    "phase_frame_map_source": {
        "capture": "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876",
        "selector": 8,
        "table": "0x083f2f20",
        "frame_pointer_range": "0x08392008..0x08392048",
    },
    "phase_frame_maps": {
        "factory": {
            "air-free": {
                8: {
                    "step": 0x4000,
                    "frames": [4, *([None] * 14), 0, 0, 0, *([1] * 4),
                               *([2] * 4), *([3] * 4), 4, 4],
                }
            }
        }
    },
    "excluded_special_poses": {
        "dragon": [
            "94a025a6d5d5a01aeab89c3d1a719e02dd69a09603c6464fdbb2e0fcee11d5dc",
            "a9986496dcc01d101e3987ba731b537598d8cff8cbb429495e3621b6d6482f30",
            "1a1a77f1e3567350531365763d2f5aa3032e9268a4b25e595d66222e98499e0c",
            "a56531512627e82b4d2af754c78240c970f4e4b0d72a6d4961fce802de6384fd",
        ]
    },
}


def pose_clip(records, state, excluded, accepted_sequences):
    """Choose the most representative uninterrupted source episode.

    Keeping the whole chronological episode, including repeated images, is
    important: the ROM has variable frame holds and sometimes revisits a pose.
    The longest episode with the most distinct poses is preferred over a
    first-seen set of images, which scrambles animation order.
    """
    episodes = []
    episode = []
    previous_frame = None
    for record in records:
        animation = record.get("animation", {})
        sequence = [animation.get("selector"), animation.get("state")]
        eligible = (record["state"] == state and record["image_sha256"] not in excluded
                    and (not accepted_sequences or sequence in accepted_sequences))
        if not eligible or (previous_frame is not None and record["frame"] != previous_frame + 1):
            if episode:
                episodes.append(episode)
            episode = []
        if eligible:
            episode.append(record)
            previous_frame = record["frame"]
        else:
            previous_frame = None
    if episode:
        episodes.append(episode)
    if not episodes:
        return None

    selected = max(
        episodes,
        key=lambda rows: (len({row["image_sha256"] for row in rows}), len(rows)),
    )
    frames = []
    for record in selected:
        digest = record["image_sha256"]
        if frames and frames[-1]["sha256"] == digest:
            frames[-1]["ticks"] += 1
        else:
            frames.append({"sha256": digest, "ticks": 1})
    return {
        "source_start_frame": selected[0]["frame"],
        "source_end_frame": selected[-1]["frame"],
        "duration_ticks": len(selected),
        "frames": frames,
        "phase_period": max(
            (record.get("animation", {}).get("group_period", 0) for record in selected),
            key=lambda value: sum(record.get("animation", {}).get("group_period") == value for record in selected),
        ),
    }


def pose_air_clip(records, phase, free, excluded, walking=None):
    """Keep one ROM episode for vertical and horizontal movement flags.

    Selector 5 installs separate frame tables for upward and downward travel,
    then picks a still/moving table within each direction. Combining rise and
    fall into one fitted clip loses those table changes.
    """
    episodes = []
    episode = []
    previous_frame = None
    for record in records:
        state = record["state"]
        state_free = state.endswith("-free")
        state_motion = state.removesuffix("-free")
        is_walking = bool(int(record.get("animation", {}).get("flags", 0)) & 0x100)
        eligible = ((phase is None or phase == state_motion) and state_free == free
                    and record["image_sha256"] not in excluded
                    and (walking is None or is_walking == walking))
        if not eligible or (previous_frame is not None and record["frame"] != previous_frame + 1):
            if episode:
                episodes.append(episode)
            episode = []
        if eligible:
            episode.append(record)
            previous_frame = record["frame"]
        else:
            previous_frame = None
    if episode:
        episodes.append(episode)
    if not episodes:
        return None

    by_frame = {record["frame"]: record for record in records}

    def clip_quality(rows):
        start = rows[0]
        before = by_frame.get(start["frame"] - 1)
        before_state = before["state"] if before else ""
        same_inventory = before_state.endswith("-free") == free
        started_from_ground = same_inventory and before_state.removesuffix("-free") in {"idle", "walk"}
        expected_start = (phase is None and start["state"].startswith("rise")) or phase == "rise"
        return (expected_start and started_from_ground, expected_start,
                len({row["image_sha256"] for row in rows}), len(rows))

    selected = max(
        episodes,
        key=clip_quality,
    )
    frames = []
    for record in selected:
        digest = record["image_sha256"]
        if frames and frames[-1]["sha256"] == digest:
            frames[-1]["ticks"] += 1
        else:
            frames.append({"sha256": digest, "ticks": 1})
    return {
        "source_start_frame": selected[0]["frame"],
        "source_end_frame": selected[-1]["frame"],
        "duration_ticks": len(selected),
        "frames": frames,
        "phase_period": max(
            (record.get("animation", {}).get("group_period", 0) for record in selected),
            key=lambda value: sum(record.get("animation", {}).get("group_period") == value for record in selected),
        ),
    }


def pose_phase_table_clip(records, table, excluded):
    """Decode airborne cels by the ROM's shared selector-5 phase.

    A time-since-state-change clip is wrong when the ROM switches tables but
    keeps +0x85c. The table pointer selects the movement/inventory variant;
    the high phase bits then select the exact cel shared by all variants.
    """
    by_phase = {phase: {} for phase in range(16)}
    selected_records = []
    for record in records:
        animation = record.get("animation", {})
        if animation.get("table") != table or record["image_sha256"] in excluded:
            continue
        raw_phase = animation.get("phase")
        if not isinstance(raw_phase, int):
            continue
        phase = (raw_phase // PARAMETERS["animation_phase"]["step"]) & 15
        counts = by_phase[phase]
        digest = record["image_sha256"]
        counts[digest] = counts.get(digest, 0) + 1
        selected_records.append(record)
    if not selected_records or any(not counts for counts in by_phase.values()):
        return None

    # One-frame table handoffs can leave a neighboring table's OAM cel in the
    # capture. The dominant image for each native phase removes those samples.
    phase_hashes = [max(counts.items(), key=lambda item: item[1])[0]
                    for counts in by_phase.values()]
    frames = []
    frame_by_hash = {}
    phase_frames = []
    for digest in phase_hashes:
        if digest not in frame_by_hash:
            frame_by_hash[digest] = len(frames)
            frames.append({"sha256": digest, "ticks": 1})
        phase_frames.append(frame_by_hash[digest])
    return {
        "source_start_frame": min(record["frame"] for record in selected_records),
        "source_end_frame": max(record["frame"] for record in selected_records),
        "duration_ticks": 16,
        "frames": frames,
        "phase_frames": phase_frames,
        "phase_period": max(
            (record.get("animation", {}).get("group_period", 0) for record in selected_records),
            key=lambda value: sum(record.get("animation", {}).get("group_period") == value for record in selected_records),
        ),
        "native_table": table,
    }


OUTPUT = ROOT / "scripts" / "OUTPUT" / ("eggo-rival-atlas_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S"))
OUTPUT.mkdir(parents=True, exist_ok=True)
ASSETS = ROOT / "renderer" / "games" / "eggo-mania" / "assets"
rules = {}
manifest = {"parameters": PARAMETERS, "stages": {}}

for stage, relative_folder in PARAMETERS["sources"].items():
    folder = ROOT / relative_folder
    source_parameters = json.loads((folder / "parameters.json").read_text(encoding="utf-8"))
    assert source_parameters["writes"] == [], f"{stage}: source capture must be input-only"
    pose_parameters = source_parameters["rival_pose_parameters"]
    assert pose_parameters["sample_steps"] == 1, f"{stage}: capture must include every native frame"
    data = json.loads((folder / "rival-poses" / "poses.json").read_text(encoding="utf-8"))
    records = sorted(data["records"], key=lambda record: record["frame"])
    excluded = set(PARAMETERS["excluded_special_poses"].get(stage, []))
    clips = {}
    for state in ("idle", "walk", "throw", "idle-free", "walk-free"):
        clip = pose_clip(records, state, excluded, PARAMETERS["animation_sequences"].get(state, []))
        if clip is None:
            # Some costumes or rare states were not reached with the preferred
            # selector during the capture. Keep their best native episode.
            clip = pose_clip(records, state, excluded, [])
        if clip:
            clips[state] = clip
    # Full airborne clips remain a fallback for costumes where a directional
    # capture did not include a rare movement combination.
    for state, free, walking in (
        ("air", False, None), ("air-free", True, None),
        ("air-moving", False, True), ("air-still", False, False),
        ("air-free-moving", True, True), ("air-free-still", True, False),
    ):
        clip = pose_air_clip(records, None, free, excluded, walking)
        if clip:
            clips[state] = clip

    for motion in ("rise", "fall"):
        for free, walking in ((False, True), (False, False), (True, True), (True, False)):
            suffix = "-free" if free else ""
            state = f"{motion}{suffix}-{'moving' if walking else 'still'}"
            clip = pose_air_clip(records, motion, free, excluded, walking)
            if clip:
                clips[state] = clip

    # Where the capture reached every native phase, prefer the ROM's table and
    # shared phase map over a clip clock restarted at a model-state transition.
    for state, table in PARAMETERS["animation_tables"].items():
        clip = pose_phase_table_clip(records, table, excluded)
        if clip:
            clips[state] = clip

    width_frames = max(len(clip["frames"]) for clip in clips.values())
    atlas = Image.new("RGBA", (width_frames * 64, len(PARAMETERS["states"]) * 64))
    contact = Image.new("RGBA", (width_frames * 64 + 150, len(PARAMETERS["states"]) * 86), "#173b52")
    draw = ImageDraw.Draw(contact)
    stage_rules = {}

    for row, state in enumerate(PARAMETERS["states"]):
        clip = clips.get(state)
        if not clip:
            continue
        stage_rules[state] = {
            "row": row,
            "durations": [frame["ticks"] for frame in clip["frames"]],
            "loop": state in PARAMETERS["loop_states"],
            "phasePeriod": clip.get("phase_period", 0),
        }
        if "phase_frames" in clip:
            stage_rules[state]["phaseFrames"] = clip["phase_frames"]
        selector_phase_maps = PARAMETERS.get("phase_frame_maps", {}).get(stage, {}).get(state)
        if selector_phase_maps:
            stage_rules[state]["phaseFramesBySelector"] = selector_phase_maps
        draw.text((2, row * 86 + 34), state, fill="white")
        for column, frame in enumerate(clip["frames"]):
            image_path = folder / "rival-poses" / (frame["sha256"] + ".png")
            image = Image.open(image_path).convert("RGBA")
            assert image.size == (64, 64)
            assert hashlib.sha256(image.tobytes()).hexdigest() == frame["sha256"]
            atlas.paste(image, (column * 64, row * 64))
            contact.alpha_composite(image, (150 + column * 64, row * 86 + 8))
            draw.text((150 + column * 64, row * 86 + 70), f"{frame['ticks']}t", fill="white")

    atlas_name = f"{stage}-rival-poses.png"
    atlas.save(ASSETS / atlas_name)
    atlas.save(OUTPUT / atlas_name)
    contact.save(OUTPUT / f"{stage}-contact.png")
    rules[stage] = stage_rules
    manifest["stages"][stage] = {
        "source": str(folder.relative_to(ROOT)).replace("\\", "/"),
        "initial_state_sha256": source_parameters["initial_state_sha256"],
        "rom_sha256": source_parameters["rom_sha256"],
        "core_sha256": source_parameters["core_sha256"],
        "pose_manifest_sha256": hashlib.sha256((folder / "rival-poses" / "poses.json").read_bytes()).hexdigest(),
        "states": clips,
        "missing_states": [state for state in PARAMETERS["states"] if state not in stage_rules],
    }

(ASSETS / "rival-poses.js").write_text(
    "export const RIVAL_POSES = " + json.dumps(rules, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
(ASSETS / "rival-poses.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
(OUTPUT / "parameters.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"output": str(OUTPUT), "states": rules}))
