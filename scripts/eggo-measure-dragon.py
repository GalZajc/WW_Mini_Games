"""Preserve both first Hard dragon arcs and all thirteen native OBJ phases."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_00-04-40_074729/dragon-primary-cycle',
 'baseline':'scripts/OUTPUT/eggo-reference_2026-10-04_00-02-41_224044/dragon-primary-hard.frame01500',
 'enemy_roots':[0x31038,0x310b8],'art_frames':list(range(28,89,5)),
 'sprite_size':32,'sprite_palette':5,'fixed_point_scale':65536}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
assert rows[0]['arena']['stage']==2
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
assert profiles[0]['samples'][26]['active']==1
assert profiles[0]['samples'][135]['active']==0 and profiles[0]['samples'][135]['life']==1250
atlas=Image.new('RGBA',(32*13,32));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(base)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==32 and o['h']==32 and o['palette']==5 and (o['x']<112 or o['x']>256))
 phase=rows[frame-2]['enemies'][0]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*32,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(13))
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'profiles':profiles,'art':art,'limits':'First Hard primary dragon; secondary enemy and later-round difficulty remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-dragon-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-dragon-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for p in profiles:
 with (out/f'side{p["side"]}.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(p['samples'][0]));writer.writeheader();writer.writerows(p['samples'])
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'dragon-enemy.png')
(assets/'dragon-enemy.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
