"""Read-only IRQ/sample scheduler audit in a bounded original replay; muted."""
from pathlib import Path
from datetime import datetime,timezone
import ctypes as C,hashlib,json,sys,wave
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from core import Core
P={'oracle':'scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z',
 'core':'scripts/.tools/mgba-native-audio-build/mgba_libretro.dll','initialFrame':400,'end':1275,
 'selectedFrames':[961,962,963,1273,1274,1275]}
source=ROOT/P['oracle'];params=json.loads((source/'parameters.json').read_text(encoding='utf-8'))
out=ROOT/'scripts/OUTPUT'/('eggo-audio-irq_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
P['source']=params;P['core_sha256']=hashlib.sha256((ROOT/P['core']).read_bytes()).hexdigest()
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
class Write(C.Structure):_fields_=[(key,C.c_uint32)for key in ['time','address','value','size','pc']]
core=Core(ROOT/P['core'],params['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
try:
 lib=core.lib;lib.eggo_sound_log_count.restype=C.c_uint;lib.eggo_sound_log_data.restype=C.POINTER(Write)
 lib.eggo_sound_sample_count.restype=C.c_uint;lib.eggo_sound_sample_data.restype=C.POINTER(C.c_uint32)
 core.restore((source/'initial.state').read_bytes());samples=0;actual=hashlib.sha256();records=[];frames=0
 for line in (ROOT/params['recording']/'inputs.jsonl').open(encoding='utf-8'):
  f=json.loads(line);frame=f['frame']
  if frame<=P['initialFrame']:continue
  if frame>P['end']:break
  lib.eggo_sound_log_reset();video,audio,_=core.step(f['mask']);actual.update(audio);samples+=len(audio)//4;frames+=1
  assert hashlib.sha256(video[3]).hexdigest()==f['video_sha256'],f'Changed native image{frame}'
  if frame in P['selectedFrames']:
   count=lib.eggo_sound_log_count();assert count<2048
   writes=[{key:int(getattr(w,key))for key,_ in Write._fields_}for w in lib.eggo_sound_log_data()[:count]]
   records.append({'frame':frame,'writes':writes,'lateness':list(lib.eggo_sound_sample_data()[:lib.eggo_sound_sample_count()])})
 with wave.open(str(source/'reference.wav'))as w:expected=hashlib.sha256(w.readframes(samples)).hexdigest()
 (out/'trace.json').write_text(json.dumps(records),encoding='utf-8')
 report={'frames':frames,'allVideoUnchanged':True,'pcmUnchanged':actual.hexdigest()==expected,'samples':samples,'pcmSha256':actual.hexdigest()}
 (out/'summary.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'out':str(out),**report}))
finally:core.close()
