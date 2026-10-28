"""Read native meter motion/OAM and decode both original bar textures."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_17-18-51_654025/floor-wave-animation',
 'position':0x31418,'velocity':0x31410,'actor_roots':[0x3bd4,0x4f50],'count_offset':0x82c,
 'frame_address':0x11a9c,'samples':80,'pointer_objects':[4,7],'bar_objects':[[5,6],[8,9]],
 'bar_rom_offsets':[0xdb058,0xdb458,0xda858,0xdac58],'bar_width':64,'bar_height':32,
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'random_seed':'encoded in the original initial state'}
prefix=ROOT/PARAMETERS['source'];meta=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
PARAMETERS['original_run']=meta
initial=Path(meta['load']).with_suffix('.ram').read_bytes()
PARAMETERS['initial_ram_sha256']=hashlib.sha256(initial).hexdigest()
def meters(ram):
 return [{'position':struct.unpack_from('<i',ram,PARAMETERS['position']+side*4)[0],
  'velocity':struct.unpack_from('<i',ram,PARAMETERS['velocity']+side*4)[0],
  'count':struct.unpack_from('<i',ram,root+PARAMETERS['count_offset'])[0]} for side,root in enumerate(PARAMETERS['actor_roots'])]
initial_state={'frame':struct.unpack_from('<I',initial,PARAMETERS['frame_address'])[0],'meters':meters(initial)}
samples=[];rom=Path(PARAMETERS['rom']).read_bytes();PARAMETERS['rom_sha256']=hashlib.sha256(rom).hexdigest()
for frame in range(1,PARAMETERS['samples']+1):
 sample=Path(str(prefix)+f'.frame{frame:05}')
 ram=Path(str(sample)+'.ram').read_bytes();oam=Path(str(sample)+'.0x7000000').read_bytes();vram=Path(str(sample)+'.memory3').read_bytes()
 native_frame=struct.unpack_from('<I',ram,PARAMETERS['frame_address'])[0];values=meters(ram)
 for side,value in enumerate(values):
  a,b,d,_=struct.unpack_from('<4H',oam,PARAMETERS['pointer_objects'][side]*8)
  assert not a&0x300 and a>>14==0 and b>>14==0 and d>>12==2
  value['pointer']={'x':(b&511)-side*128,'y':a&255}
  pictures=[]
  for index in PARAMETERS['bar_objects'][side]:
   a,b,d,_=struct.unpack_from('<4H',oam,index*8);at=0x10000+(d&1023)*32
   texture=vram[at:at+1024]
   match=[i for i,offset in enumerate(PARAMETERS['bar_rom_offsets']) if texture==rom[offset:offset+1024]]
   assert len(match)==1
   pictures.append(match[0]);value['bar_y']=a&255
  assert pictures in [[0,1],[2,3]]
  value['flashing']=pictures==[2,3]
 samples.append({'frame':frame,'native_frame':native_frame,'meters':values,
  'ram_sha256':hashlib.sha256(ram).hexdigest(),'oam_sha256':hashlib.sha256(oam).hexdigest()})
palette_source=Path(str(prefix)+'.frame00001.0x5000000');palette_bytes=palette_source.read_bytes();PARAMETERS['palette_sha256']=hashlib.sha256(palette_bytes).hexdigest()
raw=np.frombuffer(palette_bytes,dtype='<u2');palette=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(512,255)),axis=1).astype('uint8')
atlas=Image.new('RGBA',(256,32));pictures=[]
for picture,offset in enumerate(PARAMETERS['bar_rom_offsets']):
 pixels=np.zeros((32,64,4),dtype='uint8')
 for ty in range(4):
  for tx in range(8):
   at=offset+(ty*8+tx)*32;data=np.frombuffer(rom[at:at+32],dtype='uint8');indices=np.stack((data&15,data>>4),axis=1).reshape(8,8).astype('int16')
   tile=palette[288+indices].copy();tile[indices==0]=0;pixels[ty*8:(ty+1)*8,tx*8:(tx+1)*8]=tile
 atlas.paste(Image.fromarray(pixels),(picture*64,0));pictures.append({'picture':picture,'rom_offset':offset,'pixel_sha256':hashlib.sha256(pixels.tobytes()).hexdigest()})
out=ROOT/'scripts/OUTPUT'/('eggo-meter_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
data={'parameters':PARAMETERS,'initial':initial_state,'samples':samples,'pictures':pictures}
for target,value in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',data),(ROOT/'tests/fixtures/eggo-meter-gba.json',data),(ROOT/'renderer/games/eggo-mania/assets/meter-bars.json',data)]:
 target.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
atlas.save(out/'meter-bars.png');atlas.save(ROOT/'renderer/games/eggo-mania/assets/meter-bars.png')
with (out/'meter.csv').open('w',encoding='utf-8',newline='') as stream:
 writer=csv.writer(stream);writer.writerow(['frame','native_frame','side','count','position','velocity','pointer_x','pointer_y','bar_y','flashing'])
 for sample in samples:
  for side,value in enumerate(sample['meters']):writer.writerow([sample['frame'],sample['native_frame'],side,value['count'],value['position'],value['velocity'],value['pointer']['x'],value['pointer']['y'],value['bar_y'],value['flashing']])
print(out)
