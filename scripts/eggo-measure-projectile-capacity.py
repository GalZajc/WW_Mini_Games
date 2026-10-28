"""Execute the original seven-slot bomb/hammer allocator, including saturation."""
from pathlib import Path
from datetime import datetime
import sys, struct, json, hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_LR, UC_ARM_REG_SP
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'entry':0x0800426c,'return':0x08000100,'stack':0x03007000,'slot_count':7,'slot_stride':40,
 'boards':[0x0200f404,0x02010650],'actors':[0x02003bd4,0x02004f50],
 'instruction_limit':3000,'seed':None}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
cases=[]
for field in range(2):
 for kind in [8,9]:
  for hole in [-1,*range(PARAMETERS['slot_count'])]:
   uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
   for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:
    uc.mem_map(base,size);uc.mem_write(base,data)
   board=PARAMETERS['boards'][field];actor=PARAMETERS['actors'][field];writes=[]
   def put(at,value):
    uc.mem_write(at,struct.pack('<I',value&0xffffffff));writes.append({'address':at,'value':value})
   put(board+0x1248,actor);put(actor+0x864,kind)
   occupied=[i!=hole for i in range(PARAMETERS['slot_count'])]
   for i,active in enumerate(occupied):put(board+0xf80+i*PARAMETERS['slot_stride'],int(active))
   before=bytes(uc.mem_read(board+0xf80,PARAMETERS['slot_count']*PARAMETERS['slot_stride']))
   uc.reg_write(UC_ARM_REG_R0,board);uc.reg_write(UC_ARM_REG_R1,kind-8)
   uc.reg_write(UC_ARM_REG_LR,PARAMETERS['return']|1);uc.reg_write(UC_ARM_REG_SP,PARAMETERS['stack'])
   uc.emu_start(PARAMETERS['entry']|1,PARAMETERS['return'],count=PARAMETERS['instruction_limit'])
   word=lambda at:struct.unpack('<i',bytes(uc.mem_read(at,4)))[0]
   returned=uc.reg_read(UC_ARM_REG_R0);held=word(actor+0x864)
   assert returned==int(hole>=0) and held==(-1 if hole>=0 else kind)
   if hole<0:assert before==bytes(uc.mem_read(board+0xf80,len(before)))
   cases.append({'field':field,'kind':kind,'occupied':occupied,'selected_slot':hole if hole>=0 else None,
                 'returned':returned,'held_after':held,'diagnostic_writes':writes})
out=ROOT/'scripts/OUTPUT'/('eggo-projectile-capacity_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True,exist_ok=True)
fixture={'parameters':PARAMETERS,'cases':cases,'limits':'Diagnostic allocator calls; does not establish all item-use caller effects.'}
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/'tests/fixtures/eggo-projectile-capacity-gba.json',fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print({'cases':len(cases),'output':str(out)})
