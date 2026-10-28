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

start_frame = 9600
core.restore((recording_dir / f'after-frame-{start_frame:08d}.state').read_bytes())

masks = {}
with open(recording_dir / 'inputs.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        if start_frame < d['frame'] <= 9825:
            masks[d['frame']] = d['mask']

for fnum in range(start_frame + 1, 9825):
    frame, audio, mem = core.step(masks.get(fnum, 0))

w, h, pfmt, raw = frame
arr16 = np.frombuffer(raw, dtype=np.uint16).reshape((h, w))
inv5_to_8 = np.floor(np.arange(32) * 255.0 / 31.0).astype(np.uint8)
inv6_to_8 = np.floor(np.arange(64) * 255.0 / 63.0).astype(np.uint8)
r = inv5_to_8[(arr16 >> 11) & 0x1f]
g = inv6_to_8[(arr16 >> 5) & 0x3f]
b = inv5_to_8[arr16 & 0x1f]
ref_img = np.stack([r, g, b], axis=-1).astype(np.uint8)

app_img = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T16-42-38-764Z/first-mismatch-app-frame-9824.png').convert('RGB'))

def to_rgb565(img):
    r5 = (img[:, :, 0] >> 3).astype(np.uint16)
    g6 = (img[:, :, 1] >> 2).astype(np.uint16)
    b5 = (img[:, :, 2] >> 3).astype(np.uint16)
    return (r5 << 11) | (g6 << 5) | b5

app565 = to_rgb565(app_img)
ref565 = arr16

diff = (app565 != ref565)
diff_indices = np.argwhere(diff)
print(f"Total diff pixels (RGB565): {len(diff_indices)}")

if len(diff_indices) > 0:
    min_y = np.min(diff_indices[:, 0])
    max_y = np.max(diff_indices[:, 0])
    min_x = np.min(diff_indices[:, 1])
    max_x = np.max(diff_indices[:, 1])
    print(f"Bounding box: X=[{min_x}..{max_x}], Y=[{min_y}..{max_y}]")
    
    for y, x in diff_indices[:10]:
        print(f"  ({y:3d}, {x:3d}): App=0x{app565[y, x]:04x}, Ref=0x{ref565[y, x]:04x}")
