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

for fnum in range(start_frame + 1, 58671):
    frame, audio, mem = core.step(masks.get(fnum, 0))

ewram = mem['02000000']
oam = mem['07000000']

# Robot CPU je na ewram +0x311b8:
rx, ry = struct.unpack_from('<ii', ewram, 0x311b8)
rvx, rvy = struct.unpack_from('<ii', ewram, 0x311b8 + 0x14)
anim = struct.unpack_from('<i', ewram, 0x311b8 + 0x20)[0]
stolen = struct.unpack_from('<i', ewram, 0x311b8 + 0x2c)[0]
clock, phase, pose_fwd = struct.unpack_from('<iii', ewram, 0x311b8 + 0x74)

print(f"GBA Frame 58670 Robot: pos=({rx/65536:.3f}, {ry/65536:.3f}), vel=({rvx/65536:.3f}, {rvy/65536:.3f})")
print(f"  anim={anim}, stolen={stolen}, wingPhase={phase}, wingClock={clock/65536:.4f}, poseForward={pose_fwd}")

# OBJ #27, 28, 29, 31:
for obj_id in [27, 28, 29, 31]:
    a0, a1, a2, _ = struct.unpack_from('<HHHH', oam, obj_id * 8)
    y = a0 & 0xff
    if y >= 160: y -= 256
    x = a1 & 0x1ff
    if x >= 240: x -= 512
    tile = a2 & 0x3ff
    prio = (a2 >> 10) & 3
    print(f"  OAM OBJ #{obj_id}: pos=({x:4d}, {y:4d}), tile={tile:4d}, prio={prio}, a0=0x{a0:04x}, a1=0x{a1:04x}, a2=0x{a2:04x}")
