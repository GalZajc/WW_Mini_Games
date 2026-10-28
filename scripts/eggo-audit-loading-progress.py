"""Measure native startup call progress from recorded RAM snapshots (read-only)."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import csv
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/eggo-recorder'))
from capture import frames

ADDRESSES = {
    'native_frame': 0x11A9C,
    'gate': 0x328C,
    'stack_start': 0x7D00,
    'stack_end': 0x7E00,
    # 0x7D9C contains the caller's saved prefill-loop countdown while
    # FUN_0800B944 is active. Keep the surrounding words to validate context.
    'watch_words': [0x7D68, 0x7D6C, 0x7D70, 0x7D74, 0x7D78, 0x7D8C,
                    0x7D9C, 0x7DA0, 0x7DA4, 0x7DA8, 0x7DAC, 0x7DC8],
    'prefill_loop_countdown_candidate': 0x7D9C,
}
DEFAULT_STARTS = [8981, 17512, 24045, 29929, 39430, 49632, 57703,
                  64820, 69695, 75047, 80654, 85290, 91325, 98099, 104335]


def read_u32(data, offset):
    return struct.unpack_from('<I', data, offset)[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recording', type=Path)
    parser.add_argument('--starts', default=','.join(map(str, DEFAULT_STARTS)))
    parser.add_argument('--window', type=int, default=40)
    args = parser.parse_args()
    starts = [int(value) for value in args.starts.split(',')]
    recording = args.recording.resolve()
    source_parameters = recording / 'parameters.json'
    source_config = json.loads(source_parameters.read_text(encoding='utf-8'))
    offsets, position = {}, 0
    for name, size in source_config['layout'][1:]:
        offsets[name] = (position, size)
        position += size

    folder = ROOT / 'scripts/OUTPUT' / ('eggo-loading-progress_' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ'))
    folder.mkdir(parents=True)
    params = {
        'recording': str(recording),
        'source_parameters_sha256': hashlib.sha256(source_parameters.read_bytes()).hexdigest(),
        'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'starts': starts,
        'window': args.window,
        'addresses': ADDRESSES,
        'method': 'Read recorded video_refresh RAM; extract native frame counter, dispcnt, selected stack words, and possible ROM return addresses. No emulation writes or app state injection.',
        'native_prefill': {'function': '0x08018D3A..0x08018D60', 'calls': 320, 'per_iteration': ['0x0800B944(left)', '0x0800B944(right)']},
    }
    (folder / 'parameters.json').write_text(json.dumps(params, indent=2) + '\n', encoding='utf-8')

    rows = []
    for start in starts:
        for record, _, memory in frames(recording, first=start, last=start + args.window):
            frame = record['frame']
            segments = {name: memory[offset:offset + size] for name, (offset, size) in offsets.items()}
            ew, iw, io = segments['02000000'], segments['03000000'], segments['04000000']
            watch = {f'0x{address:08X}': read_u32(iw, address) for address in ADDRESSES['watch_words']}
            returns = []
            for address in range(ADDRESSES['stack_start'], ADDRESSES['stack_end'], 4):
                value = read_u32(iw, address)
                if 0x08000000 <= value < 0x080C0000:
                    returns.append([f'0x{0x03000000 + address:08X}', f'0x{value:08X}'])
            rows.append({
                'start': start,
                'frame': frame,
                'native_frame': read_u32(ew, ADDRESSES['native_frame']),
                'gate': read_u32(ew, ADDRESSES['gate']),
                'dispcnt': struct.unpack_from('<H', io)[0],
                'watch_words': {key: {'hex': f'0x{value:08X}', 'signed': struct.unpack('<i', struct.pack('<I', value))[0]}
                                for key, value in watch.items()},
                'possible_saved_code_addresses': returns,
            })
            if frame >= start + args.window:
                break

    (folder / 'progress.json').write_text(json.dumps(rows, indent=2) + '\n', encoding='utf-8')
    with (folder / 'progress.csv').open('w', encoding='utf-8', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=['start', 'frame', 'native_frame', 'gate', 'dispcnt', 'countdown_7d9c', 'returns'])
        writer.writeheader()
        for row in rows:
            count = row['watch_words']['0x00007D9C']
            writer.writerow({
                'start': row['start'], 'frame': row['frame'], 'native_frame': row['native_frame'],
                'gate': row['gate'], 'dispcnt': row['dispcnt'], 'countdown_7d9c': count['signed'],
                'returns': ';'.join(f'{sp}={pc}' for sp, pc in row['possible_saved_code_addresses']),
            })

    print(folder)
    for start in starts:
        segment = [row for row in rows if row['start'] == start]
        first_visible = next((row['frame'] for row in segment if row['dispcnt']), None)
        sample = [(row['frame'], row['native_frame'], row['watch_words']['0x00007D9C']['signed'])
                  for row in segment if row['native_frame'] == 1 or
                  0x08000000 <= row['watch_words']['0x00007DAC']['signed'] <= 0x080C0000]
        print(f'start={start} first_display={first_visible} loop_samples={sample[:20]}', flush=True)


if __name__ == '__main__':
    main()
