"""Input-only first Hard rock flights, both sides, and their eight OBJ phases."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'profiles':[
 {'source':'scripts/OUTPUT/eggo-reference_2026-10-04_00-10-23_749797/dragon-secondary-cycle','side':0},
 {'source':'scripts/OUTPUT/eggo-reference_2026-10-04_00-02-41_224044/dragon-primary-hard','side':1}],
 'art':'scripts/OUTPUT/eggo-reference_2026-10-04_00-15-35_182918/dragon-secondary-visible-art',
 'art_frames':[1,6,11,16,21,26,31,36],'art_initial_phase':5,'sprite_size':32,'sprite_palette':9}
profiles=[]
for p in PARAMETERS['profiles']:
 base=ROOT/p['source'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
 first=next(i for i,r in enumerate(rows) if r['enemies'][p['side']+2]['active'])
 samples=[]
 for row in rows[first:]:
  e=row['enemies'][p['side']+2];s={'frame':row['frame'],'primary_active':row['enemies'][p['side']]['active']}
  for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:s[k]=e[k]/65536
  for k in ['active','life','animation','variant','actor_state','actor_next_state','animation_clock','angle','speed']:s[k]=e[k]
  samples.append(s)
 assert any(not s['active'] and s['life']==1050 for s in samples)
 profiles.append({'side':p['side'],'baseline':samples[0],'samples':samples[1:],
  'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest()})
artbase=ROOT/PARAMETERS['art'];arttrace=json.loads(Path(str(artbase)+'.trace.json').read_text(encoding='utf-8'))
artmeta=json.loads(Path(str(artbase)+'.json').read_text(encoding='utf-8'));assert artmeta['writes']==[]
atlas=Image.new('RGBA',(32*8,32));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(artbase)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==32 and o['h']==32 and o['palette']==9 and o['x']<112)
 phase=PARAMETERS['art_initial_phase'] if frame==1 else arttrace[frame-2]['enemies'][2]['animation']
 assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*32,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(8))
fixture={'parameters':PARAMETERS,'profiles':profiles,'art_source_parameters':artmeta,'art':art,
 'limits':'Both first Hard rock flights from recorded spawn. Exact internal spawn anchor during water recovery/throw remains open; flight, damage geometry and rest are measured.'}
out=ROOT/'scripts/OUTPUT'/('eggo-dragon-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-dragon-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for p in profiles:
 with (out/f'side{p["side"]}.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(p['samples'][0]));writer.writeheader();writer.writerows(p['samples'])
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'dragon-secondary.png')
(assets/'dragon-secondary.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
