"""Measure held-item anchors directly from native OAM, without screenshots."""
from pathlib import Path
from datetime import datetime
from collections import Counter
import csv
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    "capture": "scripts/OUTPUT/eggo-reference_2026-10-08_17-25-52_997177",
    "prefix": "eggo-trusted-replay",
    "frames": 600,
    "actor_anchor": [32, 56],
    "held_anchor": [8, 8],
    "candidate_horizontal_radius": 20,
    "candidate_lift_range": [28, 44],
    "random_seed": None,
    "rom": "C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba",
    "anchor_table": 0x3ef80c,
}


def main():
    capture = ROOT / PARAMETERS["capture"]
    trace_path = capture / (PARAMETERS["prefix"] + ".trace.json")
    trace = json.loads(trace_path.read_text(encoding="utf-8"))
    rom = Path(PARAMETERS["rom"]).read_bytes()
    anchors = [struct.unpack_from("<ii", rom, PARAMETERS["anchor_table"] + i * 8) for i in range(22)]
    records = []
    for frame in range(1, PARAMETERS["frames"] + 1):
        oam = (capture / f"{PARAMETERS['prefix']}.frame{frame:05d}.0x7000000").read_bytes()
        ram = (capture / f"{PARAMETERS['prefix']}.frame{frame:05d}.ram").read_bytes()
        objects = []
        for index in range(128):
            a0, a1, a2 = struct.unpack_from("<HHH", oam, index * 8)
            if not a0 & 0x100 and a0 & 0x200:
                continue
            x, y = a1 & 511, a0 & 255
            x -= 512 if x >= 256 else 0
            y -= 256 if y >= 160 else 0
            objects.append(dict(id=index, x=x, y=y, a0=a0, a1=a1, a2=a2,
                                palette=a2 >> 12, priority=(a2 >> 10) & 3))
        for field, name in enumerate(("player", "cpu")):
            actors = [o for o in objects if o["priority"] == 3 and o["palette"] == field
                      and o["a0"] >> 14 == 0 and o["a1"] >> 14 == 3]
            if len(actors) != 1:
                continue
            actor = actors[0]
            actor_base = (0x3bd4, 0x4f50)[field]
            group = struct.unpack_from("<i", ram, actor_base + 0x840)[0]
            inventory = struct.unpack_from("<i", ram, actor_base + 0x864)[0]
            if inventory in (-1, 9) or not 1 <= group < len(anchors):
                continue
            ax, ay = actor["x"] + PARAMETERS["actor_anchor"][0], actor["y"] + PARAMETERS["actor_anchor"][1]
            candidates = [o for o in objects if o["priority"] == 2 and o["palette"] == 2
                          and o["a0"] >> 14 == 0 and o["a1"] >> 14 == 1
                          and abs(o["x"] + 8 - ax) <= PARAMETERS["candidate_horizontal_radius"]
                          and PARAMETERS["candidate_lift_range"][0] <= ay - o["y"] - 8 <= PARAMETERS["candidate_lift_range"][1]]
            if not candidates:
                continue
            # Held icons precede loose pickups in OAM priority order.
            held = min(candidates, key=lambda o: o["id"])
            follow = trace[max(0, frame - 2)]["camera_follow_state"][name]
            records.append(dict(frame=frame, field=name, actor=actor["id"], held=held["id"],
                                hflip=bool(actor["a1"] & 0x1000),
                                offset_x=held["x"] + 8 - ax, lift_y=ay - held["y"] - 8,
                                selector=follow["actor_state_854"], state=follow["actor_state_874"], group=group,
                                expected_x=(48-anchors[group][0] if actor["a1"] & 0x1000 else anchors[group][0])-24,
                                expected_lift=48-anchors[group][1]))
    output = ROOT / "scripts/OUTPUT" / f"eggo-held-oam_{datetime.now().astimezone():%Y-%m-%d_%H-%M-%S}"
    output.mkdir(parents=True)
    PARAMETERS["trace_sha256"] = hashlib.sha256(trace_path.read_bytes()).hexdigest()
    PARAMETERS["rom_sha256"] = hashlib.sha256(rom).hexdigest()
    (output / "parameters.json").write_text(json.dumps(PARAMETERS, indent=2) + "\n", encoding="utf-8")
    with (output / "anchors.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    counts = Counter((r["field"], r["group"], r["hflip"], r["offset_x"], r["lift_y"]) for r in records)
    summary = [dict(field=k[0], group=k[1], hflip=k[2], offset_x=k[3], lift_y=k[4], frames=v)
               for k, v in counts.most_common()]
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(output)
    print(json.dumps({"samples": len(records), "exact_rom_anchors": sum(r['offset_x'] == r['expected_x'] and r['lift_y'] == r['expected_lift'] for r in records), "groups": summary}))


if __name__ == "__main__":
    main()
