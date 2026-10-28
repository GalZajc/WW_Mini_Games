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
        if start_frame < d['frame'] <= 58670:
            masks[d['frame']] = d['mask']

for fnum in range(start_frame + 1, 58671):
    frame, audio, mem = core.step(masks.get(fnum, 0))

oam_raw = mem['07000000']

# GBA OBJ sizes table: [shape][size] -> (w, h)
sizes = {
    0: {0: (8, 8), 1: (16, 16), 2: (32, 32), 3: (64, 64)}, # Square
    1: {0: (16, 8), 1: (32, 8), 2: (32, 16), 3: (64, 32)}, # Horizontal
    2: {0: (8, 16), 1: (8, 32), 2: (16, 32), 3: (32, 64)}, # Vertical
}

print("Active OAMs in GBA on frame 58670:")
for i in range(128):
    attr0, attr1, attr2, _ = struct.unpack_from('<HHHH', oam_raw, i * 8)
    # Check if disabled (rot/scale flag = 0 and bit 9 = 1)
    is_rot = bool(attr0 & 0x0100)
    is_disabled = (not is_rot) and bool(attr0 & 0x0200)
    if is_disabled: continue
    
    y = attr0 & 0xff
    if y >= 160: y -= 256
    x = attr1 & 0x1ff
    if x >= 240: x -= 512
    shape = (attr0 >> 14) & 3
    size = (attr1 >> 14) & 3
    if shape == 3: continue
    w, h = sizes[shape][size]
    tile = attr2 & 0x3ff
    prio = (attr2 >> 10) & 3
    
    # print if anywhere near screen
    if -64 < x < 240 and -64 < y < 160:
        print(f"  OBJ #{i:2d}: pos=({x:4d}, {y:4d}), size={w:2d}x{h:2d}, tile={tile:3d}, prio={prio}, attr0=0x{attr0:04x}, attr1=0x{attr1:04x}")
