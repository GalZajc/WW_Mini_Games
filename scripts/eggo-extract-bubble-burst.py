"""Extract both native bubble burst descriptors (ROM 0801131c..11338)."""
from pathlib import Path
from datetime import datetime
import hashlib
import importlib.util
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    'source': 'scripts/OUTPUT/eggo-round-intro_2026-10-25_00-23-45',
    'frames_by_life_shift_3': [62058, 62050],
    'object': 25,
    'size': 64,
    'palette': 5,
    'priority': 1,
    'output': 'renderer/games/eggo-mania/assets/electric-bubble-burst.png',
}
spec = importlib.util.spec_from_file_location('native_layers', ROOT / 'scripts/eggo-compose-native-layers.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
out = ROOT / 'scripts/OUTPUT' / ('eggo-bubble-burst_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True)
size = PARAMETERS['size']
atlas = Image.new('RGBA', (size * 2, size))
hashes = {}
for cel, frame in enumerate(PARAMETERS['frames_by_life_shift_3']):
    raw = {}
    for address in ['04000000', '05000000', '06000000', '07000000']:
        path = ROOT / PARAMETERS['source'] / f'frame-{frame}.{address}'
        raw[address] = path.read_bytes()
        hashes[str(path.relative_to(ROOT))] = hashlib.sha256(raw[address]).hexdigest()
    obj = native.decode_object(raw['06000000'], native.palette_555(raw['05000000']),
                               raw['04000000'], raw['07000000'], PARAMETERS['object'])
    assert obj['width'] == obj['height'] == size and obj['priority'] == PARAMETERS['priority']
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[:, :, :3] = native.color5_to_rgb8(obj['pixels'])
    rgba[:, :, 3] = obj['visible'].astype(np.uint8) * 255
    rgba[~obj['visible']] = 0
    image = Image.fromarray(rgba)
    image.save(out / f'cel-{cel}.png')
    atlas.paste(image, (cel * size, 0))
atlas.save(out / 'electric-bubble-burst.png')
atlas.save(ROOT / PARAMETERS['output'])
(out / 'parameters.json').write_text(json.dumps({**PARAMETERS, 'source_sha256': hashes}, indent=2), encoding='utf-8')
print(out)
