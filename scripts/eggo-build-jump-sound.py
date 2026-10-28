"""Extract the isolated native jump, retaining its original PCM and latency."""
from pathlib import Path
from datetime import datetime
import hashlib,json,wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'jump':'scripts/OUTPUT/eggo-reference_2026-10-03_18-03-02_137738/sfx-first-jump',
 'neutral':'scripts/OUTPUT/eggo-reference_2026-10-03_18-00-47_904566/sfx-clean-neutral',
 'origin':'scripts/OUTPUT/eggo-reference_2026-10-03_18-00-10_876237/yolko-sfx-origin',
 'option_evidence':'scripts/OUTPUT/eggo-reference_2026-10-03_17-56-29_461054/native-no-music',
 'isolated_before_sample':16000,'silent_tail_samples':256,
 'normalization':False,'format':'stereo signed 16-bit PCM'}

def read(name):
 base=ROOT/PARAMETERS[name]
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 with wave.open(str(base)+'.wav') as wav:
  assert wav.getnchannels()==2 and wav.getsampwidth()==2
  rate=wav.getframerate()
  pcm=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').reshape(-1,2)
 return base,meta,rate,pcm

jump,jump_meta,rate,pcm=read('jump')
neutral,neutral_meta,neutral_rate,baseline=read('neutral')
assert jump_meta['writes']==neutral_meta['writes']==[]
assert rate==neutral_rate and pcm.shape==baseline.shape
for key in ['initial_state_sha256','rom_sha256','core_sha256']:
 assert jump_meta[key]==neutral_meta[key]
cut=PARAMETERS['isolated_before_sample']
assert not np.any(baseline[:cut]),'The control must be silent throughout the isolated cue'
active=np.flatnonzero(np.any(pcm[:cut],axis=1))
assert len(active)>0
end=int(active[-1])+1+PARAMETERS['silent_tail_samples']
assert end<cut and not np.any(pcm[int(active[-1])+1:cut])
trace=json.loads(Path(str(jump)+'.trace.json').read_text(encoding='utf-8'))
control=json.loads(Path(str(neutral)+'.trace.json').read_text(encoding='utf-8'))
assert any(abs(a['world_y']-b['world_y'])>1 for a,b in zip(trace,control))
origin=ROOT/PARAMETERS['origin']
origin_meta=json.loads(Path(str(origin)+'.json').read_text(encoding='utf-8'))
assert origin_meta['writes']==[[1012,2]],'Only the previously verified NO MUSIC option may be changed'
option=ROOT/PARAMETERS['option_evidence']
option_meta=json.loads(Path(str(option)+'.json').read_text(encoding='utf-8'))
assert option_meta['writes']==[]
assert int.from_bytes(Path(str(option)+'.ram').read_bytes()[1012:1016],'little')==2
assert hashlib.sha256(Path(str(origin)+'.state').read_bytes()).hexdigest()==jump_meta['initial_state_sha256']
clip=pcm[:end].tobytes()
manifest={'parameters':PARAMETERS,'source_parameters':jump_meta,
 'control_parameters':neutral_meta,'origin_parameters':origin_meta,
 'option_evidence_parameters':option_meta,
 'option_screenshot_sha256':hashlib.sha256(Path(str(option)+'.png').read_bytes()).hexdigest(),
 'sample_rate':rate,'sample_frames':end,'first_active_sample':int(active[0]),
 'last_active_sample':int(active[-1]),'pcm_sha256':hashlib.sha256(clip).hexdigest(),
 'limits':'Clean normal jump cue. Native shared-channel suppression and boosted jumps remain uncalibrated.'}
out=ROOT/'scripts/OUTPUT'/('eggo-jump-sound_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for dest in [out,ROOT/'renderer/games/eggo-mania/assets']:
 with wave.open(str(dest/'jump.wav'),'wb') as wav:
  wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(clip)
 (dest/'jump.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
