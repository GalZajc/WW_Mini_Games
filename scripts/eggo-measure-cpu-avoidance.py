"""Execute original enemy-avoidance instructions with logged boundary inputs."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,sys,csv
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','entry':0x08007ef0,'end':0x0800819a,
 'cpu':0x02005a40,'actor':0x02004f50,'board':0x02010650,'stack':0x03007000,'entities':0x02031038,
 'fixed':65536,'difficulty':6,'instruction_limit':5000,'actorX':40*65536,'actorY':640*65536,
 'fixture':'tests/fixtures/eggo-cpu-avoidance-gba.json'}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
profiles=[]
for dx,dy in [(1,-1),(79,-39),(80,-39),(-1,-1),(-79,39),(-80,0),(20,0),(19,-79),(-19,79),(0,-80),(0,-79),(0,-30),(0,-29),(29,-1),(30,-1),(0,0),(19,39),(19,40)]:
 for vx,vy in [(-1,-1),(-1,1),(0,0),(1,-1),(1,1)]:profiles.append({'dx':dx,'dy':dy,'vx':vx,'vy':vy})
for kind in [1,8,10,11,2,13,5,14,15]:
 for held in [-1,2]:profiles.append({'dx':20,'dy':-20,'vx':-1,'vy':1,'hazardKind':kind,'kind':held})
for frame in [300,301,511,512]:profiles.append({'dx':20,'dy':-20,'vx':-1,'vy':1,'frame':frame})
for patch in [{'active':False},{'collisionActive':0},{'sameField':False},{'hazardKind':15,'life':50},
 {'hazardKind':15,'life':49},{'actorVy':1},{'dx':19.5,'dy':-0.25}]:profiles.append({'dx':20,'dy':-20,'vx':-1,'vy':1,**patch})
PARAMETERS['profiles']=profiles;cases=[]
for profile in profiles:
 p=PARAMETERS;s=p['fixed'];q={'kind':2,'hazardKind':5,'frame':301,'active':True,'collisionActive':1,'sameField':True,'life':49,'actorVy':0,**profile}
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:uc.mem_map(base,size);uc.mem_write(base,data)
 writes=[];cpu=p['cpu'];actor=p['actor'];board=p['board'];stack=p['stack'];entity=p['entities']
 def put(name,at,value):
  uc.mem_write(at,struct.pack('<I',value&0xffffffff));writes.append({'name':name,'address':at,'value':value})
 for i in range(4):put('inactive_slot',entity+i*0x80+0x64,0)
 for name,at,value in [('actor_x',actor,p['actorX']),('actor_y',actor+4,p['actorY']),('actor_vy',actor+0x18,q['actorVy']*s),
  ('kind',actor+0x864,q['kind']),('difficulty',cpu+0xf0,p['difficulty']),('frame',0x02011a9c,q['frame']),
  ('stack_actor',stack+0x70,actor),('stack_board',stack+0x38,board),('keys',stack+0x3c,16),
  ('active',entity+0x64,int(q['active'])),('field',entity+0x68,board if q['sameField'] else 0x0200f404),
  ('hazard_kind',entity+0x24,q['hazardKind']),('life',entity+0x4c,q['life']),('collision',entity+0x48,q['collisionActive']),
  ('hit_x',entity+0x40,p['actorX']+int(q['dx']*s)),('hit_y',entity+0x44,p['actorY']+int(q['dy']*s)),
  ('vx',entity+0x14,q['vx']*s),('vy',entity+0x18,q['vy']*s)]:put(name,at,value)
 uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu)
 uc.emu_start(p['entry']|1,p['end'],count=p['instruction_limit'])
 keys=struct.unpack('<I',bytes(uc.mem_read(stack+0x3c,4)))[0]
 h={'active':q['active'],'sameField':q['sameField'],'collisionActive':q['collisionActive'],'kind':q['hazardKind'],'life':q['life'],
  'x':p['actorX']+int(q['dx']*s),'y':p['actorY']+int(q['dy']*s),'vx':q['vx']*s,'vy':q['vy']*s}
 cases.append({'input':{'actorX':p['actorX'],'actorY':p['actorY'],'actorVy':q['actorVy']*s,'kind':q['kind'],'frame':q['frame'],'keys':16,'hazards':[h]},'keys':keys,'diagnostic_writes':writes})
fixture={'parameters':p,'cases':cases,'limits':'Original avoidance instruction segment with diagnostic entities; live hit-center integration needs separate verification.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-avoidance_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',p),(out/'measurement.json',fixture),(ROOT/p['fixture'],fixture)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'avoidance.csv').open('w',encoding='utf-8',newline='') as f:
 rows=[q|{'keys':c['keys']} for q,c in zip(profiles,cases)];names=sorted(set().union(*(r.keys() for r in rows)))
 writer=csv.DictWriter(f,fieldnames=names);writer.writeheader();writer.writerows(rows)
print({'cases':len(cases),'output':str(out)})
