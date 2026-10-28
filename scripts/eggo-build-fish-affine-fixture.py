"""Read skeletal-fish affine orientation directly from both fields' native OAM."""
from pathlib import Path
from datetime import datetime
import json,struct,hashlib,importlib.util,argparse
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'capture':'scripts/OUTPUT/eggo-reference_2026-10-18_17-30-58_564005/fish-affine-both',
 'frames':[26,40,60,80,100,120],'enemy_roots':[0x31038,0x310b8],
 'seed':'Original captured native state','angles':'Previous actor update, used for OAM submission'}
parser=argparse.ArgumentParser();parser.add_argument('--stage',choices=['pirate','castle'],default='pirate');parser.add_argument('--capture')
args=parser.parse_args();PARAMETERS['stage']=args.stage
if args.capture:PARAMETERS['capture']=args.capture
p=ROOT/PARAMETERS['capture'];cases=[];images=[]
spec=importlib.util.spec_from_file_location('native_ppu',ROOT/'scripts/eggo-compose-native-layers.py')
ppu=importlib.util.module_from_spec(spec);spec.loader.exec_module(ppu)
for frame in PARAMETERS['frames']:
 prefix=Path(str(p)+f'.frame{frame:05d}')
 oam=Path(str(prefix)+'.0x7000000').read_bytes()
 trace=Path(str(p)+'.trace.json')
 samples=json.loads(trace.read_text(encoding='utf-8'))
 for side in range(2):
  objects=[(i,a0,a1,a2)for i in range(128)for a0,a1,a2 in [struct.unpack_from('<HHH',oam,i*8)]
   if a0&0x100 and a0>>14==0 and a1>>14==3 and a2>>12==5 and (a1>>9)&31==side]
  if not objects:continue
  index,a0,a1,a2=objects[0];matrix_index=(a1>>9)&31
  matrix=[struct.unpack_from('<h',oam,matrix_index*32+6+8*i)[0]for i in range(4)]
  obj=ppu.decode_object(Path(str(prefix)+'.memory3').read_bytes(),
   ppu.palette_555(Path(str(prefix)+'.0x5000000').read_bytes()),
   Path(str(prefix)+'.0x4000000').read_bytes(),oam,index)
  rgba=np.zeros((64,64,4),dtype=np.uint8);rgba[:,:,:3]=ppu.color5_to_rgb8(obj['pixels']);rgba[:,:,3]=obj['visible']*255
  rgba[~obj['visible']]=0;images.append(Image.fromarray(rgba))
  screen=np.array(Image.open(Path(str(prefix)+'.png')).convert('RGB'));observed=0
  for y,x in np.argwhere(obj['visible']):
   sx,sy=obj['x']+int(x),obj['y']+int(y)
   if 0<=sx<240 and 0<=sy<160 and np.array_equal(rgba[y,x,:3],screen[sy,sx]):observed+=1
  cases.append({'stage':args.stage,'frame':frame,'side':side,'angle':samples[frame-2]['enemies'][side]['angle'],
   'variant':samples[frame-2]['enemies'][side]['variant'],
   'animation':samples[frame-2]['enemies'][side]['animation'],'visible_native_png_pixels':observed,
   'matrix':matrix,'object':index,'oam_sha256':hashlib.sha256(oam).hexdigest()})
out=ROOT/'scripts/OUTPUT'/('eggo-fish-affine_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True);data={'parameters':PARAMETERS,'cases':cases}
sheet=Image.new('RGBA',(64,len(images)*64))
for i,image in enumerate(images):sheet.paste(image,(0,i*64))
fixture='shark' if args.stage=='castle' else 'fish'
sheet.save(ROOT/f'tests/fixtures/eggo-{fixture}-affine-gba.png');sheet.save(out/'native-fish.png')
for path in [out/'measurements.json',ROOT/f'tests/fixtures/eggo-{fixture}-affine-gba.json']:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
