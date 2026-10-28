"""Compare deterministic input-only audio profiles; do not assume a sound ID."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,wave
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'reference':'scripts/OUTPUT/eggo-reference_2026-10-03_16-54-05_065921/audio-neutral',
 'profiles':[
  'scripts/OUTPUT/eggo-reference_2026-10-03_17-00-13_381159/audio-jump-earlier',
  'scripts/OUTPUT/eggo-reference_2026-10-03_16-54-05_063004/audio-jump',
  'scripts/OUTPUT/eggo-reference_2026-10-03_16-56-17_622960/audio-jump-later'],
 'format':'stereo signed 16-bit PCM','classification':'unclassified jump-input difference'}
out=ROOT/'scripts/OUTPUT'/('eggo-audio-differences_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
def load(path):
 base=ROOT/path;meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 assert meta['writes']==[]
 with wave.open(str(base)+'.wav') as w:
  assert w.getnchannels()==2 and w.getsampwidth()==2
  rate=w.getframerate();pcm=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).astype('i4')
 return base,meta,pcm,rate
_,reference,baseline,rate=load(PARAMETERS['reference']);results=[]
for path in PARAMETERS['profiles']:
 base,meta,pcm,sample_rate=load(path)
 assert sample_rate==rate and pcm.shape==baseline.shape
 assert meta['initial_state_sha256']==reference['initial_state_sha256']
 assert meta['rom_sha256']==reference['rom_sha256'] and meta['core_sha256']==reference['core_sha256']
 delta=pcm-baseline;indices=np.flatnonzero(np.any(delta!=0,axis=1))
 assert abs(delta).max()<=32767,'Cannot write an unclipped difference as int16'
 with wave.open(str(out/(base.name+'.difference.wav')),'wb') as w:
  w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes(delta.astype('<i2').tobytes())
 trace=json.loads(Path(str(base)+'.trace.json').read_text(encoding='utf-8'))
 neutral_trace=json.loads(Path(str(ROOT/PARAMETERS['reference'])+'.trace.json').read_text(encoding='utf-8'))
 row={'name':base.name,'different_samples':int(len(indices)),
      'first_different_sample':int(indices[0]) if len(indices) else None,
      'last_different_sample':int(indices[-1]) if len(indices) else None,
      'peak_difference':int(abs(delta).max()),
      'jump_motion_confirmed':any(abs(a['world_y']-b['world_y'])>1 for a,b in zip(trace,neutral_trace)),
      'difference_pcm_sha256':hashlib.sha256(delta.astype('<i2').tobytes()).hexdigest(),
      'source_parameters':meta}
 assert row['jump_motion_confirmed'];results.append(row)
assert results[0]['different_samples']>0 and results[1]['different_samples']>0
assert results[2]['different_samples']==0
manifest={'parameters':PARAMETERS,'reference_parameters':reference,'sample_rate':rate,'results':results,
 'limits':'Two jump times change audio; a third real jump does not. No universal jump sound asset is validated or installed.'}
(out/'measurement.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
with (out/'summary.csv').open('w',encoding='utf-8',newline='') as f:
 fields=['name','different_samples','first_different_sample','last_different_sample','peak_difference','jump_motion_confirmed']
 writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows({k:r[k] for k in fields} for r in results)
print(out)
