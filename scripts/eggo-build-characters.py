"""Decode character animation resources using the original ARM sprite decoder."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,sys
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_PC
PARAMETERS={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'iwram':'scripts/OUTPUT/eggo-reference_2026-10-04_22-26-53_045214/funky-hard-entry.frame00714.0x3000000',
 'decoder':0x03001638,'return':0x08000000,'destination':0x02020000,'instruction_limit':100000,
 'size':64,'groups':21,'seed':'encoded in the input-only IWRAM source state',
 'characters':[['astro',0,0x3ef7b0],['yolko',1,0x3f23ec],['funky',2,0x3f2a38],
 ['robo',3,0x3f2100],['bebub',4,0x3f30a8],['coolio',5,0x3f3368],
 ['eggo',6,0x3f2d6c],['spike',7,0x3f270c]]}
rom=Path(PARAMETERS['rom']).read_bytes();iwram=(ROOT/PARAMETERS['iwram']).read_bytes()
PARAMETERS.update(rom_sha256=hashlib.sha256(rom).hexdigest(),iwram_sha256=hashlib.sha256(iwram).hexdigest())
out=ROOT/'scripts/OUTPUT'/('eggo-characters_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
assets=ROOT/'renderer/games/eggo-mania/assets'
uc=Uc(UC_ARCH_ARM,UC_MODE_ARM)
for base,size,data in [(0x08000000,0x400000,rom),(0x03000000,0x8000,iwram),(0x02000000,0x40000,b'')]:
 uc.mem_map(base,size)
 if data:uc.mem_write(base,data)
def words(at,count):return struct.unpack_from('<%dI'%count,rom,at-0x08000000)
def decode(at,length):
 uc.mem_write(PARAMETERS['destination'],bytes(length+32))
 for register,value in [(UC_ARM_REG_R0,at),(UC_ARM_REG_R1,PARAMETERS['destination']),
                        (UC_ARM_REG_SP,0x03007000),(UC_ARM_REG_LR,PARAMETERS['return'])]:uc.reg_write(register,value)
 uc.emu_start(PARAMETERS['decoder'],PARAMETERS['return'],count=PARAMETERS['instruction_limit'])
 assert uc.reg_read(UC_ARM_REG_PC)==PARAMETERS['return'],'Decoder did not finish'
 return bytes(uc.mem_read(PARAMETERS['destination'],length))
def picture(data,palette):
 pixels=np.zeros((64,64,4),dtype='uint8')
 for y in range(8):
  for x in range(8):
   raw=np.frombuffer(data[(y*8+x)*32:(y*8+x+1)*32],dtype='uint8')
   indices=np.stack((raw&15,raw>>4),axis=1).reshape(8,8)
   tile=palette[indices].copy();tile[indices==0]=0;pixels[y*8:y*8+8,x*8:x*8+8]=tile
 return Image.fromarray(pixels)
manifest={'parameters':PARAMETERS,'characters':{}}
for name,native_id,offset in PARAMETERS['characters']:
 root=offset+0x08000000;palette_at=words(root+0x114,1)[0]
 raw=np.frombuffer(rom[palette_at-0x08000000:palette_at-0x08000000+32],dtype='<u2')
 (out/(name+'-palette.bin')).write_bytes(raw.tobytes())
 palette=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
 groups={};records={};raw_frames=[]
 for group in range(1,PARAMETERS['groups']+1):
  header=words(root+group*4,1)[0];count,list_at=words(header,2)
  assert 0<count<=32
  images=[];entries=[]
  for descriptor in words(list_at,count):
   source,length,anchor,shape=words(descriptor,4)
   assert length==2048 and shape==0xc0002000,(name,group,hex(shape),length)
   data=decode(source,length);raw_offset=len(raw_frames)*2048;raw_frames.append(data)
   image=picture(data,palette);images.append(image)
   entries.append({'descriptor':descriptor,'source':source,'anchor':anchor,'shape':shape,
                   'raw_offset':raw_offset,'raw_bytes':len(data),
                   'pixels_sha256':hashlib.sha256(image.tobytes()).hexdigest()})
  groups[group]=images;records[group]=entries
 width=max(map(len,groups.values()))*64
 atlas=Image.new('RGBA',(width,21*64));contact=Image.new('RGB',(width+40,21*64),'#173b52');draw=ImageDraw.Draw(contact)
 for group,images in groups.items():
  draw.text((2,(group-1)*64+20),str(group),fill='white')
  for frame,image in enumerate(images):atlas.paste(image,(frame*64,(group-1)*64));contact.paste(image,(40+frame*64,(group-1)*64),image)
 atlas.save(out/(name+'.png'));contact.save(out/(name+'-contact.png'))
 (out/(name+'-frame-data.4bpp')).write_bytes(b''.join(raw_frames))
 manifest['characters'][name]={'id':native_id,'root':root,'palette':palette_at,
  'frame_data':name+'-frame-data.4bpp','frame_encoding':'native 4bpp 64x64 OBJ tiles, 2048 bytes per frame',
  'groups':records}
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
(out/'measurement.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(out)
