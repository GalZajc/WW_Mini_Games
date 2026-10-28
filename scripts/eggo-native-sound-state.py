"""Capture only native sound RAM/PCM for an unchanged recorded gameplay window."""
from pathlib import Path
from datetime import datetime,timezone
import ctypes as C,hashlib,json,sys,wave,argparse,subprocess
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from core import Core
P={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','core':'tools/eggo-recorder/runtime/mgba_libretro.dll',
   'recording':'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
   'restore_after':300,'start_after':400,'end':2000,'sound_start':0x2470,'sound_end':0x3089,
   'sound_events':'scripts/OUTPUT/eggo-native-event-trace_2026-10-26T10-11-39_459193Z/events.jsonl'}
parser=argparse.ArgumentParser();parser.add_argument('--capture');parser.add_argument('--core');parser.add_argument('--end',type=int);args=parser.parse_args()
out=Path(args.capture) if args.capture else ROOT/'scripts/OUTPUT'/('eggo-native-sound-state_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'))
out.mkdir(parents=True,exist_ok=bool(args.capture))
if args.capture:P=json.loads((out/'parameters.json').read_text(encoding='utf-8'))
if args.core:P['core']=args.core
if args.end:P['end']=args.end
core=Core(ROOT/P['core'],P['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
try:
 recording=ROOT/P['recording'];core.restore((out/'initial.state').read_bytes() if args.capture else (recording/f"after-frame-{P['restore_after']:08d}.state").read_bytes())
 maps={base:ptr+offset for base,ptr,offset,size in core.maps if ptr};frames=0
 with (out/'sound-ram.bin').open('wb') as states,wave.open(str(out/'reference.wav'),'wb') as wav:
  wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(core.sample_rate)
  for line in (recording/'inputs.jsonl').open(encoding='utf-8'):
   f=json.loads(line);frame=f['frame']
   if frame<=(P['start_after'] if args.capture else P['restore_after']):continue
   if frame>P['end']:break
   video,audio,_=core.step(f['mask'])
   if hashlib.sha256(video[3]).hexdigest()!=f['video_sha256']:raise RuntimeError(f'Native video changed at {frame}')
   if frame==P['start_after']:
    (out/'initial.state').write_bytes(core.serialize())
    for name,base,size in [('iwram',0x03000000,0x8000),('ewram',0x02000000,0x40000),('io',0x04000000,0x400)]:
     (out/f'initial-{name}.bin').write_bytes(C.string_at(maps[base],size))
    if not args.capture:break
   if frame>P['start_after']:
    states.write(C.string_at(maps[0x03000000]+P['sound_start'],P['sound_end']-P['sound_start']));wav.writeframes(audio);frames+=1
    if frames%2000==0:print(f"{frame}/{P['end']} sound frames",flush=True)
 P['rom_sha256']=hashlib.sha256(Path(P['rom']).read_bytes()).hexdigest();P['sample_rate']=core.sample_rate
 P['core_sha256']=hashlib.sha256((ROOT/P['core']).read_bytes()).hexdigest()
 P['capture_isolation']='Fresh process restored at start_after; no preceding host audio/filter/packet state.'
 (out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8');print(json.dumps({'out':str(out),'unchanged_frames':frames}))
finally:core.close()
if not args.capture:subprocess.run([sys.executable,str(Path(__file__).resolve()),'--capture',str(out)],check=True)
