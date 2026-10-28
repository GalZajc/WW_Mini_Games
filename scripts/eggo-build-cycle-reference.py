"""Build an unshipped, silent WASM reference for CPU/IRQ causality tests."""
from pathlib import Path
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
import argparse,hashlib,json,re,subprocess,shutil
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--resume');parser.add_argument('--reuse');parser.add_argument('--aot');parser.add_argument('--stems',action='store_true');args=parser.parse_args()
P={'source':'scripts/.tools/mgba-audio-source/mgba-70ed83c','sdk':'scripts/.tools/wasi-sdk-27.0-x86_64-windows',
 'nativeManifest':'scripts/.tools/mgba-native-audio-build/build.ninja','parallelCompiles':2,'memoryLimitBytes':134217728,
 'purpose':'Diagnostic only. Original ARM/video/DMA timers. No cartridge or machine state embedded.',
 'exports':['eggo_cycle_rom_buffer','eggo_cycle_state_buffer','eggo_cycle_state_size','eggo_cycle_pcm_buffer','eggo_cycle_video_buffer','eggo_cycle_sound_ram','eggo_cycle_init','eggo_cycle_step',
 'eggo_cycle_pc','eggo_cycle_read32','eggo_cycle_write32','eggo_cycle_save','eggo_cycle_seek_frame','eggo_cycle_seek_ready_frame','eggo_cycle_sample_rate']}
