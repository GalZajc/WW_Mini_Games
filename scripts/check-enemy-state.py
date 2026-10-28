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

for state_name in [
    'tools/eggo-recorder/runtime/survival-hard.state',
    'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-00000300.state',
    'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-00055800.state',
    'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-00058200.state'
]:
    p = Path(state_name)
    if not p.exists(): continue
    core.restore(p.read_bytes())
    frame, audio, mem = core.step(0)
    ewram = mem['02000000']
    chunk = ewram[0x311b8:0x311b8+0x80]
    clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
    print(f'{p.name}: 0x311b8 -> wingClock={clock/65536.0:.4f} (0x{clock:x}), wingPhase={phase}, poseForward={pose_fwd}')
