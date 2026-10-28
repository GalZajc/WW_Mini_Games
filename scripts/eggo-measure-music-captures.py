"""Document native music-only captures and their actual observed arenas."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,wave
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'sound_option_evidence':'scripts/OUTPUT/eggo-reference_2026-10-03_17-42-58_897743/native-sound-choice2.png',
 'profiles':[
  {'arena':'castle','avatar':'Funky','source':'scripts/OUTPUT/eggo-reference_2026-10-03_17-46-16_900821/factory-music-only','frame':1800},
  {'arena':'park','avatar':'Yolko','source':'scripts/OUTPUT/eggo-reference_2026-10-03_17-49-23_772224/yolko-factory-music','frame':1400}],
 'rms_interval_seconds':5,'mode':'Survival','difficulty':'Hard','sound_option':'NO SFX'}
out=ROOT/'scripts/OUTPUT'/('eggo-music-captures_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
measurements=[];rows=[]
for profile in PARAMETERS['profiles']:
 base=ROOT/profile['source'];source=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 assert source['writes']==[] and source['audio']['sample_rate']==32768
 with wave.open(str(base)+'.wav') as w:
  rate=w.getframerate();pcm=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2)
 nonzero=np.flatnonzero(np.any(pcm!=0,axis=1))
 image=Path(str(base)+f'.frame{profile["frame"]:05d}.png')
 measurements.append({'profile':profile,'source_parameters':source,
  'arena_frame_sha256':hashlib.sha256(image.read_bytes()).hexdigest(),
  'first_sound_seconds':float(nonzero[0]/rate),'last_sound_seconds':float(nonzero[-1]/rate),
  'duration_seconds':float(len(pcm)/rate),'peak':int(abs(pcm.astype('i4')).max())})
 for start in range(0,len(pcm),rate*PARAMETERS['rms_interval_seconds']):
  chunk=pcm[start:min(start+rate,len(pcm))].astype('f8')
  rows.append({'arena':profile['arena'],'seconds':start/rate,'rms':float(np.sqrt(np.mean(chunk*chunk)))})
manifest={'parameters':PARAMETERS,'measurements':measurements,
 'sound_option_frame_sha256':hashlib.sha256((ROOT/PARAMETERS['sound_option_evidence']).read_bytes()).hexdigest(),
 'limits':'Capture filenames originally guessed factory; observed arenas are castle and park. No seamless loop boundaries or universal stage order have been established.'}
(out/'measurement.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
with (out/'rms.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=['arena','seconds','rms']);writer.writeheader();writer.writerows(rows)
print(out)
