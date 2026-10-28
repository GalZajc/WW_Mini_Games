"""Search captured EWRAM for the BG3 scroll used by the normal scanline phase."""
from datetime import datetime
from pathlib import Path
import csv
import json
import struct

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIRECTORY = "scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876"
CAPTURE_PREFIX = "eggo-replay-full-graphics"
SEARCH_DIRECTORY = "scripts/OUTPUT/eggo-waterline-scroll-search_2026-10-07_16-53-09"
FIRST_FRAME, LAST_FRAME = 1, 600
RAM_BYTES = 0x40000
ALT_BG3CNT = 0x0B01


def main() -> None:
    source = ROOT / CAPTURE_DIRECTORY
    search_csv = ROOT / SEARCH_DIRECTORY / "scores.csv"
    best_scroll = {}
    with search_csv.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            frame = int(row["frame"])
            score = int(row["different_cpu_pixels"])
            if frame not in best_scroll or score < best_scroll[frame][0]:
                best_scroll[frame] = (score, int(row["bg3_vofs"]))

    expected = []
    ram_frames = []
    for frame in range(FIRST_FRAME, LAST_FRAME + 1):
        stem = f"{CAPTURE_PREFIX}.frame{frame:05d}"
        io = (source / f"{stem}.0x4000000").read_bytes()
        bg3cnt = struct.unpack_from("<H", io, 0x0E)[0]
        if bg3cnt == ALT_BG3CNT:
            score, value = best_scroll[frame]
            if score:
                raise ValueError(f"Frame {frame} has no zero-difference normal BG3 scroll")
        else:
            value = struct.unpack_from("<H", io, 0x1E)[0] & 0xFF
        expected.append(value)
        ram = (source / f"{stem}.ram").read_bytes()
        if len(ram) != RAM_BYTES:
            raise ValueError(f"Unexpected RAM size on frame {frame}: {len(ram)}")
        ram_frames.append(np.frombuffer(ram, dtype=np.uint8))

    ram_matrix = np.stack(ram_frames)
    target = np.asarray(expected, dtype=np.uint8)
    match_counts = np.count_nonzero(ram_matrix == target[:, None], axis=0)
    exact_offsets = np.flatnonzero(match_counts == len(target))
    best_offsets = np.argsort(match_counts)[-50:][::-1]
    alt_frames = sorted(best_scroll)
    alt_indices = np.asarray([frame - FIRST_FRAME for frame in alt_frames])
    alt_counts = np.count_nonzero(ram_matrix[alt_indices] == target[alt_indices, None], axis=0)
    exact_alt_offsets = np.flatnonzero(alt_counts == len(alt_frames))
    best_alt_offsets = np.argsort(alt_counts)[-50:][::-1]
    output = ROOT / "scripts" / "OUTPUT" / (
        "eggo-bg3-scroll-ram-search_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    )
    output.mkdir(parents=True, exist_ok=False)
    candidates = [{"ram_offset": f"0x{int(offset):05x}",
                   "matches": int(match_counts[offset]),
                   "fraction": float(match_counts[offset] / len(target))}
                  for offset in best_offsets]
    with (output / "top-candidate-offsets.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(candidates[0]))
        writer.writeheader()
        writer.writerows(candidates)
    alt_candidates = [{"ram_offset": f"0x{int(offset):05x}",
                       "matches": int(alt_counts[offset]),
                       "fraction": float(alt_counts[offset] / len(alt_frames))}
                      for offset in best_alt_offsets]
    with (output / "alternate-only-candidates.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(alt_candidates[0]))
        writer.writeheader()
        writer.writerows(alt_candidates)
    result = {
        "frames": len(target),
        "alternateFramesResolvedByExactImageSearch": len(best_scroll),
        "exactByteMatchOffsets": [f"0x{int(offset):05x}" for offset in exact_offsets],
        "exactAlternateOnlyByteMatchOffsets": [f"0x{int(offset):05x}" for offset in exact_alt_offsets],
        "topCandidates": candidates,
        "topAlternateOnlyCandidates": alt_candidates,
        "audio_enabled": False,
    }
    params = {
        "experiment": "Find a single RAM byte that tracks the normal-phase BG3VOFS",
        "capture_directory": CAPTURE_DIRECTORY,
        "capture_prefix": CAPTURE_PREFIX,
        "expected_scroll_source": "captured IO BG3VOFS on normal frames; zero-difference image-search BG3VOFS on alternate frames",
        "search_directory": SEARCH_DIRECTORY,
        "frame_range": [FIRST_FRAME, LAST_FRAME],
        "ram_bytes_per_frame": RAM_BYTES,
        "output_directory": str(output.relative_to(ROOT)),
        "audio_enabled": False,
        "random_seed": None,
    }
    (output / "parameters.json").write_text(json.dumps(params, indent=2), encoding="utf-8")
    (output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result}, indent=2))


if __name__ == "__main__":
    main()
