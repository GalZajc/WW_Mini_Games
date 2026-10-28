"""Decode each arena's bonus-cell map selected by ROM routine 0x08004e20."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];asset=ROOT/'renderer/games/eggo-mania/assets'
rom_path=Path('C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba');rom=rom_path.read_bytes()
stage_order=['beanstalk','factory','dragon','castle','pirate','space','jungle','park']
sources=json.loads((asset/'background-rings.json').read_text(encoding='utf-8'))['assets'];records=[]
for stage,fields in sources.items():
 pointer=struct.unpack_from('<I',rom,0x4e78+stage_order.index(stage)*8)[0]
 descriptors=[struct.unpack_from('<H',rom,pointer-0x08000000+i)[0] for i in [0x24,0x26,0x34,0x36]]
 base=ROOT/fields['player']['source_capture'];vram=Path(str(base)+'.memory3').read_bytes()
 io=Path(str(base)+'.0x4000000').read_bytes();pal=Path(str(base)+'.0x5000000').read_bytes()
 charbase=(struct.unpack_from('<H',io,8)[0]>>2&3)*0x4000;raw=np.frombuffer(pal,dtype='<u2')
 palette=np.stack([(raw&31)*255//31,((raw>>5&31)*2)*255//63,(raw>>10&31)*255//31,np.full(512,255)],axis=-1).astype('uint8')
 pixels=np.zeros((16,16,4),dtype='uint8')
 for i,descriptor in enumerate(descriptors):
  tile=np.frombuffer(vram,dtype='uint8',count=32,offset=charbase+(descriptor&1023)*32)
  idx=np.stack([tile&15,tile>>4],axis=-1).reshape(8,8);p=palette[idx+(descriptor>>12)*16].copy();p[idx==0]=0
  pixels[i//2*8:i//2*8+8,i%2*8:i%2*8+8]=p
 target=asset/f'bonus-{stage}.png';Image.fromarray(pixels).save(target)
 records.append({'stage':stage,'map_pointer':hex(pointer),'descriptors':[hex(x) for x in descriptors],
  'source_capture':str(base.relative_to(ROOT)),
  'vram_sha256':hashlib.sha256(vram).hexdigest(),'palette_sha256':hashlib.sha256(pal).hexdigest(),
  'asset_sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
parameters={'routine':'0x08004e20','stage_dispatch_table':'0x08004e54',
 'rom_sha256':hashlib.sha256(rom).hexdigest(),'random_seed':None,'assets':records}
out=ROOT/'scripts/OUTPUT'/('eggo-bonus-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for target in [out/'parameters.json',asset/'completion-bonus.json']:
 target.write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
print(out)
