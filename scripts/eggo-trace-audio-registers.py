"""Transparent emulator-source I/O timing audit; no ROM patch or audio output."""
from pathlib import Path
from datetime import datetime, timezone
import ctypes as C, hashlib, json, sys, wave
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from core import Core
P={'oracle':'scripts/OUTPUT/eggo-native-sound-state_2026-10-26T15-09-09_764019Z',
   'core':'scripts/.tools/mgba-native-audio-build/mgba_libretro.dll','maximum_register_writes_per_frame':2048}
oracle=ROOT/P['oracle'];original=json.loads((oracle/'parameters.json').read_text(encoding='utf-8'))
P.update(recording=original['recording'],start_after=original['start_after'],end=original['end'],rom=original['rom'])
out=ROOT/'scripts/OUTPUT'/('eggo-audio-register-trace_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
core=Core(ROOT/P['core'],P['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
class Write(C.Structure):_fields_=[(key,C.c_uint32)for key in ['time','address','value','size','pc']]
try:
 lib=core.lib;lib.eggo_sound_log_count.restype=C.c_uint;lib.eggo_sound_log_data.restype=C.POINTER(Write);lib.eggo_sound_current_time.restype=C.c_uint32
 lib.eggo_sound_sample_count.restype=C.c_uint;lib.eggo_sound_sample_data.restype=C.POINTER(C.c_uint32)
 lib.eggo_sound_mix_data.restype=C.POINTER(C.c_uint32)
 lib.eggo_sound_pcm_data.restype=C.POINTER(C.c_uint32)
 lib.eggo_sound_sample_clocks.restype=C.POINTER(C.c_uint32)
 core.restore((oracle/'initial.state').read_bytes());frames=0;pcm=hashlib.sha256()
 with (out/'registers.jsonl').open('w',encoding='utf-8')as trace,wave.open(str(out/'reference.wav'),'wb')as wav:
  wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(core.sample_rate)
  for line in (ROOT/P['recording']/'inputs.jsonl').open(encoding='utf-8'):
   record=json.loads(line);f=record['frame']
   if f<=P['start_after']:continue
   if f>P['end']:break
   lib.eggo_sound_log_reset();start=lib.eggo_sound_current_time()
   video,audio,_=core.step(record['mask']);wav.writeframes(audio);pcm.update(audio)
   if hashlib.sha256(video[3]).hexdigest()!=record['video_sha256']:raise RuntimeError(f'Changed video at {f}')
   count=lib.eggo_sound_log_count();assert count<P['maximum_register_writes_per_frame'],'Register log overflow'
   pointer=lib.eggo_sound_log_data()
   writes=[{key:int(getattr(w,key))for key,_ in Write._fields_}for w in pointer[:count]]
   sample_count=lib.eggo_sound_sample_count();assert sample_count<2048
   late=list(lib.eggo_sound_sample_data()[:sample_count])
   mix=list(lib.eggo_sound_mix_data()[:sample_count])
   raw=list(lib.eggo_sound_pcm_data()[:sample_count])
   clocks=list(lib.eggo_sound_sample_clocks()[:sample_count])
   trace.write(json.dumps({'frame':f,'start_clock':start,'end_clock':lib.eggo_sound_current_time(),'writes':writes,'sample_lateness':late,'sample_mix':mix,'sample_pcm':raw,'sample_clocks':clocks})+'\n');frames+=1
 P['core_sha256']=hashlib.sha256((ROOT/P['core']).read_bytes()).hexdigest();P['sample_rate']=core.sample_rate
 with wave.open(str(oracle/'reference.wav'))as w:expected=hashlib.sha256(w.readframes(w.getnframes())).hexdigest()
 summary={'frames':frames,'all_video_unchanged':True,'pcm_sha256':pcm.hexdigest(),'original_pcm_sha256':expected,'pcm_unchanged':pcm.hexdigest()==expected}
 (out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8');(out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
 print(json.dumps({'out':str(out),**summary}))
finally:core.close()
