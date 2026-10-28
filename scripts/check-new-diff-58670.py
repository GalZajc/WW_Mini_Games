import numpy as np
from PIL import Image

app_img = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T16-44-45-985Z/first-mismatch-app-frame-58670.png').convert('RGB'))
ref_img = np.array(Image.open('scripts/OUTPUT/ref-frame-58670.png').convert('RGB'))

def to_rgb565(img):
    r5 = (img[:, :, 0] >> 3).astype(np.uint16)
    g6 = (img[:, :, 1] >> 2).astype(np.uint16)
    b5 = (img[:, :, 2] >> 3).astype(np.uint16)
    return (r5 << 11) | (g6 << 5) | b5

app565 = to_rgb565(app_img)
ref565 = to_rgb565(ref_img)

diff = (app565 != ref565)
diff_indices = np.argwhere(diff)
print(f"Total diff pixels (RGB565): {len(diff_indices)}")

if len(diff_indices) > 0:
    min_y = np.min(diff_indices[:, 0])
    max_y = np.max(diff_indices[:, 0])
    min_x = np.min(diff_indices[:, 1])
    max_x = np.max(diff_indices[:, 1])
    print(f"Bounding box: X=[{min_x}..{max_x}], Y=[{min_y}..{max_y}]")
    for y, x in diff_indices[:15]:
        print(f"  ({y:3d}, {x:3d}): App=0x{app565[y, x]:04x} (RGB {app_img[y, x].tolist()}), Ref=0x{ref565[y, x]:04x} (RGB {ref_img[y, x].tolist()})")
