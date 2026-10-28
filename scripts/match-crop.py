from pathlib import Path
from PIL import Image
import numpy as np

app_crop = np.array(Image.open('scripts/OUTPUT/diff-app-crop-58670.png').convert('RGB'))

# Poiščimo med asseti
for p in Path('renderer/games/eggo-mania/assets').glob('*.png'):
    try:
        img = Image.open(p).convert('RGBA')
        arr = np.array(img)
        # če je 16x16 ali večji, poiščimo ujemanje
        h, w, _ = arr.shape
        if h < 16 or w < 16: continue
        # preverimo vsak 16x16 blok
        for y in range(0, h - 15, 8):
            for x in range(0, w - 15, 8):
                block = arr[y:y+16, x:x+16]
                alpha = block[:, :, 3] > 0
                if np.sum(alpha) < 50: continue
                block_rgb = block[:, :, :3]
                diff = np.abs(app_crop.astype(int) - block_rgb.astype(int))
                match = np.all(diff <= 8, axis=-1) & alpha
                if np.sum(match) > np.sum(alpha) * 0.9:
                    print(f"Match in {p.name} at ({x}, {y}): {np.sum(match)}/{np.sum(alpha)} pixels!")
    except Exception as e:
        pass
