"""Preserve input-only jungle secondary flights and original OBJ artwork."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, struct, subprocess, sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-58-00_447339/jungle-secondary-hard',
 'art_native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-58-51_689169/jungle-secondary-art',
 'flights':[[675,796],[1646,1744]],'side':1,'enemy_root':0x311b8,
 'art_frames':[5,10],'art_frame_bias':700,'sprite_size':32,'sprite_palette':9,'fixed_point_scale':65536,
 'theft':'scripts/OUTPUT/eggo-reference_2026-10-04_02-01-33_228002/jungle-secondary-theft-probe'}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
flights=[]
for first,last in PARAMETERS['flights']:
 samples=[]
 for row in rows[first-1:last]:
  e=row['enemies'][3];s={'frame':row['frame'],'primary_active':row['enemies'][1]['active']}
  for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
  for k in ['active','life','variant','angle','speed','animation','animation_clock','actor_state','actor_inventory']:s[k]=e[k]
  samples.append(s)
 assert samples[-1]['active']==0 and samples[-1]['life']==850
 flights.append({'baseline':rows[first-2]['enemies'][3],'turn_y':samples[0]['actor_y']-132,'samples':samples})
atlas=Image.new('RGBA',(32*2,32));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(ROOT/PARAMETERS['art_native'])+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==32 and o['h']==32 and o['palette']==9)
 phase=rows[PARAMETERS['art_frame_bias']+frame-2]['enemies'][3]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*32,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(2))
theft_base=ROOT/PARAMETERS['theft'];theft_raw=Path(str(theft_base)+'.trace.json').read_bytes()
theft_meta=json.loads(Path(str(theft_base)+'.json').read_text(encoding='utf-8'));theft=[]
for row in json.loads(theft_raw):
 e=row['enemies'][3];s={'frame':row['frame'],'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
 for k in ['active','life','variant','angle','speed','animation','animation_clock','actor_state','actor_inventory']:s[k]=e[k]
 theft.append(s)
assert theft[0]['actor_inventory']==-1 and theft[0]['life']==50
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),'flights':flights,'art':art,
 'theft_probe':theft,'theft_parameters':theft_meta,'theft_sha256':hashlib.sha256(theft_raw).hexdigest(),
 'limits':'Two full input-only right flights and logged theft probe. Global scheduling and drop ballistics remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-jungle-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-jungle-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'flight.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(flights[0]['samples'][0]));writer.writeheader()
 for flight in flights:writer.writerows(flight['samples'])
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'jungle-secondary.png')
(assets/'jungle-secondary.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
