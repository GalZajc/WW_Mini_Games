"""Native four-draw creation and complete 320-step field preparation."""
from pathlib import Path
from datetime import datetime
import json,hashlib,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'spawn_source':'scripts/OUTPUT/eggo-reference_2026-10-04_02-25-35_013307/factory-pickup-bags',
 'prefill_source':'scripts/OUTPUT/eggo-reference_2026-10-04_02-30-40_574913/factory-pickup-prefill',
 'reset_frame':39,'ready_frame':45,'fixed_point_scale':65536,'prefill_steps':320}
sources={};births=[]
for label in ['spawn_source','prefill_source']:
 base=ROOT/PARAMETERS[label];raw=Path(str(base)+'.trace.json').read_bytes();meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 assert meta['writes']==[];sources[label]={'parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest(),'rows':json.loads(raw)}
data=sources['spawn_source'];previous={'pickups':data['parameters']['pickup_initial'],'arena':data['parameters']['arena_initial']}
for row in data['rows']:
 for side in [0,1]:
  before=previous['pickups'][side];after=row['pickups'][side]
  if before['spawn_clock']!=0:continue
  for item in after['items']:
   if any(old['address']==item['address'] for old in before['items']):continue
   returned=[i['kind'] for i in before['items'] if i['state']==2 and not any(n['address']==i['address'] for n in after['items'])]
   births.append({'frame':row['frame'],'native_frame':row['native_frame'],'side':side,
    'seed':previous['arena']['rng_secondary' if side else 'rng_game'],
    'bag':before['bag'],'remaining':before['remaining'],'clock':after['spawn_clock'],
    'after_bag':after['bag'],'after_remaining':after['remaining'],'returned_kinds':returned,
    'waterline':row['enemies'][side]['waterline']/65536,'item':item})
 previous=row
prefill=sources['prefill_source']['rows'];reset=prefill[PARAMETERS['reset_frame']-1];ready=prefill[PARAMETERS['ready_frame']-1]
assert reset['pickups'][0]['items']==[]
angles=[]
angle_base=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-04_02-09-36_941624/jungle-native-drop-long'
for ram in sorted(angle_base.parent.glob(angle_base.name+'.frame*.ram')):
 data=ram.read_bytes();angles.append({'source':str(ram.relative_to(ROOT)),'sha256':hashlib.sha256(data).hexdigest(),'frame':struct.unpack_from('<i',data,0x11a9c)[0],'angle':struct.unpack_from('<i',data,0x30ea0)[0]})
fixture={'angle_samples':angles,'parameters':PARAMETERS,'sources':{k:{kk:vv for kk,vv in v.items() if kk!='rows'} for k,v in sources.items()},
 'births':births,'prefill':{'seed':reset['arena']['rng_game'],'expected_seed':ready['arena']['rng_game'],'expected':ready['pickups'][0],
 'native_frame':ready['native_frame'],'waterline':ready['enemies'][0]['waterline']/65536},
 'intro_samples':[{'frame':r['frame'],'native_frame':r['native_frame'],'seed':r['arena']['rng_game'],'pickups':r['pickups'][0]} for r in prefill[PARAMETERS['ready_frame']-1:]],
 'limits':'Input-only first Hard field setup and 17 ordinary creation events; CPU/discard-created items excluded by their spawn clock. Later difficulty tables remain separate.'}
out=ROOT/'scripts/OUTPUT'/('eggo-pickup-bags_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest in [out/'parameters.json',ROOT/'tests/fixtures/eggo-pickup-bags-gba.json']:dest.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
print(out,'births',len(births))
