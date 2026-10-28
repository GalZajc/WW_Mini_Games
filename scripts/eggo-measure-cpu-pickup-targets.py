"""Measure native Survival pickup selection from ordinary-input CPU calls."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,subprocess,sys,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba','source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building',
 'checkpoint_frames':[80,140],'fixture':'tests/fixtures/eggo-cpu-pickup-targets-gba.json',
 'script_sha256':hashlib.sha256((ROOT/'scripts/eggo-measure-cpu-policy.py').read_bytes()).hexdigest()}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-pickup-targets_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
records=[]
for index,frame in enumerate(PARAMETERS['checkpoint_frames']):
 source=PARAMETERS['source'];args=[sys.executable,str(ROOT/'scripts/eggo-measure-cpu-policy.py'),
  '--source',source+f'.frame{frame:05}','--next-source',source+f'.frame{frame+1:05}']
 result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 path=Path(result.stdout.strip().splitlines()[-1]);m=json.loads((path/'measurement.json').read_text(encoding='utf-8'))
 records.append({'frame':frame+1,'parameters':m['parameters'],'oracle_output':str(path),
  'returned_keys':m['returned_keys'],'recorded_keys':m['recorded_next_keys'],'targets':m['pickup_targets'],'travels':m['travels']})
 print(f'\rOriginal pickup targets [{index+1}/{len(PARAMETERS["checkpoint_frames"])}]',end='',flush=True)
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_THUMB
from unicorn.arm_const import UC_ARM_REG_SP,UC_ARM_REG_R8,UC_ARM_REG_R2
PARAMETERS.update(diagnostic_source=PARAMETERS['source']+'.frame00080',diagnostic_entry=0x08006a14,
 diagnostic_end=0x08006d58,instruction_limit=10000,diagnostic_stack=0x03007000,
 diagnostic_cpu=0x02005a40,diagnostic_actor=0x02004f50,diagnostic_board=0x02010650,
 diagnostic_field=0x02004860,diagnostic_pool=0x02038000)
source=ROOT/PARAMETERS['diagnostic_source'];ram=Path(str(source)+'.ram').read_bytes();iwram=Path(str(source)+'.0x3000000').read_bytes()
rom=Path(PARAMETERS['rom']).read_bytes()
PARAMETERS['rom_sha256']=hashlib.sha256(rom).hexdigest()
PARAMETERS['ram_sha256']=hashlib.sha256(ram).hexdigest();PARAMETERS['iwram_sha256']=hashlib.sha256(iwram).hexdigest()
diagnostics=[];cases=[]
def selection(name,items,heights=None,actorX=32,actorY=720):
 cases.append({'name':name,'items':items,'heights':heights or [47]*7,'actorX':actorX,'actorY':actorY})
selection('empty-flat',[])
selection('empty-ridge',[],[47,37,43,40,37,47,47])
for dy in [-9,-8,-7,475,476]:selection(f'vertical-bound-{dy}',[(40,720-dy)])
for dx in [91,92,93]:selection(f'horizontal-bound-{dx}',[(40+dx,720)])
selection('tie-first',[(32,620),(48,620)])
selection('tie-reversed',[(48,620),(32,620)])
selection('hidden-under-roof',[(40,600),(40,450)],[30]*7)
selection('left-edge',[(-12,620)])
selection('right-edge',[(112,620)])
selection('fractional-below',[ (40,728.125),(40,727.875)])
PARAMETERS['diagnostic_cases']=cases
for c in cases:
 uc=Uc(UC_ARCH_ARM,UC_MODE_THUMB)
 for base,size,data in [(0x08000000,0x400000,rom),(0x02000000,0x40000,ram),(0x03000000,0x8000,iwram)]:uc.mem_map(base,size);uc.mem_write(base,data)
 cpu=PARAMETERS['diagnostic_cpu'];actor=PARAMETERS['diagnostic_actor'];board=PARAMETERS['diagnostic_board'];field=PARAMETERS['diagnostic_field'];stack=PARAMETERS['diagnostic_stack'];pool=PARAMETERS['diagnostic_pool'];writes=[]
 def put(name,at,value,size=4):
  uc.mem_write(at,(value&((1<<(size*8))-1)).to_bytes(size,'little'));writes.append({'name':name,'address':at,'value':value,'size':size})
 for name,at,value in [('actorX',actor,int(c['actorX']*65536)),('actorY',actor+4,int(c['actorY']*65536)),
  ('height',board+0xec8,min(c['heights'])),('listHead',field+0x418,pool+0x1c if c['items'] else 0),
  ('difficulty',cpu+0xf0,6),('target',cpu,3),('idle',cpu+0xf4,40*65536),('counterD4',cpu+0xd4,9),
  ('board',stack+0x38,board),('actor',stack+0x70,actor),('field',stack+0x74,field),
  ('elevated',stack+0x80,0),('cost',stack+0x54,9999),('selected',stack+0x44,0),('nearPickup',stack+0x6c,0)]:put(name,at,value)
 put('special',0x020000ec,0,1)
 for i,h in enumerate(c['heights']):put(f'height-{i}',board+0xed0+i*4,h)
 for i in range(48):put(f'gap-count-{i}',board+0xe10+i,0,1)
 items=[]
 for i,(x,y) in enumerate(c['items']):
  at=pool+i*0x34;items.append({'id':at,'x':int(x*65536),'y':int(y*65536),'kind':0})
  for name,address,value in [('itemX',at,items[-1]['x']),('itemY',at+4,items[-1]['y']),('kind',at+0x28,0),
   ('next',at+0x1c,pool+(i+1)*0x34+0x1c if i+1<len(c['items']) else 0)]:put(name,address,value)
 before={'targetColumn':3,'idleTarget':40*65536,'counterD4':9}
 uc.reg_write(UC_ARM_REG_SP,stack);uc.reg_write(UC_ARM_REG_R8,cpu);uc.reg_write(UC_ARM_REG_R2,0)
 uc.emu_start(PARAMETERS['diagnostic_entry']|1,PARAMETERS['diagnostic_end'],count=PARAMETERS['instruction_limit'])
 read=lambda at:struct.unpack('<i',bytes(uc.mem_read(at,4)))[0]
 diagnostics.append({'name':c['name'],'input':{'actorX':int(c['actorX']*65536),'actorY':int(c['actorY']*65536),
  'heights':c['heights'],'pickups':items,'difficulty':6,'special':False,'elevated':False},'before':before,
  'after':{'targetColumn':read(cpu),'idleTarget':read(cpu+0xf4),'counterD4':read(cpu+0xd4)},
  'selected':read(stack+0x44),'nearPickup':bool(read(stack+0x6c)),'diagnostic_writes':writes})
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
fixture={'parameters':PARAMETERS,'calls':records,'diagnostics':diagnostics,
 'limits':'Ordinary-input native Survival pickup-selection states; isolated original policy calls, not complete JavaScript trajectory parity.'}
for path in [out/'measurement.json',ROOT/PARAMETERS['fixture']]:path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
with (out/'targets.csv').open('w',encoding='utf-8',newline='') as stream:
 rows=[{'frame':r['frame'],'actorX':t['input']['actorX'],'actorY':t['input']['actorY'],
  'pickups':len(t['input']['pickups']),'selected':t['selected'],'targetColumn':t['after']['targetColumn'],
  'idleTarget':t['after']['idleTarget']} for r in records for t in r['targets']]
 writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print('\n'+str(out))
