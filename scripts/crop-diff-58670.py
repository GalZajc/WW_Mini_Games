from PIL import Image
import numpy as np

app = Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T16-15-05-163Z/first-mismatch-app-frame-58670.png')
ref = Image.open('scripts/OUTPUT/ref-frame-58670.png')

app_crop = app.crop((171, 82, 187, 98))
ref_crop = ref.crop((171, 82, 187, 98))

app_crop.save('scripts/OUTPUT/diff-app-crop-58670.png')
ref_crop.save('scripts/OUTPUT/diff-ref-crop-58670.png')

print("Saved crops.")
