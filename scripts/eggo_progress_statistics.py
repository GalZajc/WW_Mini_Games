"""Generate reproducible Eggo Mania replay progress statistics.

Run from any directory: python scripts/eggo_progress_statistics.py
All outputs are written under scripts/OUTPUT/eggo-progress-statistics_<timestamp>/.
"""
from __future__ import annotations

import csv
import json
import os
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODE_EXT = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".py"}
DATA_EXT = {".json"}
EXCLUDED_DIRS = {"assets", "output", "vendor", "node_modules", "tests", "test", "__tests__", "dist", "build"}
CAPTURE_REL = Path("tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/parameters.json")
ACCEPTED_REPLAY = "eggo-long-replay_2026-10-25T19-24-27-639Z"
FINAL_FRAME = 109076


def nonblank_lines(path: Path) -> int:
    try:
        return sum(bool(line.strip()) for line in path.read_text(encoding="utf-8", errors="replace").splitlines())
    except OSError:
        return 0


def count_loc(folder: Path) -> dict[str, int]:
    totals = {"code_files": 0, "code_nonblank_lines": 0, "json_files": 0, "json_nonblank_lines": 0}
    for path in folder.rglob("*"):
        if not path.is_file() or any(p.lower() in EXCLUDED_DIRS for p in path.relative_to(folder).parts[:-1]):
            continue
        if path.name.endswith(".min.js"):
            continue
        if path.suffix.lower() in CODE_EXT:
            totals["code_files"] += 1
            totals["code_nonblank_lines"] += nonblank_lines(path)
        elif path.suffix.lower() in DATA_EXT:
            totals["json_files"] += 1
            totals["json_nonblank_lines"] += nonblank_lines(path)
    return totals


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def source_note(frame: int, text_sources: list[Path]) -> str:
    """Find direct source notes for this boundary; never infer a cause from the frame alone."""
    candidates = []
    for path in text_sources:
        if not path.exists():
            continue
        try:
            for line_no, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if str(frame) not in line and f"{frame:,}" not in line:
                    continue
                direct_fix = re.search(rf"fix(?:es|ed)?\D{{0,12}}(?:frame\s*)?{frame}(?!\d)", line, re.I)
                explicit_frame = re.search(rf"(?:frame|mismatch|difference|divergence)\s*#?\s*{frame}(?!\d)", line, re.I)
                if direct_fix or explicit_frame:
                    candidates.append((path, line_no, line.strip(), bool(direct_fix)))
        except OSError:
            pass
    # Prefer explicitly numbered fix notes over status recap lines and keep the source quote compact.
    candidates.sort(key=lambda x: (not x[3], len(x[2])))
    if candidates:
        p, line_no, line, _ = candidates[0]
        return f"{line[:420]} [source: {p.relative_to(ROOT).as_posix()}:{line_no}]"
    return f"First mismatch at frame {frame}; no frame-specific cause/fix located in checked notes."


def write_csv(path: Path, rows: list[dict]) -> None:
    fields = list(dict.fromkeys(k for row in rows for k in row))
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def read_phase_transitions() -> list[tuple[int, str | None, str]]:
    """Read each compact accepted-run trace chunk; its first fields are frame and phase."""
    trace_dir = ROOT / "tests" / "OUTPUT" / ACCEPTED_REPLAY
    files = sorted(trace_dir.glob("app-trace-*.json"), key=lambda p: int(p.stem.split("-")[-1]))
    if not files:
        raise FileNotFoundError(f"No app-trace chunks under {trace_dir}")
    previous = None
    transitions = []
    count = 0
    for path in files:
        for row in json.loads(path.read_text(encoding="utf-8")):
            count += 1
            phase = row[1]
            if phase != previous:
                transitions.append((int(row[0]), previous, phase))
                previous = phase
    if count != 108676:
        raise ValueError(f"Expected 108676 rows in accepted replay trace, found {count}")
    return transitions


