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

ewram = mem['02000000']

def dump_actor(name, base):
    x, y = struct.unpack_from('<ii', ewram, base)
    vx, vy = struct.unpack_from('<ii', ewram, base + 0x14)
    state = struct.unpack_from('<i', ewram, base + 0x110c - 0x3bd4)[0] if (base + 0x110c - 0x3bd4 + 4 <= len(ewram)) else None
    # Let's inspect inventory:
    # player inventory: 0x02004438 (offset 0x4438). CPU inventory: 0x020057B4 (offset 0x57b4)
    inv_addr = 0x4438 if name == 'player' else 0x57b4
    held_kind = struct.unpack_from('<i', ewram, inv_addr)[0]
    held_rot = struct.unpack_from('<i', ewram, inv_addr + 4)[0]
    held_fuse = struct.unpack_from('<i', ewram, inv_addr + 8)[0]
    
    print(f"--- {name} (base 0x{base:04x}) ---")
    print(f"  pos: ({x/65536:.4f}, {y/65536:.4f}), vel: ({vx/65536:.4f}, {vy/65536:.4f})")
    print(f"  inventory: kind={held_kind}, rot={held_rot}, fuse={held_fuse}")

dump_actor('player', 0x3bd4)
dump_actor('cpu', 0x4f50)
