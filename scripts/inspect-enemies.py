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
oam = mem['07000000']

ENEMIES={'roots':[0x31038,0x310b8,0x31138,0x311b8]}
names = ['P0 Primary', 'CPU Primary', 'P0 Secondary', 'CPU Secondary']

for name, root in zip(names, ENEMIES['roots']):
    chunk = ewram[root:root+0x80]
    x, y = struct.unpack_from('<ii', chunk, 0)
    vx, vy = struct.unpack_from('<ii', chunk, 0x14)
    anim, typ = struct.unpack_from('<ii', chunk, 0x20)
    active, life = struct.unpack_from('<ii', chunk, 0x48)
    clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
    print(f'{name} (0x{root:05x}): active={active}, life={life}, type={typ}, x={x/65536.0:.4f}, y={y/65536.0:.4f}, vx={vx/65536.0:.4f}, vy={vy/65536.0:.4f}, anim={anim}, wingClock={clock/65536.0:.4f}, wingPhase={phase}, poseFwd={pose_fwd}')
