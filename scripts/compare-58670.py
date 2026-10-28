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

# Najdemo najbližji state pred 58670: after-frame-00058500.state ali 58200
start_frame = 58500
core.restore((recording_dir / f'after-frame-{start_frame:08d}.state').read_bytes())

masks = {}
with open(recording_dir / 'inputs.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        if start_frame < d['frame'] <= 58670:
            masks[d['frame']] = d['mask']

inv5_to_8 = np.floor(np.arange(32) * 255.0 / 31.0).astype(np.uint8)
inv6_to_8 = np.floor(np.arange(64) * 255.0 / 63.0).astype(np.uint8)

for fnum in range(start_frame + 1, 58671):
    frame, audio, mem = core.step(masks.get(fnum, 0))

w, h, pfmt, raw = frame
arr16 = np.frombuffer(raw, dtype=np.uint16).reshape((h, w))
r = inv5_to_8[(arr16 >> 11) & 0x1f]
g = inv6_to_8[(arr16 >> 5) & 0x3f]
b = inv5_to_8[arr16 & 0x1f]
ref_img = np.stack([r, g, b], axis=-1).astype(np.uint8)

Image.fromarray(ref_img).save('scripts/OUTPUT/ref-frame-58670.png')
print("Saved scripts/OUTPUT/ref-frame-58670.png")

# Naložimo App sliko
app_img = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T16-15-05-163Z/first-mismatch-app-frame-58670.png').convert('RGB'))

# Primerjajmo piksle
# RGB565 primerjava: pretvorimo v RGB565
def to_rgb565(img):
    r5 = (img[:, :, 0] >> 3).astype(np.uint16)
    g6 = (img[:, :, 1] >> 2).astype(np.uint16)
    b5 = (img[:, :, 2] >> 3).astype(np.uint16)
    return (r5 << 11) | (g6 << 5) | b5

app565 = to_rgb565(app_img)
ref565 = arr16 # to je originalni frame v RGB565 iz GBA!

diff = (app565 != ref565)
diff_indices = np.argwhere(diff)
print(f"Total diff pixels (RGB565): {len(diff_indices)}")

if len(diff_indices) > 0:
    min_y = np.min(diff_indices[:, 0])
    max_y = np.max(diff_indices[:, 0])
    min_x = np.min(diff_indices[:, 1])
    max_x = np.max(diff_indices[:, 1])
    print(f"Bounding box: X=[{min_x}..{max_x}] (width {max_x-min_x+1}), Y=[{min_y}..{max_y}] (height {max_y-min_y+1})")
    
    # Izpišimo prvih nekaj različnih pikslov:
    print("Sample diff pixels (y, x):")
    for y, x in diff_indices[:15]:
        print(f"  ({y:3d}, {x:3d}): App=0x{app565[y, x]:04x} (RGB {app_img[y, x].tolist()}), Ref=0x{ref565[y, x]:04x} (RGB {ref_img[y, x].tolist()})")

# OAM analiza v GBA na frame 58670
oam_raw = mem.get('07000000', b'')
if oam_raw:
    print("\n--- GBA OAM around diff bounding box ---")
    for i in range(128):
        attr0, attr1, attr2, _ = struct.unpack_from('<HHHH', oam_raw, i * 8)
        y = attr0 & 0xff
        x = attr1 & 0x1ff
        if x >= 256: x -= 512
        tile = attr2 & 0x3ff
        # preverimo, če se prekriva z bounding boxom
        if len(diff_indices) > 0:
            if (min_x - 64 <= x <= max_x) and (min_y - 64 <= y <= max_y):
                print(f"  OAM #{i:2d}: pos=({x:3d}, {y:3d}), tile={tile:3d}, attr0=0x{attr0:04x}, attr1=0x{attr1:04x}, attr2=0x{attr2:04x}")
