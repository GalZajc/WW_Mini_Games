"""Measure the original beanstalk thief's complete first right visit."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-48-16_085387/beanstalk-secondary-hard',
 'art_native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-49-29_944920/beanstalk-secondary-art',
 'side':1,'first_frame':675,'last_frame':1013,'art_frames':[105,110,115,120],'art_frame_bias':700,
 'vine_frame':900,'sprite_size':32,'sprite_palette':9,'fixed_point_scale':65536,
 'theft':'scripts/OUTPUT/eggo-reference_2026-10-04_01-52-50_777739/beanstalk-secondary-theft-probe'}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
samples=[]
for row in rows[PARAMETERS['first_frame']-1:PARAMETERS['last_frame']]:
 e=row['enemies'][3];s={'frame':row['frame'],'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory','speed']:s[k]=e[k]
 samples.append(s)
assert samples[0]['active']==1 and samples[-1]['active']==0 and samples[-1]['life']==850
atlas=Image.new('RGBA',(32*4,32));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(ROOT/PARAMETERS['art_native'])+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==32 and o['h']==32 and o['palette']==9)
 phase=rows[PARAMETERS['art_frame_bias']+frame-2]['enemies'][3]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*32,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(4))
prefix=Path(str(base)+f'.frame{PARAMETERS["vine_frame"]:05d}');folder=Path(str(prefix)+'.sprites')
obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==8 and o['h']==32 and o['palette']==9)
vine=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA')
vine_meta={'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(vine.tobytes()).hexdigest()}
theft_base=ROOT/PARAMETERS['theft'];theft_raw=Path(str(theft_base)+'.trace.json').read_bytes();theft_meta=json.loads(Path(str(theft_base)+'.json').read_text(encoding='utf-8'));theft=[]
for row in json.loads(theft_raw):
 e=row['enemies'][3];s={'frame':row['frame'],'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory','speed']:s[k]=e[k]
 theft.append(s)
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),'samples':samples,'art':art,'vine':vine_meta,
 'theft_probe':theft,'theft_parameters':theft_meta,'theft_sha256':hashlib.sha256(theft_raw).hexdigest(),
 'limits':'Input-only first right visit plus logged actor-position/inventory theft probe. Internal throwing/water-recovery anchors and later round progression remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-beanstalk-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-beanstalk-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'flight.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'beanstalk-secondary.png');vine.save(assets/'beanstalk-secondary-vine.png')
(assets/'beanstalk-secondary.json').write_text(json.dumps({'art':art,'vine':vine_meta},indent=2)+'\n',encoding='utf-8')
print(out)
