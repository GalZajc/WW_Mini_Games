"""Native linked-list item motion: natural spawn and an enemy's dropped item."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'sources':[
 {'prefix':'scripts/OUTPUT/eggo-reference_2026-10-04_02-11-59_749510/factory-native-pickups','first_frame':102,'side':0,'address':14172,'kind':1,'variant':2},
 {'prefix':'scripts/OUTPUT/eggo-reference_2026-10-04_02-09-36_941624/jungle-native-drop-long','first_frame':24,'side':1,'address':19264,'kind':5,'variant':0}],
 'theft_probe':'scripts/OUTPUT/eggo-reference_2026-10-04_02-01-33_228002/jungle-secondary-theft-probe',
 'fixed_point_scale':65536,'gravity':0x400,'air_drag':0xfc00,'water_drag':0xf800,
 'air_right_edge':95,'water_turn_depth':12,'water_gravity':0x2000,'buoyancy':0x4000,
 'water_horizontal_force':0x400,'water_midpoint':47,'exit_left':-16,'exit_right':127}
profiles=[]
for source in PARAMETERS['sources']:
 base=ROOT/source['prefix'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
 samples=[];departure=None
 for row in rows[source['first_frame']-1:]:
  item=next((i for i in row['pickups'][source['side']]['items'] if i['address']==source['address']),None)
  if item is None:departure=row['frame'];break
  assert item['kind']==source['kind'] and item['variant']==source['variant']
  s={'frame':row['frame'],'waterline':row['enemies'][source['side']]['waterline']/65536}
  for key in ['x','y','vx','vy']:s[key]=item[key]/65536
  s['state']=item['state'];samples.append(s)
 assert len(samples)>400 and departure is not None
 profiles.append({'parameters':source,'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),'samples':samples,'departure_frame':departure})
drop=profiles[1];rows=json.loads(Path(str(ROOT/PARAMETERS['sources'][1]['prefix'])+'.trace.json').read_text(encoding='utf-8'))
enemy=rows[drop['samples'][0]['frame']-1]['enemies'][3]
drop['initial']={'x':enemy['x']/65536+8,'y':enemy['y']/65536+16,'vx':0,'vy':-2,'state':1}
probe=ROOT/PARAMETERS['theft_probe']
drop['theft_probe_parameters']=json.loads(Path(str(probe)+'.json').read_text(encoding='utf-8'))
drop['enemy_baseline']=json.loads(Path(str(probe)+'.trace.json').read_text(encoding='utf-8'))[29]['enemies'][3]
drop['enemy_samples']=[{'frame':r['frame'],**r['enemies'][3]} for r in rows[:24]]
fixture={'parameters':PARAMETERS,'profiles':profiles,'limits':'Air/water motion and disappearance for one input-only factory item and one logged enemy-theft probe. Pickup scheduling and CPU actions remain separate.'}
out=ROOT/'scripts/OUTPUT'/('eggo-pickup-motion_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-pickup-motion-gba.json',fixture)]:dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for i,profile in enumerate(profiles):
 with (out/f'flight-{i}.csv').open('w',encoding='utf-8',newline='') as file:
  writer=csv.DictWriter(file,fieldnames=profile['samples'][0].keys());writer.writeheader();writer.writerows(profile['samples'])
print(out)
