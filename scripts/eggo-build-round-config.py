from pathlib import Path
from datetime import datetime
import struct,json,hashlib,csv
root=Path.cwd();rom=Path('C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba').read_bytes()
params={'rom_sha256':hashlib.sha256(rom).hexdigest(),'table':0xd74b0,'difficulty_stride':608,'round_stride':76,'words':19,
 'waterline_offset':0x3bb8,'waterline_scale':65536,'native_frame_offset':0x11a9c,
 'water_start_frame_offset':0x78,'water_rise_speed_raw_offset':0x5a3c,'water_rate_word_index':15,
 'board_offset':0x10084,'board_field_stride':0x124c,'board_rows':47,'board_columns':7,'board_row_stride':8,
 'pickup_offsets':[0x1c,0x30,0x38,0x2c,0x34,0x24,0x28,0x20,0x10,8,0xc,0x14,0x18]}
tables=[[list(struct.unpack_from('<19i',rom,params['table']+d*608+r*76)) for r in range(8)] for d in range(3)]
fixture=json.loads((root/'tests/fixtures/eggo-stage-backgrounds-gba.json').read_text(encoding='utf-8'));sources=[]
for round,stage in enumerate([{'stage':'factory','source':'scripts/OUTPUT/eggo-reference_2026-10-04_02-11-59_749510/factory-native-pickups'}]+fixture['stages'],1):
 p=root/stage['source'];raw=Path(str(p)+'.ram').read_bytes();meta=json.loads(Path(str(p)+'.json').read_text(encoding='utf-8'));actual=list(struct.unpack_from('<19i',raw,0xe928));assert actual==tables[2][round-1],(round,actual)
 waterline_raw=struct.unpack_from('<i',raw,params['waterline_offset'])[0]
 native_frame=struct.unpack_from('<i',raw,params['native_frame_offset'])[0]
 start_frame=struct.unpack_from('<i',raw,params['water_start_frame_offset'])[0]
 rise_speed_raw=struct.unpack_from('<i',raw,params['water_rise_speed_raw_offset'])[0]
 rate=actual[params['water_rate_word_index']]
 assert start_frame==max(1100,1900-40*rate),(round,start_frame,rate)
 assert rise_speed_raw==-(0x8000+0x2000*rate),(round,rise_speed_raw,rate)
 sources.append({'round':round,'stage':stage['stage'],'parameters':meta,'ram_sha256':hashlib.sha256(raw).hexdigest(),
  'config':actual,'native_frame':native_frame,'native_waterline_raw':waterline_raw,
  'native_waterline_y':waterline_raw/params['waterline_scale'],'water_start_frame':start_frame,
  'water_rise_speed_raw':rise_speed_raw})
ninth_base=root/'scripts/OUTPUT/eggo-reference_2026-10-04_10-46-53_164366/survival-ninth-config'
ninth_rows=json.loads(Path(str(ninth_base)+'.trace.json').read_text(encoding='utf-8'))
before,after=ninth_rows[32:34]
def step(seed):
 product=seed*75;high=product>>16;low=product&65535
 return (product-high-(high<=low))&65535
# Two setup draws precede the two configuration draws in this continuation.
selection_seed=step(step(before['arena']['rng']))
difficulty_draw=step(selection_seed);level_draw=step(difficulty_draw)
difficulty=difficulty_draw%3;level=level_draw%7+2
expected=list(tables[difficulty][level-1]);expected[18]=max(10,expected[18])
if expected[17]%5==2 and expected[17]<=46:expected[17]+=1
assert expected==after['survival_config']
ninth={'parameters':json.loads(Path(str(ninth_base)+'.json').read_text(encoding='utf-8')),
 'trace_sha256':hashlib.sha256(Path(str(ninth_base)+'.trace.json').read_bytes()).hexdigest(),
 'selection_seed':selection_seed,'difficulty':difficulty,'level':level,'words':expected,'frame':after['frame']}
