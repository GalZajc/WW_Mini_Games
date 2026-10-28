"""Native Survival bomb/filler targeting oracle with reproducible RAM inputs."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8,UC_ARM_REG_R3
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','cpu':0x02005a40,'actor':0x02004f50,
 'board':0x02010650,'enemy':0x0200f404,'stack':0x03007000,'difficulty':6,'instruction_limit':3000,
 'heights':[43,42,39,45,43,46,41],'enemy_heights':[40,42,44,38,43,46,41],
 'actor_columns':[0,3,6],'fuses':[250,10],'panic_timers':[0,1,2],'frames':[200,201],
 'fixture':'tests/fixtures/eggo-cpu-tools-gba.json'}
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
cases=[]
profiles=[(8,col,fuse,timer,frame,1) for col in PARAMETERS['actor_columns'] for fuse in PARAMETERS['fuses'] for timer in PARAMETERS['panic_timers'] for frame in PARAMETERS['frames']]
profiles += [(10,col,250,0,frame,field) for col in PARAMETERS['actor_columns'] for frame in PARAMETERS['frames'] for field in [0,1]]
for kind,col,fuse,timer,frame,field in profiles:
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:uc.mem_map(base,size);uc.mem_write(base,data)
 writes=[];p=PARAMETERS;cpu=p['cpu'];actor=p['actor'];board=p['board'];stack=p['stack'];enemy=p['enemy']
 def put(name,at,value):
  uc.mem_write(at,struct.pack('<I',value&0xffffffff));writes.append({'name':name,'address':at,'value':value})
 heights=[47]*7 if kind==10 and field==0 else p['heights']
 cells=bytearray(49*8)
 for x,h in enumerate(heights):
  for y in range(h,47):cells[y*8+x]=3
  if h<46:cells[(h+1)*8+x]=0
 for y in [47,48]:cells[y*8:y*8+7]=bytes([255])*7
 uc.mem_write(board+0xc80,bytes(cells));writes.append({'name':'board_cells','address':board+0xc80,'hex':cells.hex()})
 for x,h in enumerate(heights):put('height',board+0xed0+x*4,h)
 for x,h in enumerate(p['enemy_heights']):put('enemy_height',enemy+0xed0+x*4,h)
 for name,at,value in [('kind',actor+0x864,kind),('fuse',board+0x123c,fuse),('field',board+0xe42,field),
  ('height',board+0xec8,min(heights)),('difficulty',cpu+0xf0,6),('panic',cpu+0xf8,timer),('target',cpu,4),
  ('frame',0x02011a9c,frame),('pickup_target',stack+0x24,0xd8f10000),('actor_column',stack+0x5c,col),
  ('stack_actor',stack+0x70,actor),('stack_board',stack+0x38,board),('stack_enemy',stack+0xc8,enemy),
  ('elevated',stack+0x80,0),('bonus',stack+0x90,0),('special',0x020000ec,0)]:put(name,at,value)
 result={}
 def hook(uc,address,size,data):
  exits={0x08006fd4:'plan',0x0800678c:'defer',0x08007dac:'use'}
  if address in exits:result['action']=exits[address];uc.emu_stop()
 uc.hook_add(UC_HOOK_CODE,hook);uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu)
 uc.emu_start((0x08006db4 if kind==8 else 0x08006ec8)|1,0x08008276,count=p['instruction_limit']);assert result
 word=lambda at:struct.unpack('<I',bytes(uc.mem_read(at,4)))[0]
 gaps=[]
 for x,h in enumerate(heights):
  gap=next((h+i+1 for i in range(5) if h+i<=47 and not cells[(h+i+1)*8+x]),0);gaps.append(gap)
 cases.append({'input':{'kind':kind,'actorColumn':col,'heights':heights,'enemyHeights':p['enemy_heights'],
  'gaps':gaps,'fuse':fuse,'frame':frame,'fieldIndex':field},'before':{'targetColumn':4,'panicTimer':timer},
  'after':{'targetColumn':word(cpu),'panicTimer':word(cpu+0xf8)},'action':result['action'],'diagnostic_writes':writes})
commit_cases=[]
PARAMETERS['commit_rotations']=[0,3];PARAMETERS['commit_frames']=[127,128]
PARAMETERS['commit_fuses']=[175,176,177,199,250];PARAMETERS['roughness']=47
for rotation in PARAMETERS['commit_rotations']:
 for frame in PARAMETERS['commit_frames']:
  for fuse in PARAMETERS['commit_fuses']:
   uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
   for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:uc.mem_map(base,size);uc.mem_write(base,data)
   writes=[]
   for name,at,value in [('stack_board',stack+0x38,board),('pickup_target',stack+0x24,0xd8f10000),
    ('fuse',board+0x123c,fuse),('rotation',actor+0x868,rotation),('roughness',board+0xecc,PARAMETERS['roughness']),
    ('difficulty',cpu+0xf0,6),('frame',0x02011a9c,frame)]:put(name,at,value)
   result={}
   def commit_hook(uc,address,size,data):
    if address in [0x0800797a,0x08007a70]:result['canCommit']=address==0x0800797a;uc.emu_stop()
   uc.hook_add(UC_HOOK_CODE,commit_hook);uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu);uc.reg_write(UC_ARM_REG_R3,actor)
   uc.emu_start(0x0800792b,0x08008276,count=PARAMETERS['instruction_limit']);assert result
   commit_cases.append({'input':{'fuse':fuse,'rotation':rotation,'roughness':PARAMETERS['roughness'],'frame':frame},**result,'diagnostic_writes':writes})
fixture={'parameters':PARAMETERS,'cases':cases,'commit_cases':commit_cases,'limits':'Original target and bomb fuse guard segments with logged board/timer inputs. Excludes threat targeting and full match replay.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-tools_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(out)
