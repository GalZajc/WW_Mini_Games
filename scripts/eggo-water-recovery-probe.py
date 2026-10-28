"""Controlled native water recovery through solid stacks and a buried opening."""
from pathlib import Path
from datetime import datetime
import json, subprocess, sys, hashlib
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'checkpoint':'hard-idle','field':0xf404,'map':0xc80,'rows':47,'stride':8,
 'frames':400,'cases':[{'name':'solid-8','height':8},{'name':'solid-20','height':20},
 {'name':'gap-20','height':20,'gap_row':8}],
 'random_seed':'Preserved in checkpoint; board, roof caches and roof actor position recorded.'}
out=ROOT/'scripts/OUTPUT'/('eggo-water-recovery_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True);captures=[]
for case in PARAMETERS['cases']:
 writes=[]
 for y in range(case['height']):
  # A native owner is one small rigid piece. Reusing one owner for a 20-row
  # synthetic stack makes the ROM's bounded component scan treat it as loose.
  cells=[y+1]*7+[0]
  if y==case.get('gap_row'):cells[3]=cells[4]=0
  base=PARAMETERS['field']+PARAMETERS['map']+(46-y)*8
  writes.extend([[base,int.from_bytes(bytes(cells[:4]),'little')],[base+4,int.from_bytes(bytes(cells[4:]),'little')]])
 writes.extend([[PARAMETERS['field']+offset,47-case['height']]for offset in range(0xec8,0xeec,4)])
 writes.extend([[0x3bd8,(720-case['height']*16)*65536],[0x3bd4+0x18,0],[0x3bd4+0x864,-1]])
 steps=[[case['height']*6,'L'],[PARAMETERS['frames']-case['height']*6,'']]
 path=out/(case['name']+'-writes.json');path.write_text(json.dumps(writes),encoding='utf-8')
 run=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',PARAMETERS['checkpoint'],
  '--writes-file',str(path),'--steps',json.dumps(steps),'--actor-motion-trace','--camera-trace',
  '--snapshot-at','[1,14,62,110,190]','--name',case['name']],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 image=Path(run.stdout.strip().splitlines()[-1]);captures.append({**case,'start_on_roof':True,'steps':steps,'prefix':str(image.with_suffix('').relative_to(ROOT))})
 print(case['name'],flush=True)
PARAMETERS['checkpoint_sha256']=hashlib.sha256((ROOT/'tests/artifacts/eggo-reference/hard-idle.state').read_bytes()).hexdigest()
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
(out/'captures.json').write_text(json.dumps(captures,indent=2)+'\n',encoding='utf-8')
print(out)
