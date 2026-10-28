"""Execute the original ARM owner/support routine on isolated diagnostic boards.

These are direct instruction comparisons, not fabricated in-game victories.
"""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, random, struct, sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM
from unicorn.arm_const import UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_R0, UC_ARM_REG_R1

PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_11-36-06_347882/collapse-loose-cell.frame00342.0x3000000',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'base':0x03000000,'entry':0x1a34,'end':0x1c70,'return_address':0x08000000,
 'board_address':0x02000000,'context_address':0x02001000,'stack':0x03007000,
 'rows':47,'stride':8,'columns':7,'foundation_owner':255,'seed':31242,'random_cases':32,'instruction_limit':100000,
 'floor_entry':0x1840,'floor_field':0x0200333c,'native_ram':'scripts/OUTPUT/eggo-reference_2026-10-04_11-36-06_347882/collapse-loose-cell.frame00342.ram'}
code=(ROOT/PARAMETERS['source']).read_bytes();rom=Path(PARAMETERS['rom']).read_bytes()
PARAMETERS['source_sha256']=hashlib.sha256(code).hexdigest();PARAMETERS['rom_sha256']=hashlib.sha256(rom).hexdigest()
PARAMETERS['routine_rom_offset']=rom.find(code[PARAMETERS['entry']:PARAMETERS['end']])
assert PARAMETERS['routine_rom_offset']>=0,'The captured routine must match ROM instructions byte for byte'
def board(items):
 rows=[[0]*7 for _ in range(8)]
 for owner,cells in items:
  for x,y in cells:rows[y][x]=owner
 return rows
cases=[{'name':'empty','rows':board([]),'anchor':[2,3]},
 {'name':'floating-L','rows':board([(3,[(2,4),(2,5),(3,4)])]),'anchor':[2,4]},
 {'name':'supported-L','rows':board([(3,[(2,4),(2,5),(3,4)]),(4,[(2,3)])]),'anchor':[2,4]},
 {'name':'on-ground','rows':board([(3,[(2,0),(2,1),(3,0)])]),'anchor':[2,0]},
 {'name':'mutual-support','rows':board([(3,[(1,3),(1,4),(2,4)]),(4,[(2,3),(3,3),(3,4),(3,5),(2,5)])]),'anchor':[1,3]}]
rng=random.Random(PARAMETERS['seed'])
for i in range(PARAMETERS['random_cases']):
 rows=[[rng.choice([0,0,0,3,4,5,6]) for _ in range(7)] for _ in range(8)]
 cases.append({'name':f'diagnostic-{i}','rows':rows,'anchor':[rng.randrange(7),rng.randrange(6)]})
records=[]
for case in cases:
 for merge in [False,True]:
  uc=Uc(UC_ARCH_ARM,UC_MODE_ARM)
  uc.mem_map(0x03000000,0x8000);uc.mem_write(0x03000000,code)
  uc.mem_map(0x02000000,0x2000);uc.mem_map(PARAMETERS['return_address'],0x1000)
  raw=bytearray(50*8)
  for y,row in enumerate(case['rows']):raw[(46-y)*8:(46-y)*8+7]=bytes(row)
  raw[47*8:47*8+7]=bytes([PARAMETERS['foundation_owner']]*7)
  uc.mem_write(PARAMETERS['board_address'],bytes(raw))
  context=PARAMETERS['context_address'];x,y=case['anchor']
  uc.mem_write(context,struct.pack('<III',PARAMETERS['board_address'],x,46-y))
  for register,value in [(UC_ARM_REG_SP,PARAMETERS['stack']),(UC_ARM_REG_LR,PARAMETERS['return_address']),
                         (UC_ARM_REG_R0,context),(UC_ARM_REG_R1,int(merge))]:uc.reg_write(register,value)
  uc.emu_start(PARAMETERS['base']+PARAMETERS['entry'],PARAMETERS['return_address'],count=PARAMETERS['instruction_limit'])
  data=bytes(uc.mem_read(context,0x1dc));owner,n=struct.unpack_from('<II',data,0xc)
  cells=[list(struct.unpack_from('<II',data,0x14+8*i)) for i in range(n)]
  cells=[[x,46-y] for x,y in cells]
  support_count=struct.unpack_from('<I',data,0x114)[0]
  supports=[list(struct.unpack_from('<III',data,0x118+12*i)) for i in range(support_count)]
  supports=[{'owner':-1 if y==47 else owner,'x':x,'y':46-y} for owner,x,y in supports]
  result=bytes(uc.mem_read(PARAMETERS['board_address'],len(raw)))
  after=[list(result[(46-y)*8:(46-y)*8+7]) for y in range(len(case['rows']))]
  records.append({**case,'merge':merge,'owner':owner,'cells':cells,'supports':supports,'after':after})
