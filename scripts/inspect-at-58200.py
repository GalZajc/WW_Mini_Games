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
# Pridobimo memory takoj po restore
# Pokličemo 1 prazen korak ali preberemo RAM
frame, audio, mem = core.step(0)

ewram = mem['02000000']
for name, root in [('P0 Secondary', 0x31138), ('CPU Secondary', 0x311b8)]:
    chunk = ewram[root:root+0x80]
    x, y = struct.unpack_from('<ii', chunk, 0)
    vx, vy = struct.unpack_from('<ii', chunk, 0x14)
    anim, typ = struct.unpack_from('<ii', chunk, 0x20)
    active, life = struct.unpack_from('<ii', chunk, 0x48)
    clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
    print(f'{name} at Frame 58201: active={active}, life={life}, type={typ}, x={x/65536.0:.4f}, y={y/65536.0:.4f}, vx={vx/65536.0:.4f}, vy={vy/65536.0:.4f}, anim={anim}, wingClock={clock/65536.0:.4f}, wingPhase={phase}, poseFwd={pose_fwd}')
