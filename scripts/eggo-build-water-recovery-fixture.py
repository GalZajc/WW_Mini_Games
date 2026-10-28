"""Preserve the independently emulated water and buried-gap trajectories."""
from pathlib import Path
from datetime import datetime
import json, hashlib, struct,argparse
ROOT=Path(__file__).resolve().parents[1]
creature_art=json.loads((ROOT/'renderer/games/eggo-mania/assets/water-creature-phases.json').read_text(encoding='utf-8'))
profiles=[{'name':'empty','height':0,'prefix':'scripts/OUTPUT/eggo-reference_2026-10-17_18-29-43_758186/water-recovery-audit'}]
parser=argparse.ArgumentParser();parser.add_argument('--stack-manifest',default='scripts/OUTPUT/eggo-water-recovery_2026-10-17_18-39-35_046586/captures.json');args=parser.parse_args()
profiles+=json.loads((ROOT/args.stack_manifest).read_text(encoding='utf-8'))
for profile in profiles:
 base=ROOT/profile['prefix'];trace_path=Path(str(base)+'.trace.json');trace=json.loads(trace_path.read_text(encoding='utf-8'))
 profile['initial']={'x':(trace[0]['world_x']+16)/16,'y':(720-trace[0]['world_y'])/16,'velocity':0}
 profile['samples']=[{'frame':row['frame'],'keys':row['keys'],**row['native_actor_motion']['player']} for row in trace]
 for index,sample in enumerate(profile['samples']):
  sample['camera_before_q16']=trace[max(0,index-1)]['native_cameras']['player']['camera_position_q16']
  sample['camera_after_q16']=trace[index]['native_cameras']['player']['camera_position_q16']
  ram_path=Path(str(base)+f'.frame{sample["frame"]:05d}.ram')
  if ram_path.exists():
   ram=ram_path.read_bytes();offset=0x30eb8
   sample['animation']={key:struct.unpack_from('<i',ram,0x3bd4+delta)[0]
    for key,delta in [('selector',0x854),('phase',0x85c),('step',0x860)]}
   sample['creature']={'x':struct.unpack_from('<i',ram,offset)[0],
    'y':struct.unpack_from('<i',ram,offset+4)[0],
    'velocity':struct.unpack_from('<i',ram,offset+0x28)[0],
    'active':bool(ram[offset+0x30]),'carrying':bool(ram[offset+0x31]),
    'counter':struct.unpack_from('<i',ram,offset+0x38)[0],'fade':bool(ram[offset+0x3c]),
    'splashed':bool(ram[offset+0x3d])}
  graphics_prefix=Path(str(base)+f'.frame{sample["frame"]:05d}')
  oam_path=Path(str(graphics_prefix)+'.0x7000000')
  if oam_path.exists():
   oam=oam_path.read_bytes();vram=Path(str(graphics_prefix)+'.memory3').read_bytes()
   for object_index in range(128):
    a0,a1,a2=struct.unpack_from('<HHH',oam,object_index*8)
    if a0&0xff00 or a1>>14!=3 or a2&0xfc00!=0x2800:continue
    start=0x10000+(a2&1023)*32;digest=hashlib.sha256(vram[start:start+2048]).hexdigest()
    matching=[f['frame'] for f in creature_art['frames'] if f['raw_sha256']==digest]
    if matching:sample['creature_draw']={'x':a1&511,'y':a0&255,'frames':matching}
 profile['source_parameters']=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 profile['trace_sha256']=hashlib.sha256(trace_path.read_bytes()).hexdigest()
parameters={'experiment':'Native water-recovery regression fixture','frames':sum(len(p['samples']) for p in profiles),
 'limits':'Empty case uses ordinary inputs. Stack cases log all diagnostic RAM writes; each row has a separate owner.',
 'random_seed':'Stored in original checkpoint and source parameters','generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
fixture={'parameters':parameters,'profiles':profiles}
out=ROOT/'scripts/OUTPUT'/('eggo-water-fixture_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for target in [out/'measurement.json',ROOT/'tests/fixtures/eggo-water-recovery-gba.json']:
 target.write_text(json.dumps(fixture,separators=(',',':'))+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
print(out)
