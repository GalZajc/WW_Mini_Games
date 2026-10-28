"""Extract original Yolko poses from input-only frame captures, with provenance."""
from pathlib import Path
from datetime import datetime
import hashlib, json, struct
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
    'motion':'scripts/OUTPUT/eggo-reference_2026-10-03_01-58-27_058310/actor-motion',
    'throw':'scripts/OUTPUT/eggo-reference_2026-10-03_01-40-12_808881/camera-throw',
    'free':'scripts/OUTPUT/eggo-reference_2026-10-03_02-02-34_170672/actor-free',
    'hop':'scripts/OUTPUT/eggo-reference_2026-10-03_02-03-32_040620/actor-hop',
    'anchor':[32,56], 'size':64,
    'states':{
        'idle':[['motion',n] for n in [2,8]],
        'walk':[['motion',n] for n in [20,24,28,32]],
        'rise':[['motion',n] for n in [52,56,60,64]],
        'float':[['motion',n] for n in [72,76,80,84]],
        'fall':[['motion',n] for n in [100,104,108,112]],
        'throw':[['throw',n] for n in [4,8,12,16,20,24,28]],
        'idle-free':[['free',n] for n in [8,12]],
        'walk-free':[['free',n] for n in [20,24]],
        'rise-free':[['throw',n] for n in [32,36]],
        'float-free':[['hop',n] for n in [4,8]],
        'fall-free':[['hop',n] for n in [20,24]],
    },
}
OUT=ROOT/'scripts/OUTPUT'/('eggo-actor-atlas_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
assets=ROOT/'renderer/games/eggo-mania/assets'
def pose(base):
    oam=Path(str(base)+'.0x7000000').read_bytes()
    vram=Path(str(base)+'.memory3').read_bytes()
    palraw=Path(str(base)+'.0x5000000').read_bytes()
    io=Path(str(base)+'.0x4000000').read_bytes()
    objects=[]
    for i in range(128):
        a0,a1,a2=struct.unpack_from('<HHH',oam,i*8)
        if a0&0x300!=0x200 and a0>>14==0 and a1>>14==3 and a2>>12==0:
            objects.append((i,a0,a1,a2))
    assert len(objects)==1,(base,objects)
    i,a0,a1,a2=objects[0]
    assert not a0&256,'Affine pose needs the affine decoder'
    raw=np.frombuffer(palraw,dtype='<u2')[256:272]
    pal=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,
        ((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
    out=np.zeros((64,64,4),dtype='uint8')
    stride=8 if struct.unpack_from('<H',io)[0]&64 else 32
    for y in range(8):
        for x in range(8):
            number=(a2&1023)+y*stride+x
            data=np.frombuffer(vram[0x10000+number*32:0x10000+(number+1)*32],dtype='uint8')
            indices=np.stack((data&15,data>>4),axis=1).reshape(8,8)
            tile=pal[indices].copy();tile[indices==0]=0
            out[y*8:y*8+8,x*8:x*8+8]=tile
    # Normalize facing; the renderer applies a horizontal flip about the anchor.
    # Captured movement to the left sets HFLIP on this object.
    return Image.fromarray(out),{'object':i,'screen_x':a1&511,'screen_y':a0&255,
        'captured_flip_x':bool(a1&4096),'tile':a2&1023,
        'graphics_sha256':hashlib.sha256(vram+palraw+oam+io).hexdigest()}

atlas=Image.new('RGBA',(64*7,64*len(PARAMETERS['states'])))
contact=Image.new('RGB',(64*8,80*len(PARAMETERS['states'])),'#173b52')
draw=ImageDraw.Draw(contact);records={}
for row,(state,sources) in enumerate(PARAMETERS['states'].items()):
    records[state]=[]
    draw.text((2,row*80+2),state,fill='white')
    for col,(profile,frame) in enumerate(sources):
        base=ROOT/(PARAMETERS[profile]+f'.frame{frame:05d}')
        metadata=json.loads((ROOT/PARAMETERS[profile]).with_suffix('.json').read_text(encoding='utf-8'))
        assert metadata['writes']==[]
        image,record=pose(base)
        record.update(source=str(base.relative_to(ROOT)),frame=frame,
            initial_state_sha256=metadata['initial_state_sha256'],x=col*64,y=row*64)
        records[state].append(record)
        atlas.paste(image,(col*64,row*64))
        contact.paste(image,(col*64+64,row*80+16),image)
atlas.save(assets/'yolko-poses.png');contact.save(OUT/'poses.png')
manifest={'parameters':PARAMETERS,'states':records}
(assets/'yolko-poses.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(OUT)
