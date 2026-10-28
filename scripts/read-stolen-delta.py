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

for fnum in range(start_frame + 1, 58671):
    frame, audio, mem = core.step(masks.get(fnum, 0))

ewram = mem['02000000']
oam = mem['07000000']

dx = struct.unpack_from('<i', ewram, 0x311b8 + 0x34)[0]
dy = struct.unpack_from('<i', ewram, 0x311b8 + 0x38)[0]
print(f"GBA robot stolen item delta: dx={dx}, dy={dy}")
