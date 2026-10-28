"""Preserve the park primary's input-only flight, native capture and sprites."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, struct, subprocess, sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-27-42_922078/park-hard',
 'side':0,'first_frame':1526,'last_frame':1785,'right_first_frame':1588,'right_last_frame':1847,
 'offset_source_frame':1600,'hit_offsets_address':0x1a4,'sprite_width':64,'sprite_height':128,'sprite_palette':5,
 'sprite_origin_y':65,'art_native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-43-34_086046/park-primary-art',
 'art_frames':[1575+4*i for i in range(17)]+[1643],
 'fixed_point_scale':65536}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
def sample(row,side=0):
 e=row['enemies'][side];s={'frame':row['frame'],'native_frame':row['native_frame'],'secondary_active':row['enemies'][side+2]['active'],
  'previous_waterline':rows[row['frame']-2]['enemies'][side]['waterline']/65536}
 for k in ['x','y','vx','vy','actor_x','actor_y','waterline']:s[k]=e[k]/65536
 for k in ['active','life','variant','angle','speed','animation','animation_clock','actor_state','actor_next_state','actor_inventory']:s[k]=e[k]
 return s
baseline=sample(rows[PARAMETERS['first_frame']-2]);samples=[sample(row) for row in rows[PARAMETERS['first_frame']-1:PARAMETERS['last_frame']]]
ram=Path(str(base)+f'.frame{PARAMETERS["offset_source_frame"]:05d}.ram').read_bytes()
offsets=list(struct.unpack_from('<18i',ram,PARAMETERS['hit_offsets_address']))
right_baseline=sample(rows[PARAMETERS['right_first_frame']-2],1)
right_samples=[sample(row,1) for row in rows[PARAMETERS['right_first_frame']-1:PARAMETERS['right_last_frame']]]
atlas=Image.new('RGBA',(64*18,128*2));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(ROOT/PARAMETERS['art_native'])+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 objects=[o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['palette']==5 and (o['x']<112 or o['x']>=448)]
 phase=rows[frame-2]['enemies'][0]['animation'];assert phase not in phases;phases.add(phase)
 head=next(o for o in objects if o['w']==32 and o['h']==16)
 body=next(o for o in objects if o['w']==64 and o['h']==32)
 neck=sorted([o for o in objects if o['w']==16 and o['h']==32],key=lambda o:o['y']) if phase else []
 assert len(neck)==(2 if phase else 0)
 record={'phase':phase,'source':str(prefix.relative_to(ROOT)),'objects':[]}
 for o in [body,*neck,head]:
  im=Image.open(folder/f'{o["id"]:03d}.png').convert('RGBA')
  record['objects'].append({'object':o,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
  positive_x=0 if o==body else 23 if o==head else 27
  negative_x=0 if o==body else 13 if o==head else 22
  y=65 if o==body else 65-offsets[phase] if o==head else 14+32*neck.index(o)
  # Captured left-field duck moves right: OAM already mirrors all parts.
  atlas.alpha_composite(im,(phase*64+positive_x,y))
  atlas.alpha_composite(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT),(phase*64+negative_x,128+y))
 art.append(record)
assert phases==set(range(18))
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'baseline':baseline,'samples':samples,'right_baseline':right_baseline,'right_samples':right_samples,'hit_offsets':offsets,'art':art,
 'limits':'Input-only first Hard visits on both sides, including left native actor capture. Special captured actor art/audio and later-round progression remain open.'}
out=ROOT/'scripts/OUTPUT'/('eggo-park-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-park-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'flight.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'park-enemy.png')
(assets/'park-enemy.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
