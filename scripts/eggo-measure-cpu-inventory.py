"""Execute original inventory dispatch/timer gates; all diagnostic inputs logged."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,sys,csv
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','entry':0x08006d84,
 'cpu':0x02005a40,'actor':0x02004f50,'stack':0x03007000,'frame_address':0x02011a9c,
 'instruction_limit':1000,'difficulty':6,'mode':5,'clock':123,
 'kinds':[0,2,7,8,9,10,11,12],'periods':[0,1,2,1280],'frames':[200,201],
 'fixture':'tests/fixtures/eggo-cpu-inventory-gba.json'}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
cases=[]
for kind in PARAMETERS['kinds']:
 for period in PARAMETERS['periods']:
  for frame in PARAMETERS['frames']:
   uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
   for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:
    uc.mem_map(base,size);uc.mem_write(base,data)
   writes=[];cpu=PARAMETERS['cpu'];actor=PARAMETERS['actor'];stack=PARAMETERS['stack']
   def put(name,at,value):
    uc.mem_write(at,struct.pack('<I',value&0xffffffff));writes.append({'name':name,'address':at,'value':value})
   for name,at,value in [('kind',actor+0x864,kind),('period',cpu+0x100,period),('clock',cpu+0xc8,PARAMETERS['clock']),
    ('stall',cpu+0x104,0),('difficulty',cpu+0xf0,PARAMETERS['difficulty']),('mode',0x020118a4,PARAMETERS['mode']),
    ('frame',PARAMETERS['frame_address'],frame),('stack_actor',stack+0x70,actor),('stack_clock',stack+0xb0,cpu+0xc8)]:put(name,at,value)
   result={}
   def hook(uc,address,size,data):
    exits={0x08006db4:'plan',0x08006ec8:'plan',0x08007054:'plan',0x0800678c:'defer',0x08007dae:'use'}
    if address in exits:result['action']=exits[address];uc.emu_stop()
   uc.hook_add(UC_HOOK_CODE,hook);uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu)
   uc.emu_start(PARAMETERS['entry']|1,0x08008276,count=PARAMETERS['instruction_limit'])
   assert result
   word=lambda at:struct.unpack('<I',bytes(uc.mem_read(at,4)))[0]
   cases.append({'kind':kind,'period':period,'frame':frame,'action':result['action'],
    'after':{name:word(cpu+offset) for name,offset in [('clock',0xc8),('period',0x100),('stall',0x104)]},'diagnostic_writes':writes})
fixture={'parameters':PARAMETERS,'cases':cases,'limits':'Original inventory instruction segment, not complete tool navigation or match replay.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-inventory_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'inventory.csv').open('w',encoding='utf-8',newline='') as f:
 rows=[{k:v for k,v in c.items() if k not in ('after','diagnostic_writes')}|c['after'] for c in cases]
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print(out)
