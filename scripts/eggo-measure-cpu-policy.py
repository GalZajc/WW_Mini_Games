"""Inspect original Hard CPU decisions by executing the native policy routine."""
from pathlib import Path
from datetime import datetime
import argparse,csv,hashlib,json,struct,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB,UC_HOOK_INTR,UC_HOOK_CODE,UC_HOOK_MEM_READ,UC_HOOK_MEM_WRITE
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R3,UC_ARM_REG_R4,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_PC
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_11-36-06_347882/collapse-loose-cell.frame00342',
 'next_source':'scripts/OUTPUT/eggo-reference_2026-10-04_11-36-06_347882/collapse-loose-cell.frame00343',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'entry':0x080065f8,'cpu':0x02005a40,'board':0x02010650,'frame_address':0x02011a9c,
 'keys_address':0x0200e9a8,'return':0x08000000,'instruction_limit':1000000,'stack':0x03007000}
parser=argparse.ArgumentParser();parser.add_argument('--source');parser.add_argument('--next-source')
parser.add_argument('--candidate',help='Diagnostic JSON: kind, column, rotation. Original memory writes are logged.')
parser.add_argument('--timing',help='Diagnostic JSON: stall, period, clock, kind, actorState. All writes are logged.')
args=parser.parse_args()
if args.source:PARAMETERS['source']=args.source
if args.next_source:PARAMETERS['next_source']=args.next_source
source=ROOT/PARAMETERS['source'];rom=Path(PARAMETERS['rom']).read_bytes()
ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
after=Path(str(ROOT/PARAMETERS['next_source'])+'.ram').read_bytes()
for name,data in [('rom',rom),('ram',ram),('iwram',iwram),('next_ram',after)]:PARAMETERS[name+'_sha256']=hashlib.sha256(data).hexdigest()
uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:uc.mem_map(base,size);uc.mem_write(base,data)
for base,size,suffix in [(0x04000000,0x1000,'.0x4000000'),(0x05000000,0x1000,'.0x5000000'),(0x06000000,0x20000,'.memory3'),(0x07000000,0x1000,'.0x7000000')]:uc.mem_map(base,size);uc.mem_write(base,Path(str(source)+suffix).read_bytes())
frame=struct.unpack_from('<I',after,PARAMETERS['frame_address']-0x02000000)[0];uc.mem_write(PARAMETERS['frame_address'],struct.pack('<I',frame))
PARAMETERS['frame']=frame
PARAMETERS['diagnostic_writes']=[]
if args.timing:
 selection=json.loads(args.timing)
 for name,offset in [('stall',0x5a40+0x104),('period',0x5a40+0x100),('clock',0x5a40+0xc8),
  ('kind',0x4f50+0x864),('actorState',0x4f50+0x874)]:
  if name not in selection:continue
  value=selection[name];uc.mem_write(0x02000000+offset,struct.pack('<I',value&0xffffffff))
  PARAMETERS['diagnostic_writes'].append({'name':name,'address':0x02000000+offset,'value':value})
if args.candidate:
 selection=json.loads(args.candidate)
 for name,offset,value in [('kind',0x4f50+0x864,selection['kind']),
  ('sweep_rotation',0x5a40+0xdc,selection['rotation']),('sweep_column',0x5a40+0xe0,selection['column']),
  ('best_score',0x5a40+0xd8,-9999)]:
  uc.mem_write(0x02000000+offset,struct.pack('<I',value&0xffffffff))
  PARAMETERS['diagnostic_writes'].append({'name':name,'address':0x02000000+offset,'value':value})
reads=set();writes=[];instructions=[];key_returns=[];candidates=[];candidate=None;geometry=None;projections=[];sweeps=[];sweep=None;timing={};travels=[];travel=None;pickup_targets=[];pickup_target=None;projectile_targets=[];projectile_target=None
def signed(v):return v if v<0x80000000 else v-0x100000000
def interrupt(uc,number,data):
 pc=uc.reg_read(UC_ARM_REG_PC);swi=struct.unpack('<H',bytes(uc.mem_read(pc-2,2)))[0]&255
 if swi==6:
  a=signed(uc.reg_read(UC_ARM_REG_R0));b=signed(uc.reg_read(UC_ARM_REG_R1));assert b
  q=abs(a)//abs(b)*(1 if a*b>=0 else -1)
  for reg,v in [(UC_ARM_REG_R0,q),(UC_ARM_REG_R1,a-q*b),(UC_ARM_REG_R3,abs(q))]:uc.reg_write(reg,v&0xffffffff)
 else:raise AssertionError(f'Unimplemented native BIOS call {swi} at {pc:x}')
