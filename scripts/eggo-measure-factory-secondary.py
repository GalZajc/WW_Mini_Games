"""Preserve the first Hard factory robot flight, its native RNG and OBJ phases."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-02-18_089841/factory-secondary-hard','side':1,'spawn_frame':696,'last_frame':1095,'art_frames':[750,769,1026,1030,1034,1038],'pose_probes':{'15':'scripts/OUTPUT/eggo-reference_2026-10-04_01-07-43_153253/factory-pose-15','14':'scripts/OUTPUT/eggo-reference_2026-10-04_01-07-43_232428/factory-pose-14','13':'scripts/OUTPUT/eggo-reference_2026-10-04_01-07-43_279543/factory-pose-13'},'art_native':'scripts/OUTPUT/eggo-reference_2026-10-04_01-04-57_298757/factory-secondary-art','wing_frames':[750,751,752,753],'sprite_size':64,'sprite_palette':9,'fixed_point_scale':65536}
base=ROOT/PARAMETERS['native'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
samples=[]
def random_step(s):
 p=s*75;h=p>>16;l=p&65535;return (p-h-(h<=l))&65535
for row in rows[PARAMETERS['spawn_frame']-1:PARAMETERS['last_frame']]:
 e=row['enemies'][3];previous=rows[row['frame']-2]
 record={'frame':row['frame'],'native_frame':row['native_frame'],'random_value':random_step(previous['arena']['rng_secondary']),'primary_active':row['enemies'][1]['active']}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:record[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory','speed']:record[k]=e[k]
 samples.append(record)
assert samples[0]['active']==1 and samples[-1]['active']==0 and samples[-1]['life']==1075
atlas=Image.new('RGBA',(64*16,64));art=[];phases=set()
for frame in PARAMETERS['art_frames']:
 prefix=Path(str(ROOT/PARAMETERS['art_native'])+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==9)
 phase=rows[frame-2]['enemies'][3]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
pose_parameters={}
for wanted,source in PARAMETERS['pose_probes'].items():
 probe_base=ROOT/source;probe_rows=json.loads(Path(str(probe_base)+'.trace.json').read_text(encoding='utf-8'))
 phase=probe_rows[0]['enemies'][3]['animation'];assert phase==int(wanted)
 prefix=Path(str(probe_base)+'.frame00002');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==9)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0));phases.add(phase)
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest(),'diagnostic':True})
 pose_parameters[wanted]=json.loads(Path(str(probe_base)+'.json').read_text(encoding='utf-8'))
left_art_base=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_01-17-58_571146/factory-secondary-left-art'
left_motion=json.loads(Path('scripts/OUTPUT/eggo-reference_2026-10-04_01-12-27_634183/factory-secondary-left.trace.json').read_text(encoding='utf-8'))
for frame in [187,190,225,229,237,247,297]:
 prefix=Path(str(left_art_base)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 obj=next(o for o in json.loads((folder/'objects.json').read_text(encoding='utf-8')) if o['w']==64 and o['h']==64 and o['palette']==9)
 phase=left_motion[frame-2]['enemies'][2]['animation'];assert phase not in phases;phases.add(phase)
 im=Image.open(folder/f'{obj["id"]:03d}.png').convert('RGBA');atlas.paste(im,(phase*64,0))
 art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'object':obj,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert phases==set(range(16))
def wing_previous(trace,side,clock=0,phase=0):
 result={}
 for row in trace:
  result[row['frame']]=phase;e=row['enemies'][side+2]
  if e['active']:
   clock-=0x44000-2*e['vy']
   if clock<=0:clock=0x80000;phase=(phase+1)&7
 return result
initial_ram=Path(str(base)+'.ram').read_bytes()
left_clock,left_phase=struct.unpack_from('<ii',initial_ram,0x31138+0x74)
right_wing_previous=wing_previous(rows,1)
left_wing_previous=wing_previous(left_motion,0,left_clock,left_phase)
wings=Image.new('RGBA',(64*8,16));wing_art=[];wing_phases=set()
wing_sources=[(ROOT/PARAMETERS['art_native'],frame,1) for frame in [750,769,1026,1030,1034]]+[(ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_01-20-46_270376/factory-secondary-wing4',216,0)]+[(left_art_base,frame,0) for frame in [211,213]]
for source,frame,side in wing_sources:
 prefix=Path(str(source)+f'.frame{frame:05d}');folder=Path(str(prefix)+'.sprites')
 if not (folder/'objects.json').exists():subprocess.run([sys.executable,str(ROOT/'scripts/eggo-decode-reference.py'),str(prefix)],check=True,capture_output=True)
 objects=json.loads((folder/'objects.json').read_text(encoding='utf-8'))
 body=next(o for o in objects if o['w']==64 and o['h']==64 and o['palette']==9)
 parts=[o for o in objects if o['w']==32 and o['h']==16 and o['palette']==9];assert len(parts)==2
 phase=(right_wing_previous if side else left_wing_previous)[frame];assert phase not in wing_phases;wing_phases.add(phase)
 im=Image.new('RGBA',(64,16))
 for part in parts:im.paste(Image.open(folder/f'{part["id"]:03d}.png').convert('RGBA'),((part['x']-body['x'])%512,0))
 wings.paste(im,(phase*64,0));wing_art.append({'phase':phase,'source':str(prefix.relative_to(ROOT)),'objects':parts,'pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
assert wing_phases==set(range(8))
left_base=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_01-12-27_634183/factory-secondary-left'
left_raw=Path(str(left_base)+'.trace.json').read_bytes();left_rows=json.loads(left_raw)
left_meta=json.loads(Path(str(left_base)+'.json').read_text(encoding='utf-8'));assert left_meta['writes']==[]
left_samples=[]
initial_game_seed=struct.unpack_from('<I',Path(str(base)+'.ram').read_bytes(),0x11ab0)[0]
for row in left_rows[:357]:
 e=row['enemies'][2];previous=left_rows[row['frame']-2] if row['frame']>1 else rows[-1]
 record={'frame':row['frame'],'native_frame':row['native_frame'],'random_value':random_step(previous['arena']['rng_game'] if row['frame']>1 else initial_game_seed),'primary_active':row['enemies'][0]['active']}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:record[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory','speed']:record[k]=e[k]
 left_samples.append(record)
left_baseline={k:rows[-1]['enemies'][2][k]/65536 if k in ['x','y','vx','vy'] else rows[-1]['enemies'][2][k] for k in ['x','y','vx','vy','active','life','animation','animation_clock']}
left_baseline.update({'wingClock':left_clock/65536,'wingPhase':left_phase,'poseForward':bool(initial_ram[0x31138+0x7c])})
native_graphics={}
for frame in [1,50,100,150,200,250,300,350]:
 source=ROOT/f'scripts/OUTPUT/eggo-reference_2026-10-04_01-10-26_265571/factory-secondary-left.frame{frame:05d}.ram'
 ram=source.read_bytes();clock,phase=struct.unpack_from('<ii',ram,0x31138+0x74)
 native_graphics[frame]={'wingClock':clock/65536,'wingPhase':phase,'poseForward':bool(ram[0x31138+0x7c]),'source':str(source.relative_to(ROOT)),'sha256':hashlib.sha256(ram).hexdigest()}
probe_base=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_01-22-05_278132/factory-secondary-theft-probe'
probe_raw=Path(str(probe_base)+'.trace.json').read_bytes();probe_rows=json.loads(probe_raw);probe_meta=json.loads(Path(str(probe_base)+'.json').read_text(encoding='utf-8'));probe=[]
for row in probe_rows:
 e=row['enemies'][3];previous=probe_rows[row['frame']-2] if row['frame']>1 else rows[749]
 record={'frame':row['frame'],'random_value':random_step(previous['arena']['rng_secondary'])}
 for k in ['x','y','vx','vy','waterline','actor_x','actor_y']:record[k]=e[k]/65536
 for k in ['active','life','animation','animation_clock','actor_state','actor_inventory']:record[k]=e[k]
 probe.append(record)
assert probe[0]['life']==50 and probe[0]['actor_inventory']==-1
right_ram=Path(str(base)+'.frame00750.ram').read_bytes();clock,phase=struct.unpack_from('<ii',right_ram,0x311b8+0x74)
right_graphics={'wingClock':clock/65536,'wingPhase':phase,'poseForward':bool(right_ram[0x311b8+0x7c])}
fixture={'theft_probe':probe,'theft_seed':rows[749]['arena']['rng_secondary'],'theft_graphics':right_graphics,'theft_parameters':probe_meta,'theft_sha256':hashlib.sha256(probe_raw).hexdigest(),'native_graphics':native_graphics,'left_samples':left_samples,'left_baseline':left_baseline,'left_parameters':left_meta,'left_sha256':hashlib.sha256(left_raw).hexdigest(),'pose_parameters':pose_parameters,'parameters':PARAMETERS,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),'samples':samples,'art':art,'wing_art':wing_art,'limits':'Right first Hard flight from recorded spawn; Global RNG consumption, internal throwing pursuit/spawn anchors and theft audio remain open; left continuation has no throw states.'}
out=ROOT/'scripts/OUTPUT'/('eggo-factory-secondary-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-factory-secondary-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'flight.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'factory-secondary.png')
wings.save(assets/'factory-secondary-wings.png')
(assets/'factory-secondary.json').write_text(json.dumps(art,indent=2)+'\n',encoding='utf-8')
print(out)
