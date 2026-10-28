import json
from pathlib import Path
import sys, struct

sys.path.append(str(Path('tools/eggo-recorder').resolve()))
from core import Core

config = json.loads(Path('tools/eggo-recorder/config.json').read_text(encoding='utf-8'))
core = Core(
    core='tools/eggo-recorder/runtime/mgba_libretro.dll',
    rom=config['rom'],
    directory='scripts/OUTPUT',
    options=config.get('core_options'),
    capture_memory=True
)

state_p = Path('tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-00058200.state')
core.restore(state_p.read_bytes())

# Read inputs around 58200..58430
inputs = {}
with open('tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/inputs.jsonl', 'r') as f:
    for line in f:
        obj = json.loads(line)
        fr = obj['frame']
        if fr > 58435:
            break
        if fr >= 58201:
            inputs[fr] = obj['mask']

print("Tracing GBA enemy state from frame 58201 to 58430:")
prev_active = False
for f in range(58201, 58431):
    pad = inputs.get(f, 0)
    frame, audio, mem = core.step(pad)
    ewram = mem['02000000']
    
    chunk = ewram[0x311b8:0x311b8+0x80]
    x_raw, y_raw = struct.unpack_from('<ii', chunk, 0x0)
    vx_raw, vy_raw = struct.unpack_from('<ii', chunk, 0x14)
    etype = struct.unpack_from('<i', chunk, 0x24)[0]
    active = struct.unpack_from('<i', chunk, 0x48)[0]
    life = struct.unpack_from('<i', chunk, 0x4c)[0]
    clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
    
    # print when active changes or around 58420..58430 or when clock changes
    if active and not prev_active:
        print(f"SPAWN Frame {f}: active={active}, life={life}, pos=({x_raw/65536:.2f}, {y_raw/65536:.2f}), vy={vy_raw/65536:.4f}, clock={clock/65536:.4f}, phase={phase}, pose={pose_fwd}")
    prev_active = active
