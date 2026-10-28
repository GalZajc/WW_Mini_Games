"""Execute native CPU steering and reversal gates with logged diagnostic inputs."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'steering_entry':0x08007dc4,'steering_end':0x08007ef0,
 'direction_entry':0x080081fc,'direction_end':0x08008276,
 'cpu':0x02005a40,'actor':0x02004f50,'stack':0x03007000,
 'instruction_limit':1000,'fixed_scale':65536,'sentinel':0xd8f10000,
 'fixture':'tests/fixtures/eggo-cpu-steering-gba.json'}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
steering_cases=[]
# Exact integer boundary and fractional-pixel cases in all seven columns.
for column in range(7):
 for delta in [-12.125,-12,-11.875,-8,-4.125,-4,-3.875]:
  steering_cases.append({'name':f'column-{column}-{delta}','x':int((column*16+delta)*65536),
   'vy':0,'actorColumn':column,'targetColumn':column,'waypointColumn':column,
   'pickupTarget':PARAMETERS['sentinel'],'idleTarget':40*65536,'kind':0,'keys':64})
# A moving pickup is pursued precisely on the ground; airborne steering uses columns.
for delta in [-2.125,-2,-1.875,0,1.875,2,2.125]:
 for vy in [0,-65536,65536]:
  steering_cases.append({'name':f'pickup-{delta}-{vy}','x':24*65536,'vy':vy,
   'actorColumn':2,'targetColumn':3,'waypointColumn':3,
   'pickupTarget':int((24+delta)*65536),'idleTarget':40*65536,'kind':0,'keys':0})
# Empty-handed idle target uses native integer X, a separate offset window.
for x in [29.875,30,30.125,32,33.875,34,34.125]:
 steering_cases.append({'name':f'idle-{x}','x':int(x*65536),'vy':0,
  'actorColumn':3,'targetColumn':3,'waypointColumn':3,
  'pickupTarget':PARAMETERS['sentinel'],'idleTarget':40*65536,'kind':-1,'keys':0})
direction_cases=[]
for keys,cc,d0,previous in [(16,0,0,0),(32,0,0,0),(16,0,1,32),(32,1,0,16),
 (16,7,0,16),(32,0,7,32),(0,0,0,16),(64,4,7,32),(48,0,0,0)]:
 direction_cases.append({'keys':keys,'counterCC':cc,'counterD0':d0,'previousKeys':previous})
PARAMETERS['steering_cases']=steering_cases;PARAMETERS['direction_cases']=direction_cases
measurements={'steering':[],'direction':[]}
for group,cases,entry,end in [('steering',steering_cases,PARAMETERS['steering_entry'],PARAMETERS['steering_end']),
 ('direction',direction_cases,PARAMETERS['direction_entry'],PARAMETERS['direction_end'])]:
 for case in cases:
  uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
  for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:
   uc.mem_map(base,size);uc.mem_write(base,data)
  cpu=PARAMETERS['cpu'];actor=PARAMETERS['actor'];stack=PARAMETERS['stack'];writes=[]
  def put(name,address,value):
   uc.mem_write(address,struct.pack('<I',value&0xffffffff));writes.append({'name':name,'address':address,'value':value})
  for name,at,value in [('actor',stack+0x70,actor),('keys',stack+0x3c,case['keys'])]:put(name,at,value)
  if group=='steering':
   for name,at in [('x',actor),('vy',actor+0x18),('kind',actor+0x864),
    ('targetColumn',cpu),('waypointColumn',cpu+4),('idleTarget',cpu+0xf4),
    ('actorColumn',stack+0x5c),('pickupTarget',stack+0x24)]:put(name,at,case[name])
  else:
   for name,at,value in [('counterCC',cpu+0xcc,case['counterCC']),('counterD0',cpu+0xd0,case['counterD0']),
    ('previousKeys',cpu+0xe8,case['previousKeys']),('ccPointer',stack+0xb4,cpu+0xcc),
    ('d0Pointer',stack+0xb8,cpu+0xd0),('previousPointer',stack+0xc4,cpu+0xe8)]:put(name,at,value)
  uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu)
  uc.emu_start(entry|1,end,count=PARAMETERS['instruction_limit'])
  read=lambda at:struct.unpack('<I',bytes(uc.mem_read(at,4)))[0]
  record={'input':case,'keys':read(stack+0x3c),'diagnostic_writes':writes}
  if group=='direction':record.update(counterCC=read(cpu+0xcc),counterD0=read(cpu+0xd0),previousKeys=read(cpu+0xe8))
  measurements[group].append(record)
fixture={'parameters':PARAMETERS,**measurements,
 'limits':'Original steering and direction instruction segments, with explicit diagnostic inputs; not full controller parity.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-steering_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'steering.csv').open('w',encoding='utf-8',newline='') as stream:
 rows=[{**r['input'],'nativeKeys':r['keys']} for r in measurements['steering']]
 writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
with (out/'direction.csv').open('w',encoding='utf-8',newline='') as stream:
 rows=[{**r['input'],'nativeKeys':r['keys'],'afterCC':r['counterCC'],'afterD0':r['counterD0'],'afterPrevious':r['previousKeys']} for r in measurements['direction']]
 writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print({'steering':len(measurements['steering']),'direction':len(measurements['direction']),'output':str(out)})
