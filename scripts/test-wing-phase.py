import numpy as np
from PIL import Image
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

for fnum in range(58201, 58428):
    frame, audio, mem = core.step(masks[fnum])

vram = mem['06000000']
oam = mem['07000000']
pal = mem['05000000']

pal_obj = np.frombuffer(pal[0x200:], dtype=np.uint16)
p9 = pal_obj[9*16:(9+1)*16]
inv5_to_8 = np.floor(np.arange(32) * 255.0 / 31.0).astype(np.uint8)
palette_rgb = []
for c in p9:
    r = inv5_to_8[c & 0x1f]
    g = inv5_to_8[(c >> 5) & 0x1f]
    b = inv5_to_8[(c >> 10) & 0x1f]
    palette_rgb.append([r, g, b])

# Dekodirajmo 4bpp ploščice iz VRAM (OBJ ploščice so na offsetu 0x10000)
# Za 32x16 sprite (shape=1, size=2):
# V 2D mapping načinu (ali 1D mapping načinu):
# DISPCNT bit 6 določa 1D ali 2D mapping za OBJ!
# Preverimo DISPCNT v I/O RAM (0x04000000)
io_ram = mem.get('04000000')
dispcnt = struct.unpack_from('<H', io_ram, 0)[0] if io_ram else 0
is_1d = bool(dispcnt & (1 << 6))
print(f'DISPCNT: 0x{dispcnt:04x}, OBJ mapping is 1D: {is_1d}')

# V 1D mappingu:
# Sprite 32x16 ima 4 ploščice v širino, 2 v višino = 8 ploščic.
# Ploščice si sledijo zaporedno: tile, tile+1, tile+2, tile+3 (prva vrstica),
# nato tile+4, tile+5, tile+6, tile+7 (druga vrstica)!
def decode_sprite_1d(start_tile, w_tiles, h_tiles):
    img = np.zeros((h_tiles * 8, w_tiles * 8, 4), dtype=np.uint8)
    for ty in range(h_tiles):
        for tx in range(w_tiles):
            tile_idx = start_tile + ty * w_tiles + tx
            tile_bytes = vram[0x10000 + tile_idx * 32 : 0x10000 + (tile_idx + 1) * 32]
            for py in range(8):
                row = tile_bytes[py * 4 : (py + 1) * 4]
                for px in range(4):
                    b = row[px]
                    c0 = b & 0xf
                    c1 = (b >> 4) & 0xf
                    x_pos = tx * 8 + px * 2
                    y_pos = ty * 8 + py
                    if c0 != 0:
                        img[y_pos, x_pos, :3] = palette_rgb[c0]
                        img[y_pos, x_pos, 3] = 255
                    if c1 != 0:
                        img[y_pos, x_pos + 1, :3] = palette_rgb[c1]
                        img[y_pos, x_pos + 1, 3] = 255
    return img

# OAM 30 je levo krilo (tile 614, 32x16)
# OAM 31 je desno krilo (tile 606, 32x16)
left_wing_vram = decode_sprite_1d(614, 4, 2)
right_wing_vram = decode_sprite_1d(606, 4, 2)

# Združimo obe v 64x16 sliko
full_wing_vram = np.zeros((16, 64, 4), dtype=np.uint8)
full_wing_vram[:, 0:32] = left_wing_vram
full_wing_vram[:, 32:64] = right_wing_vram

Image.fromarray(full_wing_vram).save('scripts/OUTPUT/vram_wings_frame58427.png')
print('Saved scripts/OUTPUT/vram_wings_frame58427.png')

# Primerjajmo to z vsemi 8 fazami v assets/factory-secondary-wings.png
wings_asset = np.array(Image.open('renderer/games/eggo-mania/assets/factory-secondary-wings.png'))
for phase in range(8):
    phase_slice = wings_asset[:, phase * 64 : (phase + 1) * 64]
    diff = np.any(full_wing_vram != phase_slice, axis=-1)
    diff_count = np.sum(diff)
    print(f'Comparison with Asset Phase {phase}: {diff_count} diff pixels')