out=Path(args.resume).resolve()if args.resume else ROOT/'scripts/OUTPUT'/('eggo-cycle-reference-build_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True,exist_ok=bool(args.resume))
previous=json.loads((out/'parameters.json').read_text(encoding='utf-8'))if args.resume else {}
reuse=Path(args.reuse).resolve()if args.reuse else None
reused=json.loads((reuse/'parameters.json').read_text(encoding='utf-8'))if reuse else {}
reuseKeys=list(reused.get('sourceSha256',{}))
source=ROOT/P['source'];paths=[]
for line in (ROOT/P['nativeManifest']).read_text(encoding='utf-8').splitlines():
 m=re.match(r'build CMakeFiles/mgba_libretro.dir/(.+\.c)\.obj:',line)
 if not m:continue
 rel=m[1]
 if rel.startswith('src/platform/') or rel=='src/util/vfs/vfs-fd.c':continue
 src=(ROOT/'scripts/.tools/mgba-native-audio-build/version.c')if rel=='version.c' else source/rel
 pristine={'src/gba/audio.c':'70ed83c/src/gba/audio.c','src/gba/io.c':'70ed83c-io-original.c','src/gba/gba.c':'70ed83c-gba-original.c','src/arm/arm.c':'70ed83c-arm-original.c'}.get(rel)
 if pristine:src=source.parent/pristine
 paths.append(src)
paths.extend([source/'src/util/memory.c',ROOT/'scripts/native-audio/mgba-cycle-reference.c'])
if args.stems:
 P['stems']=True
 P['exports']+=['eggo_stem_iwram','eggo_stem_io','eggo_stem_prepared_ring','eggo_stem_music_ring','eggo_stem_pcm_owners','eggo_stem_output','eggo_stem_mixer_calls','eggo_stem_commands','eggo_stem_command_count']
 # Make private, reproducible instrumented copies. Never alter the installed
 # native reference core or its instruction/event timing.
 for i,src in enumerate(paths):
  code=None
  if src.name=='audio.c' and src.parent.name=='gba':
   code=src.read_text(encoding='utf-8')
   declarations='\nstruct GBAAudio;void eggo_stem_sample(struct GBAAudio*);void eggo_stem_register(struct GBAAudio*,unsigned,unsigned);void eggo_stem_fifo_write(struct GBAAudio*,int,uint32_t);void eggo_stem_fifo_sample(struct GBAAudio*,int,int32_t);\n'
   code=code.replace('#include <mgba/internal/gba/audio.h>','#include <mgba/internal/gba/audio.h>'+declarations,1)
   code=code.replace('GBAudioSamplePSG(&audio->psg, &sampleLeft, &sampleRight);','GBAudioSamplePSG(&audio->psg, &sampleLeft, &sampleRight);\n eggo_stem_sample(audio);',1)
   for fn,reg in [('SOUND1CNT_X',0x64),('SOUND2CNT_HI',0x6c),('SOUND3CNT_X',0x74),('SOUND4CNT_HI',0x7c),('SOUNDCNT_HI',0x82)]:
    marker=f'void GBAAudioWrite{fn}(struct GBAAudio* audio, uint16_t value) {{'
    assert marker in code;code=code.replace(marker,marker+f'\n eggo_stem_register(audio,{reg},value);',1)
   code=code.replace('uint32_t GBAAudioWriteFIFO(struct GBAAudio* audio, int address, uint32_t value) {','uint32_t GBAAudioWriteFIFO(struct GBAAudio* audio, int address, uint32_t value) {\n eggo_stem_fifo_write(audio,address,value);',1)
   code=code.replace('void GBAAudioSampleFIFO(struct GBAAudio* audio, int fifoId, int32_t cycles) {','void GBAAudioSampleFIFO(struct GBAAudio* audio, int fifoId, int32_t cycles) {\n eggo_stem_fifo_sample(audio,fifoId,cycles);',1)
  elif src==source/'src/gba/memory.c':
   code=src.read_text(encoding='utf-8');code+='\n'
   code=code.replace('#include <mgba/internal/gba/memory.h>','#include <mgba/internal/gba/memory.h>\nvoid eggo_stem_ram_write(struct GBA*,uint32_t,unsigned);',1)
   for store,size in [('STORE_32(value, address & (SIZE_WORKING_IRAM - 4), memory->iwram);',4),('STORE_16(value, address & (SIZE_WORKING_IRAM - 2), memory->iwram);',2),('((int8_t*) memory->iwram)[address & (SIZE_WORKING_IRAM - 1)] = value;',1)]:
    assert store in code;code=code.replace(store,store+f' eggo_stem_ram_write(gba,address,{size});')
  elif src.name=='70ed83c-arm-original.c' and not args.aot:
   code=src.read_text(encoding='utf-8')
   marker='static inline void ThumbStep(struct ARMCore* cpu) {'
   code=code.replace(marker,'extern void eggo_stem_cpu_point(struct ARMCore*,uint32_t);\n'+marker+'\n eggo_stem_cpu_point(cpu,(uint32_t)cpu->gprs[15]-2);',1)
  if code is not None:
   target=out/('stem-'+src.name);target.write_text(code,encoding='utf-8');paths[i]=target
 paths.append(ROOT/'scripts/native-audio/mgba-cycle-stems.c')
if args.aot:
 aot=Path(args.aot).resolve();aotParams=json.loads((aot/'parameters.json').read_text(encoding='utf-8'))
 P['aot']=str(aot);P['aotParameters']=aotParams;P['exports']+=['eggo_aot_executed','eggo_aot_missing_pc','eggo_aot_loop_executed','eggo_program_restore_code']
 paths=[aot/'arm-aot.c'if s.name=='70ed83c-arm-original.c'else aot/'isa-thumb-aot.c'if s==source/'src/arm/isa-thumb.c'else aot/'isa-arm-aot.c'if s==source/'src/arm/isa-arm.c'else s for s in paths]
 paths.extend(aot/n for n in aotParams['generatedSources'])
common=[str(ROOT/P['sdk']/'bin/clang.exe'),'-O3','-DNDEBUG','-DM_CORE_GBA','-DMINIMAL_CORE=2','-DDISABLE_THREADING','-DMGBA_STANDALONE',
 '-DCOLOR_16_BIT','-DCOLOR_5_6_5','-D_GNU_SOURCE','-DHAVE_STRDUP','-DHAVE_STRNDUP','-DHAVE_LOCALE','-DHAVE_LOCALTIME_R','-D_WASI_EMULATED_SIGNAL',
 '-ffunction-sections','-fdata-sections','-I',str(source/'include'),'-I',str(source/'src'),'-I',str(ROOT/'scripts/.tools/mgba-native-audio-build/include')]
if args.stems:common+=['-DEGGO_STEMS']
P['sourceSha256']={str(s.relative_to(ROOT)):hashlib.sha256(s.read_bytes()).hexdigest()for s in paths}
P['compileFlags']=common
P['sourceExtraFlags']={str(s.relative_to(ROOT)):['-flto','-fwrapv']for s in paths if args.aot and s.parent==aot and s.name!='arm-aot.c'}
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
def compile_one(pair):
 i,src=pair;obj=out/f'object-{i:03d}.o';key=str(src.relative_to(ROOT))
 extra=P['sourceExtraFlags'].get(key,[])
 if obj.exists() and previous.get('sourceSha256',{}).get(key)==P['sourceSha256'][key] and previous.get('compileFlags',common)==common and previous.get('sourceExtraFlags',{}).get(key,[])==extra:return obj,0
 if reused.get('compileFlags')==common:
  for oldKey in reuseKeys:
   if reused['sourceSha256'][oldKey]!=P['sourceSha256'][key] or reused.get('sourceExtraFlags',{}).get(oldKey,[])!=extra:continue
   candidate=reuse/f'object-{reuseKeys.index(oldKey):03d}.o'
   if candidate.exists():shutil.copy2(candidate,obj);return obj,0
 result=subprocess.run(common+extra+['-c',str(src),'-o',str(obj)],capture_output=True,text=True,encoding='utf-8',errors='replace')
 (out/f'compile-{i:03d}.log').write_text(result.stdout+result.stderr,encoding='utf-8');return obj,result.returncode
objects=[];failed=False
with ThreadPoolExecutor(max_workers=P['parallelCompiles'])as pool:
 for i,(obj,code)in enumerate(pool.map(compile_one,enumerate(paths))):
  objects.append(obj);failed|=code!=0
  if code:print(obj.name,'FAILED',flush=True)
  if (i+1)%20==0:print(f'{i+1}/{len(paths)} compiled',flush=True)
if not failed:
 command=[str(ROOT/P['sdk']/'bin/clang.exe'),'-mexec-model=reactor','-Wl,--gc-sections','-Wl,--max-memory='+str(P['memoryLimitBytes'])]+['-Wl,--export='+e for e in P['exports']]+[str(o)for o in objects]+['-lm','-lwasi-emulated-signal','-o',str(out/'cycle-reference.wasm')]
 result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace');(out/'link.log').write_text(result.stdout+result.stderr,encoding='utf-8');failed=result.returncode!=0
 print(result.stderr[-8000:])
print(json.dumps({'out':str(out),'failed':failed,'sources':len(paths)}));raise SystemExit(int(failed))
