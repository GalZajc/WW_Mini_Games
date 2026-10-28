"""Decode missing rival hit/swim pictures from the existing ROM resource atlas."""
from pathlib import Path
from datetime import datetime
import json, struct, hashlib
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'renderer/games/eggo-mania/assets'
PARAMETERS = {
    'resources': 'scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879',
    'sources': json.loads((ASSETS / 'rival-poses.json').read_text(encoding='utf-8'))['parameters']['sources'],
    'actor': 0x4f50, 'resource_pointer': 0x838, 'palette_slot': 0x828,
    'size': 64, 'groups': {'injured': [5, 4], 'swim': [17, 10]},
    'random_seed': None,
}
out = ROOT / 'scripts/OUTPUT' / ('eggo-rival-specials_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True)
resources = ROOT / PARAMETERS['resources']
characters = json.loads((resources / 'measurement.json').read_text(encoding='utf-8'))['characters']
records = {}
for stage, folder in PARAMETERS['sources'].items():
    ram_path = next((ROOT / folder).glob('*.ram'))
    base = str(ram_path)[:-4]
    ram = ram_path.read_bytes()
    root = struct.unpack_from('<I', ram, PARAMETERS['actor'] + PARAMETERS['resource_pointer'])[0]
    name, char = next((n, c) for n, c in characters.items() if c['root'] == root)
    slot = struct.unpack_from('<H', ram, PARAMETERS['actor'] + PARAMETERS['palette_slot'])[0]
    native = np.frombuffer(Path(base + '.0x5000000').read_bytes(), dtype='<u2')[256 + slot * 16:272 + slot * 16]
    original = np.frombuffer((resources / (name + '-palette.bin')).read_bytes(), dtype='<u2')
    rgb = lambda p: np.stack([(p >> s & 31) * 255 // 31 for s in (0, 5, 10)], axis=-1).astype('uint8')
    source_rgb, target_rgb = rgb(original), rgb(native)
    source = np.asarray(Image.open(resources / (name + '.png')).convert('RGBA')).copy()
    original_pixels = source[..., :3].copy()
    for i in range(1, 16):
        mask = np.all(original_pixels == source_rgb[i], axis=-1) & (source[..., 3] > 0)
        source[mask, :3] = target_rgb[i]
    atlas = Image.new('RGBA', (640, 128))
    for row, (group, count) in enumerate(PARAMETERS['groups'].values()):
        strip = Image.fromarray(source[(group-1)*64:group*64, :count*64])
        atlas.paste(strip, (0, row*64))
    path = ASSETS / (stage + '-rival-specials.png')
    atlas.save(path)
    records[stage] = {'character': name, 'palette_slot': slot, 'source': base,
        'ram_sha256': hashlib.sha256(ram).hexdigest(), 'asset_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
(out / 'parameters.json').write_text(json.dumps(PARAMETERS, indent=2), encoding='utf-8')
(out / 'results.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
(ASSETS / 'rival-specials.json').write_text(json.dumps({'parameters': PARAMETERS, 'records': records}, indent=2), encoding='utf-8')
print(out)
