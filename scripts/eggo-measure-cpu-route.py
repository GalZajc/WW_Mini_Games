"""Execute native CPU route/travel routines; preserve all diagnostic inputs."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3,UC_ARM_REG_R7,UC_ARM_REG_R8
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'route_entry':0x08005f48,'travel_entry':0x08007abc,'travel_end':0x08007dc4,
 'early_exits':[0x0800678c,0x08008276],
 'cpu':0x02005a40,'actor':0x02004f50,'board':0x02010650,'stack':0x03007000,
 'return':0x08000000,'instruction_limit':10000,'fixture':'tests/fixtures/eggo-cpu-route-gba.json',
 'profiles':[[47]*7,[47,44,41,38,35,32,29],[31,34,37,40,43,46,47],
  [35,40,45,47,45,40,35],[47,43,39,35,39,43,47],[39,39,39,35,39,39,39],
  [40,40,40,40,40,40,40],[41,39,45,42,35,37,47]],
 'pairs':[(0,6),(6,0),(0,3),(3,0),(3,6),(6,3),(2,5),(5,2),(3,3)],
 'margins':[4,7]}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
def engine():
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:
  uc.mem_map(base,size);uc.mem_write(base,data)
 uc.reg_write(UC_ARM_REG_SP,PARAMETERS['stack']);return uc
cpu=PARAMETERS['cpu'];board=PARAMETERS['board'];actor=PARAMETERS['actor'];stack=PARAMETERS['stack']
records={'route':[],'travel':[]}
route_cases=[]
for heights in PARAMETERS['profiles']:
 for start,target in PARAMETERS['pairs']:
  for margin in PARAMETERS['margins']:route_cases.append({'heights':heights,'start':start,'target':target,'margin':margin,'waypoint':start})
travel_cases=[]
for heights in PARAMETERS['profiles']:
 for start,target in [(0,6),(6,0),(3,6),(3,0),(3,3)]:
  for vy in [0,-65536,65536]:
   travel_cases.append({'heights':heights,'start':start,'target':target,'margin':4,
    'waypoint':start,'row':heights[start]-(1 if vy else 0),'vy':vy,'keys':0,'kind':0,'groundRow':heights[start],
    'counterD4':9,'elevated':False,'sideFlag':0,'loopRegister':0})
# Explicit intermediate waypoint, boots margin, low/deep actor and force-target cases.
for row,vy,waypoint,elevated,side,kind,margin in [(46,0,1,False,0,0,4),(30,0,1,False,0,0,4),
 (35,-65536,1,False,0,0,4),(35,65536,1,False,0,0,4),(47,0,1,False,1,0,4),
 (47,0,-1,False,0,0,4),(47,0,1,True,0,0,4),(47,0,1,False,0,8,4),(47,0,1,False,0,0,7)]:
 travel_cases.append({'heights':PARAMETERS['profiles'][1],'start':0,'target':6,'margin':margin,
  'waypoint':waypoint,'row':row,'vy':vy,'keys':64,'kind':kind,'groundRow':47,
  'counterD4':9,'elevated':elevated,'sideFlag':side,'loopRegister':0})
PARAMETERS['route_cases']=route_cases;PARAMETERS['travel_cases']=travel_cases
for group,cases in [('route',route_cases),('travel',travel_cases)]:
 for c in cases:
  uc=engine();writes=[]
  def put(name,at,value,size=4):
   uc.mem_write(at,(value&((1<<(8*size))-1)).to_bytes(size,'little'));writes.append({'name':name,'address':at,'value':value,'size':size})
  for i,h in enumerate(c['heights']):put(f'height-{i}',board+0xed0+i*4,h)
  put('target',cpu,c['target']);put('waypoint',cpu+4,c['waypoint'])
  initial=lambda at:struct.unpack('<7i',bytes(uc.mem_read(at,28)))
  before={'waypoint':c['waypoint'],'labels':list(initial(cpu+0xc)),'parents':list(initial(cpu+0x28))}
  result={}
  if group=='route':
   put('fifth-argument-margin',stack,c['margin'])
   for register,value in [(UC_ARM_REG_R0,cpu),(UC_ARM_REG_R1,board),(UC_ARM_REG_R2,c['start']),
    (UC_ARM_REG_R3,c['target']),(UC_ARM_REG_LR,PARAMETERS['return']|1)]:uc.reg_write(register,value)
   uc.emu_start(PARAMETERS['route_entry']|1,PARAMETERS['return'],count=PARAMETERS['instruction_limit'])
   result['reachable']=bool(uc.reg_read(UC_ARM_REG_R0))
  else:
   for name,at,value,size in [('board',stack+0x38,board,4),('actor',stack+0x70,actor,4),
    ('actorColumn',stack+0x5c,c['start'],4),('actorRow',stack+0x60,c['row'],4),
    ('margin',stack+0x8c,c['margin'],4),('elevated',stack+0x80,int(c['elevated']),4),
    ('keys',stack+0x3c,c['keys'],4),('kind',actor+0x864,c['kind'],4),('vy',actor+0x18,c['vy'],4),
    ('groundRow',cpu+0xe4,c['groundRow'],4),('counterD4',cpu+0xd4,c['counterD4'],4),
    ('sideFlag',board+0x1240,c['sideFlag'],2),('clockPointer',stack+0xb0,cpu+0xc8,4),
    ('difficulty',cpu+0xf0,6,4),('frame',0x02011a9c,200,4)]:put(name,at,value,size)
   def code(uc,address,size,data):
    if address in [PARAMETERS['travel_end'],*PARAMETERS['early_exits']]:
     result.update(exit=address,keys=uc.reg_read(UC_ARM_REG_R0) if address==0x08008276 else
      struct.unpack('<I',bytes(uc.mem_read(stack+0x3c,4)))[0]);uc.emu_stop()
   uc.hook_add(UC_HOOK_CODE,code);uc.reg_write(UC_ARM_REG_R8,cpu);uc.reg_write(UC_ARM_REG_R7,c['loopRegister'])
   uc.emu_start(PARAMETERS['travel_entry']|1,0x08008286,count=PARAMETERS['instruction_limit']);assert result
   result['counterD4']=struct.unpack('<I',bytes(uc.mem_read(cpu+0xd4,4)))[0]
  after={'waypoint':struct.unpack('<i',bytes(uc.mem_read(cpu+4,4)))[0],
   'labels':list(initial(cpu+0xc)),'parents':list(initial(cpu+0x28))}
  records[group].append({'input':c,'before':before,'after':after,**result,'diagnostic_writes':writes})
fixture={'parameters':PARAMETERS,**records,
 'limits':'Original route/travel routines on explicit diagnostic towers; no full CPU trajectory parity claim.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-route_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
for group in records:
 with (out/(group+'.csv')).open('w',encoding='utf-8',newline='') as stream:
  rows=[{'case':i,**r['input'],'waypointAfter':r['after']['waypoint'],
    'result':r.get('reachable',r.get('keys'))} for i,r in enumerate(records[group])]
  writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print({'route':len(records['route']),'travel':len(records['travel']),'output':str(out)})