round9_raw=(root/'tests/artifacts/eggo-reference/round9.ram').read_bytes()
assert list(struct.unpack_from('<19i',round9_raw,0xe928))==expected
ninth['native_frame']=struct.unpack_from('<i',round9_raw,params['native_frame_offset'])[0]
ninth['native_waterline_raw']=struct.unpack_from('<i',round9_raw,params['waterline_offset'])[0]
ninth['native_initial_waterline_y']=ninth['native_waterline_raw']/params['waterline_scale']
ninth['water_start_frame']=struct.unpack_from('<i',round9_raw,params['water_start_frame_offset'])[0]
ninth['water_rise_speed_raw']=struct.unpack_from('<i',round9_raw,params['water_rise_speed_raw_offset'])[0]
rate=expected[params['water_rate_word_index']]
assert ninth['water_start_frame']==max(1100,1900-40*rate)
assert ninth['water_rise_speed_raw']==-(0x8000+0x2000*rate)
fields=[]
for field in range(2):
 base=params['board_offset']+field*params['board_field_stride']
 cells=[[round9_raw[base+y*params['board_row_stride']+x] for x in range(params['board_columns'])]
  for y in range(params['board_rows'])]
 fields.append({'ram_rows':cells,'occupied_cells':sum(value!=0 for row in cells for value in row),
  'complete_rows':sum(all(row) for row in cells)})
ninth['initial_board']={'ram_row_order':'ascending RAM row index','fields':fields}
ninth['ram_sha256']=hashlib.sha256(round9_raw).hexdigest()

def rng_transition(folder,name,round_number,expected_sites):
 base=root/folder/name;trace_path=Path(str(base)+'.trace.json')
 trace=json.loads(trace_path.read_text(encoding='utf-8'))
 metadata=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 assert metadata['writes']==[] and metadata['global_rng_call_trace_parameters']
 before=next(row for row in trace if row['frame']==33)
 after=next(row for row in trace if row['frame']==34)
 sites=metadata['global_rng_call_trace_parameters']['call_sites']
 deltas=[{'site':site['call_site'],'count':after['global_rng_call_counts'][site['id']]-before['global_rng_call_counts'][site['id']]}
  for site in sites if after['global_rng_call_counts'][site['id']]>before['global_rng_call_counts'][site['id']]]
 assert {entry['site'] for entry in deltas}==set(expected_sites),(round_number,deltas)
 assert all(entry['count']==1 for entry in deltas),(round_number,deltas)
 before_state={'global_rng':before['arena']['rng'],'field_rng':[stream['state'] for stream in before['field_rng']],
  'config':before['survival_config']}
 after_state={'global_rng':after['arena']['rng'],'field_rng':[stream['state'] for stream in after['field_rng']],
  'config':after['survival_config']}
 expected_field_seed=step(step(before_state['global_rng']))
 assert after_state['field_rng']==[expected_field_seed,expected_field_seed],(round_number,after_state)
 expected_global=expected_field_seed
 if round_number>8:expected_global=step(step(expected_global))
 assert after_state['global_rng']==expected_global,(round_number,after_state,expected_global)
 return {'round':round_number,'source':str(base.relative_to(root)).replace('\\','/'),
  'input':{'load':metadata['load'],'steps':metadata['steps'],'writes':metadata['writes'],
   'initial_state_sha256':metadata['initial_state_sha256'],'rom_sha256':metadata['rom_sha256'],
   'trace_sha256':hashlib.sha256(trace_path.read_bytes()).hexdigest(),
   'instrumentation':metadata['global_rng_call_trace_parameters']},
  'before':before_state,'after':after_state,'rng_call_deltas':deltas}

rng_transitions={'round8':rng_transition('scripts/OUTPUT/eggo-reference_2026-10-05_13-27-07_650874',
 'rng-round8-callers',8,['0x0800194c','0x08002222']),
 'round9':rng_transition('scripts/OUTPUT/eggo-reference_2026-10-05_13-28-26_984797',
 'rng-round9-callers',9,['0x0800194c','0x08002222','0x080022a8','0x080022b4'])}
data={'parameters':params,'tables':tables,'sources':sources,'ninth':ninth,'rng_transitions':rng_transitions,
 'limits':'Later-stage snapshots descend from logged win probes. Verify configuration, not successful input-only wins or full difficulty effects.'}
out=root/'scripts/OUTPUT'/('eggo-survival-config_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for dest,obj in [(out/'parameters.json',params),(out/'measurements.json',data),(root/'tests/fixtures/eggo-survival-config-gba.json',data)]:dest.write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8')
(root/'renderer/games/eggo-mania/assets/native-rounds.js').write_text('// ROM 0x080d74b0: three difficulties, eight configurations, 19 words each.\nexport const NATIVE_ROUNDS='+json.dumps(tables)+';\n',encoding='utf-8')
with (out/'config.csv').open('w',encoding='utf-8',newline='') as file:
 w=csv.writer(file);w.writerow(['difficulty','round']+[hex(i*4) for i in range(19)])
 for d,table in enumerate(tables):
  for r,config in enumerate(table,1):w.writerow([d,r]+config)
print(out)
