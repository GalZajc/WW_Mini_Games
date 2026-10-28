"""Reconstruct menu animation from individually decoded native OBJ descriptors."""
from pathlib import Path
from datetime import datetime
import subprocess,sys,json,struct,hashlib,importlib.util
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];assets=ROOT/'renderer/games/eggo-mania/assets'
base=json.loads((assets/'character-menu.json').read_text(encoding='utf-8'))
PARAMETERS={'frames':1024,'steps':[[1024,'']],'sources':base['sources'],
 'yolko_capture':'scripts/OUTPUT/eggo-reference_2026-10-19_11-42-10_625420/animated-menu',
 'seed':'Encoded in original native selection checkpoints','cell':64,'columns':64}
out=ROOT/'scripts/OUTPUT'/('eggo-menu-animation_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'));out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
spec=importlib.util.spec_from_file_location('ppu',ROOT/'scripts/eggo-compose-native-layers.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
sizes=[[(8,8),(16,16),(32,32),(64,64)],[(16,8),(32,8),(32,16),(64,32)],[(8,16),(8,32),(16,32),(32,64)]]
pics=[];picids={};decoded={};sequences={};sources={}
def decode_sequence(prefix):
 sequence=[]
 for f in range(1,PARAMETERS['frames']+1):
  p=Path(str(prefix)+f'.frame{f:05d}');read=lambda s:Path(str(p)+s).read_bytes()
  v,raw,io,o=read('.memory3'),read('.0x5000000'),read('.0x4000000'),read('.0x7000000');pal=d.palette_555(raw)
  frame=[]
  for i in reversed(range(128)):
   a,b,c=struct.unpack_from('<3H',o,i*8)
   if a&0x300==0x200 or a>>14==3:continue
   x=b&511;x=x-512 if x>=256 else x;y=a&255;y=y-256 if y>=160 else y
   w,h=sizes[a>>14][b>>14]
   if x>=240 or x+w<=0 or y>=160 or y+h<=0:continue
   assert not a&0x100,'Unexpected affine menu object'
   tile=0x10000+(c&1023)*32;count=w*h//2
   key=(a&0xff00,b&0xfe00,c,v[tile:tile+count],raw[512:])
   if key not in decoded:
    obj=d.decode_object(v,pal,io,o,i);rgba=np.dstack([d.color5_to_rgb8(obj['pixels']),obj['visible'].astype(np.uint8)*255]);rgba[~obj['visible']]=0
    digest=(w,h,hashlib.sha256(rgba.tobytes()).digest())
    if digest not in picids:picids[digest]=len(pics);pics.append(Image.fromarray(rgba))
    decoded[key]=picids[digest]
   frame.append([decoded[key],x,y,w,h])
  sequence.append(frame)
 return sequence
for index,(name,source) in enumerate(PARAMETERS['sources'].items()):
 if name=='yolko':prefix=ROOT/PARAMETERS['yolko_capture']
 else:
  args=[sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',str(ROOT/(source['prefix']+'.state')),
   '--steps',json.dumps(PARAMETERS['steps']),'--sample-every','1','--sample-graphics','--name',name+'-menu']
  run=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
  prefix=Path(run.stdout.strip().splitlines()[-1]).with_suffix('')
 sources[name]=str(prefix.relative_to(ROOT));sequences[name]=decode_sequence(prefix)
 (out/'sources.json').write_text(json.dumps(sources,indent=2),encoding='utf-8')
 print(f'{index+1}/8 {name}: {len(pics)} unique native sprites',flush=True)
sheet=Image.new('RGBA',(64*PARAMETERS['columns'],64*((len(pics)+PARAMETERS['columns']-1)//PARAMETERS['columns'])))
for i,picture in enumerate(pics):sheet.paste(picture,(i%PARAMETERS['columns']*64,i//PARAMETERS['columns']*64))
sheet.save(assets/'character-menu-animation.png')
data={'parameters':PARAMETERS,'sources':sources,'sequences':sequences}
(assets/'character-menu-animation.js').write_text('// Decoded native OBJ animation; no captured frame artwork.\nexport const MENU_ANIMATION='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
print(out)
subprocess.run([sys.executable,str(ROOT/'scripts/eggo-fit-menu-animation.py')],cwd=ROOT,check=True)
