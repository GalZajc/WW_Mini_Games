"""Execute native incoming-projectile target scan with explicit diagnostic inputs."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,sys,csv
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','entry':0x08006930,
 'cpu':0x02005a40,'actor':0x02004f50,'board':0x02010650,'enemy':0x0200f404,'stack':0x03007000,
 'instruction_limit':3000,'fixed':65536,'difficulty':6,'field_indices':[0,1],'frames':[200,201],
 'kinds':[-1,2,8,10],'flight_counters':[-1,0,1,250],
 'fixture':'tests/fixtures/eggo-cpu-projectiles-gba.json',
 'ordinary_call':'scripts/OUTPUT/eggo-cpu-policy_2026-10-04_21-24-49_998655/measurement.json'}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
profiles=[]
for field in PARAMETERS['field_indices']:
 for kind in PARAMETERS['kinds']:
  for frame in PARAMETERS['frames']:
   for counter in PARAMETERS['flight_counters']:
    profiles.append({'fieldIndex':field,'kind':kind,'frame':frame,'flightCounter':counter,'row':46,'active':True,'quiet':False})
for patch in [{'row':47},{'active':False},{'quiet':True},{'column':6},{'column':0},{'xFraction':0.5},{'multiple':True}]:
 for kind in [-1,2,8]:profiles.append({'fieldIndex':1,'kind':kind,'frame':200,'flightCounter':250,'row':46,'active':True,'quiet':False,**patch})
PARAMETERS['profiles']=profiles;cases=[]
for q in profiles:
 p=PARAMETERS;s=p['fixed'];uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:uc.mem_map(base,size);uc.mem_write(base,data)
 cpu=p['cpu'];actor=p['actor'];board=p['board'];enemy=p['enemy'];stack=p['stack'];writes=[]
 def put(name,at,value):
  uc.mem_write(at,struct.pack('<I',value&0xffffffff));writes.append({'name':name,'address':at,'value':value})
 heights=[47]*7;enemy_heights=[47]*7
 if q['quiet']:heights[2]=45;enemy_heights[5]=45
 for i,h in enumerate(heights):put('height',board+0xed0+4*i,h)
 for i,h in enumerate(enemy_heights):put('enemy_height',enemy+0xed0+4*i,h)
 for i in range(7):put('inactive_slot',enemy+0xf80+40*i,0)
 projectiles=[]
 for i in ([0,6] if q.get('multiple') else [0]):
  col=(1 if i==0 else 5) if q.get('multiple') else q.get('column',3)
  x=int(((col+8*q['fieldIndex'])*16-8+q.get('xFraction',0))*s);y=q['row']*16*s
  h={'active':q['active'],'flightCounter':q['flightCounter'],'x':x,'y':y};projectiles.append(h)
  for name,off,value in [('active',0xf80,int(h['active'])),('x',0xf84,x),('y',0xf88,y),('flight_counter',0xf9c,h['flightCounter'])]:put(name,enemy+off+40*i,value)
 for name,at,value in [('kind',actor+0x864,q['kind']),('difficulty',cpu+0xf0,p['difficulty']),('target',cpu,4),
  ('field_index',board+0xe42,q['fieldIndex']),('frame',0x02011a9c,q['frame']),('stack_actor',stack+0x70,actor),
  ('stack_board',stack+0x38,board),('stack_enemy',stack+0xc8,enemy),('pickup_target',stack+0x24,0xd8f10000)]:put(name,at,value)
 result={}
 def hook(uc,address,size,data):
  if address==0x08006854:result['action']='catch'
  exits={0x080069f6:'continue',0x0800678c:'defer',0x08007788:'discard'}
  if address in exits:result.setdefault('action',exits[address]);uc.emu_stop()
 uc.hook_add(UC_HOOK_CODE,hook);uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu)
 uc.emu_start(p['entry']|1,0x08008276,count=p['instruction_limit']);assert result
 word=lambda at:struct.unpack('<I',bytes(uc.mem_read(at,4)))[0]
 cases.append({'input':{'projectiles':projectiles,'heights':heights,'enemyHeights':enemy_heights,
  'fieldIndex':q['fieldIndex'],'kind':q['kind'],'frame':q['frame']},'before':{'targetColumn':4},
  'after':{'targetColumn':word(cpu)},'result':{**result,'pickupTarget':word(stack+0x24)},'diagnostic_writes':writes})
ordinary_path=ROOT/p['ordinary_call'];ordinary_bytes=ordinary_path.read_bytes();ordinary=json.loads(ordinary_bytes)
p['ordinary_call_sha256']=hashlib.sha256(ordinary_bytes).hexdigest()
assert ordinary['parameters']['diagnostic_writes']==[] and len(ordinary['projectile_targets'])==1
fixture={'parameters':p,'cases':cases,'ordinary_call':{'parameters':ordinary['parameters'],
 'returned_keys':ordinary['returned_keys'],'recorded_keys':ordinary['recorded_next_keys'],'projectile_targets':ordinary['projectile_targets']},
 'limits':'Native scan boundaries and one ordinary-input original call. Full integrated controller trajectories remain unproven.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-projectiles_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',p),(out/'measurement.json',fixture),(ROOT/p['fixture'],fixture)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'targets.csv').open('w',encoding='utf-8',newline='') as f:
 rows=[{'kind':c['input']['kind'],'frame':c['input']['frame'],'field':c['input']['fieldIndex'],**c['result'],**c['after']} for c in cases]
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print({'cases':len(cases),'output':str(out)})
