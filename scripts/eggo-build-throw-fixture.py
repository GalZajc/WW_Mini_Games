"""Preserve an ordinary-input throw trace and its native target coordinates."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, struct
ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {'source':'scripts/OUTPUT/eggo-reference_2026-10-03_01-40-12_808881/camera-throw',
 'actor':0x3bd4,'target_x':0x8bc,'target_y':0x8c0,'frames':28,
 'fixed_scale':65536,'seed':'preserved in source save state',
 'fixture':'tests/fixtures/eggo-throw-gba.json'}
prefix=ROOT/PARAMETERS['source']
meta=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf-8'))
assert not meta['writes'], 'Requires an ordinary-input capture'
trace_path=Path(str(prefix)+'.trace.json')
samples=json.loads(trace_path.read_text(encoding='utf-8'))[:PARAMETERS['frames']]
ram_path=Path(str(prefix)+'.frame00004.ram');ram=ram_path.read_bytes()
word=lambda offset:struct.unpack_from('<i',ram,PARAMETERS['actor']+offset)[0]/PARAMETERS['fixed_scale']
PARAMETERS['source_parameters']=meta
PARAMETERS['source_hashes']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [trace_path,ram_path]}
fixture={'parameters':PARAMETERS,'start_x':samples[0]['world_x'],'start_y':samples[0]['world_y'],
 'target_x':word(PARAMETERS['target_x']),'target_y':word(PARAMETERS['target_y']),
 'kind':6,'rotation':0,'samples':samples,
 'limits':'One ordinary-input throw on an empty tower; this does not establish every actor state or moving-board target update.'}
graphics=[]
for frame in range(4,29,4):
 snapshot=Path(str(prefix)+f'.frame{frame:05}.ram');data=snapshot.read_bytes()
 oam_path=Path(str(prefix)+f'.frame{frame:05}.0x7000000');oam=oam_path.read_bytes()
 read=lambda offset:struct.unpack_from('<i',data,PARAMETERS['actor']+offset)[0]/PARAMETERS['fixed_scale']
 graphics.append({'frame':frame,'x':read(0x8a0),'y':read(0x8a4),'scale':read(0x8ac),
  'matrix':struct.unpack_from('<h',oam,32+6)[0]})
 PARAMETERS['source_hashes'][str(snapshot.relative_to(ROOT))]=hashlib.sha256(data).hexdigest()
 PARAMETERS['source_hashes'][str(oam_path.relative_to(ROOT))]=hashlib.sha256(oam).hexdigest()
fixture['graphics']=graphics
out=ROOT/'scripts/OUTPUT'/('eggo-throw_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'trajectory.csv').open('w',encoding='utf-8',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
print(out)
