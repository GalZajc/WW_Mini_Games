"""Preserve the ROM-backed factory bubble motion, escape timer and four OBJ frames."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'native':'scripts/OUTPUT/eggo-reference_2026-10-03_22-46-53_584720/bubble-native-profile',
 'escape':'scripts/OUTPUT/eggo-reference_2026-10-03_22-50-53_849084/bubble-escape-profile',
 'art':[
  ['scripts/OUTPUT/eggo-reference_2026-10-03_22-46-53_584720/bubble-native-profile.frame00401.sprites',24],
  ['scripts/OUTPUT/eggo-reference_2026-10-03_22-50-53_843548/bubble-art.frame00066.sprites',26],
  ['scripts/OUTPUT/eggo-reference_2026-10-03_22-46-53_584720/bubble-native-profile.frame00112.sprites',26],
  ['scripts/OUTPUT/eggo-reference_2026-10-03_22-46-53_584720/bubble-native-profile.frame00399.sprites',24]],
 'fixed_point_scale':65536,'waterline':760,'initial_life':61,
 'spawn_frame':61,'capture_frame':113,'release_frame':405,'escape_release_frame':272,
 'escape_initial_animation_clock':3}
fixture={'parameters':PARAMETERS,'sources':[]}
for name in ['native','escape']:
 base=ROOT/PARAMETERS[name]
 raw=Path(str(base)+'.trace.json').read_bytes()
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 assert meta['writes']==([[22452,-1]] if name=='native' else [])
 rows=json.loads(raw)
 fixture['sources'].append({'kind':name,'parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest()})
 samples=[]
 for row in rows:
  e=row['enemies'][0]
  sample={'frame':row['frame'],'nativeFrame':row['native_frame']}
  for k in ['x','y','vx','vy','actor_x','actor_y']:sample[k]=e[k]/PARAMETERS['fixed_point_scale']
  for k in ['active','life','animation','escape_counter','actor_state']:sample[k]=e[k]
  samples.append(sample)
 fixture[name]=samples
assert fixture['native'][112]['actor_state']==6
assert fixture['native'][404]['actor_state']==0
assert fixture['escape'][270]['actor_state']==6 and fixture['escape'][271]['actor_state']==0
atlas=Image.new('RGBA',(256,64));art=[]
for phase,(source,number) in enumerate(PARAMETERS['art']):
 folder=ROOT/source
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['id']==number)
 assert obj['w']==obj['h']==64 and obj['palette']==5
 image=Image.open(folder/f'{number:03d}.png').convert('RGBA')
 atlas.paste(image,(phase*64,0))
 art.append({'phase':phase,'source':source,'object':obj,'pixel_sha256':hashlib.sha256(image.tobytes()).hexdigest()})
fixture['art']=art
fixture['limits']='Native-size factory Survival/Hard. Native frame phase depends on menu timing; the local game uses its reproducible seed phase. Wider/taller custom fields adapt the native movement bounds.'
out=ROOT/'scripts/OUTPUT'/('eggo-bubble-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-bubble-gba.json',fixture)]:
 dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for name in ['native','escape']:
 with (out/f'{name}.csv').open('w',encoding='utf-8',newline='') as file:
  writer=csv.DictWriter(file,fieldnames=list(fixture[name][0]));writer.writeheader();writer.writerows(fixture[name])
atlas.save(ROOT/'renderer/games/eggo-mania/assets/electric-bubble.png')
(ROOT/'renderer/games/eggo-mania/assets/electric-bubble.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