native_ram=(ROOT/PARAMETERS['native_ram']).read_bytes()
PARAMETERS['native_ram_sha256']=hashlib.sha256(native_ram).hexdigest()
floor_cases=[{'name':'continuous-stack','rows':board([(3,[(0,0),(0,1),(0,2),(0,3)])]),'remove':0},
 {'name':'island-above-empty-row','rows':board([(3,[(0,0),(0,1)]),(4,[(0,4),(1,4)])]),'remove':0},
 {'name':'gap-directly-above-target','rows':board([(3,[(0,1)]),(4,[(0,3),(1,3)])]),'remove':1}]
floors=[]
for case in floor_cases:
 uc=Uc(UC_ARCH_ARM,UC_MODE_ARM)
 uc.mem_map(0x03000000,0x8000);uc.mem_write(0x03000000,code)
 uc.mem_map(0x02000000,0x40000);uc.mem_write(0x02000000,native_ram)
 uc.mem_map(PARAMETERS['return_address'],0x1000)
 field=PARAMETERS['floor_field'];root=struct.unpack('<I',bytes(uc.mem_read(field+0x12a8,4)))[0]
 raw=bytearray(50*8)
 for y,row in enumerate(case['rows']):raw[(46-y)*8:(46-y)*8+7]=bytes(row)
 raw[47*8:47*8+7]=raw[48*8:48*8+7]=bytes([PARAMETERS['foundation_owner']]*7)
 uc.mem_write(root+0xc80,bytes(raw))
 counts=[sum(bool(v) for v in raw[y*8:y*8+7]) for y in range(50)]
 uc.mem_write(root+0xe10,bytes(counts))
 for x in range(7):
  top=next(y for y in range(49) if raw[y*8+x])
  uc.mem_write(root+0xed0+x*4,struct.pack('<I',top))
 actor=bytes(uc.mem_read(field+0x898,8))
 for register,value in [(UC_ARM_REG_SP,PARAMETERS['stack']),(UC_ARM_REG_LR,PARAMETERS['return_address']),
                        (UC_ARM_REG_R0,field),(UC_ARM_REG_R1,46-case['remove'])]:uc.reg_write(register,value)
 uc.emu_start(PARAMETERS['base']+PARAMETERS['floor_entry'],PARAMETERS['return_address'],count=PARAMETERS['instruction_limit'])
 result=bytes(uc.mem_read(root+0xc80,len(raw)))
 after=[list(result[(46-y)*8:(46-y)*8+7]) for y in range(len(case['rows']))]
 assert bytes(uc.mem_read(field+0x898,8))==actor,'Floor deletion must not translate the actor'
 floors.append({**case,'after':after,'actor_translated':False})
out=ROOT/'scripts/OUTPUT'/('eggo-piece-support_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
fixture={'parameters':PARAMETERS,'cases':records,'floor_cases':floors,'limits':'Direct execution of original ARM instructions on diagnostic grids. This proves the owner query, mutual-support merge and bounded floor deletion, not game input timing or arbitrary diagnostic-grid realizability in gameplay.'}
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',fixture),(ROOT/'tests/fixtures/eggo-piece-support-gba.json',fixture)]:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'cases.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.writer(f);writer.writerow(['name','merge','owner','cells','supports','board_changed'])
 for r in records:writer.writerow([r['name'],r['merge'],r['owner'],len(r['cells']),len(r['supports']),r['rows']!=r['after']])
print(len(records),'native instruction comparisons',out)
