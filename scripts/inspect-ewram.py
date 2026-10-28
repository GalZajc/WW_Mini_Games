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
    if fnum in (58425, 58426, 58427):
        ewram = mem['02000000']
        oam = mem['07000000']
        
        # Right enemy at 0x311b8
        chunk = ewram[0x311b8:0x311b8+0x80]
        x_fx, y_fx = struct.unpack_from('<ii', chunk, 0)
        vx_fx, vy_fx = struct.unpack_from('<ii', chunk, 0x14)
        clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
        
        # OAM #29, 30, 31
        def get_oam(idx):
            e = oam[idx*8:(idx+1)*8]
            a0, a1, a2, _ = np.frombuffer(e, dtype=np.uint16)
            y = int(a0 & 0xff)
            x = int(a1 & 0x1ff)
            t = int(a2 & 0x3ff)
            p = int((a2 >> 12) & 0xf)
            return f'pos=({x},{y}) tile={t} pal={p}'
        
        print(f'Frame {fnum}:')
        print(f'  EWRAM CPU enemy: x={x_fx/65536.0:.4f}, y={y_fx/65536.0:.4f}, vx={vx_fx/65536.0:.4f}, vy={vy_fx/65536.0:.4f}')
        print(f'  wingClock={clock/65536.0:.4f}, wingPhase={phase}, poseForward={pose_fwd}')
        print(f'  OAM 29: {get_oam(29)}')
        print(f'  OAM 30: {get_oam(30)}')
        print(f'  OAM 31: {get_oam(31)}')
