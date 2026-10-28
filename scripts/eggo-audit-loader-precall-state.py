"""Find native frame counters during the wait before each arena loader call."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/eggo-recorder'))
from capture import frames

RECORDING = ROOT / 'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398'
WINDOWS = [
    (8981, 8996), (17512, 17528), (24045, 24060), (29929, 29944),
    (39430, 39447), (49632, 49647), (57703, 57719), (64820, 64837),
    (69695, 69711), (75047, 75062), (80654, 80671), (85290, 85305),
    (91325, 91341), (98099, 98115), (104335, 104351),
]


def candidates(samples):
    found = []
    for segment, data in [('ewram', 0), ('iwram', 262144)]:
        size = 0x40000 if segment == 'ewram' else 0x8000
        arrays = [memory[data:data + size] for memory in samples]
        for width, fmt in [(1, '<B'), (2, '<H'), (4, '<I')]:
            for offset in range(0, size - width + 1):
                if offset % width:
                    continue
                values = [struct.unpack_from(fmt, block, offset)[0] for block in arrays]
                if values[0] == 0 and 10 <= values[-1] <= 30 and all(b - a in (0, 1) for a, b in zip(values, values[1:])):
                    if values[-1] - values[0] >= 10:
                        found.append({'segment': segment, 'offset': offset, 'width': width,
                                      'start': values[0], 'end': values[-1],
                                      'sequence': values})
                if values[0] >= 10 and values[0] <= 30 and values[-1] == 0 and all(a - b in (0, 1) for a, b in zip(values, values[1:])):
                    if values[0] - values[-1] >= 10:
                        found.append({'segment': segment, 'offset': offset, 'width': width,
                                      'start': values[0], 'end': values[-1],
                                      'sequence': values})
    return found


def main():
    run = ROOT / 'scripts/OUTPUT' / ('eggo-loader-precall-state_' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ'))
    run.mkdir(parents=True)
    input_file = RECORDING / 'inputs.jsonl'
    params = {
        'recording': str(RECORDING), 'recording_input_sha256': hashlib.sha256(input_file.read_bytes()).hexdigest(),
        'starts_and_loader_entries': WINDOWS,
        'method': 'Read-only EWRAM and IWRAM snapshots at every original video callback from gate-0 round start through the measured FUN_08018E38 call entry. Search byte/halfword/word counters that monotonically count 10..30 ticks from or to zero.',
        'address_notes': {'ewram': '0x02000000', 'iwram': '0x03000000', 'gate': '0x0200328C', 'loader_state': '0x02003290'},
    }
    (run / 'parameters.json').write_text(json.dumps(params, indent=2) + '\n', encoding='utf-8')
    report = []
    shared = {}
    for round_index, (start, entry) in enumerate(WINDOWS, 2):
        samples = []
        frame_numbers = []
        for record, _, memory in frames(RECORDING, first=start, last=entry):
            samples.append(memory)
            frame_numbers.append(record['frame'])
        found = candidates(samples)
        for c in found:
            key = (c['segment'], c['offset'], c['width'])
            shared.setdefault(key, []).append({'round': round_index, 'values': c['sequence']})
        report.append({'round': round_index, 'start': start, 'entry': entry,
                       'frame_numbers': frame_numbers, 'candidate_counters': found})
    report_obj = {'rounds': report,
                  'counters_seen_in_multiple_rounds': [
                      {'segment': key[0], 'offset': f'0x{key[1]:X}', 'width': key[2], 'rounds': vals}
                      for key, vals in shared.items() if len(vals) >= 2]}
    (run / 'candidates.json').write_text(json.dumps(report_obj, indent=2) + '\n', encoding='utf-8')
    print(run)
    for round_data in report:
        common = [c for c in round_data['candidate_counters'] if c['offset'] < 0x3400]
        print(f"round{round_data['round']} start={round_data['start']} entry={round_data['entry']} common={common[:10]}")


if __name__ == '__main__':
    main()
