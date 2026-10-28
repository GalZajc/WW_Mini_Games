"""Execute the original rotation gate, with logged diagnostic inputs."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,sys,csv
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'entry':0x0800819a,'end':0x080081fc,'cpu':0x02005a40,'actor':0x02004f50,'stack':0x03007000,
 'instruction_limit':1000,'keys_before':80,
 'cases':[(0,0,0),(0,3,0),(1,3,15),(2,3,1),(2,3,0),(3,3,10)],
 'fixture':'tests/fixtures/eggo-cpu-rotation-gba.json'}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes();ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
cases=[]
for current,target,wait in PARAMETERS['cases']:
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:
  uc.mem_map(base,size);uc.mem_write(base,data)
 writes=[]
 def set_word(name,at,value):
  uc.mem_write(at,struct.pack('<I',value&0xffffffff));writes.append({'name':name,'address':at,'value':value})
 cpu=PARAMETERS['cpu'];actor=PARAMETERS['actor'];stack=PARAMETERS['stack']
 for name,address,value in [('current',actor+0x868,current),('target',cpu+0xb8,target),('wait',cpu+0xb4,wait),
  ('stack_actor',stack+0x70,actor),('stack_target',stack+0xac,cpu+0xb8),('stack_keys',stack+0x3c,PARAMETERS['keys_before'])]:set_word(name,address,value)
 uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu)
 uc.emu_start(PARAMETERS['entry']|1,PARAMETERS['end'],count=PARAMETERS['instruction_limit'])
 read=lambda at:struct.unpack('<I',bytes(uc.mem_read(at,4)))[0]
 cases.append({'current':current,'target':target,'wait':wait,'after_wait':read(cpu+0xb4),
  'keys_before':PARAMETERS['keys_before'],'keys_after':read(stack+0x3c),
  'rotation_binding':read(0x02000158),'mode':read(0x020118a4),'diagnostic_writes':writes})
fixture={'parameters':PARAMETERS,'cases':cases,
 'limits':'Original rotation instruction segment in captured Survival state, not the full CPU controller.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-rotation_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'rotation.csv').open('w',encoding='utf-8',newline='') as stream:
 rows=[{k:v for k,v in c.items() if k!='diagnostic_writes'} for c in cases]
 writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print(out)
