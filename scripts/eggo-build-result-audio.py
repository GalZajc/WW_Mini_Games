"""Extract native result music, preserving win entry before its verified loop."""
from pathlib import Path
from datetime import datetime
import hashlib,json,wave,collections
import numpy as np
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'renderer/games/eggo-mania/assets'
PARAMETERS={'loss':'scripts/OUTPUT/eggo-reference_2026-10-04_22-09-13_475528/result-music-clean',
 'win':'scripts/OUTPUT/eggo-reference_2026-10-04_22-13-24_319834/win-result-audio-full',
 'shared_frames':225,'native_frame_cycles':280896,'native_cpu_hz':16777216,
 'seam_search_samples':512,'silent_tail_samples':512,'normalization':False,'crossfade':False,'seed':'encoded in original states'}
out=ROOT/'scripts/OUTPUT'/('eggo-result-audio_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
sources={}
for mode in ['loss','win']:
 prefix=ROOT/PARAMETERS[mode];meta=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf-8'))
 assert meta['writes']==([] if mode=='loss' else [[15320,0]])
 trace_bytes=Path(str(prefix)+'.trace.json').read_bytes();trace=json.loads(trace_bytes)
 with wave.open(str(prefix)+'.wav') as stream:
  rate=stream.getframerate();assert stream.getnchannels()==2 and stream.getsampwidth()==2
  pcm=np.frombuffer(stream.readframes(stream.getnframes()),dtype='<i2').reshape(-1,2)
 sources[mode]={'meta':meta,'trace':trace,'rate':rate,'pcm':pcm,'trace_sha256':hashlib.sha256(trace_bytes).hexdigest()}
loss,win=sources['loss'],sources['win'];assert loss['rate']==win['rate']
assert all(a['music_tracks']==b['music_tracks'] for a,b in zip(loss['trace'][:225],win['trace'][:225]))
assert loss['trace'][225]['music_tracks']!=win['trace'][225]['music_tracks']
rate=loss['rate'];cut=loss['trace'][PARAMETERS['shared_frames']-1]['audio_sample_frames']
assert int.from_bytes(Path(loss['meta']['load']).with_suffix('.ram').read_bytes()[1012:1016],'little')==3
last=int(np.flatnonzero(np.any(loss['pcm'],axis=1))[-1])+1
assert not np.any(loss['pcm'][last:])
tracks={};measurements=[]
def save(name,mode,start,end,loop=False,loop_start=None):
 clip=sources[mode]['pcm'][start:end].tobytes();filename=name+'.wav'
 for destination in [out,ASSETS]:
  with wave.open(str(destination/filename),'wb') as stream:
   stream.setnchannels(2);stream.setsampwidth(2);stream.setframerate(rate);stream.writeframes(clip)
 record={'file':filename,'sample_rate':rate,'sample_frames':end-start,'duration_seconds':(end-start)/rate,
         'pcm_sha256':hashlib.sha256(clip).hexdigest(),'loop':loop,'loop_start_seconds':(loop_start-start)/rate if loop_start is not None else 0}
 tracks[name]=record;measurements.append({'name':name,'source':PARAMETERS[mode],'source_parameters':sources[mode]['meta'],
  'source_trace_sha256':sources[mode]['trace_sha256'],'start_sample':start,'end_sample':end,'loop_start_sample':loop_start,**record})
save('result-intro','loss',0,cut)
save('result-loss','loss',cut,min(len(loss['pcm']),last+PARAMETERS['silent_tail_samples']))
keys=[tuple(r['music_tracks']) for r in win['trace']];seen={};periods=collections.Counter();first={}
for i,key in enumerate(keys):
 if key in seen:
  n=i-seen[key];periods[n]+=1;first.setdefault(n,seen[key])
 seen[key]=i
period=periods.most_common(1)[0][0];begin_frame=first[period]
assert keys[begin_frame:begin_frame+period]==keys[begin_frame+period:begin_frame+2*period]
sample_period=round(period*PARAMETERS['native_frame_cycles']*rate/PARAMETERS['native_cpu_hz'])
anchor=win['trace'][begin_frame]['audio_sample_frames'];span=PARAMETERS['seam_search_samples']
candidates=np.arange(anchor-span,anchor+span+1);signal=win['pcm'].astype('int32')
edges=signal[candidates].astype('float64')**2+signal[candidates+sample_period-1].astype('float64')**2
jump=(signal[candidates]-signal[candidates+sample_period-1]).astype('float64')**2
loop_start=int(candidates[np.argmin((edges+jump).sum(axis=1))]);win_cut=win['trace'][224]['audio_sample_frames']
save('result-win','win',win_cut,loop_start+sample_period,True,loop_start)
tracks['result-win']['period_frames']=period;tracks['result-win']['verified_frames']=period
manifest={'parameters':PARAMETERS,'tracks':tracks,'measurements':measurements,
 'limits':'Native music-only option, stereo PCM unchanged. Result voices/shared SFX channels and sub-packet entry latency remain unverified. Winning origin is an explicit rescue-position diagnostic.'}
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',manifest),(ASSETS/'result-audio.json',manifest),(ROOT/'tests/fixtures/eggo-result-audio-gba.json',manifest)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
(ASSETS/'native-result-audio.js').write_text('// Native result PCM; provenance in result-audio.json.\nexport const NATIVE_RESULT_AUDIO='+json.dumps(tracks,indent=2)+';\n',encoding='utf-8')
print({'loop_frames':period,'tracks':tracks,'output':str(out)})
