from PIL import Image
import numpy as np

app = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T16-44-45-985Z/first-mismatch-app-frame-58670.png').convert('RGB'))
ref = np.array(Image.open('scripts/OUTPUT/ref-frame-58670.png').convert('RGB'))

# Primerjajmo območje Y=[55..80], X=[160..190]
app_sub = app[55:80, 160:190]
ref_sub = ref[55:80, 160:190]

print("Ref image has piece pixels (yellow/white) in Y=[59..74], X=[166..182]:")
for y in range(55, 76):
    r_line = ""
    a_line = ""
    for x in range(165, 185):
        # rumena/bela:
        r_is_piece = (ref[y, x, 0] > 180 and ref[y, x, 1] > 180)
        a_is_piece = (app[y, x, 0] > 180 and app[y, x, 1] > 180)
        r_line += "P" if r_is_piece else "."
        a_line += "P" if a_is_piece else "."
    print(f"y={y:2d}: Ref=[{r_line}]  App=[{a_line}]")
