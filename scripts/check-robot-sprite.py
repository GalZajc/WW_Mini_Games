from PIL import Image
import numpy as np

img = Image.open('renderer/games/eggo-mania/assets/factory-secondary.png').convert('RGBA')
arr = np.array(img)

f2 = arr[:64, 2*64:3*64]
print("Frame 2 alpha at (X=20..36, Y=25..41):")
for y in range(25, 42):
    line = ""
    for x in range(20, 37):
        line += "#" if f2[y, x, 3] > 0 else "."
    print(f"y={y:2d}: {line}")
