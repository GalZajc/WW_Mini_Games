"""Extract a small, reproducible real-tower dive regression from the native tape."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'prefix':'scripts/OUTPUT/eggo-reference_2026-10-18_13-28-09_956755_run01/built-water-input',
 'start':1840,'end':2120,'actor':0x3bd4,'field':0xf404,'root':0x333c,
 'seed':'Original checkpoint state; no RAM writes or injected board events.'}
p=ROOT/PARAMETERS['prefix'];trace=json.loads(Path(str(p)+'.trace.json').read_text(encoding='utf-8'))
b=Path(str(p)+f'.frame{PARAMETERS["start"]:05d}.ram').read_bytes()
read=lambda at:struct.unpack_from('<i',b,at)[0]
initial={'actor':trace[PARAMETERS['start']-1]['native_actor_motion']['player'],
 'native_frame':read(0x11a9c),'waterline_q16':read(PARAMETERS['root']+0x87c),
 'drop_ticks':read(PARAMETERS['field']+0xebc),'config_words':trace[PARAMETERS['start']-1]['survival_config'],
 'rows':[[b[PARAMETERS['field']+0xc80+(46-y)*8+x]for x in range(7)]for y in range(47)],
 'timers':[[46-i,read(PARAMETERS['root']+0x12ac+4*i)]for i in range(47)
  if read(PARAMETERS['root']+0x12ac+4*i)>=0]}
samples=[{'frame':r['frame'],'keys':r['keys'],'actor':r['native_actor_motion']['player']}
 for r in trace[PARAMETERS['start']:PARAMETERS['end']]]
data={'parameters':PARAMETERS,'initial':initial,'samples':samples,
 'initial_ram_sha256':hashlib.sha256(b).hexdigest(),
 'native_trace_sha256':hashlib.sha256(Path(str(p)+'.trace.json').read_bytes()).hexdigest()}
out=ROOT/'scripts/OUTPUT'/('eggo-built-water-fixture_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for path,value in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',data),
 (ROOT/'tests/fixtures/eggo-built-water-gba.json',data)]:
 path.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
print(out)
