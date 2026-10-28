"""Fresh unmodified original core, synthetic valid inputs, generated READY state."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,ctypes as C,hashlib,json,sys,wave
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from core import Core
parser=argparse.ArgumentParser();parser.add_argument('--seed',type=int,default=7);parser.add_argument('--character',type=int,default=6);parser.add_argument('--from-bootstrap',action='store_true');args=parser.parse_args()
P={'contexts':'scripts/OUTPUT/eggo-ready-contexts_2026-10-27T01-37-29-171Z',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','core':'tools/eggo-recorder/runtime/mgba_libretro.dll',
 'seed':args.seed,'character':args.character,'inputSeed':0x1337+args.seed,'start_after':0,'end':600,
 'sound_start':0x2470,'sound_end':0x3089,'sample_rate':32768,
 'inputPattern':{'movePeriod':45,'jumpPeriod':72,'jumpHold':28,'fastPeriod':113,'fastHold':5,
  'placePeriod':100,'placeHold':3,'turnPeriod':61,'divePeriod':131,'discardPeriod':257}}
context=next(c for c in json.loads((ROOT/P['contexts']/'contexts.json').read_text(encoding='utf-8'))if c['seed']==args.seed and c['character']==args.character)
initial=(ROOT/P['contexts']/context['state']).read_bytes();P['context']=context;P['initial_state_sha256']=hashlib.sha256(initial).hexdigest()
if args.from_bootstrap:
 P['initialization']={'bootstrap':'scripts/OUTPUT/eggo-cycle-bootstrap_2026-10-27T01-09-22-895Z/before-survival.state','startFrame':372,
  'warmupFrames':context['readyAt']-372+1,'seedAddress':0x02011aac,'characterAddress':0x020003d4,'warmupButtons':0}
 initial=(ROOT/P['initialization']['bootstrap']).read_bytes();P['initial_state_sha256']=hashlib.sha256(initial).hexdigest()
P['rom_sha256']=hashlib.sha256(Path(P['rom']).read_bytes()).hexdigest();P['core_sha256']=hashlib.sha256((ROOT/P['core']).read_bytes()).hexdigest()
out=ROOT/'scripts/OUTPUT'/('eggo-context-audio_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
P['recording']=str(out);(out/'initial.state').write_bytes(initial);(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
core=Core(ROOT/P['core'],P['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
try:
 core.restore(initial);maps={base:ptr+offset for base,ptr,offset,size in core.maps if ptr};rng=P['inputSeed'];move=0;p=P['inputPattern'];audio_hash=hashlib.sha256()
 if args.from_bootstrap:
  setup=P['initialization']
  C.c_uint32.from_address(maps[0x02000000]+setup['seedAddress']-0x02000000).value=args.seed&0xffff
  C.c_uint32.from_address(maps[0x02000000]+setup['characterAddress']-0x02000000).value=args.character
  for _ in range(setup['warmupFrames']):core.step(setup['warmupButtons'])
 with (out/'inputs.jsonl').open('w',encoding='utf-8')as tape,(out/'sound-ram.bin').open('wb')as ram,wave.open(str(out/'reference.wav'),'wb')as wav:
  wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(P['sample_rate'])
  for frame in range(1,P['end']+1):
   if (frame-1)%p['movePeriod']==0:
    rng^=(rng<<13)&0xffffffff;rng^=rng>>17;rng^=(rng<<5)&0xffffffff;rng&=0xffffffff;move=[0,1<<6,1<<7][rng%3]
   mask=move
   if frame%p['jumpPeriod']<p['jumpHold']:mask|=1<<4
   elif frame%p['fastPeriod']<p['fastHold']:mask|=1<<5
   if frame%p['placePeriod']<p['placeHold']:mask|=1<<8
   if frame%p['turnPeriod']==0:mask|=1
   if frame%p['divePeriod']==0:mask|=1<<10
   if frame%p['discardPeriod']==0:mask|=1<<11
   video,audio,_=core.step(mask);wav.writeframes(audio);audio_hash.update(audio)
   ram.write(C.string_at(maps[0x03000000]+P['sound_start'],P['sound_end']-P['sound_start']))
   tape.write(json.dumps({'frame':frame,'mask':mask,'video_sha256':hashlib.sha256(video[3]).hexdigest()})+'\n')
 report={'frames':P['end'],'pcmSha256':audio_hash.hexdigest(),'inputTapeSha256':hashlib.sha256((out/'inputs.jsonl').read_bytes()).hexdigest()}
 (out/'summary.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'out':str(out),**report}))
finally:core.close()
