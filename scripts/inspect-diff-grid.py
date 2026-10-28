import numpy as np
from PIL import Image

app = np.array(Image.open('tests/OUTPUT/eggo-long-replay_2026-10-24T15-23-47-111Z/first-mismatch-app-frame-58427.png').convert('RGB'))
ref = np.array(Image.open('scripts/OUTPUT/ref-frame-58427.png'))
wings = np.array(Image.open('renderer/games/eggo-mania/assets/factory-secondary-wings.png'))

# Primerjajmo piksle na Y=56..71, X=127..190
print('=== Y=64..71 across X=127..190 ===')
for y in range(64, 72):
    diffs = []
    for x in range(127, 191):
        if not np.array_equal(app[y, x], ref[y, x]):
            diffs.append(x)
    print(f'Y={y}: {len(diffs)} diffs at X={[min(diffs), max(diffs)] if diffs else []}')
    # Poglejmo nekaj pikslov
    if diffs:
        x_ex = diffs[0]
        print(f'   At ({x_ex}, {y}): App={app[y, x_ex].tolist()} Ref={ref[y, x_ex].tolist()}')
