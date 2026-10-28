"""Inspect the original isolated sound-driver instruction and I/O footprint.

No ROM is changed or shipped; this is a bounded diagnostic for replacing the
current whole-track/WAV approximation with the actual sequencer and mixer.
"""
from pathlib import Path
from datetime import datetime,timezone
from collections import Counter
import ctypes as C,hashlib,json,sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/eggo-recorder'));sys.path.insert(0,str(ROOT/'scripts/.tools'))
from core import Core
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_CODE,UC_HOOK_MEM_WRITE,UC_HOOK_MEM_READ
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_CPSR
from capstone import Cs,CS_ARCH_ARM,CS_MODE_THUMB

P={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','core':'tools/eggo-recorder/runtime/mgba_libretro.dll',
 'recording':'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
 'restore_after':300,'probe_frame':400,'entry':0x0801f480,'stop':0x0803fff0,'stack':0x03007e00,'instruction_limit':1000000}
out=ROOT/'scripts/OUTPUT'/('eggo-audio-driver-probe_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
rom=Path(P['rom']).read_bytes();P['rom_sha256']=hashlib.sha256(rom).hexdigest()
core=Core(ROOT/P['core'],P['rom'],ROOT/'tools/eggo-recorder/runtime',capture_memory=False)
try:
 core.restore((ROOT/P['recording']/f"after-frame-{P['restore_after']:08d}.state").read_bytes())
 for line in (ROOT/P['recording']/'inputs.jsonl').open(encoding='utf-8'):
  f=json.loads(line)
  if f['frame']<=P['restore_after']:continue
  if f['frame']>P['probe_frame']:break
  core.step(f['mask'])
 maps={base:ptr+offset for base,ptr,offset,size in core.maps if ptr}
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB);uc.mem_map(0x08000000,len(rom));uc.mem_write(0x08000000,rom)
 for base,size in [(0x02000000,0x40000),(0x03000000,0x8000),(0x04000000,0x1000)]:
  uc.mem_map(base,size);uc.mem_write(base,C.string_at(maps[base],min(size,0x400) if base==0x04000000 else size))
 (out/'initial-io.bin').write_bytes(bytes(uc.mem_read(0x04000000,0x400)))
 (out/'initial-ewram.bin').write_bytes(bytes(uc.mem_read(0x02000000,0x40000)))
 before=bytes(uc.mem_read(0x03000000,0x8000));(out/'initial-iwram.bin').write_bytes(before)
 instructions=Counter();opcodes={};io=[];pages=Counter();modes=Counter()
 def code(cpu,at,size,_):
  raw=bytes(cpu.mem_read(at,size));instructions[at]+=1;opcodes[at]=raw.hex();modes['thumb' if cpu.reg_read(UC_ARM_REG_CPSR)&32 else 'arm']+=1
 def write(cpu,access,at,size,value,_):
  if 0x04000000<=at<0x04001000:io.append({'address':hex(at),'size':size,'value':value})
 def read(cpu,access,at,size,value,_):
  if at>=0x08000000:pages[at&~4095]+=1
 uc.hook_add(UC_HOOK_CODE,code);uc.hook_add(UC_HOOK_MEM_WRITE,write);uc.hook_add(UC_HOOK_MEM_READ,read)
 uc.reg_write(UC_ARM_REG_CPSR,0x3f);uc.reg_write(UC_ARM_REG_SP,P['stack']);uc.reg_write(UC_ARM_REG_LR,P['stop']|1)
 uc.emu_start(P['entry']|1,P['stop'],count=P['instruction_limit'])
 after=bytes(uc.mem_read(0x03000000,0x8000));(out/'result-iwram.bin').write_bytes(after)
 (out/'result-io.bin').write_bytes(bytes(uc.mem_read(0x04000000,0x400)))
 md=Cs(CS_ARCH_ARM,CS_MODE_THUMB);names=Counter()
 for at,raw in opcodes.items():
  for instruction in md.disasm(bytes.fromhex(raw),at):names[instruction.mnemonic]+=instructions[at]
 summary={'instructions':sum(instructions.values()),'unique_instructions':len(instructions),'modes':dict(modes),'mnemonics':dict(names),
  'read_rom_pages':{hex(at):n for at,n in sorted(pages.items())},'io_writes':io,'modified_iwram_bytes':sum(a!=b for a,b in zip(before,after))}
 (out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8');(out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
 print(json.dumps({'out':str(out),'instructions':summary['instructions'],'modes':summary['modes'],'mnemonics':summary['mnemonics'],'io_writes':len(io)}))
finally:core.close()
