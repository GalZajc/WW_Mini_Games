import numpy as np
from PIL import Image

app = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T15-23-47-111Z/first-mismatch-app-frame-58427.png').convert('RGB'))
ref = np.array(Image.open('scripts/OUTPUT/ref-frame-58427.png'))
wings = np.array(Image.open('renderer/games/eggo-mania/assets/factory-secondary-wings.png'))

app_wing = app[56:72, 127:191]
ref_wing = ref[56:72, 127:191]

# Preverimo za vsako fazo v wings:
for phase in range(8):
    w_slice = wings[:, phase*64:(phase+1)*64]
    alpha = w_slice[:, :, 3] > 0
    w_rgb = w_slice[:, :, :3]
    
    # Preverimo ujemanje z app_wing (z toleranco zaradi 5-bit vs 6-bit barv)
    diff_app = np.abs(app_wing.astype(int) - w_rgb.astype(int))
    match_app = np.all(diff_app <= 4, axis=-1) & alpha
    
    diff_ref = np.abs(ref_wing.astype(int) - w_rgb.astype(int))
    match_ref = np.all(diff_ref <= 4, axis=-1) & alpha
    
    print(f'Phase {phase} (total {np.sum(alpha)} opaque px):')
    print(f'  matches App: {np.sum(match_app)} / {np.sum(alpha)}')
    print(f'  matches Ref: {np.sum(match_ref)} / {np.sum(alpha)}')
