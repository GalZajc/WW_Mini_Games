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
    
    # Preverimo stanje akterjev:
    # Player 0: root 0x02003bd4 (ali 0x3bd4)
    # CPU: root 0x02004f50 (ali 0x4f50)
    # State je na +0x874
    p0_state = struct.unpack_from('<i', ewram, 0x3bd4 + 0x874)[0]
    p1_state = struct.unpack_from('<i', ewram, 0x4f50 + 0x874)[0]
    
    # Blimp reševanje: p0_blimp ali p1_blimp
    # Izpišimo če je kateri v reševanju ali v vodi
    if p0_state in (7, 8, 9, 10, 11) or p1_state in (7, 8, 9, 10, 11):
        if fnum % 10 == 0 or fnum in (58201, 58356, 58357, 58427):
            print(f'Frame {fnum}: P0 state={p0_state}, CPU state={p1_state}')
