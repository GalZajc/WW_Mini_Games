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

def random_step(s):
    p = (s & 0xffff) * 75
    h = p >> 16
    l = p & 0xffff
    return (p - h - (1 if h <= l else 0)) & 0xffff

records = []
for fnum in range(58201, 58428):
    frame, audio, mem = core.step(masks[fnum])
    ewram = mem['02000000']
    
    # 0x311b8: CPU secondary enemy
    chunk = ewram[0x311b8:0x311b8+0x80]
    x, y = struct.unpack_from('<ii', chunk, 0)
    vx, vy = struct.unpack_from('<ii', chunk, 0x14)
    anim, typ = struct.unpack_from('<ii', chunk, 0x20)
    active, life = struct.unpack_from('<ii', chunk, 0x48)
    clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
    
    # CPU actor root: 0x4f50
    # actor coordinates at 0x4f50
    act_x = struct.unpack_from('<i', ewram, 0x4f50)[0]
    act_y = struct.unpack_from('<i', ewram, 0x4f54)[0]
    water = struct.unpack_from('<i', ewram, 0x4f50 - 0x898 + 0x87c)[0]
    
    # secondary RNG at 0x11ab4
    sec_rng = struct.unpack_from('<I', ewram, 0x11ab4)[0]
    
    records.append({
        'frame': fnum,
        'active': active,
        'life': life,
        'x': x / 65536.0,
        'y': y / 65536.0,
        'vx': vx / 65536.0,
        'vy': vy / 65536.0,
        'anim': anim,
        'wingClock': clock / 65536.0,
        'wingPhase': phase,
        'poseForward': pose_fwd,
        'actorX': act_x / 65536.0,
        'actorY': act_y / 65536.0,
        'water': water / 65536.0,
        'secRng': sec_rng
    })

Path('scripts/OUTPUT/enemy_steps.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print('Dumped scripts/OUTPUT/enemy_steps.json')
