"""Preserve an input-only park bird arc and its native OBJ animation."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, struct, subprocess, sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-27-42_922078/park-hard',
 'art_native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-29-35_328878/park-secondary-art',
 'spawn_frame':696,'last_frame':797,'side':1,'enemy_root':0x311b8,'art_frames':[710,715,720,725,730,735,740,745],
 'sprite_size':64,'sprite_palette':9,'fixed_point_scale':65536,
 'theft':'scripts/OUTPUT/eggo-reference_2026-10-04_01-37-09_187661/park-secondary-theft-probe'}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
samples=[]
for row in rows[PARAMETERS['spawn_frame']-1:PARAMETERS['last_frame']]:
 e=row['enemies'][3];s={'frame':row['frame'],'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
 for k in ['active','life','variant','angle','speed','animation','animation_clock','actor_state','actor_inventory']:s[k]=e[k]
 samples.append(s)
left_samples=[]
for row in rows[1784:1844]:
 e=row['enemies'][2];s={'frame':row['frame'],'primary_active':row['enemies'][0]['active']}
 for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
 for k in ['active','life','variant','angle','speed','animation','animation_clock','actor_state','actor_inventory']:s[k]=e[k]
 left_samples.append(s)
left_turn_y=left_samples[0]['actor_y']-148
ram=Path(str(ROOT/PARAMETERS['art_native'])+'.frame00696.ram').read_bytes()
turn_y=struct.unpack_from('<i',ram,PARAMETERS['enemy_root']+0x3c)[0]/65536
assert turn_y==samples[0]['actor_y']-148
assert samples[-1]['active']==0 and samples[-1]['life']==850
atlas=Image.new('RGBA',(64*8,64));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(ROOT/PARAMETERS['art_native'])+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==9)
 phase=rows[frame-2]['enemies'][3]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(8))
theft_base=ROOT/PARAMETERS['theft'];theft_raw=Path(str(theft_base)+'.trace.json').read_bytes()
theft_meta=json.loads(Path(str(theft_base)+'.json').read_text(encoding='utf-8'));theft=[]
for row in json.loads(theft_raw):
 e=row['enemies'][3];s={'frame':row['frame'],'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
 for k in ['active','life','variant','angle','speed','animation','animation_clock','actor_state','actor_inventory']:s[k]=e[k]
 theft.append(s)
assert theft[4]['actor_inventory']==5 and theft[5]['actor_inventory']==-1 and theft[5]['life']==50
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'turn_y':turn_y,'samples':samples,'left_samples':left_samples,'left_turn_y':left_turn_y,'art':art,
 'theft_probe':theft,'theft_parameters':theft_meta,'theft_sha256':hashlib.sha256(theft_raw).hexdigest(),
 'limits':'First input-only park bird arcs on both sides; separate logged actor-position/inventory probe confirms theft timing. Dropped-item ballistic flight and internal throw anchors remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-park-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-park-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'flight.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'park-secondary.png')
(assets/'park-secondary.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
