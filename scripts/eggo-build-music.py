"""Build unmodified PCM music loops, verified by all native sequencer tracks."""
from pathlib import Path
from datetime import datetime
import argparse, collections, csv, hashlib, json, subprocess, sys, wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--profiles', required=True)
args = parser.parse_args()
PARAMETERS = {
    'profiles': args.profiles, 'native_frame_cycles': 280896,
    'native_cpu_hz': 16777216, 'seam_search_samples': 512,
    'normalization': False, 'crossfade': False, 'channels': 2,
    'verification': 'Every byte of all eight sequencer tracks for one complete repeated cycle',
}
out = ROOT/'scripts/OUTPUT'/('eggo-music-build_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
profiles = json.loads((ROOT/args.profiles).read_text(encoding='utf-8'))
records = []; destinations = ROOT/'renderer/games/eggo-mania/assets'

for profile in profiles:
    source = ROOT/profile['source']
    meta = json.loads(Path(str(source)+'.json').read_text(encoding='utf-8'))
    trace_path = Path(str(source)+'.trace.json')
    trace = json.loads(trace_path.read_text(encoding='utf-8'))
    assert meta['writes']==[] and meta['music_trace_parameters']['tracks']==8
    keys = [tuple(r['music_tracks']) for r in trace]
    seen = {}; periods = collections.Counter(); first = {}
    for i,key in enumerate(keys):
        if key in seen:
            period = i-seen[key]; periods[period]+=1; first.setdefault(period,seen[key])
        seen[key]=i
    period = periods.most_common(1)[0][0]; start = first[period]
    continuation = None
    if len(keys)<start+2*period:
        frames = start+2*period-len(keys)+1
        command = [sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',str(source)+'.state',
                   '--name',profile['arena']+'-music-verification','--steps',json.dumps([[frames,'']]),'--music-trace']
        result = subprocess.run(command,cwd=ROOT,check=True,capture_output=True,encoding='utf-8')
        continuation = Path(result.stdout.strip().splitlines()[-1]).with_suffix('')
        extra = json.loads(Path(str(continuation)+'.trace.json').read_text(encoding='utf-8'))
        keys += [tuple(r['music_tracks']) for r in extra]
    assert keys[start:start+period]==keys[start+period:start+2*period], profile['arena']
    with wave.open(str(source)+'.wav') as stream:
        rate=stream.getframerate();assert stream.getnchannels()==2 and stream.getsampwidth()==2
        pcm=np.frombuffer(stream.readframes(stream.getnframes()),dtype='<i2').reshape(-1,2)
    # Audio callbacks emit 512-sample packets, so frame markers are quantized.
    # The hardware clock ratio gives the actual musical cycle in PCM samples.
    sample_period=round(period*PARAMETERS['native_frame_cycles']*rate/PARAMETERS['native_cpu_hz'])
    anchor=trace[start]['audio_sample_frames']
    assert anchor+sample_period+PARAMETERS['seam_search_samples']<len(pcm)
    candidates=np.arange(max(1,anchor-PARAMETERS['seam_search_samples']),anchor+PARAMETERS['seam_search_samples']+1)
    signal=pcm.astype(np.int32)
    # Select a quiet join within one callback packet. No PCM samples are changed.
    jumps=np.sum((signal[candidates]-signal[candidates+sample_period-1]).astype(np.float64)**2,axis=1)
    edges=np.sum(signal[candidates].astype(np.float64)**2+signal[candidates+sample_period-1].astype(np.float64)**2,axis=1)
    begin=int(candidates[np.argmin(jumps+edges)])
    clip=pcm[begin:begin+sample_period].tobytes()
    name=profile['arena']+'-music.wav'
    for dest in [out,destinations]:
        with wave.open(str(dest/name),'wb') as stream:
            stream.setnchannels(2);stream.setsampwidth(2);stream.setframerate(rate);stream.writeframes(clip)
    record={'arena':profile['arena'],'file':name,'source':profile['source'],'source_parameters':meta,
            'trace_sha256':hashlib.sha256(trace_path.read_bytes()).hexdigest(),
            'source_wav_sha256':hashlib.sha256(Path(str(source)+'.wav').read_bytes()).hexdigest(),
            'period_frames':period,'verified_frames':period,'verification_start_frame':start+1,
            'continuation':continuation.relative_to(ROOT).as_posix() if continuation else None,
            'sample_rate':rate,'sample_frames':sample_period,'start_sample':begin,
            'duration_seconds':sample_period/rate,'pcm_sha256':hashlib.sha256(clip).hexdigest(),
            'join_jump':(signal[begin]-signal[begin+sample_period-1]).tolist()}
    if continuation:
        record['continuation_parameters']=json.loads(Path(str(continuation)+'.json').read_text(encoding='utf-8'))
        record['continuation_trace_sha256']=hashlib.sha256(Path(str(continuation)+'.trace.json').read_bytes()).hexdigest()
    records.append(record)
    (out/'measurements.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
    print(f'{len(records)}/{len(profiles)}: {profile["arena"]}, {period} frames, {sample_period/rate:.3f} s',flush=True)
manifest={r['arena']:{k:r[k] for k in ['file','period_frames','sample_rate','sample_frames','duration_seconds','pcm_sha256']} for r in records}
(destinations/'native-music.js').write_text('// Verified native sequencer cycles; unmodified stereo PCM.\nexport const NATIVE_MUSIC='+json.dumps(manifest,indent=2)+';\n',encoding='utf-8')
fixture={'parameters':PARAMETERS,'tracks':records,'limits':'Steady in-game loops only. Entry phase, result music and native shared-channel SFX mixing remain unverified. PCM phase at the join is selected from an unchanged source recording; sequencer equality does not imply identical oscillator/sample phase.'}
(ROOT/'tests/fixtures/eggo-music-gba.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
with (out/'loops.csv').open('w',encoding='utf-8',newline='') as stream:
    fields=['arena','period_frames','verified_frames','sample_rate','sample_frames','duration_seconds','start_sample']
    writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader();writer.writerows({k:r[k] for k in fields} for r in records)
print(out,flush=True)
