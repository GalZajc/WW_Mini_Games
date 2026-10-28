"""Preserve the first Hard pirate thief flight, theft and OBJ phases."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_00-53-56_238152/pirate-primary-hard','side':1,'spawn_frame':718,'last_frame':944,'art_frames':[750,755,760,765,770,775,780,785],'sprite_size':32,'art_native':'scripts/OUTPUT/eggo-reference_2026-10-04_00-57-26_180188/pirate-secondary-art','sprite_palette':9,'fixed_point_scale':65536}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
samples=[]
for row in rows[PARAMETERS['spawn_frame']-1:PARAMETERS['last_frame']]:
 e=row['enemies'][3]
 record={'frame':row['frame'],'native_frame':row['native_frame'],'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:record[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory','speed']:record[k]=e[k]
 samples.append(record)
assert samples[0]['active']==1 and samples[-1]['active']==0 and samples[-1]['life']==1075
atlas=Image.new('RGBA',(32*8,32));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(ROOT/PARAMETERS['art_native'])+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==32 and o['h']==32 and o['palette']==9)
 phase=rows[frame-2]['enemies'][3]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*32,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(8))
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),'samples':samples,'art':art,'limits':'Right first Hard flight and native inventory theft; internal throw spawn anchor and left flight remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-pirate-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-pirate-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'flight.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'pirate-secondary.png')
(assets/'pirate-secondary.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
