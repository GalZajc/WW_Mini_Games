"""Preserve both native beanstalk arcs, capture/release and the eight OBJ phases."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, struct, subprocess, sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'native':'scripts/OUTPUT/eggo-reference_2026-10-03_23-08-14_881993/beanstalk-enemy',
 'art':'scripts/OUTPUT/eggo-reference_2026-10-03_23-15-03_306968/beanstalk-art',
 'art_frames':[24,29,34,39,44,49,54,59],
 'hard_start':'scripts/OUTPUT/eggo-reference_2026-10-03_23-21-05_458588/beanstalk-hard-start',
 'hard_long':'scripts/OUTPUT/eggo-reference_2026-10-03_23-23-12_706129/beanstalk-hard-long',
 'factory_start':'scripts/OUTPUT/eggo-reference_2026-10-03_23-22-08_422794/factory-hard-delay',
 'fixed_point_scale':65536,'initial_life':742,'initial_waterline':760,
 'difficulty':9,'sprite_palette':5,'sprite_size':64,'sprite_count':8}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes()
metadata=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
assert metadata['writes']==[]
rows=json.loads(raw);samples=[]
for row in rows:
 e=row['enemies'][0]
 sample={'frame':row['frame']}
 for key in ['x','y','vx','vy','waterline','actor_x','actor_y']:sample[key]=e[key]/PARAMETERS['fixed_point_scale']
 for key in ['active','life','animation','variant','actor_state']:sample[key]=e[key]
 samples.append(sample)
assert samples[741]['active']==1 and samples[883]['active']==1
assert samples[898]['actor_state']==6 and samples[1002]['actor_state']==0
artbase=ROOT/PARAMETERS['art'];artrows=json.loads(Path(str(artbase)+'.trace.json').read_text(encoding='utf-8'))
artmetadata=json.loads(Path(str(artbase)+'.json').read_text(encoding='utf-8'));assert artmetadata['writes']==[]
atlas=Image.new('RGBA',(PARAMETERS['sprite_size']*PARAMETERS['sprite_count'],PARAMETERS['sprite_size']))
art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(artbase)+f'.frame{frame:05d}')
 if not Path(str(prefix)+'.sprites/objects.json').exists():
  subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 folder=Path(str(prefix)+'.sprites');objects=json.loads((folder/'objects.json').read_text(encoding='utf-8'))
 obj=next(o for o in objects if o['w']==o['h']==PARAMETERS['sprite_size'] and o['palette']==PARAMETERS['sprite_palette'] and o['x']<112)
 # OAM displays the previous actor-update animation phase.
 phase=artrows[frame-2]['enemies'][0]['animation'];assert phase not in phases;phases.add(phase)
 image=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(image,(phase*PARAMETERS['sprite_size'],0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(image.tobytes()).hexdigest()})
assert phases==set(range(PARAMETERS['sprite_count']))
hard=[];hard_sources=[]
for name in ['hard_start','hard_long','factory_start']:
 prefix=ROOT/PARAMETERS[name];recorded=Path(str(prefix)+'.trace.json').read_bytes()
 meta=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
 recorded_rows=json.loads(recorded);hard_sources.append({'kind':name,'parameters':meta,'trace_sha256':hashlib.sha256(recorded).hexdigest()})
 if name=='hard_start':
  assert recorded_rows[35]['enemies'][0]['life']==1480 and recorded_rows[35]['enemies'][0]['type']==14
  baseline=recorded_rows[1599]['enemies'][0]
  initial_ram=Path(str(prefix)+'.frame01600.ram').read_bytes()
  baseline['animationClock']=struct.unpack_from('<i',initial_ram,0x31038+0x28)[0]
 if name=='factory_start':assert recorded_rows[30]['enemies'][0]['life']==1480 and recorded_rows[30]['enemies'][0]['type']==5
 if name=='hard_long':
  for row in recorded_rows:
   e=row['enemies'][0];s={'frame':row['frame']}
   for key in ['x','y','vx','vy','waterline','actor_x','actor_y']:s[key]=e[key]/PARAMETERS['fixed_point_scale']
   for key in ['active','life','animation','variant','actor_state']:s[key]=e[key]
   hard.append(s)
fixture={'parameters':PARAMETERS,'source_parameters':metadata,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'art_source_parameters':artmetadata,'samples':samples,'art':art,
 'hard_baseline':baseline,'hard_samples':hard,'hard_sources':hard_sources,
 'limits':'Input-only eighth-stage Hard reference (difficulty 9), first-stage Hard (difficulty 5) and initial timer 1480. Other enemies and full water behavior still need validation.'}
out=ROOT/'scripts/OUTPUT'/('eggo-jumper-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-jumper-gba.json',fixture)]:
 dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'samples.csv').open('w',encoding='utf-8',newline='') as file:
 writer=csv.DictWriter(file,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
atlas.save(ROOT/'renderer/games/eggo-mania/assets/beanstalk-enemy.png')
(ROOT/'renderer/games/eggo-mania/assets/beanstalk-enemy.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
