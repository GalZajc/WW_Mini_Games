"""Statically specialize ROM Thumb instructions into C for cycle-accurate work.

This is an experimental diagnostic program, not a shipped emulator/ROM. All
original game instructions in the specified executable ranges become named,
compile-time C operations; the original CPU/platform remains the timing ABI.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,csv,hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--rom',default='C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba');args=parser.parse_args()
P={'rom':args.rom,'ranges':[[0,0x22000],[0xb8000,0xbc000]],'pageBytes':4096,
 'maxLoopInstructions':64,
 'armRanges':[{'source':0,'address':0x08000000,'length':0x110},
              {'source':0x10c,'address':0x0200e9c0,'length':0x800},
              {'source':0xb8000,'address':0x080b8000,'length':0x4000},
              {'source':0x3ef5dc,'address':0x083ef5dc,'length':0x40}],
 'source':'scripts/.tools/mgba-audio-source/mgba-70ed83c','sdk':'scripts/.tools/wasi-sdk-27.0-x86_64-windows',
 'purpose':'Ahead-of-time C specialization of original game instructions; diagnostic before integration. No recorded events or timing corrections.'}
out=ROOT/'scripts/OUTPUT'/('eggo-thumb-recompile_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
source=ROOT/P['source'];rom=Path(args.rom).read_bytes();P['romSha256']=hashlib.sha256(rom).hexdigest()
flags=['-DNDEBUG','-DM_CORE_GBA','-DMINIMAL_CORE=2','-DDISABLE_THREADING','-D_GNU_SOURCE','-I',str(source/'include'),'-I',str(source/'src'),'-I',str(ROOT/'scripts/.tools/mgba-native-audio-build/include')]
preprocess=subprocess.run([str(ROOT/P['sdk']/'bin/clang.exe'),'-E','-P',*flags,str(source/'src/arm/isa-thumb.c')],capture_output=True,text=True,encoding='utf-8',check=True)
table=re.search(r'const ThumbInstruction _thumbTable\[0x400\]\s*=\s*\{(.*?)\};',preprocess.stdout,re.S).group(1)
names=re.findall(r'_ThumbInstruction\w+',table);assert len(names)==1024
unique=sorted(set(names));declarations='\n'.join('void eggo_aot_'+n+'(struct ARMCore*,unsigned);'for n in unique)
isa=(source/'src/arm/isa-thumb.c').read_text(encoding='utf-8')+'\n'
isa+='\n'.join('__attribute__((always_inline)) void eggo_aot_'+n+'(struct ARMCore* cpu,unsigned op){'+n+'(cpu,op);}'for n in unique)+'\n'
(out/'isa-thumb-aot.c').write_text(isa,encoding='utf-8')
arm=(source.parent/'70ed83c-arm-original.c').read_text(encoding='utf-8')
armKnown='||'.join(f'(site>=0x{r["address"]:08x}u&&site<0x{r["address"]+r["length"]:08x}u)'for r in P['armRanges'])
thumbKnown='||'.join(f'(offset>=0x{a:x}u&&offset<0x{b:x}u)'for a,b in P['ranges'])
arm=arm.replace('static inline void ARMStep(struct ARMCore* cpu) {',
 'extern void eggo_aot_arm_step(struct ARMCore*,uint32_t);\nstatic inline void ARMStep(struct ARMCore* cpu) {\n uint32_t site=(uint32_t)cpu->gprs[15]-4;\n if('+armKnown+'){eggo_aot_arm_step(cpu,site);return;}',1)
arm=arm.replace('static inline void ThumbStep(struct ARMCore* cpu) {',
 'extern void eggo_aot_step(struct ARMCore*,uint32_t);\nstatic inline void ThumbStep(struct ARMCore* cpu) {\n uint32_t site=(uint32_t)cpu->gprs[15]-2,offset=site&0x01ffffff;\n if((site>>24)>=8&&(site>>24)<=13&&('+thumbKnown+')){eggo_aot_step(cpu,site);return;}',1)
start=arm.index('void ARMRunLoop(struct ARMCore* cpu) {');before,run=arm[:start],arm[start:]
run=run.replace('void ARMRunLoop(struct ARMCore* cpu) {','extern void eggo_aot_run(struct ARMCore*,uint32_t);\nvoid ARMRunLoop(struct ARMCore* cpu) {',1)
run=run.replace('\t\t\tThumbStep(cpu);','\t\t\tuint32_t site=(uint32_t)cpu->gprs[15]-2,offset=site&0x01ffffff;\n\t\t\tif((site>>24)>=8&&(site>>24)<=13&&('+thumbKnown+'))eggo_aot_run(cpu,site);else ThumbStep(cpu);',1)
arm=before+run
(out/'arm-aot.c').write_text(arm,encoding='utf-8')
pages=[];sources=[]
with (out/'instructions.csv').open('w',encoding='utf-8',newline='')as f:
 writer=csv.writer(f);writer.writerow(['address','opcode','cOperation'])
 for start,end in P['ranges']:
  for page in range(start,end,P['pageBytes']):
   fn=f'eggo_aot_page_{page:06x}';pages.append((page,fn));code=['#include <mgba/internal/arm/arm.h>',declarations,'#ifdef EGGO_STEMS\nvoid eggo_stem_cpu_point(struct ARMCore*,uint32_t);\n#endif',f'void {fn}(struct ARMCore* cpu,uint32_t site){{switch(site){{']
   for offset in range(page,min(page+P['pageBytes'],end),2):
    op=int.from_bytes(rom[offset:offset+2],'little');handler=names[op>>6];address=0x08000000+offset
    hook=f'\n#ifdef EGGO_STEMS\n eggo_stem_cpu_point(cpu,0x{address:08x});\n#endif\n'if address in (0x0801f480,0x0802070c)else''
    code.append(f'case 0x{address:08x}: {hook}eggo_aot_{handler}(cpu,0x{op:04x});return;');writer.writerow([f'{address:08x}',f'{op:04x}',handler])
   code.append('default:__builtin_trap();}}\n');name=f'page-{page:06x}.c';sources.append(name);(out/name).write_text('\n'.join(code),encoding='utf-8')
dispatch=['#include <mgba/internal/arm/arm.h>','#include <mgba/internal/arm/isa-inlines.h>',
 'static uint64_t aotSteps;static uint32_t missingPC;extern uint64_t eggo_aot_loop_steps;',
 'extern uint64_t eggo_aot_arm_steps;extern uint32_t eggo_aot_arm_missing;',
 'uint64_t eggo_aot_executed(void){return aotSteps+eggo_aot_loop_steps+eggo_aot_arm_steps;}','uint32_t eggo_aot_missing_pc(void){return missingPC?missingPC:eggo_aot_arm_missing;}']
dispatch.extend('void '+fn+'(struct ARMCore*,uint32_t);'for _,fn in pages)
dispatch+=['void eggo_aot_step(struct ARMCore* cpu,uint32_t site){',
 'site=(site&0x01ffffff)|0x08000000;cpu->prefetch[0]=cpu->prefetch[1];cpu->gprs[15]+=2;',
 'LOAD_16(cpu->prefetch[1],cpu->gprs[15]&cpu->memory.activeMask,cpu->memory.activeRegion);aotSteps++;switch(site&~4095u){']
dispatch.extend(f'case 0x{0x08000000+page:08x}:{fn}(cpu,site);return;'for page,fn in pages)
dispatch+=['default:missingPC=site;__builtin_trap();}}']
(out/'aot-dispatch.c').write_text('\n'.join(dispatch),encoding='utf-8');sources+=['aot-dispatch.c']
# Natural backward loops are compiled as real C loops. Every instruction keeps
# its original prefetch and event-budget check; no CPU cycles are skipped.
def control_flow(op):
 if op>=0xd000:return True
 if (op&0xfe00)==0xbc00 and op&0x100:return True
 if 0x4400<=op<0x4800:
  kind=(op>>8)&3;dest=(op&7)|((op>>4)&8)
  return kind==3 or (dest==15 and kind in (0,2))
 return False
loops={}
for start,end in P['ranges']:
 for at in range(start,end,2):
  op=int.from_bytes(rom[at:at+2],'little')
  if not 0xd000<=op<0xde00:continue
  imm=op&255;imm=imm-256 if imm>=128 else imm;target=at+4+imm*2
  if target<start or target>=at or (at-target)//2+1>P['maxLoopInstructions'] or target in loops:continue
  body=[(i,int.from_bytes(rom[i:i+2],'little'))for i in range(target,at+2,2)]
  if any(control_flow(code)or names[code>>6].endswith('ILL')for _,code in body[:-1]):continue
  loops[target]=body
loop_pages={}
for target,body in loops.items():loop_pages.setdefault(target//P['pageBytes']*P['pageBytes'],[]).append((target,body))
for page,bodies in loop_pages.items():
 code=['#include <mgba/internal/arm/arm.h>','#include <mgba/internal/arm/isa-inlines.h>',declarations,'extern uint64_t eggo_aot_loop_steps;','#ifdef EGGO_STEMS\nvoid eggo_stem_cpu_point(struct ARMCore*,uint32_t);\n#endif']
 for target,body in bodies:
  code.append(f'__attribute__((noinline)) void eggo_aot_loop_{target:06x}(struct ARMCore* cpu){{for(;;){{')
  for at,op in body:
   if at+0x08000000 in (0x0801f480,0x0802070c):code.append(f'#ifdef EGGO_STEMS\n eggo_stem_cpu_point(cpu,0x{at+0x08000000:08x});\n#endif')
   code+=['cpu->prefetch[0]=cpu->prefetch[1];cpu->gprs[15]+=2;',
    'LOAD_16(cpu->prefetch[1],cpu->gprs[15]&cpu->memory.activeMask,cpu->memory.activeRegion);eggo_aot_loop_steps++;',
    f'eggo_aot_{names[op>>6]}(cpu,0x{op:04x});',
    'if(cpu->cycles>=cpu->nextEvent||cpu->executionMode!=MODE_THUMB)return;']
   expected=(target+0x08000002)if at==body[-1][0]else(at+0x08000004)
   code.append(f'if((uint32_t)cpu->gprs[15]!=0x{expected:08x})return;')
  code.append('}}')
 name=f'loops-{page:06x}.c';(out/name).write_text('\n'.join(code),encoding='utf-8');sources.append(name)
code=['#include <mgba/internal/arm/arm.h>','uint64_t eggo_aot_loop_steps;',
 'uint64_t eggo_aot_loop_executed(void){return eggo_aot_loop_steps;}',
 'void eggo_aot_step(struct ARMCore*,uint32_t);']
code.extend(f'void eggo_aot_loop_{at:06x}(struct ARMCore*);'for at in loops)
code+=['void eggo_aot_run(struct ARMCore* cpu,uint32_t site){site=(site&0x01ffffff)|0x08000000;switch(site){']
code.extend(f'case 0x{0x08000000+at:08x}:eggo_aot_loop_{at:06x}(cpu);return;'for at in loops)
code+=['default:eggo_aot_step(cpu,site);return;}}']
(out/'aot-loop-dispatch.c').write_text('\n'.join(code),encoding='utf-8');sources.append('aot-loop-dispatch.c')
# ARM cartridge startup and the exact IRQ dispatcher copied by DMA into EWRAM
# are specialized too. BIOS and other RAM-resident ARM routines retain their
# existing platform decoder; do not describe this as a completely decompiled
# game while those routines still execute through it.
preprocess=subprocess.run([str(ROOT/P['sdk']/'bin/clang.exe'),'-E','-P',*flags,str(source/'src/arm/isa-arm.c')],capture_output=True,text=True,encoding='utf-8',check=True)
table=re.search(r'const ARMInstruction _armTable\[0x1000\]\s*=\s*\{(.*?)\};',preprocess.stdout,re.S).group(1)
armNames=re.findall(r'_ARMInstruction\w+',table);assert len(armNames)==4096
operations=[]
for r in P['armRanges']:
 for at in range(0,r['length'],4):
  op=int.from_bytes(rom[r['source']+at:r['source']+at+4],'little')
  operations.append((r['address']+at,op,armNames[((op>>16)&0xff0)|((op>>4)&15)]))
handlers=sorted({name for _,_,name in operations})
isa=(source/'src/arm/isa-arm.c').read_text(encoding='utf-8')+'\n'
isa+='\n'.join('__attribute__((always_inline)) void eggo_aot_'+n+'(struct ARMCore* cpu,unsigned op){'+n+'(cpu,op);}'for n in handlers)+'\n'
(out/'isa-arm-aot.c').write_text(isa,encoding='utf-8')
code=['#include <mgba/internal/arm/arm.h>','#include <mgba/internal/arm/isa-inlines.h>','#include <mgba/internal/arm/isa-arm.h>',
 'uint64_t eggo_aot_arm_steps;uint32_t eggo_aot_arm_missing;']
code.extend('void eggo_aot_'+name+'(struct ARMCore*,unsigned);'for name in handlers)
code+=['static const uint16_t conditions[16]={0xf0f0,0x0f0f,0xcccc,0x3333,0xff00,0x00ff,0xaaaa,0x5555,0x0c0c,0xf3f3,0xaa55,0x55aa,0x0a05,0xf5fa,0xffff,0};',
 'void eggo_aot_arm_step(struct ARMCore* cpu,uint32_t site){',
 'cpu->prefetch[0]=cpu->prefetch[1];cpu->gprs[15]+=4;',
 'LOAD_32(cpu->prefetch[1],cpu->gprs[15]&cpu->memory.activeMask,cpu->memory.activeRegion);eggo_aot_arm_steps++;switch(site){']
for at,op,name in operations:
 condition=op>>28
 check=f'if(!(conditions[{condition}]&(1u<<(cpu->cpsr.flags>>4)))){{cpu->cycles+=ARM_PREFETCH_CYCLES;return;}}'if condition!=14 else''
 code.append(f'case 0x{at:08x}: {check}eggo_aot_{name}(cpu,0x{op:08x});return;')
code+=['default:eggo_aot_arm_missing=site;__builtin_trap();}}']
(out/'aot-arm-dispatch.c').write_text('\n'.join(code),encoding='utf-8');sources.append('aot-arm-dispatch.c')
P['armInstructions']=len(operations)
# The compiled program also supplies its instruction bytes for native bus
# prefetch/data reads. Assets can then contain extracted non-program data,
# rather than a renamed complete cartridge. This does not eliminate the RAM
# ARM decoder documented above.
imageRanges=[(a,b)for a,b in P['ranges']]+[(0x3ef5dc,0x3ef61c)]
image=['#include <stdint.h>','#include <string.h>','extern void* eggo_cycle_rom_buffer(void);']
for index,(start,end)in enumerate(imageRanges):
 words=[int.from_bytes(rom[i:i+2],'little')for i in range(start,end,2)]
 image.append(f'static const uint16_t code_{index}[]={{'+','.join(hex(v)for v in words)+'};')
image.append('void eggo_program_restore_code(void){uint8_t* memory=eggo_cycle_rom_buffer();')
image.extend(f'memcpy(memory+{a},code_{i},{b-a});'for i,(a,b)in enumerate(imageRanges))
image.append('}')
(out/'aot-program-image.c').write_text('\n'.join(image),encoding='utf-8');sources.append('aot-program-image.c')
P['compiledImageRanges']=imageRanges
P['naturalLoops']=len(loops)
P['untranslatedExecution']='Original platform CPU decoder; no guessed instruction or audio fallback.'
P['generatedSources']=sources;P['instructions']=sum((b-a)//2 for a,b in P['ranges']);P['operationTemplates']=len(unique)
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),'instructions':P['instructions'],'sources':len(sources)}))
