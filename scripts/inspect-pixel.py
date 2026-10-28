from PIL import Image
import numpy as np

img = Image.open('scripts/OUTPUT/diff-app-crop-58670.png')
arr = np.array(img)

print("App crop 16x16 shape:", arr.shape)
# Natisnemo kot ASCII art po svetlosti:
for row in arr:
    line = ""
    for px in row:
        r, g, b = px[:3]
        bright = (int(r) + int(g) + int(b)) // 3
        if bright > 200: line += "#"
        elif bright > 100: line += "+"
        elif bright > 30: line += "."
        else: line += " "
    print(line)
