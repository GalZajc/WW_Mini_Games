"""Read-only ROM instruction inspection, preserving parameters and source hash."""
from pathlib import Path
from datetime import datetime
import argparse, csv, hashlib, json, struct, sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB, CS_MODE_ARM
parser=argparse.ArgumentParser()
parser.add_argument('--ranges',required=True,help='JSON array of ROM-offset [start,end] pairs')
parser.add_argument('--source',default='C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba')
parser.add_argument('--base',type=lambda s:int(s,0),default=0x08000000)
parser.add_argument('--mode',choices=['thumb','arm'],default='thumb')
args=parser.parse_args()
parameters={'source':args.source,
 'base':args.base,'ranges':json.loads(args.ranges),'decoder':'capstone/'+args.mode,
 'limits':'Only inspect known instruction ranges; inline literal pools are data, not code.'}
rom=Path(parameters['source']).read_bytes();parameters['source_sha256']=hashlib.sha256(rom).hexdigest()
if args.base==0x08000000:parameters['rom_sha256']=parameters['source_sha256']
decoder=Cs(CS_ARCH_ARM,CS_MODE_ARM if args.mode=='arm' else CS_MODE_THUMB);records=[]
for start,end in parameters['ranges']:
 for i in decoder.disasm(rom[start:end],parameters['base']+start):
  literal=None
  if i.mnemonic=='ldr' and '[pc,' in i.op_str:
   delta=int(i.op_str.split('#')[1].split(']')[0],0)
   at=((i.address+(8 if args.mode=='arm' else 4))&~3)+delta-parameters['base']
   literal=hex(struct.unpack_from('<I',rom,at)[0])
  record={'address':hex(i.address),'bytes':i.bytes.hex(),'mnemonic':i.mnemonic,'operands':i.op_str,'literal':literal}
  records.append(record)
  print(f'{i.address:08x} {i.mnemonic} {i.op_str}'+(f' ; {literal}' if literal else ''))
out=ROOT/'scripts/OUTPUT'/('eggo-instructions_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
(out/'instructions.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
with (out/'instructions.csv').open('w',encoding='utf-8',newline='') as file:
 writer=csv.DictWriter(file,fieldnames=list(records[0]));writer.writeheader();writer.writerows(records)
print(out)
