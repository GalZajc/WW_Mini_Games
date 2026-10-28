"""Decode arena water OBJ/BG animations, never whole captured screenshots."""
from pathlib import Path
from datetime import datetime
import json, subprocess, sys, struct, hashlib, importlib.util,argparse
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'frames':60,'phase_offset':39,'ticks_per_cel':4,'surface_size':[112,32],
 'body_source_y':80,'body_size':[112,176],'seed':'Checkpoint RNG retained',
 'checkpoints':{
 'dragon':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_576376/dragon-landed.state',
 'castle':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_514995/castle-landed.state',
 'pirate':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_580151/pirate-landed.state',
 'space':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_404434/space-landed.state',
 'jungle':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_417436/jungle-landed.state',
 'park':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_425429/park-landed.state',
 'beanstalk':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-18_098381/beanstalk-landed.state'}}
out=ROOT/'scripts/OUTPUT'/('eggo-arena-water_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
assets=ROOT/'renderer/games/eggo-mania/assets'
parser=argparse.ArgumentParser();parser.add_argument('--reuse',action='store_true');args=parser.parse_args()
previous=json.loads((assets/'arena-water.json').read_text(encoding='utf-8')) if args.reuse else None
PARAMETERS['animation_frames']=60;PARAMETERS['runtime_phase']='nativeFrame modulo 60; preserve each arena\'s sub-cel timing'
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
ppu=module('ppu','eggo-compose-native-layers.py')
alternate=module('alternate','eggo-build-factory-waterline-bg3.py')
# Use the existing tile decoder without executing its extraction entry point.
source=(ROOT/'scripts/eggo-build-factory-water-body.py').read_text(encoding='utf-8')
scope={'__file__':str(ROOT/'scripts/eggo-build-factory-water-body.py')}
exec(source.split('source = ROOT / PARAMETERS["source_run"]')[0],scope)
records={}
for stage,checkpoint in PARAMETERS['checkpoints'].items():
 if previous:prefix=ROOT/previous['sources'][stage]['prefix']
 else:
  run=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',checkpoint,
   '--steps','[[60,""]]','--sample-every','1','--sample-graphics','--name',stage+'-water-art'],
   cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
  prefix=Path(run.stdout.strip().splitlines()[-1]).with_suffix('')
 surfaces={};bodies={};strips={};samples=[]
 for f in range(1,61):
  p=Path(str(prefix)+f'.frame{f:05d}');ram=Path(str(p)+'.ram').read_bytes()
  phase=struct.unpack_from('<I',ram,0x11a9c)[0]%60
  vram=Path(str(p)+'.memory3').read_bytes();raw=Path(str(p)+'.0x5000000').read_bytes()
  strips[struct.unpack_from('<I',ram,0x11a9c)[0]%60]=Image.fromarray(alternate.decode_alt_bg3_source(vram,raw))
  if phase in surfaces:continue
  io=Path(str(p)+'.0x4000000').read_bytes();oam=Path(str(p)+'.0x7000000').read_bytes()
  palette=ppu.palette_555(raw);surface=np.zeros((32,112,4),dtype=np.uint8);objects=[]
  for i in range(128):
   a0,a1,a2=struct.unpack_from('<HHH',oam,i*8)
   x=a1&511;x=x-512 if x>=256 else x
   if a0&0x300 or a0>>14!=1 or a1>>14!=3 or a2>>12!=4 or x not in [-8,56]:continue
   obj=ppu.decode_object(vram,palette,io,oam,i)
   rgb=ppu.color5_to_rgb8(obj['pixels']);rgba=np.dstack([rgb,obj['visible'].astype(np.uint8)*255]);rgba[~obj['visible']]=0
   lo=max(0,x);hi=min(112,x+64);surface[:,lo:hi]=rgba[:,lo-x:hi-x];objects.append(i)
  assert len(objects)==2,(stage,f,objects)
  words=np.frombuffer(raw,dtype='<u2');pal=np.stack([(words&31)*255//31,((words>>5)&31)*255//31,((words>>10)&31)*255//31,np.full(words.shape,255)],axis=-1).astype('uint8')
  body,*_=scope['decode_bg1'](vram,pal,io)
  # Native BG1 uses horizontal offset eight; preserve its transparent texels.
  body=body.crop((8,80,120,256))
  surfaces[phase]=Image.fromarray(surface);bodies[phase]=body
  samples.append({'frame':f,'phase':phase,'objects':objects,'graphics_sha256':hashlib.sha256(vram+raw+oam+io).hexdigest()})
 assert len(surfaces)==60
 for kind,images,height in [('surface',surfaces,32),('body',bodies,176),('bg3',strips,18)]:
  sheet=Image.new('RGBA',(112,height*len(images)))
  for phase,image in images.items():sheet.paste(image,(0,phase*height))
  sheet.save(assets/f'{stage}-water-{kind}.png');sheet.save(out/f'{stage}-{kind}.png')
 records[stage]={'prefix':str(prefix.relative_to(ROOT)),'checkpoint_sha256':hashlib.sha256((ROOT/checkpoint).read_bytes()).hexdigest(),'samples':samples}
 print(stage,flush=True)
data={'parameters':PARAMETERS,'sources':records}
for p in [out/'parameters.json',assets/'arena-water.json']:p.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(out)
