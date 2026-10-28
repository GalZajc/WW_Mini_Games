"""Check native rival OBJ against ROM descriptor resources and upload phase."""
from pathlib import Path
from datetime import datetime
import json, csv, struct, hashlib, importlib.util
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
CAPTURE=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876'
RESOURCES=ROOT/'scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879'
manifest=json.loads((RESOURCES/'measurement.json').read_text(encoding='utf-8'))
resource=manifest['characters']['bebub']
ATLAS=ROOT/'renderer/games/eggo-mania/assets/factory-rival-native.png'
atlas=np.asarray(Image.open(ATLAS).convert('RGBA'))
art={}
for group,entries in resource['groups'].items():
    for cel,entry in enumerate(entries):
        art[entry['descriptor']]=atlas[(int(group)-1)*64:int(group)*64,cel*64:(cel+1)*64]
spec=importlib.util.spec_from_file_location('ppu',ROOT/'scripts/eggo-compose-native-layers.py')
ppu=importlib.util.module_from_spec(spec);spec.loader.exec_module(ppu)
out=ROOT/'scripts/OUTPUT'/('eggo-rival-resource_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
records=[];previous=None
for frame in range(1,601):
    base=CAPTURE/f'eggo-replay-full-graphics.frame{frame:05d}'
    ram=Path(str(base)+'.ram').read_bytes();oam=Path(str(base)+'.0x7000000').read_bytes()
    vram=Path(str(base)+'.memory3').read_bytes();io=Path(str(base)+'.0x4000000').read_bytes()
    palette=ppu.palette_555(Path(str(base)+'.0x5000000').read_bytes())
    fields={name:struct.unpack_from('<I',ram,0x4f50+offset)[0] for name,offset in
            [('descriptor',0x850),('group',0x840),('phase',0x85c),('selector',0x854),('state',0x858),('table',0x84c)]}
    obj=None
    for index in range(128):
        a0,a1,a2=struct.unpack_from('<HHH',oam,index*8)
        x=a1&511;x=x-512 if x>=256 else x
        if a0&0x300 or a0>>14 or a1>>14!=3 or a2>>12!=1 or not 96<=x<256:continue
        obj=ppu.decode_object(vram,palette,io,oam,index)
        if obj is not None:break
    if obj is None:raise ValueError(frame)
    rgb=(obj['pixels'].astype(np.uint16)*255//31).astype(np.uint8)
    alpha=obj['visible']
    if a1&4096:rgb=rgb[:,::-1];alpha=alpha[:,::-1]
    if a1&8192:rgb=rgb[::-1];alpha=alpha[::-1]
    matches=[pointer for pointer,image in art.items() if np.array_equal(alpha,image[...,3]>0)
             and np.array_equal(rgb[alpha],image[alpha,:3])]
    records.append({'frame':frame,**fields,'matches':';'.join(hex(p) for p in matches),
                    'current_descriptor_exact':fields['descriptor'] in matches,
                    'previous_descriptor_exact':previous is not None and previous['descriptor'] in matches})
    previous=fields
with (out/'frames.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
summary={'frames':600,'current_descriptor_exact':sum(r['current_descriptor_exact'] for r in records),
         'previous_descriptor_exact':sum(r['previous_descriptor_exact'] for r in records)}
(out/'parameters.json').write_text(json.dumps({'experiment':'Native rival ROM resource audit','capture':str(CAPTURE),
    'resources':str(RESOURCES),'resource_root':resource['root'],'frames':600,'random_seed':None,
    'resource_atlas_sha256':hashlib.sha256(ATLAS.read_bytes()).hexdigest()},indent=2),encoding='utf-8')
(out/'results.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps({'output':str(out),**summary},indent=2))
