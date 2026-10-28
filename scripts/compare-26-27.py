import json
from pathlib import Path
import sys, struct
import numpy as np
from PIL import Image

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

ref_frames = {}
for fnum in range(58201, 58428):
    frame, audio, mem = core.step(masks[fnum])
    if fnum in (58426, 58427):
        w, h, pfmt, raw = frame
        arr16 = np.frombuffer(raw, dtype=np.uint16).reshape((h, w))
        inv5_to_8 = np.floor(np.arange(32) * 255.0 / 31.0).astype(np.uint8)
        inv6_to_8 = np.floor(np.arange(64) * 255.0 / 63.0).astype(np.uint8)
        r = inv5_to_8[(arr16 >> 11) & 0x1f]
        g = inv6_to_8[(arr16 >> 5) & 0x3f]
        b = inv5_to_8[arr16 & 0x1f]
        ref_frames[fnum] = np.stack([r, g, b], axis=-1).astype(np.uint8)

ref58426 = ref_frames[58426]
ref58427 = ref_frames[58427]
app58427 = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T15-23-47-111Z/first-mismatch-app-frame-58427.png').convert('RGB'))

# Primerjajmo ref58426 in ref58427 na območju kril
print('Difference in Ref between Frame 58426 and 58427 in region Y=50..75, X=120..195:')
diff_ref = np.any(ref58426[50:75, 120:195] != ref58427[50:75, 120:195], axis=-1)
print(f'Total pixels changed in Ref: {np.sum(diff_ref)}')

# Primerjajmo app58427 in ref58426 na območju kril:
# Ali je app58427 enak ref58426 (torej ali je App zamudil za 1 frame)?!
diff_app_ref26 = np.any(app58427[50:75, 120:195] != ref58426[50:75, 120:195], axis=-1)
print(f'Difference between App 58427 and Ref 58426: {np.sum(diff_app_ref26)} pixels')

# Bounding box razlik
print('Difference between App 58427 and Ref 58427:')
diff_app_ref27 = np.any(app58427 != ref58427, axis=-1)
indices = np.argwhere(diff_app_ref27)
print(f'Total diff pixels on screen: {len(indices)}')
if len(indices) > 0:
    min_y, min_x = indices.min(axis=0)
    max_y, max_x = indices.max(axis=0)
    print(f'Bounding box: X=[{min_x}..{max_x}], Y=[{min_y}..{max_y}]')
