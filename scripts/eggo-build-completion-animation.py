"""Decode all eight native completion-star frames from ROM OBJ data."""
from pathlib import Path
from datetime import datetime
import json, hashlib, struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ROM = Path('C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba')
CAPTURE = ROOT / 'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.frame00219'
rom = ROM.read_bytes()
pointer = struct.unpack_from('<I', rom, 0x1b128)[0]
palette = Path(str(CAPTURE) + '.0x5000000').read_bytes()
oam = Path(str(CAPTURE) + '.0x7000000').read_bytes()
attr2 = struct.unpack_from('<H', oam, 35*8+4)[0]
bank = attr2 >> 12
image = Image.new('RGBA', (64, 8))
for frame in range(8):
    tile = rom[pointer-0x08000000+frame*32:pointer-0x08000000+(frame+1)*32]
    for y in range(8):
        for x in range(8):
            index = (tile[y*4+x//2] >> ((x&1)*4)) & 15
            if not index: continue
            rgb = struct.unpack_from('<H', palette, 512+(bank*16+index)*2)[0]
            image.putpixel((frame*8+x,y), tuple(((rgb>>shift)&31)*255//31 for shift in (0,5,10))+(255,))
asset = ROOT / 'renderer/games/eggo-mania/assets/completed-floor-star.png'
image.save(asset)
params = {'experiment':'ROM completion-star animation', 'rom':str(ROM),
          'rom_sha256':hashlib.sha256(rom).hexdigest(), 'rom_pointer':hex(pointer),
          'palette_capture':str(CAPTURE.relative_to(ROOT)), 'palette_bank':bank,
          'asset':str(asset.relative_to(ROOT)), 'frames':8, 'frame_size':[8,8],
          'random_seed':None, 'motion_routine':'0x0801b084',
          'motion':'type 1 advances world Y by one pixel per update; counter increments every two updates, frame is counter >> 1'}
out = ROOT / 'scripts/OUTPUT' / ('eggo-completion-animation_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(params,indent=2)+'\n',encoding='utf-8')
params['asset_sha256'] = hashlib.sha256(asset.read_bytes()).hexdigest()
asset.with_suffix('.json').write_text(json.dumps(params,indent=2)+'\n',encoding='utf-8')
image.save(out/'animation.png')
print(out)
