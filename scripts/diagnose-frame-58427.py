import sys
import json
import hashlib
from pathlib import Path
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

state_file = recording_dir / 'after-frame-00058200.state'
core.restore(state_file.read_bytes())
print('Restored state after frame 58200')

masks = {}
expected_hashes = {}
with open(recording_dir / 'inputs.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        fnum = d['frame']
        if 58201 <= fnum <= 58427:
            masks[fnum] = d['mask']
            expected_hashes[fnum] = d['video_sha256']

last_frame = None
last_mem = None
for fnum in range(58201, 58428):
    mask = masks[fnum]
    frame, audio, mem = core.step(mask)
    if fnum == 58427:
        last_frame = frame
        last_mem = mem
        w, h, pfmt, raw = frame
        hsh = hashlib.sha256(raw).hexdigest()
        print(f'Frame 58427 reached! SHA256: {hsh}, pfmt: {pfmt}')

w, h, pfmt, raw = last_frame
# mGBA z RGB565 (pfmt == 2)
arr16 = np.frombuffer(raw, dtype=np.uint16).reshape((h, w))

# Pretvorba v RGB888 natanko tako kot v Appu:
inv5_to_8 = np.floor(np.arange(32) * 255.0 / 31.0).astype(np.uint8)
inv6_to_8 = np.floor(np.arange(64) * 255.0 / 63.0).astype(np.uint8)

if pfmt == 2:
    r5 = (arr16 >> 11) & 0x1f
    g6 = (arr16 >> 5) & 0x3f
    b5 = arr16 & 0x1f
    r = inv5_to_8[r5]
    g = inv6_to_8[g6]
    b = inv5_to_8[b5]
elif pfmt == 0:
    r5 = (arr16 >> 10) & 0x1f
    g5 = (arr16 >> 5) & 0x1f
    b5 = arr16 & 0x1f
    r = inv5_to_8[r5]
    g = inv5_to_8[g5]
    b = inv5_to_8[b5]

rgb_ref = np.stack([r, g, b], axis=-1).astype(np.uint8)
ref_img = Image.fromarray(rgb_ref)
ref_img.save('scripts/OUTPUT/ref-frame-58427.png')

# Naloži app sliko
app_img_path = Path('tests/OUTPUT/eggo-long-replay_2026-10-24T15-23-47-111Z/first-mismatch-app-frame-58427.png')
app_img = Image.open(app_img_path).convert('RGB')
rgb_app = np.array(app_img)

diff = np.any(rgb_ref != rgb_app, axis=-1)
diff_indices = np.argwhere(diff) # y, x
print(f'Total mismatch pixels: {len(diff_indices)}')

if len(diff_indices) > 0:
    min_y, min_x = diff_indices.min(axis=0)
    max_y, max_x = diff_indices.max(axis=0)
    print(f'Bounding box of diff: X=[{min_x}..{max_x}], Y=[{min_y}..{max_y}], width={max_x-min_x+1}, height={max_y-min_y+1}')
    
    print('First 20 diff pixels (Y, X): Ref RGB vs App RGB:')
    for y, x in diff_indices[:20]:
        print(f'  ({y}, {x}): Ref={rgb_ref[y, x].tolist()} App={rgb_app[y, x].tolist()}')

# Shranimo diff sliko
diff_visual = np.zeros((h, w, 3), dtype=np.uint8)
diff_visual[diff] = [255, 0, 0] # rdeče kjer se razlikuje
Image.fromarray(diff_visual).save('scripts/OUTPUT/diff-frame-58427.png')
print('Saved scripts/OUTPUT/diff-frame-58427.png')

# OAM analiza v referenci
oam_raw = last_mem.get('07000000')
if oam_raw:
    print('\n--- OAM Objects near diff region in Reference ---')
    for i in range(128):
        entry = oam_raw[i*8:(i+1)*8]
        attr0, attr1, attr2, _ = np.frombuffer(entry, dtype=np.uint16)
        y = int(attr0 & 0xff)
        x = int(attr1 & 0x1ff)
        if x >= 240: x -= 512
        tile = int(attr2 & 0x3ff)
        prio = int((attr2 >> 10) & 3)
        pal = int((attr2 >> 12) & 0xf)
        shape = int((attr0 >> 14) & 3)
        size = int((attr1 >> 14) & 3)
        rot = int((attr0 >> 8) & 1)
        disabled = int((attr0 >> 9) & 1) if not rot else 0
        if disabled: continue
        if (min_x - 32 <= x <= max_x + 32) and (min_y - 32 <= y <= max_y + 32):
            print(f'  OAM #{i:02d}: pos=({x}, {y}), tile={tile}, pal={pal}, prio={prio}, shape={shape}, size={size}')
