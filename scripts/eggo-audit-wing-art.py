"""Compare robot wing tiles to their native RAM phase, independently of screen layers."""
from pathlib import Path
from datetime import datetime
import json, struct, importlib.util, hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
CAPTURE=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876'
ASSET=ROOT/'renderer/games/eggo-mania/assets/factory-secondary-wings.png'
atlas=np.asarray(Image.open(ASSET).convert('RGBA')).copy()
atlas[atlas[:,:,3]==0]=0
spec=importlib.util.spec_from_file_location('ppu',ROOT/'scripts/eggo-compose-native-layers.py')
ppu=importlib.util.module_from_spec(spec);spec.loader.exec_module(ppu)
out=ROOT/'scripts/OUTPUT'/('eggo-wing-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
records=[];seen=set();fixed=Image.new('RGBA',(512,16));previous=None
for frame in range(1,601):
 base=CAPTURE/f'eggo-replay-full-graphics.frame{frame:05d}'
 ram=Path(str(base)+'.ram').read_bytes()
 if previous is None:previous=ram;continue
 oam=Path(str(base)+'.0x7000000').read_bytes();vram=Path(str(base)+'.memory3').read_bytes()
 io=Path(str(base)+'.0x4000000').read_bytes();palette=ppu.palette_555(Path(str(base)+'.0x5000000').read_bytes())
 for field,address in enumerate([0x31138,0x311b8]):
  phase=struct.unpack_from('<i',previous,address+0x78)[0]
  x=(struct.unpack_from('<i',previous,address)[0]>>16)+field*128
  parts=[]
  for index in range(128):
   a0,a1,a2=struct.unpack_from('<HHH',oam,index*8)
   if a0>>14!=1 or a1>>14!=2 or a2>>12!=9:continue
   ox=a1&511;ox-=512 if ox>=256 else 0
   if ox not in (x,x+32):continue
   obj=ppu.decode_object(vram,palette,io,oam,index)
   if obj is None:continue
   rgba=np.zeros((16,32,4),dtype=np.uint8)
   rgba[:,:,:3]=(obj['pixels'].astype(np.uint16)*255//31).astype('uint8')
   rgba[:,:,3]=obj['visible']*255;rgba[~obj['visible']]=0
   parts.append((ox-x,rgba))
  if len(parts)!=2:continue
  merged=np.zeros((16,64,4),dtype=np.uint8)
  for offset,pixels in parts:merged[:,offset:offset+32]=pixels
  matches=[i for i in range(8) if np.array_equal(merged,atlas[:,i*64:(i+1)*64])]
  records.append({'frame':frame,'field':field,'phase':phase,'matches':matches})
  if phase not in seen:fixed.paste(Image.fromarray(merged),(phase*64,0));seen.add(phase)
 previous=ram
fixed.save(out/'native-wing-phases.png')
summary={'samples':len(records),'exact':sum(r['phase'] in r['matches'] for r in records),
 'mapping':{p:sorted({i for r in records if r['phase']==p for i in r['matches']}) for p in sorted(seen)}}
(out/'parameters.json').write_text(json.dumps({'capture':str(CAPTURE),'asset':str(ASSET),
 'asset_sha256':hashlib.sha256(ASSET.read_bytes()).hexdigest(),'random_seed':None},indent=2),encoding='utf-8')
(out/'frames.json').write_text(json.dumps(records),encoding='utf-8')
(out/'results.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps({'output':str(out),**summary},indent=2))
