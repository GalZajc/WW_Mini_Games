"""Compare recovered native glyph motion with an input-only result replay."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'initial':'scripts/OUTPUT/eggo-reference_2026-10-03_13-55-10_161647/bomb-right-expiry.frame00248',
 'replay':'scripts/OUTPUT/eggo-reference_2026-10-04_21-38-07_870262/result-motion',
 'root':0x31254,'stride':40,'indices':[0,1,2,3,4,6,7,8,9],'frames':186,'fixed':65536,
 'right_kick':0x2666,'left_kick':0x2e14,'bottom_kick':0x23d7,'top_kick':0x30a3,
 'seed':None}
ram_path=ROOT/(PARAMETERS['initial']+'.ram');trace_path=ROOT/(PARAMETERS['replay']+'.trace.json')
meta=json.loads((ROOT/(PARAMETERS['replay']+'.json')).read_text(encoding='utf-8'))
assert meta['writes']==[] and meta['steps']==[[240,'']]
ram=ram_path.read_bytes();trace=json.loads(trace_path.read_text(encoding='utf-8'))
names=['x','y','vx','vy','maxX','maxY','minX','minY']
initial=[dict(zip(names,struct.unpack_from('<8i',ram,PARAMETERS['root']+i*PARAMETERS['stride']))) for i in PARAMETERS['indices']]
states=[dict(s) for s in initial];samples=[]
for sample in trace[:PARAMETERS['frames']]:
 positions=[[s['x']//PARAMETERS['fixed'],s['y']//PARAMETERS['fixed']] for s in states]
 actual=[[s['x'],s['y']] for s in sample['result_oam']]
 assert positions==actual,(sample['frame'],positions,actual)
 samples.append({'frame':sample['frame'],'positions':actual})
 for s in states:
  s['x']+=s['vx']
  if s['x']>s['maxX']:s['x']=s['maxX'];s['vx']=-s['vx'];s['vy']+=PARAMETERS['right_kick']
  if s['x']<s['minX']:s['x']=s['minX'];s['vx']=-s['vx'];s['vy']-=PARAMETERS['left_kick']
  s['y']+=s['vy']
  if s['y']>s['maxY']:s['y']=s['maxY'];s['vy']=-s['vy'];s['vx']+=PARAMETERS['bottom_kick']
  if s['y']<s['minY']:s['y']=s['minY'];s['vy']=-s['vy'];s['vx']-=PARAMETERS['top_kick']
fixture={'parameters':PARAMETERS,'source_parameters':meta,'initial':initial,'samples':samples,
 'hashes':{'initial_ram':hashlib.sha256(ram).hexdigest(),'trace':hashlib.sha256(trace_path.read_bytes()).hexdigest()},
 'limits':'Natural left-loss/right-win glyph motion until the native result-page transition at replay frame 187. No claim about the later menu or scoring.'}
out=ROOT/'scripts/OUTPUT'/('eggo-result-motion_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/'tests/fixtures/eggo-result-motion-gba.json',fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print({'frames':len(samples),'glyph_positions':len(samples)*len(initial),'output':str(out)})