def code(uc,address,size,data):
 global candidate,geometry,sweep,travel,pickup_target,projectile_target
 instructions.append(address)
 def word(at):return signed(struct.unpack('<I',bytes(uc.mem_read(at,4)))[0])
 def brain():
  base=PARAMETERS['cpu']
  return {name:word(base+offset) for name,offset in
   [('targetColumn',0),('state',8),('bestRotation',0xb8),('anchorX',0xc0),('anchorY',0xc4),
    ('clock',0xc8),('bestScore',0xd8),('rotation',0xdc),('column',0xe0)]}
 def timers():
  return {name:word(PARAMETERS['cpu']+offset) for name,offset in
   [('clock',0xc8),('counterCC',0xcc),('counterD0',0xd0),('period',0x100),('stall',0x104)]}
 def route_state():
  cpu=PARAMETERS['cpu']
  return {'waypoint':word(cpu+4),'labels':[word(cpu+0xc+i*4) for i in range(7)],
   'parents':[word(cpu+0x28+i*4) for i in range(7)],'groundRow':word(cpu+0xe4),'counterD4':word(cpu+0xd4)}
 def pickup_brain():
  cpu=PARAMETERS['cpu']
  return {'targetColumn':word(cpu),'idleTarget':word(cpu+0xf4),'counterD4':word(cpu+0xd4)}
 if address in (0x0800678c,0x08008238,0x08008248,0x08008276):
  sp=uc.reg_read(UC_ARM_REG_SP)
  key_returns.append({'pc':hex(address),'keys_slot':word(sp+0x3c),
   'global_input_mask':word(0x0200014c),'rotation_binding_mask':word(0x02000158),
   'actorColumn':word(sp+0x5c),'actorRow':word(sp+0x60),
   'targetColumn':word(PARAMETERS['cpu']),'searchState':word(PARAMETERS['cpu']+8),
   'resultRegister':uc.reg_read(UC_ARM_REG_R0)})
 if address==0x08006930:
  sp=uc.reg_read(UC_ARM_REG_SP);board=word(sp+0x38);enemy=word(sp+0xc8);actor=word(sp+0x70)
  projectile_target={'input':{'heights':[word(board+0xed0+i*4) for i in range(7)],
   'enemyHeights':[word(enemy+0xed0+i*4) for i in range(7)],
   'kind':word(actor+0x864),'fieldIndex':int.from_bytes(bytes(uc.mem_read(board+0xe42,2)),'little'),
   'frame':word(PARAMETERS['frame_address']),
   'projectiles':[{'active':bool(bytes(uc.mem_read(enemy+0xf80+i*40,1))[0]),
    'x':word(enemy+0xf84+i*40),'y':word(enemy+0xf88+i*40),'flightCounter':word(enemy+0xf9c+i*40)} for i in range(7)]},
   'before':{'targetColumn':word(PARAMETERS['cpu'])},'action':'continue'}
 if projectile_target is not None:
  if address==0x08006854:projectile_target['action']='catch'
  if address==0x08007788:projectile_target['action']='discard'
  if address in [0x080069f6,0x0800678c,0x08008276]:
   sp=uc.reg_read(UC_ARM_REG_SP)
   if address==0x0800678c:projectile_target['action']='defer'
   projectile_target.update(after={'targetColumn':word(PARAMETERS['cpu'])},pickupTarget=word(sp+0x24))
   projectile_targets.append(projectile_target);projectile_target=None
 if address==0x08006a14:
  sp=uc.reg_read(UC_ARM_REG_SP);board=word(sp+0x38);actor=word(sp+0x70);field=word(sp+0x74)
  pickups=[];pointer=word(field+0x418)
  while pointer:
   at=pointer-0x1c
   pickups.append({'id':at,'x':word(at),'y':word(at+4),'kind':word(at+0x28)})
   pointer=word(at+0x1c)
   assert len(pickups)<=18
  pickup_target={'input':{'actorX':word(actor),'actorY':word(actor+4),
   'heights':[word(board+0xed0+i*4) for i in range(7)],'pickups':pickups,
   'difficulty':word(PARAMETERS['cpu']+0xf0),'special':bool(bytes(uc.mem_read(0x020000ec,1))[0]),
   'elevated':bool(word(sp+0x80))},'before':pickup_brain()}
 if address==0x08006d58 and pickup_target is not None:
  sp=uc.reg_read(UC_ARM_REG_SP)
  pickup_target.update(after=pickup_brain(),selected=word(sp+0x44),nearPickup=bool(word(sp+0x6c)))
  pickup_targets.append(pickup_target);pickup_target=None
 if address==0x08007abc:
  sp=uc.reg_read(UC_ARM_REG_SP);board=word(sp+0x38);actor=word(sp+0x70);cpu=PARAMETERS['cpu'];kind=word(actor+0x864)
  if -1<=kind<=7:
   travel={'input':{'heights':[word(board+0xed0+i*4) for i in range(7)],
    'start':word(sp+0x5c),'target':word(cpu),'row':word(sp+0x60),'vy':word(actor+0x18),
    'kind':kind,'margin':word(sp+0x8c),'keys':word(sp+0x3c),'sideFlag':int.from_bytes(bytes(uc.mem_read(board+0x1240,2)),'little'),
    'elevated':bool(word(sp+0x80)),'loopRegister':uc.reg_read(UC_ARM_REG_R7),
    'frame':word(PARAMETERS['frame_address']),'nearPickup':bool(word(sp+0x6c))},'before':route_state()}
 if travel is not None and address in (0x08007dc4,0x0800678c,0x08008276):
  sp=uc.reg_read(UC_ARM_REG_SP)
  travel.update(after=route_state(),early=address!=0x08007dc4,
   keys=word(sp+0x3c) if address==0x08007dc4 else uc.reg_read(UC_ARM_REG_R0) if address==0x08008276 else 0)
  travels.append(travel);travel=None
 if address==0x080065f8:timing['before']=timers()
 if address==0x08006780:timing['wait']=True
 if address==0x0800678c and timing.get('wait') and 'begin' not in timing:timing['afterWait']=timers()
 if address==0x08006800:timing['begin']=timers()
 if address in (0x0800704c,0x08007054):
  timing['pieceGate']=timers();timing['forcedUse']=address==0x0800704c
 if address==0x080070ac:
  board=word(uc.reg_read(UC_ARM_REG_SP)+0x38)
  sweep={'before':brain(),'emptyFirstField':word(board+0xec8)==47 and
   struct.unpack('<H',bytes(uc.mem_read(board+0xe42,2)))[0]==0}
 if address==0x0800c884:
  shape=uc.reg_read(UC_ARM_REG_R8);origin=uc.reg_read(UC_ARM_REG_R4);sp=uc.reg_read(UC_ARM_REG_SP)
  geometry={'cells':[[x,y] for x in range(3) for y in range(3)
   if struct.unpack('<H',bytes(uc.mem_read(shape+32*y+4*x,2)))[0]],
   'startX':word(origin)>>20,'startY':word(origin+4)>>20,
   'board':list(bytes(uc.mem_read(word(sp+0x50),49*8)))}
 if address==0x080071be and geometry is not None:
  geometry.update({'valid':bool(bytes(uc.mem_read(0x02004f50+0x880,1))[0]),
   'anchorX':word(0x020118e8),'anchorY':word(0x020118ec)})
  projections.append(geometry);geometry=None
 if address==0x08007208:
  sp=uc.reg_read(UC_ARM_REG_SP);local=lambda off:word(sp+off)
  board=local(0x38);actor=local(0x70);cpu=PARAMETERS['cpu']
  candidate={'board':list(bytes(uc.mem_read(board+0xc80,49*8))),
   'heights':[word(board+0xed0+i*4) for i in range(7)],
   'anchorX':local(0x48),'anchorY':local(0x4c),'column':word(cpu+0xe0)-1,
   'rotation':local(0x50),'actorColumn':local(0x5c),'clock':word(cpu+0xc8),
   'height':word(board+0xec8),'roughness':word(board+0xecc),
   'urgency':local(0x90),'elevated':bool(local(0x80)),
   'mode':word(0x020118a4),'special':bool(bytes(uc.mem_read(0x020000ec,1))[0]),
   'progress':word(actor+0x82c),'bonus':word(actor+0xa0c),
   'actorRotation':word(actor+0x868),'kind':word(actor+0x864),'difficulty':word(cpu+0xf0)}
  # The sweep's column lives in sb; the counter has already advanced/wrapped.
  candidate['column']=uc.reg_read(UC_ARM_REG_R9)
 if address in (0x08007170,0x08007188):
  sp=uc.reg_read(UC_ARM_REG_SP);board=word(sp+0x38);cpu=PARAMETERS['cpu']
  column=uc.reg_read(UC_ARM_REG_R9)
  candidate={'hole':True,'board':list(bytes(uc.mem_read(board+0xc80,49*8))),
   'heights':[word(board+0xed0+i*4) for i in range(7)],
   'column':column,'rotation':word(sp+0x50),'kind':2,
   'height':word(board+0xec8),'difficulty':word(cpu+0xf0),
   'gap':word(0x020118f0+column*4)}
 if address==0x08007706:
  score=signed(uc.reg_read(UC_ARM_REG_R4))
  if candidate is not None:candidate['score']=score;candidates.append(candidate);candidate=None
  if sweep is not None:
   sp=uc.reg_read(UC_ARM_REG_SP)
   sweep.update(score=score,anchorX=word(sp+0x48),anchorY=word(sp+0x4c))
 if address==0x08007762 and sweep is not None:
  sweep['after']=brain();sweeps.append(sweep);sweep=None
