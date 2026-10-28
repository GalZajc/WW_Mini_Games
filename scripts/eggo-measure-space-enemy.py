"""Preserve input-only first Hard space enemy timing, contact and original OBJ art."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'native':'scripts/OUTPUT/eggo-reference_2026-10-03_23-44-24_642735/space-primary-art',
 'baseline':'scripts/OUTPUT/eggo-reference_2026-10-03_23-36-49_077052/space-hard-enemy.frame01500',
 'art_frames':list(range(29,114,7)),'sprite_size':64,'sprite_palette':5,
 'enemy_root':0x31038,'fixed_point_scale':65536,'hit_offset_address':0x170}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
ram=Path(str(ROOT/PARAMETERS['baseline'])+'.ram').read_bytes()
baseline={k:struct.unpack_from('<i',ram,PARAMETERS['enemy_root']+off)[0] for k,off in
 {'x':0,'y':4,'vx':0x14,'vy':0x18,'animation':0x20,'animationClock':0x28,'active':0x48,'life':0x4c,'variant':0x50}.items()}
samples=[]
for row in rows:
 e=row['enemies'][0];s={'frame':row['frame']}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:s[k]=e[k]/PARAMETERS['fixed_point_scale']
 for k in ['active','life','animation','variant','actor_state','actor_inventory','hit_flash','animation_clock']:s[k]=e[k]
 samples.append(s)
assert samples[27]['active']==1 and samples[27]['life']==182
assert samples[209]['active']==0 and samples[209]['life']==1150
assert any(s['hit_flash']==25 for s in samples)
atlas=Image.new('RGBA',(PARAMETERS['sprite_size']*13,PARAMETERS['sprite_size']));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(base)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==5 and o['x']<112)
 phase=rows[frame-2]['enemies'][0]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(13))
offsets=list(struct.unpack_from('<13i',ram,PARAMETERS['hit_offset_address']))
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'baseline':baseline,'samples':samples,'hit_offsets':offsets,'art':art,
 'limits':'Primary first Hard hazard only. Secondary projectile, sound and subsequent-round difficulty remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-space-enemy-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-space-enemy-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'samples.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
atlas.save(ROOT/'renderer/games/eggo-mania/assets/space-enemy.png')
(ROOT/'renderer/games/eggo-mania/assets/space-enemy.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
