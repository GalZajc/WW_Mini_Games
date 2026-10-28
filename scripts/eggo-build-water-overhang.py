"""Decode the eight-pixel water OBJ overhangs, without screenshot pixels."""
from pathlib import Path
from datetime import datetime
import hashlib, importlib.util, json, struct
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'renderer/games/eggo-mania/assets'
PARAMETERS = {'sprite_size': [64, 32], 'field_width': 112, 'edge_width': 8,
              'palette_bank': 4, 'seed': None,
              'source': 'Existing unmodified native graphics captures; no new inputs'}
spec = importlib.util.spec_from_file_location('ppu', ROOT/'scripts/eggo-compose-native-layers.py')
ppu = importlib.util.module_from_spec(spec); spec.loader.exec_module(ppu)
sources = json.loads((ASSETS/'arena-water.json').read_text(encoding='utf-8'))['sources']
sources['factory'] = {'prefix': 'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics',
                      'samples': [1, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54]}
out = ROOT/'scripts/OUTPUT'/('eggo-water-overhang_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(); records = {}
for stage, source in sources.items():
    phases = {}; hashes = {}; factory = stage == 'factory'
    old = np.array(Image.open(ASSETS/f'{stage}-water-surface.png').convert('RGBA'))
    for index, frame in enumerate(source.get('samples', []) if factory else range(1, 61)):
        prefix = ROOT/(source['prefix']+f'.frame{frame:05d}')
        suffixes = ['.memory3', '.0x5000000', '.0x4000000', '.0x7000000']
        raw = [Path(str(prefix)+s).read_bytes() for s in suffixes]
        vram, palette, io, oam = raw
        phase = index if factory else struct.unpack_from('<I', Path(str(prefix)+'.ram').read_bytes(), 0x11a9c)[0] % 60
        full = np.zeros((32, 128, 4), dtype=np.uint8); found = []
        for obj_index in range(128):
            a, b, c = struct.unpack_from('<3H', oam, obj_index*8)
            x = b & 511; x = x-512 if x >= 256 else x
            if a & 0x300 or a >> 14 != 1 or b >> 14 != 3 or c >> 12 != PARAMETERS['palette_bank'] or x not in [-8, 56]: continue
            obj = ppu.decode_object(vram, ppu.palette_555(palette), io, oam, obj_index)
            rgba = np.dstack([ppu.color5_to_rgb8(obj['pixels']), obj['visible'].astype(np.uint8)*255])
            rgba[~obj['visible']] = 0; full[:, x+8:x+72] = rgba; found.append(obj_index)
        assert len(found) == 2, (stage, frame, found)
        # The already verified in-field artwork must remain identical in RGB5.
        expected = old[phase*32:(phase+1)*32]
        assert np.array_equal(full[:, 8:120, 3], expected[:, :, 3]), (stage, phase, 'alpha')
        assert np.array_equal(full[:, 8:120, :3] >> 3, expected[:, :, :3] >> 3), (stage, phase, 'RGB5')
        phases[phase] = np.concatenate([full[:, :8], full[:, 120:]], axis=1)
        hashes[frame] = {s: hashlib.sha256(data).hexdigest() for s, data in zip(suffixes, raw)}
    assert sorted(phases) == list(range(15 if factory else 60))
    asset = ASSETS/f'{stage}-water-overhang.png'
    Image.fromarray(np.concatenate([phases[p] for p in sorted(phases)])).save(asset)
    records[stage] = {'prefix': source['prefix'], 'phases': len(phases), 'source_hashes': hashes,
                      'asset_sha256': hashlib.sha256(asset.read_bytes()).hexdigest()}
    print(stage, len(phases), flush=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS, indent=2), encoding='utf-8')
(out/'results.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print(out)