def read(uc,access,address,size,value,data):reads.add((address,size))
def write(uc,access,address,size,value,data):writes.append({'address':address,'size':size,'value':value,'pc':uc.reg_read(UC_ARM_REG_PC)})
uc.hook_add(UC_HOOK_INTR,interrupt);uc.hook_add(UC_HOOK_CODE,code)
uc.hook_add(UC_HOOK_MEM_READ,read,begin=0x02000000,end=0x0203ffff)
uc.hook_add(UC_HOOK_MEM_WRITE,write,begin=0x02000000,end=0x0203ffff)
for reg,value in [(UC_ARM_REG_SP,PARAMETERS['stack']),(UC_ARM_REG_LR,PARAMETERS['return']|1),
                  (UC_ARM_REG_R0,PARAMETERS['cpu']),(UC_ARM_REG_R1,PARAMETERS['board'])]:uc.reg_write(reg,value)
uc.emu_start(PARAMETERS['entry']|1,PARAMETERS['return'],count=PARAMETERS['instruction_limit'])
keys=uc.reg_read(UC_ARM_REG_R0);recorded_keys=struct.unpack_from('<H',after,PARAMETERS['keys_address']-0x02000000)[0]
cpu_after=bytes(uc.mem_read(PARAMETERS['cpu'],0x118))
measurement={'parameters':PARAMETERS,'returned_keys':keys,'recorded_next_keys':recorded_keys,
 'instructions':len(instructions),'executed_addresses':sorted(set(instructions)),'key_returns':key_returns,
 'read_addresses':sorted(reads),'writes':writes,'candidates':candidates,'projections':projections,'sweeps':sweeps,'timing':timing,'travels':travels,'pickup_targets':pickup_targets,'projectile_targets':projectile_targets,'cpu_before':ram[0x5a40:0x5b58].hex(),'cpu_after':cpu_after.hex(),
 'limits':'One isolated native policy call from a real checkpoint. Other pre-policy RNG consumers and native timing must be checked before claiming a full controller replay.'}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-policy_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',measurement)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'writes.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=['address','size','value','pc']);writer.writeheader();writer.writerows(writes)
print({'returned_keys':keys,'recorded_next_keys':recorded_keys,'instructions':len(instructions),'reads':len(reads),'writes':len(writes)})
print(out)
