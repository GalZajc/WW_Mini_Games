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

print("Tracing GBA Robot & CPU steal between 58660 and 58671:")
for fnum in range(start_frame + 1, 58672):
    frame, audio, mem = core.step(masks.get(fnum, 0))
    if fnum >= 58660:
        ewram = mem['02000000']
        # CPU actor (0x4f50)
        cpu_x, cpu_y = struct.unpack_from('<ii', ewram, 0x4f50)
        cpu_held = struct.unpack_from('<i', ewram, 0x57b4)[0]
        
        # Robot is in enemy table:
        # Enemy 1 (CPU secondary) or let's find enemy with type == 2
        # Earlier we saw robot at ewram offset 0x311b8:
        # Wait, enemy table has 4 enemies:
        # Let's inspect all 4 enemies in ewram
        # Table is at 0x02011bc0 (ewram offset 0x11bc0) or 0x311b8?
        # Let's search ewram for type == 2
        robot_data = None
        for base in [0x11bc0, 0x11c40, 0x11cc0, 0x11d40, 0x310c0, 0x31140, 0x311c0, 0x311b8]:
            if base + 0x80 <= len(ewram):
                etype = struct.unpack_from('<i', ewram, base + 0x24)[0]
                if etype == 2:
                    rx, ry = struct.unpack_from('<ii', ewram, base)
                    rvx, rvy = struct.unpack_from('<ii', ewram, base + 0x14)
                    active = struct.unpack_from('<i', ewram, base + 0x48)[0]
                    life = struct.unpack_from('<i', ewram, base + 0x4c)[0]
                    # stolen item pointer or kind in enemy:
                    # In enemy struct: what offset is stolen item?
                    # Let's check offsets +0x2c, +0x40, +0x60
                    stolen = struct.unpack_from('<i', ewram, base + 0x2c)[0]
                    field_idx = struct.unpack_from('<H', ewram, base + 0x66)[0]
                    if field_idx == 1: # CPU field!
                        robot_data = (base, rx/65536, ry/65536, rvx/65536, rvy/65536, active, life, stolen)
                        break
        
        if robot_data:
            base, rx, ry, rvx, rvy, act, life, stolen = robot_data
            if fnum == 58669:
                print(f"ROBOT EWRAM ADDRESS: 0x{0x02000000 + base:08x}, stolen address: 0x{0x02000000 + base + 0x2c:08x}")
            dx = (rx + 17) - (cpu_x/65536 - 16) # hit distance in model
            dy = (ry + 62) - (cpu_y/65536)
            print(f"Frame {fnum}: CPU pos=({cpu_x/65536:.2f}, {cpu_y/65536:.2f}), held={cpu_held} | Robot pos=({rx:.2f}, {ry:.2f}), act={act}, life={life}, stolen={stolen} | diff=({rx - cpu_x/65536:.2f}, {ry - cpu_y/65536:.2f})")
