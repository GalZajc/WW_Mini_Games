"""Inspect native round-loading latency and saved call-stack words; never run the UI."""
from pathlib import Path
from datetime import datetime
import argparse
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/eggo-recorder'))
from capture import frames

ADDRESSES = {'native_frame': 0x11a9c, 'gate': 0x328c,
             'stack_start': 0x7d00, 'stack_end': 0x7e00,
             'rom_start': 0x08000000, 'rom_code_end': 0x080c0000}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recording', type=Path)
    parser.add_argument('--starts', required=True, help='Comma-separated original round-start frames')
    parser.add_argument('--window', type=int, default=40)
    args = parser.parse_args()
    starts = [int(x) for x in args.starts.split(',')]
    if args.window < 1 or any(n < 1 for n in starts):
        parser.error('Starts and window must be positive')
    source_parameters = args.recording / 'parameters.json'
    config = json.loads(source_parameters.read_text(encoding='utf-8'))
    offsets, position = {}, 0
    for name, size in config['layout'][1:]:
        offsets[name] = (position, size)
        position += size
    out = ROOT / 'scripts/OUTPUT' / ('eggo-loading-audit_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
    out.mkdir(parents=True)
    params = {'recording': str(args.recording.resolve()), 'starts': starts, 'window': args.window,
              'addresses': ADDRESSES, 'sampling': 'recorded video_refresh; no writes; no game-state injection',
              'source_parameters_sha256': hashlib.sha256(source_parameters.read_bytes()).hexdigest(),
              'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (out / 'parameters.json').write_text(json.dumps(params, indent=2) + '\n', encoding='utf-8')
    result = []
    for index, start in enumerate(starts, 1):
        trace = []
        for record, _, memory in frames(args.recording, first=start, last=start + args.window):
            segments = {name: memory[p:p+n] for name, (p, n) in offsets.items()}
            ew, iw, io = (segments[name] for name in ('02000000', '03000000', '04000000'))
            stack = []
            for address in range(ADDRESSES['stack_start'], ADDRESSES['stack_end'], 4):
                value = struct.unpack_from('<I', iw, address)[0]
                if ADDRESSES['rom_start'] <= value < ADDRESSES['rom_code_end']:
                    stack.append([hex(0x03000000 + address), hex(value)])
            trace.append({'frame': record['frame'],
                          'native_frame': struct.unpack_from('<I', ew, ADDRESSES['native_frame'])[0],
                          'gate': struct.unpack_from('<I', ew, ADDRESSES['gate'])[0],
                          'dispcnt': struct.unpack_from('<H', io)[0],
                          'possible_saved_code_addresses': stack})
        first = next((r['frame'] for r in trace if r['dispcnt']), None)
        result.append({'start': start, 'first_display': first,
                       'hidden_ticks': None if first is None else first-start-1, 'trace': trace})
        print(f'[{index}/{len(starts)}] start={start}, first_display={first}, hidden_ticks={result[-1]["hidden_ticks"]}', flush=True)
    (out / 'loading.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(out)


if __name__ == '__main__':
    main()
