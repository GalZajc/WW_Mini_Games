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

for f_num in range(57000, 75000, 1500):
    p = Path(f'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-{f_num:08d}.state')
    if not p.exists(): continue
    core.restore(p.read_bytes())
    _, _, mem = core.step(0)
    ewram = mem['02000000']
    # Round is at 0x02011910 - 0x02000000 = 0x11910 or let's find round
    # In earlier scripts, round word is at 0x02011938 or similar
    # Let's inspect where round number is
    round_val = ewram[0x11938] if len(ewram) > 0x11938 else -1
    print(f"Frame {f_num}: byte@0x11938={round_val}")
