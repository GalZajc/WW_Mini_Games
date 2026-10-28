"""Measure native one-cell placements for all four inventory orientations."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,subprocess,sys

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'checkpoint':'hard-idle','actor':0x3bd4,'inventory_offset':0x864,
 'rotation_offset':0x868,'field':0xf404,'map_offset':0xc80,'rows':47,'columns':7,
 'singleton_kind':2,'frames':40,'prime_steps':[[2,'']],'steps':[[1,'A'],[39,'']],
 'random_seed':'Preserved in original checkpoint; diagnostic inventory writes only.'}
out=ROOT/'scripts/OUTPUT'/('eggo-singleton-placement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
PARAMETERS['checkpoint_sha256']=hashlib.sha256((ROOT/'tests/artifacts/eggo-reference/hard-idle.state').read_bytes()).hexdigest()
records=[]
for rotation in range(4):
 writes=[[PARAMETERS['actor']+PARAMETERS['inventory_offset'],PARAMETERS['singleton_kind']],
         [PARAMETERS['actor']+PARAMETERS['rotation_offset'],rotation]]
 prime=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),
  '--load',PARAMETERS['checkpoint'],'--writes',json.dumps(writes),
  '--steps',json.dumps(PARAMETERS['prime_steps']),'--sample-graphics',
  '--name',f'singleton-prime-{rotation}'],
  cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 initial=Path(prime.stdout.strip().splitlines()[-1]).with_suffix('')
 run=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),
  '--load',str(initial)+'.state',
  '--steps',json.dumps(PARAMETERS['steps']),'--board-events','--sample-every','1',
  '--sample-graphics','--actor-motion-trace','--camera-trace','--ai-trace',
  '--enemy-trace','--pickup-trace','--arena-trace','--oam-trace','--name',f'singleton-rotation-{rotation}'],
  cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 prefix=Path(run.stdout.strip().splitlines()[-1]).with_suffix('')
 ram=Path(str(prefix)+'.ram').read_bytes();cells=[]
 for row in range(PARAMETERS['rows']):
  for x in range(PARAMETERS['columns']):
   owner=ram[PARAMETERS['field']+PARAMETERS['map_offset']+row*8+x]
   if owner:cells.append({'x':x,'row':row,'owner':owner,
    'descriptors':[struct.unpack_from('<H',ram,PARAMETERS['field']+(row*2+dy)*32+x*4+dx*2)[0]
     for dy in range(2)for dx in range(2)]})
 records.append({'rotation':rotation,'writes':writes,'initial_prefix':str(initial.relative_to(ROOT)),
  'initial_sha256':hashlib.sha256(Path(str(initial)+'.state').read_bytes()).hexdigest(),
  'prefix':str(prefix.relative_to(ROOT)),
  'cells':cells,'final_ram_sha256':hashlib.sha256(ram).hexdigest()})
 print(json.dumps(records[-1]),flush=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
(out/'results.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(out)
