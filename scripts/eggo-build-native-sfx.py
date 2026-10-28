"""Capture isolated native SFX through the original driver, without playing audio.

The diagnostic VM redirects the first voluntary jump's sound ID, then disables
all further sound dispatch. No patched ROM is written or shipped. The mixer,
sample voices, amplitude, stereo balance and initial buffering stay native.
"""
from pathlib import Path
from datetime import datetime
import argparse, ctypes as C, hashlib, json, shutil, struct, sys, wave, subprocess
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from core import Core
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB

PARAMETERS={
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'core':'tools/eggo-recorder/runtime/mgba_libretro.dll',
 'state':'scripts/OUTPUT/eggo-reference_2026-10-03_18-00-10_876237/yolko-sfx-origin.state',
 'capture_frames':240,'silence_tail_samples':512,'sample_format':'stereo signed16 PCM',
 'wrapper':0x08005e14,'driver':0x08020898,'event_table':0x08021a4c,
 'trigger_call':0x0800fd3e,'trigger_immediate':0x0800fd3c,
 'slots':[0x03002624,0x03002634],'normalization':False,
 'latency_calibration':'renderer/games/eggo-mania/assets/jump.wav',
 'diagnostic_changes':'NOP all wrapper BL calls except one jump, replace its immediate event ID; NOP that call after first tick',
}

def sha(data):return hashlib.sha256(data).hexdigest()
def wrapper_calls(rom):
 calls=[]
 for at in range(0,len(rom)-4,2):
  a,b=struct.unpack_from('<HH',rom,at)
  if a&0xf800!=0xf000 or b&0xf800!=0xf800:continue
  signed=((a&0x7ff)<<12)|((b&0x7ff)<<1)
  if signed&(1<<22):signed-=1<<23
  if 0x08000000+at+4+signed==PARAMETERS['wrapper']:calls.append(at)
 assert len(calls)==82 and PARAMETERS['trigger_call']-0x08000000 in calls
 return calls

