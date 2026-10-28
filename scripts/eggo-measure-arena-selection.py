"""Preserve native arena selection traces and the matching Thumb instructions."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/.tools'))
from capstone import Cs,CS_ARCH_ARM,CS_MODE_THUMB
PARAMETERS={
 'captures':['scripts/OUTPUT/eggo-reference_2026-10-03_18-19-32_176882/arena-draw0',
             'scripts/OUTPUT/eggo-reference_2026-10-03_18-19-32_212884/arena-draw60'],
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'rom_base':0x08000000,'fade_frames':16,'selection_draws':3,
 'native_stage_names':['beanstalk','factory','dragon','castle','pirate','space','jungle','park'],
 'expected_stages':['factory','space'],
 'instruction_ranges':[(0x16b4,0x16d6),(0x9338,0x934a),(0x9350,0x937c),(0x2bcc,0x2be2)]}
rom=Path(PARAMETERS['rom']).read_bytes();decoder=Cs(CS_ARCH_ARM,CS_MODE_THUMB)
instructions=[]
for start,end in PARAMETERS['instruction_ranges']:
 for i in decoder.disasm(rom[start:end],PARAMETERS['rom_base']+start):
  instructions.append({'address':hex(i.address),'bytes':i.bytes.hex(),
                       'mnemonic':i.mnemonic,'operands':i.op_str})

def step(seed):
 product=seed*75;high=product>>16;low=product&65535
 return (product-high-(high<=low))&65535

samples=[];sources=[]
for relative,expected in zip(PARAMETERS['captures'],PARAMETERS['expected_stages']):
 base=ROOT/relative;meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 trace=json.loads(Path(str(base)+'.trace.json').read_text(encoding='utf-8'))
 assert meta['writes']==[]
 assert meta['rom_sha256']==hashlib.sha256(rom).hexdigest()
 press=next(r['frame'] for r in trace if r['keys']=='A')
 drawn=next(r for r in trace if r['frame']==press+PARAMETERS['fade_frames'])
 before=next(r for r in trace if r['frame']==drawn['frame']-1)
 seed=before['arena']['rng'];first=step(seed);third=step(step(first))
 assert drawn['arena']['rng']==third
 assert drawn['arena']['stage']==first%8
 stage=PARAMETERS['native_stage_names'][first%8];assert stage==expected
 samples.append({'seed':seed,'first_draw':first,'third_draw':third,
                 'stage_id':first%8,'stage':stage,'selection_frame':drawn['frame']})
 sources.append({'path':relative,'parameters':meta,
                 'trace_sha256':hashlib.sha256(Path(str(base)+'.trace.json').read_bytes()).hexdigest()})
fixture={'parameters':PARAMETERS,'samples':samples,'sources':sources,'instructions':instructions,
 'limits':'Initial arena and cyclic progression only. This does not calibrate pickup distribution, AI streams or difficulty progression.'}
out=ROOT/'scripts/OUTPUT'/('eggo-arena-selection_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
for dest in [out/'measurements.json',ROOT/'tests/fixtures/eggo-arena-selection-gba.json']:
 dest.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
with (out/'samples.csv').open('w',encoding='utf-8',newline='') as file:
 writer=csv.DictWriter(file,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
print(out)
