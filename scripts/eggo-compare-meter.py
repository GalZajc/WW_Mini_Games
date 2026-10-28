"""Compare the live Electron meter strip to independently decoded original OAM."""
from pathlib import Path
import json,struct,sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]);fixture=json.loads((ROOT/'tests/fixtures/eggo-meter-gba.json').read_text(encoding='utf-8'))
params={'frames':[1,3,30,40,60,80],'crop_y':146,'crop_height':14,'source':fixture['parameters']['source']}
actual=np.array(Image.open(out/'meter-trace.native.png'));expected=Image.new('RGBA',(672,28));results=[]
for column,frame in enumerate(params['frames']):
 source=ROOT/(params['source']+f'.frame{frame:05}')
 vram=Path(str(source)+'.memory3').read_bytes();oam=Path(str(source)+'.0x7000000').read_bytes();raw=np.frombuffer(Path(str(source)+'.0x5000000').read_bytes(),dtype='<u2')
 palette=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(512,255)),axis=1).astype('uint8')
 for side in range(2):
  image=Image.new('RGBA',(112,160))
  objects=[fixture['parameters']['pointer_objects'][side],*fixture['parameters']['bar_objects'][side]]
  for index in sorted(objects,reverse=True):
   a,b,d,_=struct.unpack_from('<4H',oam,index*8);width,height=(8,8) if index==objects[0] else (64,32)
   pixels=np.zeros((height,width,4),dtype='uint8')
   for ty in range(height//8):
    for tx in range(width//8):
     at=0x10000+((d&1023)+ty*(width//8)+tx)*32;data=np.frombuffer(vram[at:at+32],dtype='uint8');indices=np.stack((data&15,data>>4),axis=1).reshape(8,8).astype('int16')
     tile=palette[256+(d>>12)*16+indices].copy();tile[indices==0]=0;pixels[ty*8:(ty+1)*8,tx*8:(tx+1)*8]=tile
   sprite=Image.fromarray(pixels);image.paste(sprite,((b&511)-side*128,a&255),sprite)
  crop=image.crop((0,146,112,160));expected.paste(crop,(column*112,side*14))
  difference=np.any(actual[side*14:(side+1)*14,column*112:(column+1)*112]!=np.array(crop),axis=2)
  results.append({'frame':frame,'side':side,'different_pixels':int(difference.sum())})
expected.save(out/'meter-trace.original-objects.png')
(out/'meter-pixel-comparison.json').write_text(json.dumps({'parameters':params,'results':results},indent=2)+'\n',encoding='utf-8')
print(results)
assert all(r['different_pixels']==0 for r in results)