def worker(sound_id,out,rom,state,calls):
 # One process per effect is essential: libretro's host audio packet phase
 # is not contained in GBA save states and otherwise leaks between captures.
 core=Core(ROOT/PARAMETERS['core'],PARAMETERS['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
 try:
  maps={start:ptr+offset for start,ptr,offset,length in core.maps if ptr}
  base=maps[0x08000000];iram=maps[0x03000000];nop=bytes.fromhex('c046c046')
  for at in calls:C.memmove(base+at,nop,4)
  core.restore(state);trigger=PARAMETERS['trigger_call']-0x08000000
  C.memmove(base+trigger,rom[trigger:trigger+4],4)
  C.memmove(base+PARAMETERS['trigger_immediate']-0x08000000,struct.pack('<H',0x2000|sound_id),2)
  pcm=[];slot_trace=[]
  for frame in range(PARAMETERS['capture_frames']):
   _,audio,_=core.step(16 if frame==0 else 0);pcm.append(audio)
   slots=[list(C.string_at(iram+(a-0x03000000),16)) for a in PARAMETERS['slots']]
   slot_trace.append({'frame':frame+1,'priority':[s[14] for s in slots],'voice':[s[15] for s in slots]})
   if frame==0:C.memmove(base+trigger,nop,4)
  signal=np.frombuffer(b''.join(pcm),dtype='<i2').reshape(-1,2)
  if sound_id==1:
   with wave.open(str(ROOT/PARAMETERS['latency_calibration'])) as w:
    control=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2)
   shift=int(np.flatnonzero(np.any(signal,axis=1))[0])-int(np.flatnonzero(np.any(control,axis=1))[0])
   assert shift>=0 and np.array_equal(signal[shift:shift+len(control)],control),'Native jump waveform calibration failed'
   calibration={'calibrated_leading_silence_samples':shift,'calibration_asset_sha256':sha((ROOT/PARAMETERS['latency_calibration']).read_bytes())}
   (out/'calibration.json').write_text(json.dumps(calibration,indent=2),encoding='utf-8')
  shift=json.loads((out/'calibration.json').read_text(encoding='utf-8'))['calibrated_leading_silence_samples']
  assert not np.any(signal[:shift]),'Cannot trim nonzero native samples'
  signal=signal[shift:];active=np.flatnonzero(np.any(signal,axis=1))
  priority,voice,sequence=struct.unpack_from('<BBH',rom,PARAMETERS['event_table']-0x08000000+4*sound_id)
  if len(active):
   end=int(active[-1])+1+PARAMETERS['silence_tail_samples'];assert end<=len(signal),f'Effect {sound_id} exceeds capture'
   data=signal[:end].tobytes();first=int(active[0]);last=int(active[-1])
  else:data=signal[:PARAMETERS['silence_tail_samples']].tobytes();first=last=None
  name=f'native-sfx-{sound_id:02x}.wav'
  with wave.open(str(out/name),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(core.sample_rate);w.writeframes(data)
  busy=next((s['frame']-1 for s in slot_trace if not any(s['voice'])),PARAMETERS['capture_frames'])
  entry={'file':name,'native_id':sound_id,'priority':priority,'voice':voice+1,'sequence':sequence,'busy_frames':busy,
   'first_active_sample':first,'last_active_sample':last,'sample_frames':len(data)//4,'sample_rate':core.sample_rate,
   'pcm_sha256':sha(data),'duration_seconds':len(data)/4/core.sample_rate}
  (out/f'effect-{sound_id:02x}.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
  (out/f'slots-{sound_id:02x}.json').write_text(json.dumps(slot_trace,separators=(',',':')),encoding='utf-8')
 finally:core.close()

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--ids',default='1,2,4,5,6,7,12,13,14,29,34,36,37,38,39,42,44,45,47,49')
 parser.add_argument('--install',action='store_true');parser.add_argument('--worker',type=int);parser.add_argument('--output');args=parser.parse_args()
 ids=[int(s,0) for s in args.ids.split(',')];assert ids[0]==1
 out=Path(args.output) if args.output else ROOT/'scripts/OUTPUT'/('eggo-native-sfx_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
 out.mkdir(parents=True,exist_ok=args.worker is not None)
 rom=Path(PARAMETERS['rom']).read_bytes();state=(ROOT/PARAMETERS['state']).read_bytes();calls=wrapper_calls(rom)
 if args.worker is not None:worker(args.worker,out,rom,state,calls);return
 params={**PARAMETERS,'ids':ids,'rom_sha256':sha(rom),'state_sha256':sha(state),'core_sha256':sha((ROOT/PARAMETERS['core']).read_bytes()),
  'call_sites':[hex(0x08000000+a) for a in calls],'worker_isolation':'Fresh process and core per effect: no residual host audio buffer state'}
 measurements=[]
 for index,sound_id in enumerate(ids):
  subprocess.run([sys.executable,str(Path(__file__).resolve()),'--worker',str(sound_id),'--output',str(out)],check=True)
  entry=json.loads((out/f'effect-{sound_id:02x}.json').read_text(encoding='utf-8'));measurements.append(entry)
  print(f'{index+1}/{len(ids)} ID {sound_id:02x}: {entry["sample_frames"]} samples, slot busy {entry["busy_frames"]} ticks',flush=True)
 params.update(json.loads((out/'calibration.json').read_text(encoding='utf-8')))
 manifest={'parameters':params,'effects':measurements,'limits':'Native isolated SFX and driver-admission slots, not complete mixed-music parity. Common capture phase calibrated against input-only jump.'}
 (out/'parameters.json').write_text(json.dumps(params,indent=2)+'\n',encoding='utf-8')
 (out/'measurement.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 if args.install:
  dest=ROOT/'renderer/games/eggo-mania/assets'
  for entry in measurements:shutil.copy2(out/entry['file'],dest/entry['file'])
  (dest/'native-sfx.js').write_text('// Native driver captures; see native-sfx.json for diagnostic provenance.\nexport const NATIVE_SFX='+json.dumps({str(e['native_id']):e for e in measurements},indent=2)+';\n',encoding='utf-8')
  (dest/'native-sfx.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 print(out)

if __name__=='__main__':main()
