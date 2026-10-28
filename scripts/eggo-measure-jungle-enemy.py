"""Preserve the naturally selected first Survival/Hard jungle hazard and OBJ art."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'native':'scripts/OUTPUT/eggo-reference_2026-10-03_23-27-46_067694/jungle-hard-enemy',
 'art':'scripts/OUTPUT/eggo-reference_2026-10-03_23-29-53_007795/jungle-enemy-art',
 'moved':'scripts/OUTPUT/eggo-reference_2026-10-03_23-32-11_463662/jungle-move-between-jumps',
 'baseline_frame':1500,'art_frames':[1,6,11,16,21,26,31,36],
 'art_initial_phase':0,'sprite_width':32,'sprite_height':64,'sprite_palette':5,
 'fixed_point_scale':65536,'actor_root':0x3bd4,'enemy_root':0x31038}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes()
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
rows=json.loads(raw)
assert rows[23]['arena']['stage']==6
baseline=rows[PARAMETERS['baseline_frame']-1]['enemies'][0].copy()
ram=Path(str(base)+f'.frame{PARAMETERS["baseline_frame"]:05d}.ram').read_bytes()
baseline['animationClock']=struct.unpack_from('<i',ram,PARAMETERS['enemy_root']+0x28)[0]
samples=[]
for row in rows[PARAMETERS['baseline_frame']:]:
 e=row['enemies'][0];s={'frame':row['frame']-PARAMETERS['baseline_frame']}
 for key in ['x','y','vx','vy','waterline','actor_x','actor_y']:s[key]=e[key]/PARAMETERS['fixed_point_scale']
 for key in ['active','life','animation','variant','actor_state']:s[key]=e[key]
 samples.append(s)
assert samples[180]['actor_state']==6 and samples[180]['life']==20
assert any(not s['active'] and s['life']==1050 for s in samples)
artbase=ROOT/PARAMETERS['art'];arttrace=json.loads(Path(str(artbase)+'.trace.json').read_text(encoding='utf-8'))
artmeta=json.loads(Path(str(artbase)+'.json').read_text(encoding='utf-8'));assert artmeta['writes']==[]
atlas=Image.new('RGBA',(PARAMETERS['sprite_width']*8,PARAMETERS['sprite_height']));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(artbase)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==PARAMETERS['sprite_width'] and o['h']==PARAMETERS['sprite_height'] and o['palette']==PARAMETERS['sprite_palette'] and o['x']<112)
 phase=PARAMETERS['art_initial_phase'] if frame==1 else arttrace[frame-2]['enemies'][0]['animation']
 assert phase not in phases;phases.add(phase)
 image=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(image,(phase*PARAMETERS['sprite_width'],0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(image.tobytes()).hexdigest()})
assert phases==set(range(8))
movebase=ROOT/PARAMETERS['moved'];moveraw=Path(str(movebase)+'.trace.json').read_bytes()
movemeta=json.loads(Path(str(movebase)+'.json').read_text(encoding='utf-8'));assert movemeta['writes']==[]
moved_initial=rows[1599]['enemies'][0].copy()
moveram=Path(str(base)+'.frame01600.ram').read_bytes()
moved_initial['animationClock']=struct.unpack_from('<i',moveram,PARAMETERS['enemy_root']+0x28)[0]
moved_samples=[]
for row in json.loads(moveraw):
 e=row['enemies'][0];s={'frame':row['frame']}
 for key in ['x','y','vx','vy','waterline','actor_x','actor_y']:s[key]=e[key]/PARAMETERS['fixed_point_scale']
 for key in ['active','life','animation','variant','actor_state']:s[key]=e[key]
 moved_samples.append(s)
assert moved_samples[72]['x']==moved_initial['x']/65536
assert moved_samples[-1]['actor_x']!=moved_initial['actor_x']/65536
assert not any(s['actor_state']==6 for s in moved_samples)
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'baseline':baseline,'samples':samples,'art_source_parameters':artmeta,'art':art,
 'moved_baseline':moved_initial,'moved_samples':moved_samples,'moved_source_parameters':movemeta,'moved_trace_sha256':hashlib.sha256(moveraw).hexdigest(),
 'limits':'First-stage Hard primary jungle hazard. Bite-specific actor poses/audio, secondary hazards and subsequent-round difficulty remain uncalibrated.'}
out=ROOT/'scripts/OUTPUT'/('eggo-jungle-enemy-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-jungle-enemy-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'samples.csv').open('w',encoding='utf-8',newline='') as file:
 writer=csv.DictWriter(file,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
atlas.save(ROOT/'renderer/games/eggo-mania/assets/jungle-enemy.png')
(ROOT/'renderer/games/eggo-mania/assets/jungle-enemy.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
