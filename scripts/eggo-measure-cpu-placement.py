"""Execute the original ordinary-piece commit timer, including parity and dive."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8,UC_ARM_REG_R0
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'entry':0x0800797a,'exits':[0x0800678c,0x08007abc,0x08008276],
 'cpu':0x02005a40,'actor':0x02004f50,'board':0x02010650,'stack':0x03007000,
 'instruction_limit':1000,'fixture':'tests/fixtures/eggo-cpu-placement-gba.json'}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
cases=[]
for kind,rotation,row,roof in [(0,0,47,47),(2,1,47,47),(2,1,45,47),(2,0,47,47),(8,0,47,47),(10,0,47,47)]:
 for wait in [0,31,2,1]:
  for frame in [200,201]:cases.append({'kind':kind,'targetRotation':rotation,'actorRow':row,'roofRow':roof,
   'wait':wait,'frame':frame,'difficulty':6,'targetColumn':3,'clock':99})
PARAMETERS['cases']=cases;records=[]
for case in cases:
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:
  uc.mem_map(base,size);uc.mem_write(base,data)
 cpu=PARAMETERS['cpu'];actor=PARAMETERS['actor'];board=PARAMETERS['board'];stack=PARAMETERS['stack'];writes=[]
 def put(name,address,value):
  uc.mem_write(address,struct.pack('<I',value&0xffffffff));writes.append({'name':name,'address':address,'value':value})
 for name,at,value in [('actor',stack+0x70,actor),('board',stack+0x38,board),('clockPointer',stack+0xb0,cpu+0xc8),
  ('targetColumn',cpu,case['targetColumn']),('wait',cpu+0xfc,case['wait']),('difficulty',cpu+0xf0,case['difficulty']),
  ('targetRotation',cpu+0xb8,case['targetRotation']),('kind',actor+0x864,case['kind']),
  ('actorRow',stack+0x60,case['actorRow']),('roofRow',board+0xed0+case['targetColumn']*4,case['roofRow']),
  ('frame',0x02011a9c,case['frame']),('stall',cpu+0x104,0),('clock',cpu+0xc8,case['clock'])]:put(name,at,value)
 exit_info={}
 def code(uc,address,size,data):
  if address in PARAMETERS['exits']:
   exit_info.update(address=address,keys=uc.reg_read(UC_ARM_REG_R0) if address==0x08008276 else 0)
   uc.emu_stop()
 uc.hook_add(UC_HOOK_CODE,code);uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu)
 uc.emu_start(PARAMETERS['entry']|1,0x08008286,count=PARAMETERS['instruction_limit']);assert exit_info
 read=lambda at:struct.unpack('<I',bytes(uc.mem_read(at,4)))[0]
 records.append({'input':case,**exit_info,'afterWait':read(cpu+0xfc),'afterStall':read(cpu+0x104),
  'afterClock':read(cpu+0xc8),'diagnostic_writes':writes})
fixture={'parameters':PARAMETERS,'cases':records,'limits':'Original commit timer entered after readiness checks, not the whole controller.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-placement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'placement.csv').open('w',encoding='utf-8',newline='') as stream:
 rows=[{**r['input'],**{k:v for k,v in r.items() if k not in ['input','diagnostic_writes']}} for r in records]
 writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print({'cases':len(records),'output':str(out)})
