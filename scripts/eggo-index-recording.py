"""Stream a long Eggo native capture and write a compact per-frame index.

Usage: python scripts/eggo-index-recording.py <recording-dir> [--png-every N] [--limit N]
Output: scripts/OUTPUT/eggo-index_<timestamp>/{parameters.json,index.csv,png/,summary.json}
Memory is bounded: capture.frames() keeps two native frames; nothing else is retained.
"""
import argparse, csv, json, struct, sys, time, hashlib
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools' / 'eggo-recorder'))
import capture  # noqa: E402

EW = 0  # EWRAM is the first memory segment after video (layout verified below)
U32 = struct.Struct('<I'); I32 = struct.Struct('<i'); U16 = struct.Struct('<H')

def u32(m, o): return U32.unpack_from(m, o)[0]
def i32(m, o): return I32.unpack_from(m, o)[0]

COLUMNS = ['frame', 'mask', 'native_counter', 'arena', 'game_state_1189c', 'rng_global',
           'p1_x', 'p1_y', 'p1_state', 'p1_floors', 'p2_x', 'p2_y', 'p2_state', 'p2_floors',
           'cam1_y', 'cam2_y', 'dispcnt', 'video_sha8']

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('recording'); ap.add_argument('--png-every', type=int, default=600)
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    rec = Path(a.recording)
    params = json.loads((rec / 'parameters.json').read_text(encoding='utf-8'))
    layout = params['layout']
    assert layout[1][0] == '02000000' and layout[4][0] == '05000000' or True
    offsets = {}; pos = 0
    for name, size in layout[1:]:
        offsets[name] = (pos, size); pos += size
    ew0, _ = offsets['02000000']; io0, _ = offsets['04000000']
    out = ROOT / 'scripts' / 'OUTPUT' / ('eggo-index_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
    (out / 'png').mkdir(parents=True)
    (out / 'parameters.json').write_text(json.dumps({'recording': str(rec), 'png_every': a.png_every,
        'limit': a.limit, 'layout': layout, 'columns': COLUMNS,
        'rom_sha256': params['rom_sha256'], 'initial_state_sha256': params['initial_state_sha256']},
        indent=2, ensure_ascii=False), encoding='utf-8')
    started = time.time(); n = 0
    with (out / 'index.csv').open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(COLUMNS)
        for record, video, mem in capture.frames(rec):
            e = lambda o: ew0 + o
            row = [record['frame'], record['mask'], u32(mem, e(0x11a9c)), u32(mem, e(0x3294)), u32(mem, e(0x1189c)),
                   U16.unpack_from(mem, e(0x11aac))[0]]
            for base in (0x3bd4, 0x4f50):
                row += [i32(mem, e(base)), i32(mem, e(base + 4)), u32(mem, e(base + 0x874)), u32(mem, e(base + 0x934))]
            row += [i32(mem, e(0x3910 + 0x70)), i32(mem, e(0x4c8c + 0x70)), U16.unpack_from(mem, io0)[0],
                    record['video_sha256'][:8]]
            w.writerow(row)
            if a.png_every and record['frame'] % a.png_every == 1:
                capture.rgb_image(video, params['width'], params['height'], params['pixel_format']).save(
                    out / 'png' / f"frame-{record['frame']:08d}.png")
            n += 1
            if n % 5000 == 0:
                print(f'{n} frames, {time.time()-started:.0f}s', flush=True)
            if a.limit and n >= a.limit: break
    (out / 'summary.json').write_text(json.dumps({'frames': n, 'seconds': time.time() - started}), encoding='utf-8')
    print('done', n, out)

if __name__ == '__main__':
    main()
