"""Native solid tower: start on its roof, dive into water, then recover."""
from pathlib import Path
from datetime import datetime
import json,hashlib,subprocess,sys,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--height',type=int,default=15)
parser.add_argument('--checkpoint',default='hard-idle')
args=parser.parse_args()
PARAMETERS={'checkpoint':args.checkpoint,'height':args.height,'columns':7,'actor':0x3bd4,'field':0xf404,
 'prime_steps':[[2,'']],'steps':[[args.height*6,'L'],[600-args.height*6,'']],
 'seed':'Original checkpoint; all diagnostic initial writes recorded.',
 'cell_descriptors':[43,44,50,51]}
out=ROOT/'scripts/OUTPUT'/('eggo-tall-water_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True);writes=[]
for y in range(PARAMETERS['height']):
 row=46-y
 for x in range(PARAMETERS['columns']):
  at=PARAMETERS['field']+0xc80+row*8+x
  # Byte ownership is written as aligned words below. One owner per square.
  for dy in range(2):
   address=PARAMETERS['field']+(row*2+dy)*32+x*4
   tiles=PARAMETERS['cell_descriptors'][dy*2:dy*2+2]
   writes.append([address,tiles[0]|tiles[1]<<16])
 owners=[y*7+x+1 for x in range(7)]+[0]
 writes.extend([[PARAMETERS['field']+0xc80+row*8+dx,
  int.from_bytes(bytes(owners[dx:dx+4]),'little')]for dx in [0,4]])
writes.extend([[PARAMETERS['field']+offset,47-PARAMETERS['height']]
 for offset in range(0xec8,0xeec,4)])
writes.extend([[PARAMETERS['actor'],72*65536],
 [PARAMETERS['actor']+4,(720-16*PARAMETERS['height'])*65536],
 [PARAMETERS['actor']+0x14,0],[PARAMETERS['actor']+0x18,0],
 [PARAMETERS['actor']+0x864,-1],[PARAMETERS['actor']+0x874,0],
 [PARAMETERS['actor']+0x878,0],[PARAMETERS['actor']+0x880,0]])
(out/'writes.json').write_text(json.dumps(writes)+'\n',encoding='utf-8')
flags=['--sample-every','1','--sample-graphics','--actor-motion-trace','--camera-trace',
 '--ai-trace','--enemy-trace','--pickup-trace','--arena-trace','--board-events','--oam-trace']
def capture(name,load,steps,extra=[]):
 result=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),
  '--load',load,'--steps',json.dumps(steps),'--name',name,*flags,*extra],cwd=ROOT,
  text=True,encoding='utf-8',capture_output=True,check=True)
 return Path(result.stdout.strip().splitlines()[-1]).with_suffix('')
prime=capture(f'solid-{args.height}-roof',args.checkpoint,PARAMETERS['prime_steps'],['--writes-file',str(out/'writes.json')])
prefix=capture(f'solid-{args.height}-water',str(prime)+'.state',PARAMETERS['steps'])
PARAMETERS.update({'initial_prefix':str(prime.relative_to(ROOT)),'prefix':str(prefix.relative_to(ROOT)),
 'checkpoint_sha256':json.loads(Path(str(prime)+'.json').read_text(encoding='utf-8'))['initial_state_sha256'],
 'initial_sha256':hashlib.sha256(Path(str(prime)+'.state').read_bytes()).hexdigest()})
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
trace=json.loads(Path(str(prefix)+'.trace.json').read_text(encoding='utf-8'))
samples=[{'frame':r['frame'],**r['native_actor_motion']['player']}for r in trace]
(out/'actor.json').write_text(json.dumps(samples,indent=2)+'\n',encoding='utf-8')
print(out)
print(prefix)
