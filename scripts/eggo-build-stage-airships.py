"""Recolor decoded native OBJ artwork using each arena's original OBJ palette."""
from pathlib import Path
from datetime import datetime
import json,hashlib,struct
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'renderer/games/eggo-mania/assets'
PARAMETERS={'sources':json.loads((ASSETS/'intro-environments.json').read_text())['parameters']['sources'],
 'bases':{'intro-balloon':'scripts/OUTPUT/eggo-reference_2026-10-03_11-09-58_790843/dragon-start.frame00120',
 'rescue-blimp':'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.frame00001'},
 'base_obj_source':'scripts/OUTPUT/eggo-reference_2026-10-19_19-08-03_088727/user-first600.frame00001',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'palette_slot':6,'random_seed':None}
output=ROOT/'scripts/OUTPUT'/('eggo-stage-airships_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
output.mkdir(parents=True);results={}
def palette(prefix):
 raw=(ROOT/(prefix+'.0x5000000')).read_bytes()
 p=np.frombuffer(raw,dtype='<u2')[352:368]
 return np.stack([(p>>s&31)*255//31 for s in (0,5,10)],axis=-1).astype('uint8')
prefix=ROOT/PARAMETERS['base_obj_source']
vram=Path(str(prefix)+'.memory3').read_bytes();oam=Path(str(prefix)+'.0x7000000').read_bytes()
base_colors=palette(PARAMETERS['base_obj_source'])
def decode(raw,width,height,colors):
 result=np.zeros((height,width,4),dtype='uint8')
 for y in range(height//8):
  for x in range(width//8):
   data=np.frombuffer(raw[(y*(width//8)+x)*32:(y*(width//8)+x+1)*32],dtype='uint8')
   idx=np.stack((data&15,data>>4),axis=1).reshape(8,8)
   result[y*8:y*8+8,x*8:x*8+8,:3]=colors[idx]
   result[y*8:y*8+8,x*8:x*8+8,3]=(idx!=0)*255
 return Image.fromarray(result)
parts=[]
for i in range(128):
 a,b,c=struct.unpack_from('<HHH',oam,i*8);x=b&511;y=a&255
 if a>>14 or b>>14!=3 or c>>12!=6 or 112<=x<448:continue
 parts.append((x-512 if x>=448 else x,y-256 if y>=192 else y,c&1023))
assert len(parts)==4
base_sprite=Image.new('RGBA',(128,128));left=min(x for x,y,t in parts);top=min(y for x,y,t in parts)
for x,y,tile in parts:base_sprite.alpha_composite(decode(vram[0x10000+tile*32:0x10000+tile*32+2048],64,64,base_colors),(x-left,y-top))
rom=Path(PARAMETERS['rom']).read_bytes()
for stage,prefix in PARAMETERS['sources'].items():
 target=palette(prefix+'.frame00120')
 for name,base in PARAMETERS['bases'].items():
  original=base_colors if name=='rescue-blimp' else palette(base)
  pixels=np.array(base_sprite if name=='rescue-blimp' else Image.open(ASSETS/(name+'.png')).convert('RGBA'));colors=pixels[...,:3].copy()
  for i in range(1,16):
   mask=np.all(colors==original[i],axis=-1)&(pixels[...,3]>0);pixels[mask,:3]=target[i]
  path=ASSETS/(name+'-'+stage+'.png');Image.fromarray(pixels).save(path)
  results[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
 flame=Image.new('RGBA',(32,8))
 for index,offset in enumerate([0x21f1dc,0x21f19c]):flame.paste(decode(rom[offset:offset+64],16,8,target),(index*16,0))
 path=ASSETS/('airship-flame-'+stage+'.png');flame.save(path);results[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
(output/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
(output/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(output)
