import numpy as np
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

core.restore((recording_dir / 'after-frame-00058200.state').read_bytes())
masks = {}
with open(recording_dir / 'inputs.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        if 58201 <= d['frame'] <= 58427:
            masks[d['frame']] = d['mask']

for fnum in range(58201, 58428):
    frame, audio, mem = core.step(masks[fnum])

ewram = mem['02000000']

# 0x02000260: left wing tiles for wingPhase 0..7
print('Left wing table (0x02000260):')
for phase in range(8):
    tile_ptr = struct.unpack_from('<I', ewram, 0x260 + phase * 4)[0]
    print(f'  Phase {phase}: ptr=0x{tile_ptr:08x}')

# 0x02000280: right wing tiles for wingPhase 0..7
print('Right wing table (0x02000280):')
for phase in range(8):
    tile_ptr = struct.unpack_from('<I', ewram, 0x280 + phase * 4)[0]
    print(f'  Phase {phase}: ptr=0x{tile_ptr:08x}')

# 0x020002a0: body tiles for anim 0..15
print('Body table (0x020002a0):')
for anim in range(16):
    tile_ptr = struct.unpack_from('<I', ewram, 0x2a0 + anim * 4)[0]
    print(f'  Anim {anim}: ptr=0x{tile_ptr:08x}')
