"""Preserve input-only native drop-through trajectories for gameplay checks."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,csv
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'profiles':[
 {'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-36-06_737656/dive-single','held_frames':1},
 {'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-40-41_511959/dive-held','held_frames':20}],
 'frames':20,'actor':0x3bd4,'board':0xf404,'cell_offset':0xc80,
 'drop_counter_offset':0xebc,'rows':47,'columns':7,'stride':8,
 'fixed_scale':65536,'tile_pixels':16,'fixture':'tests/fixtures/eggo-dive-gba.json'}
profiles=[];records=[]
for profile in PARAMETERS['profiles']:
 prefix=ROOT/profile['source'];meta=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf-8'))
 assert not meta['writes'],'Only ordinary-input captures are allowed'
 first=Path(str(prefix)+'.frame00001.ram').read_bytes()
 word=lambda b,offset:struct.unpack_from('<i',b,offset)[0]
 initial_y=word(first,PARAMETERS['actor']+4)/PARAMETERS['fixed_scale']
 board=[[first[PARAMETERS['board']+PARAMETERS['cell_offset']+(46-y)*8+x]
  for x in range(7)] for y in range(47)]
 while board and not any(board[-1]):board.pop()
 samples=[]
 for frame in range(1,PARAMETERS['frames']+1):
  ram=Path(str(prefix)+f'.frame{frame:05}.ram').read_bytes()
  sample={'frame':frame,'world_y':word(ram,PARAMETERS['actor']+4)/65536,
   'velocity':word(ram,PARAMETERS['actor']+0x18)/65536,
   'drop_ticks':word(ram,PARAMETERS['board']+PARAMETERS['drop_counter_offset'])}
  samples.append(sample);records.append({'profile':profile['source'],**sample})
 profiles.append({**profile,'source_parameters':meta,'source_ram_sha256':hashlib.sha256(first).hexdigest(),
  'initial_y':initial_y,'initial_x':(word(first,PARAMETERS['actor'])/65536+16)/16,
  'rows':board,'samples':samples})
fixture={'parameters':PARAMETERS,'profiles':profiles,
 'limits':'Two roof drop-through captures, first twenty frames before water entry. Water recovery has its separate native fixture.'}
out=ROOT/'scripts/OUTPUT'/('eggo-dive_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'trajectory.csv').open('w',encoding='utf-8',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=list(records[0]));writer.writeheader();writer.writerows(records)
print(out)
