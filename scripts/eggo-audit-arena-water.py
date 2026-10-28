"""Audit all 60 native water phases; preserve portable airship-state samples."""
from pathlib import Path
from datetime import datetime
import json,struct,importlib.util,hashlib,argparse,subprocess,sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'manifest':'renderer/games/eggo-mania/assets/arena-water.json','frames':60,
 'seed':'Recorded checkpoints; no new inputs or writes','pixel_tolerance':0}
parser=argparse.ArgumentParser();parser.add_argument('--continuation',action='store_true');args=parser.parse_args();PARAMETERS['continuation']=args.continuation
out=ROOT/'scripts/OUTPUT'/('eggo-arena-water-audit_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
ppu=module('ppu','eggo-compose-native-layers.py');alternate=module('alternate','eggo-build-factory-waterline-bg3.py')
j=json.loads((ROOT/PARAMETERS['manifest']).read_text(encoding='utf-8'));stages=[];boats=[]
for stage,source in j['sources'].items():
 if args.continuation:
  result=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',source['prefix']+'.state',
   '--steps','[[60,""]]','--sample-every','1','--sample-graphics','--name',stage+'-water-continuation'],
   cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
  source={**source,'prefix':str(Path(result.stdout.strip().splitlines()[-1]).with_suffix('').relative_to(ROOT))}
 atlas=np.array(Image.open(ROOT/f'renderer/games/eggo-mania/assets/{stage}-water-surface.png').convert('RGBA'))
 strip=np.array(Image.open(ROOT/f'renderer/games/eggo-mania/assets/{stage}-water-bg3.png').convert('RGBA'))
 different=0;observed=0;records=[]
 for frame in range(1,61):
  pre=ROOT/(source['prefix']+f'.frame{frame:05d}');ram=Path(str(pre)+'.ram').read_bytes();clock=struct.unpack_from('<I',ram,0x11a9c)[0]
  oam=Path(str(pre)+'.0x7000000').read_bytes();vram=Path(str(pre)+'.memory3').read_bytes();raw=Path(str(pre)+'.0x5000000').read_bytes();io=Path(str(pre)+'.0x4000000').read_bytes()
  expected=np.zeros((32,112,4),dtype='uint8');screen=np.array(Image.open(Path(str(pre)+'.png')).convert('RGB'))
  for i in range(128):
   a,b,c=struct.unpack_from('<HHH',oam,i*8);x=b&511;x=x-512 if x>=256 else x
   if a&0x300 or a>>14!=1 or b>>14!=3 or c>>12!=4 or x not in [-8,56]:continue
   d=ppu.decode_object(vram,ppu.palette_555(raw),io,oam,i)
   rgba=np.dstack([ppu.color5_to_rgb8(d['pixels']),d['visible'].astype('uint8')*255]);rgba[~d['visible']]=0
   lo=max(0,x);hi=min(112,x+64);expected[:,lo:hi]=rgba[:,lo-x:hi-x]
   for y,xx in np.argwhere(d['visible']):
    sx,sy=d['x']+int(xx),d['y']+int(y)
    if 0<=sx<112 and 0<=sy<160 and np.array_equal(rgba[y,xx,:3],screen[sy,sx]):observed+=1
  phase=clock%60
  error=int(np.count_nonzero(np.any(expected!=atlas[phase*32:(phase+1)*32],axis=2)))
  bg=alternate.decode_alt_bg3_source(vram,raw)
  bg_error=int(np.count_nonzero(np.any(bg!=strip[(clock%60)*18:(clock%60+1)*18],axis=2)))
  error+=bg_error
  different+=error;records.append({'frame':frame,'different_pixels':error,'native_frame':clock})
  for side in range(2):
   x,y=struct.unpack_from('<ii',ram,0x333c+side*0x137c+0x850)
   boats.append({'stage':stage,'frame':clock,'side':side,'x':x,'y':y})
 assert observed>0 and different==0,(stage,different,observed)
 stages.append({'stage':stage,'source':source['prefix'],'different_pixels':different,'native_png_visible_water_pixels':observed,'samples':records,
  'atlas_sha256':hashlib.sha256(atlas.tobytes()).hexdigest()});print(stage,observed,flush=True)
data={'parameters':PARAMETERS,'stages':stages}
(out/'parameters.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
(ROOT/'tests/fixtures/eggo-arena-boats-gba.json').write_text(json.dumps({'parameters':PARAMETERS,'samples':boats},indent=2)+'\n',encoding='utf-8')
print(out)
