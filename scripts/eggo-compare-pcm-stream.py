"""Exact stereo comparison with bounded memory, no lag fit/gain/resampling."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,wave
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--native',required=True);parser.add_argument('--app',required=True);parser.add_argument('--app-leading-samples',type=int,default=0);parser.add_argument('--limit',type=int);args=parser.parse_args()
P={'native':str(Path(args.native).resolve()),'app':str(Path(args.app).resolve()),'chunkSampleFrames':262144,
 'knownTransportOffsetSamples':args.app_leading_samples,'resampling':False,'normalization':False}
out=ROOT/'scripts/OUTPUT'/('eggo-pcm-stream-comparison_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
first=None;different=active=compared=squares=0;ha=hashlib.sha256();hb=hashlib.sha256()
with wave.open(str(Path(args.native)/'reference.wav'))as a,wave.open(str(Path(args.app)/'reconstruction.wav'))as b:
 assert a.getnchannels()==b.getnchannels()==2 and a.getsampwidth()==b.getsampwidth()==2 and a.getframerate()==b.getframerate()
 P.update(sampleRate=a.getframerate(),nativeSampleFrames=a.getnframes(),appSampleFrames=b.getnframes())
 b.setpos(args.app_leading_samples)
 limit=min(a.getnframes(),b.getnframes()-args.app_leading_samples,args.limit if args.limit is not None else a.getnframes())
 while compared<limit:
  n=min(P['chunkSampleFrames'],limit-compared);aa=a.readframes(n);bb=b.readframes(n);ha.update(aa);hb.update(bb)
  av=np.frombuffer(aa,dtype='<i2').reshape(-1,2);bv=np.frombuffer(bb,dtype='<i2').reshape(-1,2);d=av.astype(np.int64)-bv
  different+=int(np.count_nonzero(d));active+=int(np.count_nonzero(av));squares+=int(np.sum(d*d))
  if first is None and np.any(d):
   i,c=np.argwhere(d!=0)[0];first={'sample':int(compared+i),'channel':int(c),'native':int(av[i,c]),'app':int(bv[i,c])}
  compared+=n
  if compared%(P['chunkSampleFrames']*32)==0:print(f'{compared}/{limit}',flush=True)
report={'comparedSampleFrames':compared,'firstDifference':first,'differentChannelSamples':different,'nonzeroReferenceChannelSamples':active,
 'meanSquaredError':squares/(compared*2),'exactMatchOverCommonSamples':first is None and active>0,
 'comparedNativeSha256':ha.hexdigest(),'comparedAppSha256':hb.hexdigest()}
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8');(out/'comparison.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),**report}))
