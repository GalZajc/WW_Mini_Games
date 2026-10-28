import json
from pathlib import Path
import sys, struct
import numpy as np

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
    if fnum in (58426, 58427):
        oam = mem['07000000']
        print(f'=== OAM on Frame {fnum} ===')
        for i in range(24, 34):
            e = oam[i*8:(i+1)*8]
            a0, a1, a2, _ = np.frombuffer(e, dtype=np.uint16)
            y = int(a0 & 0xff)
            x = int(a1 & 0x1ff)
            if x >= 240: x -= 512
            t = int(a2 & 0x3ff)
            p = int((a2 >> 12) & 0xf)
            prio = int((a2 >> 10) & 3)
            shape = int((a0 >> 14) & 3)
            size = int((a1 >> 14) & 3)
            print(f'  OAM #{i:02d}: pos=({x:4d}, {y:3d}), tile={t:4d}, pal={p:2d}, prio={prio}, shape={shape}, size={size}')
