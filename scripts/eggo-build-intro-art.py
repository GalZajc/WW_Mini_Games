"""Extract native countdown and intro balloon pictures with source provenance."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_11-09-58_790843/dragon-start',
            'countdown_frames':[90,120,180,240],'countdown_object':2,'countdown_palette_frame':120,
            'balloon_frame':120,'balloon_palette':6,'balloon_origin':[-3,-4],
            'balloon_size':128,'countdown_size':64}
OUT=ROOT/'scripts/OUTPUT'/('eggo-intro-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
base=ROOT/PARAMETERS['source'];source=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
assert source['writes']==[]
SIZES=[[(8,8),(16,16),(32,32),(64,64)],[(16,8),(32,8),(32,16),(64,32)],[(8,16),(8,32),(16,32),(32,64)]]
def sprites(frame,palette_frame=None):
    prefix=Path(str(base)+f'.frame{frame:05d}')
    oam=Path(str(prefix)+'.0x7000000').read_bytes();vram=Path(str(prefix)+'.memory3').read_bytes()
    palette_prefix=Path(str(base)+f'.frame{palette_frame:05d}') if palette_frame is not None else prefix
    pal=Path(str(palette_prefix)+'.0x5000000').read_bytes();io=Path(str(prefix)+'.0x4000000').read_bytes()
    raw=np.frombuffer(pal,dtype='<u2')[256:]
    colors=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(len(raw),255)),axis=-1).astype('uint8')
    result=[]
    for i in range(128):
        a0,a1,a2=struct.unpack_from('<HHH',oam,i*8)
        if a0&0x300==0x200 or a0>>14==3:continue
        w,h=SIZES[a0>>14][a1>>14];picture=np.zeros((h,w,4),dtype='uint8')
        assert not a0&8192,'This extractor expects 4bpp native object pictures'
        stride=w//8 if struct.unpack_from('<H',io)[0]&64 else 32
        for y in range(h//8):
            for x in range(w//8):
                tile=(a2&1023)+y*stride+x
                data=np.frombuffer(vram[0x10000+tile*32:0x10000+(tile+1)*32],dtype='uint8')
                indices=np.stack((data&15,data>>4),axis=1).reshape(8,8)
                decoded=colors[(a2>>12)*16+indices].copy();decoded[indices==0]=0
                picture[y*8:y*8+8,x*8:x*8+8]=decoded
        if not a0&256:
            if a1&4096:picture=picture[:,::-1]
            if a1&8192:picture=picture[::-1]
        sx=a1&511;sy=a0&255
        result.append({'id':i,'image':Image.fromarray(picture),'x':sx-512 if sx>=448 else sx,
                       'y':sy-256 if sy>=192 else sy,'palette':a2>>12,'affine':bool(a0&256)})
    return result,{'source':str(prefix.relative_to(ROOT)),
                   'graphics_sha256':hashlib.sha256(oam+vram+pal+io).hexdigest()}

countdown=Image.new('RGBA',(PARAMETERS['countdown_size']*4,PARAMETERS['countdown_size']))
records=[]
for index,(frame,label) in enumerate(zip(PARAMETERS['countdown_frames'],['3','2','1','GO'])):
    # The source's first digit is still palette-faded at frame 90. Decode all
    # four raw pictures with the full palette; apply the live fade at runtime.
    objects,record=sprites(frame,PARAMETERS['countdown_palette_frame']);obj=next(o for o in objects if o['id']==PARAMETERS['countdown_object'])
    assert obj['image'].size==(64,64) and obj['affine']
    countdown.paste(obj['image'],(index*64,0))
    records.append({**record,'label':label,'frame':frame,'object':obj['id'],
                    'image_sha256':hashlib.sha256(obj['image'].tobytes()).hexdigest(),
                    'note':'Raw picture: native affine scale/rotation are not baked in.'})
objects,balloon_record=sprites(PARAMETERS['balloon_frame'])
balloon=Image.new('RGBA',(PARAMETERS['balloon_size'],PARAMETERS['balloon_size']))
parts=[o for o in objects if o['palette']==PARAMETERS['balloon_palette'] and o['x']<112]
for obj in reversed(parts):
    assert not obj['affine']
    balloon.alpha_composite(obj['image'],(obj['x']-PARAMETERS['balloon_origin'][0],obj['y']-PARAMETERS['balloon_origin'][1]))
manifest={'parameters':PARAMETERS,'initial_state_sha256':source['initial_state_sha256'],
          'rom_sha256':source['rom_sha256'],'core_sha256':source['core_sha256'],
          'countdown':records,'balloon':{**balloon_record,'objects':[o['id'] for o in parts]}}
assets=ROOT/'renderer/games/eggo-mania/assets'
countdown.save(assets/'countdown.png');balloon.save(assets/'intro-balloon.png')
countdown.save(OUT/'countdown.png');balloon.save(OUT/'intro-balloon.png')
(assets/'intro-art.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
contact=Image.new('RGBA',(384,128),'#173b52');contact.alpha_composite(countdown,(0,32));contact.alpha_composite(balloon,(256,0))
contact.save(OUT/'intro-art.png')
print(OUT)
