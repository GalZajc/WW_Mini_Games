"""Reconstruct native bomb particles from a documented zero-fuse trigger."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_13-22-05_526756',
            'name':'bomb-explosion-art','frames':40,'size':128,'origin':[64,96],
            'object_palette':2,'minimum_object':21,'maximum_opaque_pixels':180,
            'note':'Inventory ID set to bomb with zero fuse. Visual extraction only; no fuse or blast calibration.'}
folder=ROOT/PARAMETERS['source'];assets=ROOT/'renderer/games/eggo-mania/assets'
params=json.loads((folder/(PARAMETERS['name']+'.json')).read_text(encoding='utf-8'))
assert params['writes']==[[0x4438,8]]
atlas=Image.new('RGBA',(PARAMETERS['size']*PARAMETERS['frames'],PARAMETERS['size']))
records=[]
for frame in range(1,PARAMETERS['frames']+1):
    base=folder/(PARAMETERS['name']+f'.frame{frame:05d}')
    oam=Path(str(base)+'.0x7000000').read_bytes();vram=Path(str(base)+'.memory3').read_bytes()
    palraw=Path(str(base)+'.0x5000000').read_bytes();io=Path(str(base)+'.0x4000000').read_bytes()
    raw=np.frombuffer(palraw,dtype='<u2')[256+32:256+48].astype('uint32')
    colors=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
    stride=2 if struct.unpack_from('<H',io)[0]&64 else 32
    image=Image.new('RGBA',(PARAMETERS['size'],PARAMETERS['size']));objects=[]
    for index in range(127,PARAMETERS['minimum_object']-1,-1):
        a0,a1,a2=struct.unpack_from('<HHH',oam,index*8)
        if a0&0x300==0x200 or a0>>14 or a1>>14!=1 or a2>>12!=PARAMETERS['object_palette']:continue
        x,y=a1&511,a0&255
        if x>=448:x-=512
        if y>=192:y-=256
        center=16 if a0&0x300==0x300 else 8
        if x+center<0 or x+center>112 or abs(y+center-PARAMETERS['origin'][1])>64:continue
        pixels=np.zeros((16,16,4),dtype='uint8')
        for ty in range(2):
            for tx in range(2):
                tile=(a2&1023)+ty*stride+tx
                raw_tile=np.frombuffer(vram[0x10000+tile*32:0x10000+(tile+1)*32],dtype='uint8')
                indices=np.stack((raw_tile&15,raw_tile>>4),axis=1).reshape(8,8)
                colored=colors[indices].copy();colored[indices==0]=0
                pixels[ty*8:ty*8+8,tx*8:tx*8+8]=colored
        opaque=int(np.count_nonzero(pixels[:,:,3]))
        if opaque>PARAMETERS['maximum_opaque_pixels']:continue
        sprite=Image.fromarray(pixels);matrix=None
        if a0&256:
            mi=(a1>>9)&31
            pa,pb,pc,pd=[struct.unpack_from('<h',oam,mi*32+k)[0]/256 for k in [6,14,22,30]]
            width=32 if center==16 else 16;half=width/2
            sprite=sprite.transform((width,width),Image.Transform.AFFINE,
                (pa,pb,8-pa*half-pb*half,pc,pd,8-pc*half-pd*half),resample=Image.Resampling.NEAREST)
            matrix=[pa,pb,pc,pd]
        else:
            if a1&4096:sprite=sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            if a1&8192:sprite=sprite.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        image.alpha_composite(sprite,(x-PARAMETERS['origin'][0]+PARAMETERS['size']//2,
                                      y-PARAMETERS['origin'][1]+PARAMETERS['size']//2))
        objects.append({'object':index,'attributes':[a0,a1,a2],'opaque':opaque,'matrix':matrix})
    atlas.alpha_composite(image,((frame-1)*PARAMETERS['size'],0))
    records.append({'frame':frame,'objects':objects,'graphics_sha256':hashlib.sha256(vram+palraw+oam+io).hexdigest()})
assert len(records[9]['objects'])==8, 'Frame 10 must contain the eight visually verified burst sprites'
manifest={'parameters':PARAMETERS,'source_parameters':params,'frames':records}
out=ROOT/'scripts/OUTPUT'/('eggo-explosion_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True,exist_ok=True)
for dest in [out,assets]:
    atlas.save(dest/'bomb-explosion.png');(dest/'bomb-explosion.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
contact=Image.new('RGBA',(4*128,3*144),'#173b52');draw=ImageDraw.Draw(contact)
for i,frame in enumerate([1,2,5,10,15,20,25,30,32,34,36,40]):
    contact.alpha_composite(atlas.crop(((frame-1)*128,0,frame*128,128)),(i%4*128,i//4*144))
    draw.text((i%4*128,i//4*144+128),str(frame),fill='white')
contact.save(out/'contact.png');print(json.dumps({'output':str(out),'counts':[len(r['objects']) for r in records]}))