def main() -> None:
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    out = ROOT / "scripts" / "OUTPUT" / f"eggo-progress-statistics_{stamp}"
    out.mkdir(parents=True, exist_ok=False)
    text_sources = [ROOT / "EGGO_REPLAY_STATUS.md", ROOT / "EGGO_CLAUDE_HANDOFF.md", ROOT / "renderer/games/eggo-mania/REFERENCE.md"]
    capture_params_path = ROOT / CAPTURE_REL
    capture_fps = float(read_json(capture_params_path)["fps"])
    phase_transitions = read_phase_transitions()
    level_starts = [f for f, old, new in phase_transitions if old == "countdown" and new == "playing"]
    level_ends = [f for f, old, new in phase_transitions if old == "playing" and new == "won"]
    level_losses = [f for f, old, new in phase_transitions if old == "playing" and new == "lost"]
    next_countdowns = [f for f, old, new in phase_transitions if old == "won" and new == "countdown"]
    if len(level_starts) < 8 or len(level_ends) < 8:
        raise ValueError("Accepted full trace has fewer than eight completed levels")
    level8_end = level_ends[7]
    replay_root = ROOT / "tests" / "OUTPUT"
    candidates = []
    excluded = {"not_full_prefix": 0, "inconsistent_mismatch_count": 0, "non_advancing_duplicate": 0}
    for report_path in replay_root.glob("eggo-long-replay_*/report.json"):
        run_dir = report_path.parent
        param_path = run_dir / "parameters.json"
        if not param_path.exists():
            continue
        params, report = read_json(param_path), read_json(report_path)
        start = int(params.get("startAfter", 400))
        if start != 400 or params.get("seed", 1492) != 1492:
            excluded["not_full_prefix"] += 1; continue
        if "renderFrom" in params and int(params["renderFrom"]) != 401:
            excluded["not_full_prefix"] += 1; continue
        if int(report.get("skippedRenders", 0) or 0) != 0:
            excluded["not_full_prefix"] += 1; continue
        matched = int(report.get("matched", 0))
        mismatch = report.get("firstMismatch")
        if mismatch:
            first = int(mismatch.get("recordingFrame", -1))
            last = first - 1
            if matched != last - start:
                excluded["inconsistent_mismatch_count"] += 1; continue
            evidence = "full_prefix_first_mismatch"
        elif report.get("allMatched"):
            last = start + int(report.get("compared", matched))
            evidence = "full_prefix_all_matched"
        else:
            continue
        legacy = "renderFrom" not in params
        candidates.append({
            "stamp": run_dir.name.removeprefix("eggo-long-replay_"), "run": run_dir.name,
            "report": report_path, "params": params, "matched": matched, "compared": int(report.get("compared", matched)),
            "first_mismatch": int(mismatch["recordingFrame"]) if mismatch else "",
            "last": last, "evidence": evidence, "legacy": legacy,
        })
    candidates.sort(key=lambda x: (x["stamp"], x["last"]))
    # Retain every chronological report which raised the verified maximum, including dense early steps.
    milestones = []
    best = 400
    for item in candidates:
        if item["last"] <= best:
            excluded["non_advancing_duplicate"] += 1; continue
        best = item["last"]
        boundary = item["first_mismatch"]
        note = source_note(boundary, text_sources) if boundary else "Complete supplied recording; no mismatch."
        milestones.append({
            "milestone_index": len(milestones), "run_timestamp_utc": item["stamp"], "replay_run": item["run"],
            "evidence_type": item["evidence"] + ("_legacy_full_prefix_default" if item["legacy"] else "_skipped_renders_zero"),
            "verified_last_frame": item["last"], "matched_frames_reported": item["matched"],
            "compared_frames_reported": item["compared"], "first_mismatch_frame": boundary,
            "skipped_renders": 0 if not item["legacy"] else "not reported; legacy harness had no renderFrom option",
            "capture_game_seconds": round((item["last"] - 400) / capture_fps, 3),
            "model_60hz_seconds": round((item["last"] - 400) / 60, 3),
            "incremental_capture_seconds": round((item["last"] - (milestones[-1]["verified_last_frame"] if milestones else 400)) / capture_fps, 3),
            "fix_or_next_issue_at_boundary": note,
            "report_evidence": report_path_relative(item["report"]),
            "seed": item["params"].get("seed", 1492), "start_after": 400,
        })

    # The source note above needs FPS only for output below; its values are frame-derived.
    # Fix seconds now capture_fps is known.
    for i, row in enumerate(milestones):
        row["capture_game_seconds"] = round((row["verified_last_frame"] - 400) / capture_fps, 3)
        row["model_60hz_seconds"] = round((row["verified_last_frame"] - 400) / 60, 3)
        row["incremental_capture_seconds"] = round((row["verified_last_frame"] - (milestones[i-1]["verified_last_frame"] if i else 400)) / capture_fps, 3)
    write_csv(out / "milestones.csv", milestones)

    round_rows = []
    for i, start_frame in enumerate(level_starts, 1):
        won_frame = level_ends[i-1] if i <= len(level_ends) else ""
        loss_index = i - len(level_ends) - 1
        loss_frame = level_losses[loss_index] if 0 <= loss_index < len(level_losses) else ""
        next_countdown = next_countdowns[i-1] if i <= len(next_countdowns) else ""
        round_rows.append({"level_index": i, "play_start_frame_countdown_to_playing": start_frame,
                           "level_end_frame_playing_to_won": won_frame,
                           "prior_level_last_playing_frame": int(won_frame)-1 if won_frame else "",
                           "next_countdown_frame_won_to_countdown": next_countdown,
                           "loss_frame_if_uncompleted": loss_frame,
                           "graph_boundary_type": "thin dashed at playing->won" if won_frame and i != 8 else ("thin solid red at playing->won" if won_frame else "no completion boundary"),
                           "trace_source": f"{ACCEPTED_REPLAY}/app-trace-*.json (every frame; phase field)",
                           "note": "Level end is first frame in phase=won, before the following countdown. This is the accepted replay model phase trace, not a native RAM audit."})
    write_csv(out / "level_boundaries.csv", round_rows)

    eggo = count_loc(ROOT / "renderer" / "games" / "eggo-mania")
    others = {p.name: count_loc(p) for p in sorted((ROOT / "renderer" / "games").iterdir()) if p.is_dir() and p.name != "eggo-mania"}
    totals = {k: sum(v[k] for v in others.values()) for k in next(iter(others.values()))} if others else {}
    loc_rows = [{"game_folder": "eggo-mania", "scope": "Eggo Mania", **eggo}]
    loc_rows.extend({"game_folder": name, "scope": "other game", **counts} for name, counts in others.items())
    loc_rows.append({"game_folder": "ALL_OTHER_GAMES", "scope": "other games subtotal", **totals})
    write_csv(out / "game_source_loc.csv", loc_rows)

    # Preserve source-authored fix notes that explicitly name frame numbers.
    fix_rows = []
    for source in text_sources:
        if not source.exists():
            continue
        for line_no, line in enumerate(source.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            frame_refs = []
            for match in re.finditer(r"\bfix(?:es|ed|ing)?\s*(?:passes\s*)?(?:at\s*|on\s*|through\s*|frame\s*)?[:#]?\s*((?:\d{3,6})(?:\s*(?:,|/|and|&|-)\s*\d{3,6})*)", line, re.I):
                frame_refs.extend(int(n) for n in re.findall(r"\d{3,6}", match.group(1)))
            frame_refs = sorted(set(n for n in frame_refs if 1000 <= n <= FINAL_FRAME))
            if frame_refs:
                fix_rows.append({"source": source.relative_to(ROOT).as_posix(), "line": line_no,
                                 "frame_references": ";".join(map(str, frame_refs)), "fix_note": line.strip()[:900]})
    write_csv(out / "fix_history.csv", fix_rows)

    # A selected trailing mean of observed first-mismatch advancements. The endpoint's complete run is right-censored.
    gaps = []
    prev = None
    for idx, row in enumerate(milestones):
        f = row["first_mismatch_frame"]
        if f not in (None, ""):
            f = int(f)
            if prev is not None and f > prev:
                gaps.append({"milestone_index": idx, "gap_frames": f-prev, "gap_seconds": (f-prev)/capture_fps})
            prev = f
    observed_mismatch_frames = [int(r["first_mismatch_frame"]) for r in milestones if r["first_mismatch_frame"] not in (None, "")]
    last_boundary = max(observed_mismatch_frames) if observed_mismatch_frames else 400
    censored_frames = max(0, FINAL_FRAME - last_boundary)
    recent = gaps[-5:]
    rolling_mean = sum(g["gap_seconds"] for g in recent) / len(recent) if recent else None
    # Use a full-length x array on both charts. Rolling-mean values exist only at their corresponding milestone indices.
    rolling_by_index = {g["milestone_index"]: sum(x["gap_seconds"] for x in gaps[max(0, i-4):i+1])/len(gaps[max(0, i-4):i+1])
                        for i, g in enumerate(gaps)}
    x = list(range(len(milestones)))
    y = [r["capture_game_seconds"] for r in milestones]
    boundary_x = []
    for frame in level_ends:
        ix = next((j for j, row in enumerate(milestones) if row["verified_last_frame"] >= frame), None)
        if ix is not None: boundary_x.append((ix, frame))
    end8_ix = next((j for j, row in enumerate(milestones) if row["verified_last_frame"] >= level8_end), None)

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise RuntimeError("Matplotlib is needed to regenerate the PNG charts") from exc
    plt.rcParams.update({"figure.constrained_layout.use": True})
    fig, ax = plt.subplots(figsize=(11, 5.5), layout="constrained")
    ax.plot(x, y, marker="o", linewidth=0.75, markersize=2.2, color="#1769aa")
    for ix, frame in boundary_x:
        ax.axvline(ix, color="#777777", linestyle="--", linewidth=0.65, alpha=0.75)
    if end8_ix is not None:
        ax.axvline(end8_ix, color="red", linestyle="-", linewidth=0.85, alpha=0.9)
    ax.set_xlabel("Milestone index (chronological; all advancing full-prefix runs)")
    ax.set_ylabel(f"Verified gameplay time (s; original capture {capture_fps:.4f} Hz)")
    ax.set_title("Eggo replay progress: verified game time")
    ax.grid(True, alpha=.22)
    fig.savefig(out / "verified_game_time.png", dpi=200)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(11, 5.5), layout="constrained")
    yroll = [rolling_by_index.get(i, float("nan")) for i in x]
    ax.plot(x, yroll, marker="o", linewidth=0.75, markersize=2.2, color="#25834a", label="Trailing mean, up to 5 observed mismatch gaps")
    ax.scatter([len(x)-1], [censored_frames/capture_fps], marker="^", s=17, facecolors="none", edgecolors="#ba2020", label="Final all-matched interval (right-censored)")
    for ix, frame in boundary_x:
        ax.axvline(ix, color="#777777", linestyle="--", linewidth=0.65, alpha=0.75)
    if end8_ix is not None:
        ax.axvline(end8_ix, color="red", linestyle="-", linewidth=0.85, alpha=0.9)
    ax.set_xlim(0, max(1, len(x)-1))
    ax.set_xlabel("Milestone index (same chronological index as verified-time chart)")
    ax.set_ylabel(f"Replay gap (s; captured {capture_fps:.4f} Hz)")
    ax.set_title("Observed coherent replay intervals")
    ax.text(.01, .99, "Descriptive trailing mean; not an identifiable forecast", transform=ax.transAxes, va="top", fontsize=8)
    ax.grid(True, axis="y", alpha=.22)
    ax.legend(fontsize=8, loc="upper right")
    fig.savefig(out / "incremental_coherent_replay_time.png", dpi=200)
    plt.close(fig)

    params = {
        "generated_local_time": datetime.now().astimezone().isoformat(timespec="seconds"), "workspace": str(ROOT),
        "milestone_discovery": "Every chronological full-prefix run that advanced the verified maximum is included (not hand-curated); non-advancing duplicates, inconsistent early reports, suffix-only runs and skipped-render runs are counted in exclusions.",
        "acceptance": "Must startAfter=400, seed=1492, renderFrom absent (legacy harness full-prefix default) or 401, and skippedRenders absent/0. For mismatch reports, verified_last_frame is firstMismatch.recordingFrame-1 and matched count must equal last-startAfter. For allMatched, use startAfter+compared.",
        "excluded_report_counts": excluded,
        "historical_notes": [str(p.relative_to(ROOT)).replace(os.sep, "/") for p in text_sources],
        "antigravity": {"title": "Eggo Claude Handoff Review", "conversation_id": "50701917-f59b-412f-8dca-fd3be74145ae",
                        "checked_transcript": str(Path.home()/".gemini/antigravity/brain/50701917-f59b-412f-8dca-fd3be74145ae/.system_generated/logs/transcript_full.jsonl"),
                        "round_trace": "Task-21141 output embedded at transcript step 21143 lists per-frame round/phase transitions; round transition starts 8981,17512,24045,29929,39430,49632,57703,61018. Separate later game reset at68977 is not a level end."},
        "capture_fps": capture_fps, "capture_fps_source": CAPTURE_REL.as_posix(), "model_fps": 60,
        "time_interpretation": "Capture-time seconds = verified recording frames / the original capture fps 59.727500915527344. Replay model used fixed 60 Hz; both seconds columns retained. The original device refresh fluctuates slightly around the reported capture rate.",
        "round_boundary_lines": round_rows, "level8_end_frame": level8_end,
        "graph_style": "Thin lines and small markers. Dashed verticals map every completed level's first playing->won phase frame to the first advancing milestone at/after that frame; solid red marks level8 completion at its playing->won frame. Both charts use milestone_index 0..N-1 as the identical x coordinate sequence.",
        "coherent_estimate": {"kind": "descriptive selected-run trailing mean; not statistical expected time", "window": 5,
                              "recent_mean_seconds": rolling_mean, "recent_mean_frames": sum(g["gap_frames"] for g in recent)/len(recent) if recent else None,
                              "final_right_censored_frames": censored_frames, "final_right_censored_seconds": censored_frames/capture_fps,
                              "note": "The supplied tape cannot identify a probability distribution or true expected next-fix interval. Trailing mean summarizes the latest five positive first-mismatch-boundary advancements. The terminal all-matched observation is right-censored and excluded."},
        "loc_method": "Nonblank UTF-8 lines. Authored/runtime extensions .js/.mjs/.cjs/.ts/.tsx/.jsx/.html/.css/.py; JSON counts separate. Exclude assets, output, vendor, node_modules, tests, build, dist and minified JS.",
        "eggo_loc": eggo, "other_game_loc_by_folder": others, "other_game_loc_sum": totals,
        "output_files": ["milestones.csv", "fix_history.csv", "level_boundaries.csv", "game_source_loc.csv", "verified_game_time.png", "incremental_coherent_replay_time.png", "parameters.json", "README.md"],
    }
    (out/"parameters.json").write_text(json.dumps(params, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    minutes = (FINAL_FRAME-400)/capture_fps/60
    note = f"""# Eggo Mania replay progress statistics\n\nThis rebuild preserves every chronological full-prefix report that raised the verified frame frontier: **{len(milestones)} milestones**, including dense early work (first 5,000 frames). The complete accepted replay compares frames 401–109,076 with zero skipped renders and no mismatch. At the original capture rate ({capture_fps:.7f} Hz), verified tape duration is **{minutes:.2f} minutes**. The separate 60 Hz model duration is **{(FINAL_FRAME-400)/60/60:.2f} minutes**; neither is computer runtime.\n\n## Evidence and exclusions\n\n`milestones.csv` records full-prefix extent and report path for each advancing run. A first-mismatch run verifies only up to frame mismatch-1. Modern reports require renderFrom=401 and skippedRenders=0; legacy runs are accepted only where the older harness lacks renderFrom. Inconsistent early reports, suffix-only runs, skipped rendering and duplicate/non-advancing reports are excluded and counted in `parameters.json`. Frame-specific issue text is linked to a matching note in the checked status/handoff/reference docs; where none matched, the CSV says so instead of guessing. `fix_history.csv` preserves frame-numbered fix notes from those docs, including early fixes.\n\nAntigravity chat **Eggo Claude Handoff Review** was checked. The plotted boundaries come from every frame phase in the accepted full replay `app-trace-*.json`; a level ends on the first `playing`→`won` frame, before the next countdown. `level_boundaries.csv` lists all starts, clears and the final uncompleted level. The eighth clear is red; all other clears are dashed. This is the accepted replay model phase trace, not a native RAM audit.\n\nThe second chart's latest trailing mean over up to five positive mismatch-boundary advancements is **{rolling_mean:.1f} s**. This is a descriptive selected-run statistic, not a statistically identifiable expected future time or bug count. The final all-matched follow-up (**{censored_frames/capture_fps:.1f} s**) is right-censored and shown separately.\n\n## Source size\n\nEggo Mania: **{eggo['code_nonblank_lines']:,}** nonblank runtime/authored source lines in {eggo['code_files']} files. Other games: **{totals.get('code_nonblank_lines',0):,}** lines in {totals.get('code_files',0)} files, subtotal; per-game counts are in `game_source_loc.csv`. JSON config/data lines are separately tallied. Assets, tests, generated output, vendors and build folders are excluded.\n"""
    (out/"README.md").write_text(note, encoding="utf-8")
    print(json.dumps({"output": str(out), "milestones": len(milestones), "first_5000_count": sum(r["verified_last_frame"] < 5000 for r in milestones),
                      "excluded": excluded, "recent_trailing_mean_seconds": rolling_mean, "right_censored_seconds": censored_frames/capture_fps,
                      "level8_end_x_index": end8_ix, "capture_fps": capture_fps}, ensure_ascii=False, indent=2))


def report_path_relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


if __name__ == "__main__":
    main()
