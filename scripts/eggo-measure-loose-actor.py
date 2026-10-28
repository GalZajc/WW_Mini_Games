"""Execute the original loose-owner pass with observed/diagnostic actor positions."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_INTR
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3,UC_ARM_REG_PC
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_11-36-06_347882/collapse-loose-cell.frame00342',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','entry':0x0800cdb0,
 'field':0x0200333c,'frame_address':0x02011a9c,'frame':1320,
 'actor_offset':0x898,'velocity_offset':0x8b0,'return':0x08000000,'instruction_limit':100000}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
PARAMETERS['rom_sha256']=hashlib.sha256(rom).hexdigest();PARAMETERS['ram_sha256']=hashlib.sha256(ram).hexdigest();PARAMETERS['iwram_sha256']=hashlib.sha256(iwram).hexdigest()
def signed(v):return v if v<0x80000000 else v-0x100000000
def interrupt(uc,number,data):
 pc=uc.reg_read(UC_ARM_REG_PC);swi=struct.unpack('<H',bytes(uc.mem_read(pc-2,2)))[0]&255
 if swi==6:
  a=signed(uc.reg_read(UC_ARM_REG_R0));b=signed(uc.reg_read(UC_ARM_REG_R1));assert b
  quotient=abs(a)//abs(b)*(1 if a*b>=0 else -1)
  for register,value in [(UC_ARM_REG_R0,quotient),(UC_ARM_REG_R1,a-quotient*b),(UC_ARM_REG_R3,abs(quotient))]:uc.reg_write(register,value&0xffffffff)
 else:raise AssertionError(f'Unsupported native BIOS call {swi} at {pc:x}')
cases=[{'name':'observed-no-contact','actor':None},
 {'name':'inside-moving-cell','actor':[31,668]},
 {'name':'left-of-moving-cell','actor':[30,668]},
 {'name':'right-of-moving-cell','actor':[47,668]},
 {'name':'above-moving-cell','actor':[31,667]},
 {'name':'below-moving-cell','actor':[31,684]}]
records=[]
for case in cases:
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:uc.mem_map(base,size);uc.mem_write(base,data)
 for base,size,suffix in [(0x04000000,0x1000,'.0x4000000'),(0x05000000,0x1000,'.0x5000000'),(0x06000000,0x20000,'.memory3'),(0x07000000,0x1000,'.0x7000000')]:uc.mem_map(base,size);uc.mem_write(base,Path(str(source)+suffix).read_bytes())
 uc.mem_write(PARAMETERS['frame_address'],struct.pack('<I',PARAMETERS['frame']))
 actor=PARAMETERS['field']+PARAMETERS['actor_offset'];velocity=PARAMETERS['field']+PARAMETERS['velocity_offset']
 if case['actor']:uc.mem_write(actor,struct.pack('<ii',*[v*65536 for v in case['actor']]))
 before_actor=list(struct.unpack('<ii',bytes(uc.mem_read(actor,8))));before_velocity=struct.unpack('<i',bytes(uc.mem_read(velocity,4)))[0]
 uc.hook_add(UC_HOOK_INTR,interrupt)
 for register,value in [(UC_ARM_REG_SP,0x03007000),(UC_ARM_REG_LR,PARAMETERS['return']|1),(UC_ARM_REG_R0,PARAMETERS['field'])]:uc.reg_write(register,value)
 uc.emu_start(PARAMETERS['entry']|1,PARAMETERS['return'],count=PARAMETERS['instruction_limit'])
 after_actor=list(struct.unpack('<ii',bytes(uc.mem_read(actor,8))));after_velocity=struct.unpack('<i',bytes(uc.mem_read(velocity,4)))[0]
 root=struct.unpack('<I',bytes(uc.mem_read(PARAMETERS['field']+0x12a8,4)))[0]
 board=bytes(uc.mem_read(root+0xc80,47*8));rows=[list(board[y*8:y*8+7]) for y in range(46,-1,-1)]
 records.append({**case,'before_actor':before_actor,'after_actor':after_actor,'before_velocity':before_velocity,'after_velocity':after_velocity,'rows_after':rows})
 print(case['name'],before_velocity/65536,'->',after_velocity/65536)
out=ROOT/'scripts/OUTPUT'/('eggo-loose-actor_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
fixture={'parameters':PARAMETERS,'cases':records,'limits':'Original Thumb loose-owner pass and ARM dependencies, with BIOS signed division supplied as arithmetic. Diagnostic actor positions verify the routine response, not full subsequent actor integration.'}
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/'tests/fixtures/eggo-loose-actor-gba.json',fixture)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'actor.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.writer(f);writer.writerow(['name','before_velocity','after_velocity'])
 for r in records:writer.writerow([r['name'],r['before_velocity'],r['after_velocity']])
print(out)
