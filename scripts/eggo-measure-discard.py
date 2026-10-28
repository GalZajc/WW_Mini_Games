"""Compare input-only R discards with native pickup motion and protection."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'scale':65536,'sources':[
 {'prefix':'scripts/OUTPUT/eggo-reference_2026-10-04_02-43-21_923026/native-discard-idle','frame':1,'actor_vx':0},
 {'prefix':'scripts/OUTPUT/eggo-reference_2026-10-04_02-47-20_306692/native-discard-moving','frame':9,'actor_vx':2}],
 'discard_x':8,'discard_y':24,'discard_vy':4,'protection_frames':30}
profiles=[]
for source in PARAMETERS['sources']:
 base=ROOT/source['prefix'];raw=Path(str(base)+'.trace.json').read_bytes();rows=json.loads(raw)
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert meta['writes']==[]
 first=rows[source['frame']-1]
 item=next(i for i in first['pickups'][0]['items'] if i['wait']==29)
 actor=first['enemies'][0]
 samples=[]
 for row in rows[source['frame']-1:]:
  pickup=next((i for i in row['pickups'][0]['items'] if i['address']==item['address']),None)
  if pickup is None:break
  samples.append({'frame':row['frame'],'waterline':row['enemies'][0]['waterline']/PARAMETERS['scale'],**pickup})
 profiles.append({'source_parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),
  'initial':{'actor_x':actor['actor_x']/65536,'actor_y':actor['actor_y']/65536,
   'actor_vx':source['actor_vx'],'kind':item['kind'],'variant':item['variant']},'samples':samples})
catch_source=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_02-11-59_749510/factory-native-pickups'
catch_raw=Path(str(catch_source)+'.trace.json').read_bytes();catch_rows=json.loads(catch_raw);catches=[]
for previous,current in zip(catch_rows,catch_rows[1:]):
 if current['frame']<100:continue # Exclude setup/reset inventory placeholders.
 for side in [0,1]:
  actor=current['enemies'][side]
  if previous['enemies'][side]['actor_inventory']!=-1 or actor['actor_inventory']<0:continue
  removed=[i for i in previous['pickups'][side]['items'] if i['kind']==actor['actor_inventory'] and not any(j['address']==i['address'] for j in current['pickups'][side]['items'])]
  if len(removed)!=1:continue
  catches.append({'frame':current['frame'],'side':side,'actor_x':actor['actor_x'],'actor_y':actor['actor_y'],
    'waterline':actor['waterline'],'item':removed[0]})
assert len(catches)==9
fixture={'parameters':PARAMETERS,'profiles':profiles,'catches':catches,
 'catch_source_parameters':json.loads(Path(str(catch_source)+'.json').read_text(encoding='utf-8')),
 'catch_trace_sha256':hashlib.sha256(catch_raw).hexdigest(),
 'limits':'Two input-only ordinary-piece discards and nine natural catches. Bomb reset is independently derived from ROM, not a measured discarded-bomb re-catch sequence.'}
out=ROOT/'scripts/OUTPUT'/('eggo-discard_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-discard-gba.json',fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for index,profile in enumerate(profiles):
 with (out/f'discard-{index}.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=profile['samples'][0].keys());writer.writeheader();writer.writerows(profile['samples'])
print(out)
