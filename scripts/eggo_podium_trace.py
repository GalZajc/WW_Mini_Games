"""Capture native podium OBJ artwork and poses without altering emulated memory."""
import ctypes as C
import struct,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
PARAMETERS={'actor_object':2,'actor_palette':0,'actor_size':64,'counter':0x14,'mode':0x20,'menu':0x2c,
 'palette_source':'scripts/OUTPUT/eggo-reference_2026-10-04_21-46-00_586686/survival-loss-result.frame00300.0x5000000'}
class PodiumRecorder:
 def __init__(self,output,maps,ram,palette_file=None):
  self.output=Path(output)/'podium';self.output.mkdir(exist_ok=True)
  self.pointers={start:ptr+offset for start,ptr,offset,length in maps if ptr};self.ram=ram
  self.images={};self.records=[]
  self.palette_file=palette_file
  self.palette_bytes=Path(palette_file).read_bytes() if palette_file else None
 def sample(self,frame):
  oam=C.string_at(self.pointers[0x07000000],1024)
  a,b,c=struct.unpack_from('<3H',oam,PARAMETERS['actor_object']*8)
  if a&0x300==0x200 or a>>14!=0 or b>>14!=3 or c>>12!=PARAMETERS['actor_palette']:return
  io=C.string_at(self.pointers[0x04000000],2);stride=8 if struct.unpack('<H',io)[0]&64 else 32
  vram=C.string_at(self.pointers[0x06000000],98304);first=c&1023
  palette=self.palette_bytes or (Path(__file__).resolve().parents[1]/PARAMETERS['palette_source']).read_bytes()[512:544]
  raw=np.frombuffer(palette,dtype='<u2')
  colors=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
  image=np.zeros((64,64,4),dtype='uint8')
  for ty in range(8):
   for tx in range(8):
    at=0x10000+(first+ty*stride+tx)*32
    data=np.frombuffer(vram[at:at+32],dtype='uint8');indices=np.stack((data&15,data>>4),axis=1).reshape(8,8)
    pixels=colors[indices].copy();pixels[indices==0]=0;image[ty*8:ty*8+8,tx*8:tx*8+8]=pixels
  digest=hashlib.sha256(image.tobytes()).hexdigest()
  if digest not in self.images:
   self.images[digest]=len(self.images);Image.fromarray(image).save(self.output/(digest+'.png'))
  matrix=None
  if a&256:
   index=(b>>9)&31;matrix=[struct.unpack_from('<h',oam,index*32+k)[0] for k in [6,14,22,30]]
  self.records.append({'frame':frame,'picture':self.images[digest],'x':b&511,'y':a&255,
    'flip_x':bool(not a&256 and b&4096),'flip_y':bool(not a&256 and b&8192),
    'double_size':bool(a&256 and a&512),'matrix':matrix,
    'counter':C.c_int32.from_address(self.ram+PARAMETERS['counter']).value,
    'mode':C.c_int32.from_address(self.ram+PARAMETERS['mode']).value,
    'menu':C.c_int32.from_address(self.ram+PARAMETERS['menu']).value})
 def save(self):
  # Some runs (for example a quick loss before the podium transition) never
  # expose this OBJ. Pillow cannot encode a zero-width PNG, so keep an empty
  # transparent tile as a valid, explicit "no captured actor" atlas.
  atlas=Image.new('RGBA',(max(1,len(self.images))*64,64))
  for digest,index in self.images.items():atlas.paste(Image.open(self.output/(digest+'.png')),(index*64,0))
  atlas.save(self.output/'actor-atlas.png')
  parameters={**PARAMETERS,'palette_override':str(self.palette_file) if self.palette_file else None,
   'palette_override_sha256':hashlib.sha256(self.palette_bytes).hexdigest() if self.palette_bytes else None}
  data={'parameters':parameters,'images':self.images,'records':self.records}
  (self.output/'poses.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
  return parameters
