"""Preserve both first Hard skeletal fish arcs and all five native OBJ phases."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_00-54-29_430326/pirate-primary-cycle',
 'art_native':'scripts/OUTPUT/eggo-reference_2026-10-04_00-56-01_700214/pirate-primary-art',
 'baseline':'scripts/OUTPUT/eggo-reference_2026-10-04_00-53-56_238152/pirate-primary-hard.frame01500',
 'enemy_roots':[0x31038,0x310b8],'art_frames':list(range(26,35,2)),
 'sprite_size':64,'sprite_palette':5,'fixed_point_scale':65536}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
assert rows[0]['arena']['stage']==4
ram=Path(str(ROOT/PARAMETERS['baseline'])+'.ram').read_bytes();profiles=[]
for side,root in enumerate(PARAMETERS['enemy_roots']):
 b={k:struct.unpack_from('<i',ram,root+off)[0] for k,off in
  {'x':0,'y':4,'vx':0x14,'vy':0x18,'animation':0x20,'animationClock':0x28,'speedDecreaseHeight':0x3c,'active':0x48,'life':0x4c,'variant':0x50,'angle':0x54,'speed':0x58}.items()}
 samples=[]
 for row in rows:
  e=row['enemies'][side];s={'frame':row['frame'],'native_frame':row['native_frame'],'secondary_active':row['enemies'][side+2]['active']}
  for k in ['x','y','vx','vy','waterline','actor_x','actor_y','camera_y']:s[k]=e[k]/65536
  for k in ['active','life','animation','variant','actor_state','actor_next_state','animation_clock','angle','speed']:s[k]=e[k]
  samples.append(s)
 profiles.append({'side':side,'baseline':b,'samples':samples})
assert profiles[0]['samples'][24]['active']==1
assert profiles[0]['samples'][133]['active']==0 and profiles[0]['samples'][133]['life']==1050
atlas=Image.new('RGBA',(64*5,64));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(ROOT/PARAMETERS['art_native'])+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==5 and (o['x']<112 or o['x']>256))
 phase=rows[frame-2]['enemies'][0]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(5))
capture_base=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_00-54-55_984000/pirate-primary-capture'
capture_raw=Path(str(capture_base)+'.trace.json').read_bytes()
capture_meta=json.loads(Path(str(capture_base)+'.json').read_text(encoding='utf-8'));assert capture_meta['writes']==[]
capture_rows=json.loads(capture_raw)
capture=[]
for row in capture_rows:
 e=row['enemies'][0];entry={'frame':row['frame']}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:entry[k]=e[k]/65536
 for k in ['active','life','actor_state','actor_next_state','animation_clock','animation','variant','angle','speed']:entry[k]=e[k]
 capture.append(entry)
fixture={'capture':capture,'capture_parameters':capture_meta,'capture_sha256':hashlib.sha256(capture_raw).hexdigest(),'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'profiles':profiles,'art':art,'limits':'First Hard primary skeletal fish; secondary enemy and later-round difficulty remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-pirate-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-pirate-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for p in profiles:
 with (out/f'side{p["side"]}.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(p['samples'][0]));writer.writeheader();writer.writerows(p['samples'])
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'pirate-enemy.png')
(assets/'pirate-enemy.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
