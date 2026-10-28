"""Original space missile cycles and fixed-point sine table, without gameplay RAM writes."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-03_23-50-29_101264/space-secondary-cycle',
 'baseline':'scripts/OUTPUT/eggo-reference_2026-10-03_23-36-49_077052/space-hard-enemy.frame01700',
 'contact':'scripts/OUTPUT/eggo-reference_2026-10-03_23-58-41_265411/space-secondary-contact-probe',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'sine_offset':0xd8550,'sine_count':1024,'enemy_roots':[0x31138,0x311b8],
 'art_frames':[175,180,185],'sprite_size':64,'sprite_palette':9,'fixed_point_scale':65536}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
ram=Path(str(ROOT/PARAMETERS['baseline'])+'.ram').read_bytes();profiles=[]
for side,root in enumerate(PARAMETERS['enemy_roots']):
 baseline={k:struct.unpack_from('<i',ram,root+off)[0] for k,off in
  {'x':0,'y':4,'vx':0x14,'vy':0x18,'animation':0x20,'animationClock':0x28,'active':0x48,'life':0x4c,'variant':0x50,'angle':0x54,'speed':0x58}.items()}
 samples=[]
 for row in rows:
  e=row['enemies'][side+2];s={'frame':row['frame'],'primary_active':row['enemies'][side]['active']}
  for k in ['x','y','vx','vy','waterline','actor_x','actor_y','camera_y']:s[k]=e[k]/65536
  for k in ['active','life','animation','variant','actor_state','actor_next_state','animation_clock','angle','speed']:s[k]=e[k]
  samples.append(s)
 profiles.append({'side':side,'baseline':baseline,'samples':samples})
assert profiles[0]['samples'][9]['active']==1
assert profiles[0]['samples'][213]['active']==0 and profiles[0]['samples'][213]['life']==850
rom=Path(PARAMETERS['rom']).read_bytes();sine=list(struct.unpack_from('<1024i',rom,PARAMETERS['sine_offset']))
atlas=Image.new('RGBA',(64*3,64));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(base)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==9 and o['x']>256)
 phase=rows[frame-2]['enemies'][2]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(3))
contactbase=ROOT/PARAMETERS['contact'];contactraw=Path(str(contactbase)+'.trace.json').read_bytes()
contactmeta=json.loads(Path(str(contactbase)+'.json').read_text(encoding='utf-8'))
assert contactmeta['writes']==[[15316,0],[15320,39321600],[15340,0]]
contact=[]
for row in json.loads(contactraw):
 e=row['enemies'][2];contact.append({'frame':row['frame'],'actor_y':e['actor_y']/65536,
  'actor_state':e['actor_state'],'actor_next_state':e['actor_next_state']})
assert contact[0]['actor_next_state']==7
fixture={'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
 'rom_sha256':hashlib.sha256(rom).hexdigest(),'profiles':profiles,'art':art,
 'contact_samples':contact,'contact_source_parameters':contactmeta,'contact_trace_sha256':hashlib.sha256(contactraw).hexdigest(),
 'limits':'First Hard space secondary flights on both sides. Water-recovery spawn anchor, other stage enemies and later round difficulty remain open. Contact probe changes only actor X/Y/vertical velocity; it is a diagnostic, not an input-only replay.'}
out=ROOT/'scripts/OUTPUT'/('eggo-space-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-space-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for profile in profiles:
 with (out/f'side{profile["side"]}.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(profile['samples'][0]));writer.writeheader();writer.writerows(profile['samples'])
assets=ROOT/'renderer/games/eggo-mania/assets'
atlas.save(assets/'space-secondary.png');(assets/'space-secondary.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
(assets/'native-sine.js').write_text('// ROM 0x080d8550: signed 16.16 samples, one every four angle units.\nexport const NATIVE_SINE=Object.freeze('+json.dumps(sine,separators=(',',':'))+');\n',encoding='utf-8')
print(out)
