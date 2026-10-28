"""Preserve the first Hard castle thief flight, its native RNG and OBJ phases."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_00-30-00_135681/castle-secondary-hard','side':1,'spawn_frame':699,'last_frame':1098,'art_frames':[750,758,766,774],'sprite_size':64,'sprite_palette':9,'fixed_point_scale':65536}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
samples=[]
def random_step(s):
 p=s*75;h=p>>16;l=p&65535;return (p-h-(h<=l))&65535
for row in rows[PARAMETERS['spawn_frame']-1:PARAMETERS['last_frame']]:
 e=row['enemies'][3];previous=rows[row['frame']-2]
 record={'frame':row['frame'],'random_value':random_step(previous['arena']['rng_secondary']),'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:record[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory']:record[k]=e[k]
 samples.append(record)
assert samples[0]['active']==1 and samples[-1]['active']==0 and samples[-1]['life']==1075
atlas=Image.new('RGBA',(64*4,64));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(base)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==9)
 phase=rows[frame-2]['enemies'][3]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(4))
probe_base=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_00-50-29_366258/castle-secondary-theft-probe'
probe_raw=Path(str(probe_base)+'.trace.json').read_bytes();probe_meta=json.loads(Path(str(probe_base)+'.json').read_text(encoding='utf-8'))
probe_rows=json.loads(probe_raw);probe=[]
for row in probe_rows:
 e=row['enemies'][3];previous=probe_rows[row['frame']-2] if row['frame']>1 else rows[749]
 record={'frame':row['frame'],'random_value':random_step(previous['arena']['rng_secondary'])}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:record[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory']:record[k]=e[k]
 probe.append(record)
assert probe[0]['life']==50 and probe[0]['actor_inventory']==-1
fixture={'theft_seed':rows[749]['arena']['rng_secondary'],'theft_probe':probe,'theft_parameters':probe_meta,'theft_sha256':hashlib.sha256(probe_raw).hexdigest(),'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),'samples':samples,'art':art,'limits':'Right first Hard flight from recorded spawn; shared global RNG, internal throwing spawn anchor, original theft audio and left flight remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-castle-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-castle-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'flight.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'castle-secondary.png')
(assets/'castle-secondary.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
