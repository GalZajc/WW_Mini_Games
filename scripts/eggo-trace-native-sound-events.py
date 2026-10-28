"""Muted native dispatch audit. Instrument only this disposable VM, never the ROM file.

Every audited video frame must retain the original recording hash; a mismatch
invalidates the audit immediately. The tiny Thumb trampoline preserves registers
before calling the unchanged original sound wrapper.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, ctypes as C, hashlib, json, struct, sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from core import Core
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB

PARAMETERS={
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'core':'tools/eggo-recorder/runtime/mgba_libretro.dll',
 'recording':'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
 'start_after':300,'end':9000,'wrapper':0x08005e14,
 'scratch':0x0203fe00,'maximum_events_per_frame':64,'hook_tail_bytes':256,
 'safety':'In-memory diagnostic instrumentation only; stop on first original video hash mismatch.',
}
def sha(data):return hashlib.sha256(data).hexdigest()
def branch_link(at,target):
 delta=target-at-4
 assert delta%2==0 and -(1<<22)<=delta<(1<<22)
 return struct.pack('<HH',0xf000|((delta>>12)&0x7ff),0xf800|((delta>>1)&0x7ff))
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--end',type=int,default=PARAMETERS['end']);parser.add_argument('--start-after',type=int,default=PARAMETERS['start_after']);parser.add_argument('--wrapper',type=lambda x:int(x,0),default=PARAMETERS['wrapper']);a=parser.parse_args()
 p={**PARAMETERS,'wrapper':a.wrapper,'end':a.end,'start_after':a.start_after,'hook_version':2,'scratch_bytes':324}
 out=ROOT/'scripts/OUTPUT'/('eggo-native-event-trace_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
 recording=ROOT/p['recording'];rom=Path(p['rom']).read_bytes();hook=0x08000000+len(rom)-p['hook_tail_bytes']
 assert rom[-p['hook_tail_bytes']:]==b'\xff'*p['hook_tail_bytes']
 state=(recording/f"after-frame-{p['start_after']:08d}.state").read_bytes()
 calls=[]
 for offset in range(0,len(rom)-4,2):
  x,y=struct.unpack_from('<HH',rom,offset)
  if x&0xf800!=0xf000 or y&0xf800!=0xf800:continue
  delta=((x&0x7ff)<<12)|((y&0x7ff)<<1)
  if delta&(1<<22):delta-=1<<23
  if 0x08000000+offset+4+delta==p['wrapper']:calls.append(offset)
 assert len(calls)==82 if p['wrapper']==PARAMETERS['wrapper'] else len(calls)>0
 # push r0..r3,lr; append r0 ID to bounded log; restore r0..r3;
 # BL original wrapper; pop pc (original caller return address).
 words=[0xb50f,0x4908,0x880a,0x2a40,0xd208,0x1d0b,0x5498,
        0x4670,0x0093,0x18cb,0x3344,0x6018,0x3201,0x800a,0xbc0f]
 code=struct.pack('<15H',*words)+branch_link(hook+30,p['wrapper'])+struct.pack('<HI',0xbd00,p['scratch'])
 p.update(rom_sha256=sha(rom),core_sha256=sha((ROOT/p['core']).read_bytes()),initial_state_sha256=sha(state),
          hook=hook,patched_wrapper_call_sites=calls,hook_disassembly=[f'{i.address:08x}: {i.mnemonic} {i.op_str}' for i in Cs(CS_ARCH_ARM,CS_MODE_THUMB).disasm(code[:36],hook)])
 (out/'parameters.json').write_text(json.dumps(p,indent=2),encoding='utf-8')
 core=Core(ROOT/p['core'],p['rom'],ROOT/'tools/eggo-recorder/runtime',options={'mgba_frameskip':'disabled','mgba_color_correction':'OFF','mgba_interframe_blending':'OFF'},capture_memory=False)
 summary={'compared':0,'events':0,'first_video_mismatch':None}
 try:
  core.restore(state);maps={start:ptr+offset for start,ptr,offset,length in core.maps if ptr}
  base=maps[0x08000000];scratch=maps[0x02000000]+p['scratch']-0x02000000
  assert C.string_at(scratch,p['scratch_bytes'])==bytes(p['scratch_bytes']),'Scratch region not unused in initial state'
  C.memmove(base+hook-0x08000000,code,len(code))
  for offset in calls:C.memmove(base+offset,branch_link(0x08000000+offset,hook),4)
  with (recording/'inputs.jsonl').open(encoding='utf-8') as inputs,(out/'events.jsonl').open('w',encoding='utf-8') as events:
   for line in inputs:
    frame=json.loads(line)
    if frame['frame']<=p['start_after']:continue
    if frame['frame']>p['end']:break
    C.memset(scratch,0,p['scratch_bytes']);video,_,_=core.step(frame['mask']);summary['compared']+=1
    if sha(video[3])!=frame['video_sha256']:
     summary['first_video_mismatch']=frame['frame'];break
    count=int.from_bytes(C.string_at(scratch,2),'little');assert count<p['maximum_events_per_frame'],'Event buffer saturated; audit is incomplete'
    ids=list(C.string_at(scratch+4,count));summary['events']+=count
    if ids:events.write(json.dumps({'frame':frame['frame'],'ids':ids,'call_sites':[hex(x-5) for x in struct.unpack('<'+'I'*count,C.string_at(scratch+68,count*4))]})+'\n')
    if summary['compared']%1000==0:print(f"{frame['frame']}/{p['end']}",flush=True)
 finally:core.close()
 summary['valid']=summary['first_video_mismatch'] is None
 (out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');print(json.dumps({'out':str(out),**summary}),flush=True)
 if not summary['valid']:raise SystemExit(1)
if __name__=='__main__':main()
