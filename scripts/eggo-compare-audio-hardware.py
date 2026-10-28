"""Compare stereo PCM without changing gain, resampling or hiding residuals.

A bounded integer offset accounts for the libretro host's 512-sample packet
buffer, which is deliberately not present in the sound-only WASM backend.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, wave
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def load(p):
 with wave.open(str(p)) as w:
  assert w.getnchannels()==2 and w.getsampwidth()==2
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2),w.getframerate()
parser=argparse.ArgumentParser();parser.add_argument('--native',required=True);parser.add_argument('--app',required=True);args=parser.parse_args()
a,rate=load(Path(args.native)/'reference.wav');b,other=load(Path(args.app)/'reconstruction.wav');assert rate==other
P={'native':str(Path(args.native).resolve()),'app':str(Path(args.app).resolve()),'sample_rate':rate,
   'maximum_packet_offset_samples':1024,'offset_search_sample_frames':32768,'normalization':False,'resampling':False,
   'native_pcm_sha256':hashlib.sha256(a.tobytes()).hexdigest(),'app_pcm_sha256':hashlib.sha256(b.tobytes()).hexdigest()}
best=None
for lag in range(-P['maximum_packet_offset_samples'],P['maximum_packet_offset_samples']+1):
 aa=a[max(0,lag):];bb=b[max(0,-lag):];n=min(len(aa),len(bb),P['offset_search_sample_frames']);difference=aa[:n].astype(np.int32)-bb[:n]
 score=float(np.mean(difference.astype(np.float64)**2))
 if best is None or score<best[0]:best=(score,lag,n)
_,lag,_=best;aa=a[max(0,lag):];bb=b[max(0,-lag):];n=min(len(aa),len(bb));aa=aa[:n];bb=bb[:n];different=aa!=bb
mse=float(np.mean((aa.astype(np.float64)-bb.astype(np.float64))**2))
indices=np.argwhere(different);active=int(np.count_nonzero(aa))
summary={'compared_sample_frames':n,'host_packet_offset_samples':lag,'mean_squared_error':mse,
         'mismatching_channel_samples':int(np.count_nonzero(different)),'nonzero_reference_samples':active,
         'exact_nontrivial_match':bool(active and not np.any(different)),
         'first_differences':[{'sample':int(i),'channel':int(c),'native':int(aa[i,c]),'app':int(bb[i,c])} for i,c in indices[:20]]}
out=ROOT/'scripts/OUTPUT'/('eggo-audio-hardware-comparison_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8');(out/'comparison.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),**summary}))
