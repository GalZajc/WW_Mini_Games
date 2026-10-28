import json
from pathlib import Path
import sys, struct

sys.path.append(str(Path('tools/eggo-recorder').resolve()))
from core import Core

config = json.loads(Path('tools/eggo-recorder/config.json').read_text(encoding='utf-8'))
recording_dir = Path('tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398')

core = Core(
    core='tools/eggo-recorder/runtime/mgba_libretro.dll',
    rom=config['rom'],
    directory='scripts/OUTPUT',
    options=config.get('core_options'),
    capture_memory=True
)

start_frame = 58500
core.restore((recording_dir / f'after-frame-{start_frame:08d}.state').read_bytes())

masks = {}
with open(recording_dir / 'inputs.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        if start_frame < d['frame'] <= 58671:
            masks[d['frame']] = d['mask']

print("Tracing GBA CPU from 58640 to 58670:")
for fnum in range(start_frame + 1, 58671):
    frame, audio, mem = core.step(masks.get(fnum, 0))
    if fnum >= 58640:
        ewram = mem['02000000']
        x, y = struct.unpack_from('<ii', ewram, 0x4f50)
        vx, vy = struct.unpack_from('<ii', ewram, 0x4f50 + 0x14)
        held_kind = struct.unpack_from('<i', ewram, 0x57b4)[0]
        # CPU keys: 0x5a40 is AI brain. Keys are at 0xe9a8 or in field struct?
        # Let's find cpu keys: AI keys at 0x0200e9a8? Or in ewram 0x4c8c + offset?
        # In eggo-reference-probed: AI={'brain':0x5a40, 'keys':0xe9a8}
        ai_keys = struct.unpack_from('<H', ewram, 0xe9a8)[0] if 0xe9a8 + 2 <= len(ewram) else 0
        print(f"Frame {fnum}: CPU pos=({x/65536:.3f}, {y/65536:.3f}), vel=({vx/65536:.3f}, {vy/65536:.3f}), held={held_kind}, ai_keys=0x{ai_keys:04x}")
