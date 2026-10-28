"""Decode all rescue-creature frames with the original ARM tile decoder."""
from pathlib import Path
from datetime import datetime
import hashlib, json, struct, sys
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'iwram':'scripts/OUTPUT/eggo-reference_2026-10-04_22-26-53_045214/funky-hard-entry.frame00714.0x3000000',
 'palette_capture':'scripts/OUTPUT/eggo-reference_2026-10-17_18-39-35_419191/solid-8.frame00110.0x5000000',
 'decoder':0x03001638,'destination':0x02020000,'return':0x08000000,
 'stack':0x03007000,'instruction_limit':100000,'size':64,'palette_bank':2,
 'rise_literal_offsets':list(range(0x13e58,0x13e89,8))+[0x13ec0],
 'release_literal_offsets':list(range(0x13dac,0x13de5,8)),
 'random_seed':None,'routine':'0x08013a7c',
}
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_PC
rom=Path(PARAMETERS['rom']).read_bytes();iwram=(ROOT/PARAMETERS['iwram']).read_bytes()
raw_palette=(ROOT/PARAMETERS['palette_capture']).read_bytes()
PARAMETERS.update(rom_sha256=hashlib.sha256(rom).hexdigest(),
 iwram_sha256=hashlib.sha256(iwram).hexdigest(),palette_sha256=hashlib.sha256(raw_palette).hexdigest())
uc=Uc(UC_ARCH_ARM,UC_MODE_ARM)
for base,size,data in [(0x08000000,0x400000,rom),(0x03000000,0x8000,iwram),(0x02000000,0x40000,b'')]:
 uc.mem_map(base,size)
 if data:uc.mem_write(base,data)
palette=np.frombuffer(raw_palette,dtype='<u2')[256+16*PARAMETERS['palette_bank']:272+16*PARAMETERS['palette_bank']]
palette=np.stack([*((palette>>s&31)*255//31 for s in (0,5,10)),np.full(16,255)],axis=-1).astype('uint8')
palette[0]=0
atlas=Image.new('RGBA',(PARAMETERS['size']*16,PARAMETERS['size']));frames=[];raw_frames=[]
offsets=PARAMETERS['rise_literal_offsets']+PARAMETERS['release_literal_offsets']
for frame,offset in enumerate(offsets):
 source=struct.unpack_from('<I',rom,offset)[0]
 uc.mem_write(PARAMETERS['destination'],bytes(2080))
 for register,value in [(UC_ARM_REG_R0,source),(UC_ARM_REG_R1,PARAMETERS['destination']),
  (UC_ARM_REG_SP,PARAMETERS['stack']),(UC_ARM_REG_LR,PARAMETERS['return'])]:uc.reg_write(register,value)
 uc.emu_start(PARAMETERS['decoder'],PARAMETERS['return'],count=PARAMETERS['instruction_limit'])
 assert uc.reg_read(UC_ARM_REG_PC)==PARAMETERS['return']
 data=bytes(uc.mem_read(PARAMETERS['destination'],2048));raw_frames.append(data)
 image=np.zeros((64,64,4),dtype='uint8')
 for y in range(8):
  for x in range(8):
   tile=np.frombuffer(data[(y*8+x)*32:(y*8+x+1)*32],dtype='uint8')
   indices=np.stack((tile&15,tile>>4),axis=1).reshape(8,8)
   image[y*8:y*8+8,x*8:x*8+8]=palette[indices]
 atlas.paste(Image.fromarray(image),(frame*64,0))
 frames.append({'frame':frame,'literal':hex(offset+0x08000000),'source':hex(source),
  'raw_sha256':hashlib.sha256(data).hexdigest()})
asset=ROOT/'renderer/games/eggo-mania/assets/water-creature-phases.png';atlas.save(asset)
out=ROOT/'scripts/OUTPUT'/('eggo-water-creature_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True);atlas.save(out/'animation.png');(out/'frames.4bpp').write_bytes(b''.join(raw_frames))
PARAMETERS.update(frames=frames,asset_sha256=hashlib.sha256(asset.read_bytes()).hexdigest())
# Splash routine 0x08019f74 selects 16 compressed 32x32 pictures at half speed.
# The seventeenth table entry is not displayed (counter < header_count - 1).
splash_data=[];splash_frames=[]
for frame in range(16):
 source=struct.unpack_from('<I',rom,0x3f1e64+4*frame)[0]
 uc.mem_write(PARAMETERS['destination'],bytes(544))
 for register,value in [(UC_ARM_REG_R0,source),(UC_ARM_REG_R1,PARAMETERS['destination']),
  (UC_ARM_REG_SP,PARAMETERS['stack']),(UC_ARM_REG_LR,PARAMETERS['return'])]:uc.reg_write(register,value)
 uc.emu_start(PARAMETERS['decoder'],PARAMETERS['return'],count=PARAMETERS['instruction_limit'])
 assert uc.reg_read(UC_ARM_REG_PC)==PARAMETERS['return']
 data=bytes(uc.mem_read(PARAMETERS['destination'],512));splash_data.append(data)
 splash_frames.append({'frame':frame,'source':hex(source),'raw_sha256':hashlib.sha256(data).hexdigest()})
ring_sources=json.loads((ROOT/'renderer/games/eggo-mania/assets/background-rings.json').read_text(encoding='utf-8'))['assets']
splash_assets={}
for stage,fields in ring_sources.items():
 capture=ROOT/fields['player']['source_capture'];palette_path=Path(str(capture)+'.0x5000000')
 raw=np.frombuffer(palette_path.read_bytes(),dtype='<u2')[384:400]
 colors=np.stack([*((raw>>s&31)*255//31 for s in (0,5,10)),np.full(16,255)],axis=-1).astype('uint8');colors[0]=0
 splash=Image.new('RGBA',(512,32))
 for frame,data in enumerate(splash_data):
  image=np.zeros((32,32,4),dtype='uint8')
  for y in range(4):
   for x in range(4):
    tile=np.frombuffer(data[(y*4+x)*32:(y*4+x+1)*32],dtype='uint8')
    image[y*8:y*8+8,x*8:x*8+8]=colors[np.stack((tile&15,tile>>4),axis=1).reshape(8,8)]
  splash.paste(Image.fromarray(image),(frame*32,0))
 splash_path=asset.parent/f'water-splash-{stage}.png';splash.save(splash_path)
 splash_assets[stage]={'capture':str(capture.relative_to(ROOT)),'palette_sha256':hashlib.sha256(palette_path.read_bytes()).hexdigest(),
  'asset_sha256':hashlib.sha256(splash_path.read_bytes()).hexdigest()}
splash_metadata={'routine':'0x08019f74','rom_sha256':PARAMETERS['rom_sha256'],'palette_bank':8,
 'frames':splash_frames,'size':32,'ticks_per_frame':2,'stages':splash_assets}
(asset.parent/'water-splash.json').write_text(json.dumps(splash_metadata,indent=2)+'\n',encoding='utf-8')
(out/'splash-parameters.json').write_text(json.dumps(splash_metadata,indent=2)+'\n',encoding='utf-8')
for target in [out/'parameters.json',asset.with_suffix('.json')]:
 target.write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
