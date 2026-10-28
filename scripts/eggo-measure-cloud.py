"""Preserve paired cloud hit/control trajectories and the native hit-state evidence."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'hit':'scripts/OUTPUT/eggo-reference_2026-10-03_19-06-59_360101/cloud-jump-hit',
 'control':'scripts/OUTPUT/eggo-reference_2026-10-03_19-06-59_380095/cloud-jump-control',
 'bubble_control':'scripts/OUTPUT/eggo-reference_2026-10-03_19-02-43_365219/cloud-removed-control',
 'pixels_per_cell':16,'jump_frame':72,'float_frames':[71,99],
 'counter_address':0x10378,'state_address':0x4448,
 'snapshot_frames':[85,86,87,100,120],
 'cloud_x':5,'cloud_y':3.5,'first_hit_frame':86,
 'pulse_counters':[[201,192],[137,128],[73,64]],
 'hit_radius_pixels':20,'strict_bounds':True,
 'rom_routines':{'create':'0x080041b4','advance':'0x0801add0','hit_box':'0x080049ec','hit_state':'0x0800f634'}}
sources=[];traces={};states={}
for kind in ['hit','control','bubble_control']:
 base=ROOT/PARAMETERS[kind]
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 raw=Path(str(base)+'.trace.json').read_bytes()
 traces[kind]=json.loads(raw)
 if kind=='hit':assert meta['writes']==[]
 else:assert meta['writes']==[[0x57b4,-1]],'Control removes CPU inventory only'
 sources.append({'kind':kind,'parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest()})
 if kind=='bubble_control':
  ram=Path(str(base)+'.frame00113.ram').read_bytes()
  assert struct.unpack_from('<i',ram,PARAMETERS['counter_address'])[0]==0
  assert struct.unpack_from('<i',ram,PARAMETERS['state_address'])[0]==6
  continue
 states[kind]={}
 for frame in PARAMETERS['snapshot_frames']:
  ram=Path(str(base)+f'.frame{frame:05d}.ram').read_bytes()
  states[kind][frame]=struct.unpack_from('<i',ram,PARAMETERS['state_address'])[0]
 assert states[kind][85]==0
 assert states[kind][86]==(7 if kind=='hit' else 0)
baseline=traces['hit'][0]['world_y'];x=traces['hit'][0]['world_x']
samples=[]
for a,b in zip(traces['hit'],traces['control']):
 assert a['frame']==b['frame']
 if a['frame']<88:assert a['world_x']==b['world_x'] and a['world_y']==b['world_y']
 if a['frame']>=70:samples.append({'frame':a['frame'],
  'hit_height_pixels':baseline-a['world_y'],'control_height_pixels':baseline-b['world_y'],
  'hit_state':states['hit'].get(a['frame']),'control_state':states['control'].get(a['frame'])})
fixture={'parameters':PARAMETERS,'initial_x':(x+16)/16,'samples':samples,'sources':sources,
 'limits':'Paired jump tests and cloud timer/hit box. State 6 in the no-cloud control is an independent environmental electric bubble; its behavior is not implemented by this fixture.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cloud-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
for dest in [out/'measurements.json',ROOT/'tests/fixtures/eggo-cloud-gba.json']:
 dest.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
with (out/'samples.csv').open('w',encoding='utf-8',newline='') as file:
 writer=csv.DictWriter(file,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
print(out)
