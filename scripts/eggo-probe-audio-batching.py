"""Read-only IRQ/idle-loop causality probe, with controlled input branches."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,ctypes as C,hashlib,json,sys,wave
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from core import Core
parser=argparse.ArgumentParser();parser.add_argument('--variant',choices=['recorded','neutral','right','jump'],default='recorded');args=parser.parse_args()
P={'oracle':'scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z',
 'core':'scripts/.tools/mgba-native-audio-build/mgba_libretro.dll','initialFrame':400,'branchAfter':940,'end':1000,
 'variant':args.variant,'recordFrom':939,'traceOrigin':'actual native CPU; diagnostic only, not a production event source'}
P['libretroMaskOverride']={'recorded':None,'neutral':0,'right':1<<7,'jump':1<<4}[args.variant]
source=ROOT/P['oracle'];parameters=json.loads((source/'parameters.json').read_text(encoding='utf-8'))
out=ROOT/'scripts/OUTPUT'/('eggo-audio-batching_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
P['sourceParameters']=parameters;P['coreSha256']=hashlib.sha256((ROOT/P['core']).read_bytes()).hexdigest()
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
class Write(C.Structure):_fields_=[(key,C.c_uint32)for key in ['time','address','value','size','pc']]
class IRQ(C.Structure):_fields_=[(key,C.c_uint32)for key in ['time','when','relative','late','pc','cpsr','vcount','dispstat','ie','flags','lastPrefetchedPc']]
core=Core(ROOT/P['core'],parameters['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
try:
 lib=core.lib
 for name,kind in [('log',Write),('irq',IRQ)]:
  getattr(lib,'eggo_sound_'+name+'_count').restype=C.c_uint
  getattr(lib,'eggo_sound_'+name+'_data').restype=C.POINTER(kind)
 lib.eggo_sound_sample_count.restype=C.c_uint;lib.eggo_sound_sample_data.restype=C.POINTER(C.c_uint32)
 core.restore((source/'initial.state').read_bytes());frames=0;pcm=hashlib.sha256();sampleFrames=0;firstVideoDifference=None;rows=[]
 for line in (ROOT/parameters['recording']/'inputs.jsonl').open(encoding='utf-8'):
  f=json.loads(line);frame=f['frame']
  if frame<=P['initialFrame']:continue
  if frame>P['end']:break
  mask=f['mask']
  if frame>P['branchAfter'] and P['libretroMaskOverride'] is not None:mask=P['libretroMaskOverride']
  lib.eggo_sound_log_reset();video,audio,_=core.step(mask);frames+=1;pcm.update(audio);sampleFrames+=len(audio)//4
  same=hashlib.sha256(video[3]).hexdigest()==f['video_sha256']
  if not same and firstVideoDifference is None:firstVideoDifference=frame
  if args.variant=='recorded' or frame<=P['branchAfter']:assert same,f'Instrumentation changed image{frame}'
  if frame>=P['recordFrom']:
   n=lib.eggo_sound_log_count();assert n<2048;irqCount=lib.eggo_sound_irq_count();assert irqCount<64
   writes=[{key:int(getattr(w,key))for key,_ in Write._fields_}for w in lib.eggo_sound_log_data()[:n]]
   irqs=[{key:int(getattr(w,key))for key,_ in IRQ._fields_}for w in lib.eggo_sound_irq_data()[:irqCount]]
   rows.append({'frame':frame,'mask':mask,'irqs':irqs,'writes':writes,'lateness':list(lib.eggo_sound_sample_data()[:lib.eggo_sound_sample_count()])})
 with wave.open(str(source/'reference.wav'))as w:original=hashlib.sha256(w.readframes(sampleFrames)).hexdigest()
 (out/'trace.json').write_text(json.dumps(rows),encoding='utf-8')
 report={'frames':frames,'variant':args.variant,'firstVideoDifference':firstVideoDifference,'originalPcmUnchanged':pcm.hexdigest()==original,'pcmSha256':pcm.hexdigest()}
 (out/'summary.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'out':str(out),**report}))
finally:core.close()
