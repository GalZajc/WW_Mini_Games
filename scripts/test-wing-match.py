import numpy as np
from PIL import Image

ref = np.array(Image.open('scripts/OUTPUT/ref-frame-58427.png'))
app = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T15-23-47-111Z/first-mismatch-app-frame-58427.png').convert('RGB'))
wings = np.array(Image.open('renderer/games/eggo-mania/assets/factory-secondary-wings.png'))

# Na Frame 58427: x=127, y=56
# Krila so velikosti 64x16: X=[127..190], Y=[56..71]
ref_wing_region = ref[56:72, 127:191] # shape (16, 64, 3)
app_wing_region = app[56:72, 127:191] # shape (16, 64, 3)

print('--- Diff between App and Ref in wing region (16x64) ---')
diff_app_ref = np.any(ref_wing_region != app_wing_region, axis=-1)
print(f'Total diff in wing region: {np.sum(diff_app_ref)}')

# Preverimo vsako fazo v assets/factory-secondary-wings.png:
# Če bi to fazo z alpha blendingom narisali čez ozadje, ali se ujema z Ref ali z App?
# Ozadje za krili:
# Poglejmo piksle kjer ima faza alpha == 0
for phase in range(8):
    w_slice = wings[:, phase*64:(phase+1)*64] # RGBA
    alpha = w_slice[:, :, 3] > 0
    rgb = w_slice[:, :, :3]
    
    # Kjer je alpha > 0 v w_slice:
    # Kakšno je ujemanje z Ref?
    match_ref = np.all(ref_wing_region[alpha] == rgb[alpha], axis=-1)
    # Kakšno je ujemanje z App?
    match_app = np.all(app_wing_region[alpha] == rgb[alpha], axis=-1)
    
    print(f'Phase {phase}: {np.sum(alpha)} opaque pixels')
    print(f'   matches Ref: {np.sum(match_ref)} / {np.sum(alpha)}')
    print(f'   matches App: {np.sum(match_app)} / {np.sum(alpha)}')
