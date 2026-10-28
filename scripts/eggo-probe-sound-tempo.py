"""Read native tempo/roof inputs at the first driver mismatch, silently."""
from pathlib import Path
from datetime import datetime,timezone
import ctypes as C,json,sys,hashlib
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from core import Core
P={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','core':'tools/eggo-recorder/runtime/mgba_libretro.dll',
   'recording':'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398','after':73800,'start':73838,'end':73845,
   'fields':{'tempo':0xd0,'minimumTempo':0xd4,'leadLatch':0xd8,'configHeight':0xe96c,'humanRoof':0x102d0,'cpuRoof':0x11518}}
out=ROOT/'scripts/OUTPUT'/('eggo-sound-tempo-probe_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
core=Core(ROOT/P['core'],P['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False);rows=[]
try:
 r=ROOT/P['recording'];core.restore((r/f"after-frame-{P['after']:08d}.state").read_bytes());base=next(ptr+off for at,ptr,off,size in core.maps if at==0x02000000)
 for line in (r/'inputs.jsonl').open(encoding='utf-8'):
  f=json.loads(line)
  if f['frame']<=P['after']:continue
  if f['frame']>P['end']:break
  video,_,_=core.step(f['mask']);assert hashlib.sha256(video[3]).hexdigest()==f['video_sha256']
  if f['frame']>=P['start']:rows.append({'frame':f['frame'],**{name:int.from_bytes(C.string_at(base+at,4),'little',signed=True)for name,at in P['fields'].items()}})
 (out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8');(out/'states.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
 print(json.dumps({'out':str(out),'states':rows}))
finally:core.close()
