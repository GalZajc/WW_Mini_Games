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

phase_seen = {}
for fnum in range(58201, 58428):
    frame, audio, mem = core.step(masks[fnum])
    ewram = mem['02000000']
    oam = mem['07000000']
    
    chunk = ewram[0x311b8:0x311b8+0x80]
    active, life = struct.unpack_from('<ii', chunk, 0x48)
    clock, phase, pose_fwd = struct.unpack_from('<iii', chunk, 0x74)
    
    if active:
        # Preberimo položaj OAM 30 (levo krilo) in OAM 29 (telo)
        e30 = oam[30*8:31*8]
        a0, a1, a2, _ = np.frombuffer(e30, dtype=np.uint16)
        y = int(a0 & 0xff)
        x = int(a1 & 0x1ff)
        t = int(a2 & 0x3ff)
        
        if phase not in phase_seen:
            w, h, pfmt, raw = frame
            arr16 = np.frombuffer(raw, dtype=np.uint16).reshape((h, w))
            r = inv5_to_8[(arr16 >> 11) & 0x1f]
            g = inv6_to_8[(arr16 >> 5) & 0x3f]
            b = inv5_to_8[arr16 & 0x1f]
            rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
            
            # Izrežimo krila (64x16 pri (x, y))
            # x je v OAM, y je v OAM
            wing_crop = rgb[y:y+16, x:x+64]
            phase_seen[phase] = {
                'frame': fnum,
                'x': x,
                'y': y,
                'tile': t,
                'crop': wing_crop
            }
            print(f'Captured GBA Phase {phase} at frame {fnum}: OAM pos=({x}, {y}), tile={t}')

# Primerjajmo vsako ujeto fazo z assetom factory-secondary-wings.png
wings_asset = np.array(Image.open('renderer/games/eggo-mania/assets/factory-secondary-wings.png'))
for phase, info in sorted(phase_seen.items()):
    crop = info['crop']
    # Asset za ta phase
    asset_slice = wings_asset[:, phase*64:(phase+1)*64]
    alpha = asset_slice[:, :, 3] > 0
    asset_rgb = asset_slice[:, :, :3]
    
    # Primerjajmo piksle
    diff = np.abs(crop.astype(int) - asset_rgb.astype(int))
    match = np.all(diff <= 4, axis=-1) & alpha
    print(f'GBA Phase {phase} (from frame {info["frame"]}) vs Asset Phase {phase}: {np.sum(match)} / {np.sum(alpha)} matching pixels')
