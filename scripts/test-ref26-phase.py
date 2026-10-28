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

inv5_to_8 = np.floor(np.arange(32) * 255.0 / 31.0).astype(np.uint8)
inv6_to_8 = np.floor(np.arange(64) * 255.0 / 63.0).astype(np.uint8)

for fnum in range(58201, 58427): # teče do 58426 vključno
    frame, audio, mem = core.step(masks[fnum])

w, h, pfmt, raw = frame
arr16 = np.frombuffer(raw, dtype=np.uint16).reshape((h, w))
r = inv5_to_8[(arr16 >> 11) & 0x1f]
g = inv6_to_8[(arr16 >> 5) & 0x3f]
b = inv5_to_8[arr16 & 0x1f]
ref58426 = np.stack([r, g, b], axis=-1).astype(np.uint8)

# Na frame 58426 je bil OAM kril pos=(129, 55)
wing_crop_26 = ref58426[55:71, 129:193]

# Primerjajmo wing_crop_26 z vsemi 8 fazami v assets/factory-secondary-wings.png
wings_asset = np.array(Image.open('renderer/games/eggo-mania/assets/factory-secondary-wings.png'))
print('--- Matching Ref 58426 wing crop (at pos 129, 55) against asset phases ---')
for phase in range(8):
    w_slice = wings_asset[:, phase*64:(phase+1)*64]
    alpha = w_slice[:, :, 3] > 0
    w_rgb = w_slice[:, :, :3]
    diff = np.abs(wing_crop_26.astype(int) - w_rgb.astype(int))
    match = np.all(diff <= 4, axis=-1) & alpha
    print(f'Phase {phase} (opaque {np.sum(alpha)}): matches {np.sum(match)} / {np.sum(alpha)}')
