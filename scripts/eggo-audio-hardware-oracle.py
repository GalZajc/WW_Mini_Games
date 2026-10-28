"""Reference hardware decay after freezing ONLY sound-driver dispatch, silently.

The reference remains the unmodified mGBA core. Diagnostic ROM patches exist only
in the disposable process. Disable direct PCM routing to isolate all PSG voices.
"""
from pathlib import Path
from datetime import datetime, timezone
import ctypes as C, hashlib, json, struct, sys, wave
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/eggo-recorder'))
from core import Core
P = {'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
     'core':'tools/eggo-recorder/runtime/mgba_libretro.dll',
     'state':'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-00001500.state',
     'frames':120, 'frame_cycles':280896, 'freeze_entries':[0x0801f480,0x08005e14],
     'state_io_offset':0x400,'soundcnt_hi':0x82,'direct_pcm_route_mask':0x3300,'sample_rate':32768,
     'psg_fixture':{'registers':{0x60:0,0x62:0xf080,0x64:0x0706,0x80:0x1177,0x84:0x81},
                    'envelope':0x706 << 10,'flags':0x4f,'first_channel_event':0}}
out=ROOT/'scripts/OUTPUT'/('eggo-audio-hardware-oracle_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'))
out.mkdir(parents=True)
state=bytearray((ROOT/P['state']).read_bytes());at=P['state_io_offset']+P['soundcnt_hi']
value=struct.unpack_from('<H',state,at)[0]&~P['direct_pcm_route_mask'];struct.pack_into('<H',state,at,value)
fixture=P['psg_fixture']
for register,value in fixture['registers'].items():struct.pack_into('<H',state,P['state_io_offset']+register,value)
struct.pack_into('<I',state,0x130,fixture['envelope']);struct.pack_into('<I',state,0x140,fixture['first_channel_event']);struct.pack_into('<I',state,0x1dc,fixture['flags'])
(out/'initial.state').write_bytes(state)
P['original_state_sha256']=hashlib.sha256((ROOT/P['state']).read_bytes()).hexdigest()
P['core_sha256']=hashlib.sha256((ROOT/P['core']).read_bytes()).hexdigest()
P['rom_sha256']=hashlib.sha256(Path(P['rom']).read_bytes()).hexdigest()
core=Core(ROOT/P['core'],P['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
try:
 core.restore(bytes(state));maps={base:ptr+offset for base,ptr,offset,size in core.maps if ptr}
 for a in P['freeze_entries']:C.memmove(maps[0x08000000]+a-0x08000000,bytes.fromhex('7047'),2)
 with wave.open(str(out/'reference.wav'),'wb') as w:
  w.setnchannels(2);w.setsampwidth(2);w.setframerate(core.sample_rate)
  for i in range(P['frames']):
   _,audio,_=core.step(0);w.writeframes(audio)
 P['sample_rate']=core.sample_rate
 (out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
 print(json.dumps({'out':str(out)}))
finally:core.close()
