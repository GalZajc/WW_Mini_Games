"""Read captured native enemy motion/hit centers for model adapter validation."""
from pathlib import Path
from datetime import datetime
import json,struct,hashlib
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'fixture_glob':'tests/fixtures/eggo-*-gba.json','entity_root':0x31038,'entity_stride':0x80,
 'slots':4,'fixed':65536,'fixture':'tests/fixtures/eggo-cpu-hit-centers-gba.json',
 'limits':'Captured active entity states and persistent collision centers; formula validation, not a full match replay.'}
PARAMETERS['continuation']='scripts/OUTPUT/eggo-reference_2026-10-04_21-12-13_429038/cpu-rock-center'
prefixes=set()
def walk(v):
 if isinstance(v,dict):
  for k,x in v.items():
   if k in ['native','baseline','art'] and isinstance(x,str) and 'eggo-reference_' in x:prefixes.add(x.replace('\\','/'))
   elif isinstance(x,(dict,list)):walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
for f in ROOT.glob(PARAMETERS['fixture_glob']):
 if f.name.startswith('eggo-cpu-'):continue
 walk(json.loads(f.read_text(encoding='utf-8')))
files=set()
for prefix in prefixes:
 q=ROOT/prefix
 if Path(str(q)+'.ram').exists():files.add(Path(str(q)+'.ram'))
 files.update(q.parent.glob(q.name+'.frame*.ram'))
cases=[];sources={}
for f in sorted(files):
 ram=f.read_bytes();sources[str(f.relative_to(ROOT))]=hashlib.sha256(ram).hexdigest()
 for slot in range(PARAMETERS['slots']):
  at=PARAMETERS['entity_root']+slot*PARAMETERS['entity_stride']
  word=lambda off:struct.unpack_from('<i',ram,at+off)[0]
  if not word(0x48):continue
  state={name:word(off)/(65536 if name in ['x','y','vx','vy'] else 1) for name,off in
   [('x',0),('y',4),('vx',20),('vy',24),('animation',32),('animationClock',40),('life',76),('variant',80)]}
  state['active']=True
  # Snapshots sampled outside transition frames use the current phase.
  state['previousAnimation']=int(state['animation'])
  actor=word(0x6c)-0x02000000;field=word(0x68)-0x02000000
  actor_state=struct.unpack_from('<i',ram,actor+0x874)[0]
  protected=struct.unpack_from('<H',ram,field+0x1240)[0]!=0
  protected=protected or ram[0x30eb8+(slot%2)*0x40+0x31]!=0
  cases.append({'source':str(f.relative_to(ROOT)),'slot':slot,'kind':word(36),'state':state,
   'actorState':actor_state,'contactBlocked':actor_state in [1,7] or protected,
   'hitX':word(64)/65536,'hitY':word(68)/65536})
PARAMETERS['sources']=sources
continuation=[]
for frame in [1,2]:
 f=ROOT/(PARAMETERS['continuation']+f'.frame{frame:05d}.ram');ram=f.read_bytes();at=PARAMETERS['entity_root']+2*PARAMETERS['entity_stride']
 w=lambda off:struct.unpack_from('<i',ram,at+off)[0]
 continuation.append({'frame':frame,'source':str(f.relative_to(ROOT)),'sha256':hashlib.sha256(ram).hexdigest(),
  'x':w(0)/65536,'y':w(4)/65536,'hitX':w(64)/65536,'hitY':w(68)/65536})
fixture={'parameters':PARAMETERS,'cases':cases,'continuation':continuation}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-hit-centers_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print({'cases':len(cases),'kinds':sorted(set(c['kind'] for c in cases)),'output':str(out)})
