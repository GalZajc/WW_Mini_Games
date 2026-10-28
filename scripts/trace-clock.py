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

# Simulacija po kodi iz model.js
app_clock = 8.0
app_phase = 0

print('fnum | GBA clock | GBA phase | GBA vy  | App clock | App phase | diff?')
print('-----+-----------+-----------+---------+-----------+-----------+------')

for fnum in range(58201, 58428):
    frame, audio, mem = core.step(masks[fnum])
    if fnum >= 58357:
        ewram = mem['02000000']
        chunk = ewram[0x311b8:0x311b8+0x80]
        clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
        vy = struct.unpack_from('<i', chunk, 0x18)[0] / 65536.0
        
        # Posodobimo app_clock in app_phase po formuli iz model.js
        app_clock -= (4.25 - 2.0 * vy)
        if app_clock <= 0:
            app_clock = 8.0
            app_phase = (app_phase + 1) % 8
        
        gba_clock = clock / 65536.0
        gba_phase = phase
        diff_str = ' ***' if gba_phase != app_phase or abs(gba_clock - app_clock) > 0.001 else ''
        if diff_str or fnum >= 58420 or fnum <= 58362:
            print(f'{fnum} |  {gba_clock:7.4f}  |     {gba_phase}     | {vy:7.4f} |  {app_clock:7.4f}  |     {app_phase}     |{diff_str}')
