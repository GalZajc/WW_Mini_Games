"""Decode each arena's BG0 foundation tiles with its own palette, not a screenshot."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'renderer/games/eggo-mania/assets'
PARAMETERS={'sources':json.loads((ASSETS/'placed-pieces.json').read_text(encoding='utf-8'))['parameters']['sources'],
            'first_tile':608,'width':112,'height':48,'random_seed':None}
out=ROOT/'scripts/OUTPUT'/('eggo-stage-platforms_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True)
records={}
for stage,relative in PARAMETERS['sources'].items():
    prefix=ROOT/relative
    vram=Path(str(prefix)+'.memory3').read_bytes()
    palette=Path(str(prefix)+'.0x5000000').read_bytes()
    io=Path(str(prefix)+'.0x4000000').read_bytes()
    control=struct.unpack_from('<H',io,8)[0]
    charbase=(control>>2&3)*16384;screenbase=(control>>8&31)*2048
    descriptors=np.frombuffer(vram[screenbase:screenbase+2048],dtype='<u2').reshape(32,32)
    candidates=np.flatnonzero((descriptors[:,0]&1023)==PARAMETERS['first_tile'])
    if len(candidates)!=1:raise ValueError((stage,candidates.tolist()))
    start=int(candidates[0]);words=np.frombuffer(palette,dtype='<u2')
    colors=np.stack([(words>>shift&31)*255//31 for shift in [0,5,10]]+[np.full(512,255)],axis=-1).astype(np.uint8)
    image=np.zeros((PARAMETERS['height'],PARAMETERS['width'],4),dtype=np.uint8)
    used=[]
    for y in range(PARAMETERS['height']//8):
        row=[]
        for x in range(PARAMETERS['width']//8):
            d=int(descriptors[(start+y)%32,x]);row.append(d)
            at=charbase+(d&1023)*32
            raw=np.frombuffer(vram[at:at+32],dtype=np.uint8)
            indices=np.stack((raw&15,raw>>4),axis=1).reshape(8,8).astype(np.int32)
            tile=colors[(d>>12)*16+indices].copy();tile[indices==0]=0
            if d&1024:tile=tile[:,::-1]
            if d&2048:tile=tile[::-1]
            image[y*8:y*8+8,x*8:x*8+8]=tile
        used.append(row)
    path=ASSETS/f'platform-{stage}.png';Image.fromarray(image).save(path)
    Image.fromarray(image).save(out/path.name)
    records[stage]={'source':relative,'map_row':start,'descriptors':used,
        'source_sha256':hashlib.sha256(vram+palette+io).hexdigest(),'asset_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
(out/'results.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print(out)
