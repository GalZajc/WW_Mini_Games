"""Decode the supplied ROM's live GBA tile layers for local visual comparison.
No ROM bytes are copied into the app; outputs retain their original art provenance.
"""
from pathlib import Path
import struct, argparse
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('name');a=p.parse_args()
root=Path(__file__).resolve().parents[1];source=Path(a.name)
folder=source.parent if source.parent!=Path('.') else root/'tests/artifacts/eggo-reference'
a.name=source.stem if source.suffix in ('.png','.state') else source.name
base=folder/a.name
vram=(folder/(a.name+'.memory3')).read_bytes();palraw=(folder/(a.name+'.0x5000000')).read_bytes();io=(folder/(a.name+'.0x4000000')).read_bytes()
raw=np.frombuffer(palraw,dtype='<u2');pal=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(raw.shape,255)),axis=-1).astype('uint8')
def tile(number,bank=0,charbase=0,bpp=4,obj=False):
 size=64 if bpp==8 else 32;start=charbase+number*size
 data=np.frombuffer(vram[start:start+size],dtype='uint8')
 if len(data)<size:return np.zeros((8,8,4),dtype='uint8')
 indices=data.reshape(8,8) if bpp==8 else np.stack((data&15,data>>4),axis=1).reshape(8,8)
 image=pal[indices.astype(int)+(0 if bpp==8 else bank*16)+(256 if obj else 0)].copy();image[indices==0,3]=0
 return image
for layer in range(4):
 cnt=struct.unpack_from('<H',io,8+2*layer)[0];cb=((cnt>>2)&3)*0x4000;sb=((cnt>>8)&31)*0x800;bpp=8 if cnt&128 else 4;size=cnt>>14;w=512 if size&1 else 256;h=512 if size&2 else 256
 out=np.zeros((h,w,4),dtype='uint8')
 for y in range(h//8):
  for x in range(w//8):
   block=(y//32)*(w//256)+(x//32);index=block*1024+(y%32)*32+(x%32)
   desc=struct.unpack_from('<H',vram,sb+index*2)[0];pix=tile(desc&1023,desc>>12,cb,bpp)
   if desc&1024:pix=pix[:,::-1]
   if desc&2048:pix=pix[::-1,:]
   out[y*8:y*8+8,x*8:x*8+8]=pix
 Image.fromarray(out).save(folder/(a.name+f'.bg{layer}.png'))
# Decode active OAM sprites, preserving each object's palette and tile layout.
oam=(folder/(a.name+'.0x7000000')).read_bytes();objects=[]
sizes=[[(8,8),(16,16),(32,32),(64,64)],[(16,8),(32,8),(32,16),(64,32)],[(8,16),(8,32),(16,32),(32,64)]]
objfolder=folder/(a.name+'.sprites');objfolder.mkdir(exist_ok=True)
for i in range(128):
 a0,a1,a2=struct.unpack_from('<HHH',oam,i*8)
 if a0&0x300==0x200 or a0>>14==3:continue
 w,h=sizes[a0>>14][a1>>14];bpp=8 if a0&8192 else 4;first=a2&1023;out=np.zeros((h,w,4),dtype='uint8')
 for ty in range(h//8):
  for tx in range(w//8):
   number=first+ty*(w//8 if struct.unpack_from('<H',io)[0]&64 else 32)+tx
   out[ty*8:ty*8+8,tx*8:tx*8+8]=tile(number,a2>>12,0x10000,bpp,True)
 if not a0&256:
  if a1&4096:out=out[:,::-1]
  if a1&8192:out=out[::-1,:]
 Image.fromarray(out).save(objfolder/f'{i:03d}.png');objects.append({'id':i,'x':a1&511,'y':a0&255,'w':w,'h':h,'tile':first,'palette':a2>>12})
import json
(objfolder/'objects.json').write_text(json.dumps(objects,indent=2),encoding='utf-8')
print('Decoded layers and',len(objects),'objects')
