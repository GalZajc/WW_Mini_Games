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

for fnum in range(58201, 58230):
    frame, audio, mem = core.step(masks[fnum])
    ewram = mem['02000000']
    chunk = ewram[0x311b8:0x311b8+0x80]
    active, life = struct.unpack_from('<ii', chunk, 0x48)
    clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
    vy = struct.unpack_from('<i', chunk, 0x18)[0]
    print(f'Frame {fnum}: active={active}, life={life}, vy={vy/65536.0:.4f}, wingClock={clock/65536.0:.4f}, wingPhase={phase}')
