"""Native throw-skin and rescue-gate counterexamples for the current fixes."""
from pathlib import Path
from datetime import datetime
import json,struct,subprocess,sys,hashlib,importlib.util
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'seed':'Saved checkpoint RNG retained; every setup write recorded',
 'throw_kind':0,'throw_steps':[[2,''],[1,'A'],[3,'']],
 'rescue_cases':[{'name':'below','y':129},{'name':'equal','y':128},{'name':'above','y':127,'frames':90},
 {'name':'early','y':127,'clock':348},{'name':'ready','y':127,'clock':350},
 {'name':'forced-rise','y':127,'forced':True,'height':42,'frames':30}]}
out=ROOT/'scripts/OUTPUT'/('eggo-priority-regressions_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
def capture(name,checkpoint,steps,writes):
 result=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',checkpoint,
  '--writes',json.dumps(writes),'--steps',json.dumps(steps),'--sample-every','1','--sample-graphics',
  '--name',name],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 return Path(result.stdout.strip().splitlines()[-1]).with_suffix('')
spec=importlib.util.spec_from_file_location('ppu',ROOT/'scripts/eggo-compose-native-layers.py');ppu=importlib.util.module_from_spec(spec);spec.loader.exec_module(ppu)
water=json.loads((ROOT/'renderer/games/eggo-mania/assets/arena-water.json').read_text(encoding='utf-8'))
checkpoints={'factory':'hard-idle',**{stage:value['prefix']+'.state' for stage,value in water['sources'].items()}};cases=[];sheet=Image.new('RGBA',(64,len(checkpoints)*64))
for row,(stage,checkpoint) in enumerate(checkpoints.items()):
 prefix=capture(stage+'-throw-skin',checkpoint,PARAMETERS['throw_steps'],[[0x4438,0],[0x443c,0]])
 p=Path(str(prefix)+'.frame00006');oam=Path(str(p)+'.0x7000000').read_bytes();candidates=[]
 for i in range(128):
  a,b,c=struct.unpack_from('<HHH',oam,i*8)
  if a&0x300==0x100 and a>>14==0 and b>>14==3 and (b&511)<112 and c>>12==13:candidates.append(i)
 assert len(candidates)==1,(stage,candidates)
 i=candidates[0];o=ppu.decode_object(Path(str(p)+'.memory3').read_bytes(),ppu.palette_555(Path(str(p)+'.0x5000000').read_bytes()),Path(str(p)+'.0x4000000').read_bytes(),oam,i)
 rgba=np.dstack([ppu.color5_to_rgb8(o['pixels']),o['visible'].astype('uint8')*255]);rgba[~o['visible']]=0;sheet.paste(Image.fromarray(rgba),(0,row*64))
 matrix_index=(struct.unpack_from('<H',oam,i*8+2)[0]>>9)&31
 matrix=[struct.unpack_from('<h',oam,matrix_index*32+6+j*8)[0]for j in range(4)]
 cases.append({'stage':stage,'kind':0,'matrix':matrix,'prefix':str(prefix.relative_to(ROOT)),
  'oam_sha256':hashlib.sha256(oam).hexdigest()});print(stage,flush=True)
fixtures=ROOT/'tests/fixtures';sheet.save(fixtures/'eggo-arena-throw-gba.png')
(fixtures/'eggo-arena-throw-gba.json').write_text(json.dumps({'parameters':PARAMETERS,'cases':cases},indent=2)+'\n',encoding='utf-8')
rescue=[]
for case in PARAMETERS['rescue_cases']:
 writes=[[0x3bd8,case['y']*65536],[0x3bd4+0x18,0]]
 if 'clock'in case:writes.append([0x11a9c,case['clock']])
 if case.get('forced'):
  writes.append([0xf404+0x1240,1]);writes.extend([[0xf404+offset,47-case['height']] for offset in range(0xec8,0xeec,4)])
  for y in range(case['height']):
   row=46-y;owners=bytes([y+1]*7+[0]);writes.extend([[0x10084+row*8+dx,int.from_bytes(owners[dx:dx+4],'little')]for dx in [0,4]])
 frames=case.get('frames',4);prefix=capture('rescue-'+case['name'],'hard-idle',[[frames,'']],writes)
 samples=[]
 for f in range(1,frames+1):
  b=Path(str(prefix)+f'.frame{f:05d}.ram').read_bytes()
  samples.append({'frame':f,'game_state':struct.unpack_from('<I',b,0x10)[0],
   'actor_x':struct.unpack_from('<i',b,0x3bd4)[0]/65536,'actor_y':struct.unpack_from('<i',b,0x3bd8)[0]/65536,
   'boat':list(struct.unpack_from('<ii',b,0x3b8c)),'boat_phases':list(struct.unpack_from('<II',b,0x3bac)),
   'clock':struct.unpack_from('<I',b,0x11a9c)[0]})
 rescue.append({**case,'writes':writes,'samples':samples,'prefix':str(prefix.relative_to(ROOT))});print(case['name'],flush=True)
data={'parameters':PARAMETERS,'throws':cases,'rescue':rescue}
for p in [out/'parameters.json',fixtures/'eggo-rescue-gates-gba.json']:p.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(out)
