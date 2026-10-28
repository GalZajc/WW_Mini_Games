"""Measure original filler growth in eight environments with a real tower.

Diagnostic writes select inventory only; placement and filler are performed
by original A inputs. This is artwork/transition evidence, not round parity.
"""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'sources':json.loads((ROOT/'tests/fixtures/eggo-stage-backgrounds-gba.json').read_text())['parameters']['sources'],
 'actor':0x3bd4,'held':0x864,'rotation':0x868,'board':0xf404,'build_kind':6,'filler_kind':10,
 'build_frames':40,'fill_frames':70,'seed':'preserved in original source states',
 'limits':'Eight diagnostic inventory selections followed by real controls; no fabricated board or changed gameplay timers.'}
PARAMETERS['sources']['factory']='tests/artifacts/eggo-reference/hard-idle'
out=ROOT/'scripts/OUTPUT'/('eggo-filler-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
records=[]
reuse={}
if len(sys.argv)>1:
 source=Path(sys.argv[1]);PARAMETERS['reuse_source']=str(source);PARAMETERS['reuse_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
 reuse={record['stage']:record for record in json.loads(source.read_text(encoding='utf-8'))['stages']}
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
def capture(source,name,kind,frames,sample=False):
 writes=[[PARAMETERS['actor']+PARAMETERS['held'],kind],[PARAMETERS['actor']+PARAMETERS['rotation'],0]]
 args=[sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',str(source),'--name',name,
  '--writes',json.dumps(writes),'--steps',json.dumps([[1,'A'],[frames-1,'']]),'--board-events']
 if sample:args+=['--sample-every','1','--sample-graphics']
 result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 return Path(result.stdout.strip().splitlines()[-1]).with_suffix('')
for stage,source in PARAMETERS['sources'].items():
 state=ROOT/(source+'.state')
 if stage in reuse:
  built=ROOT/reuse[stage]['build_source'];filled=ROOT/reuse[stage]['growth_source']
 else:
  built=capture(state,'filler-build-'+stage,PARAMETERS['build_kind'],PARAMETERS['build_frames'])
  filled=capture(Path(str(built)+'.state'),'filler-growth-'+stage,PARAMETERS['filler_kind'],PARAMETERS['fill_frames'],True)
 old=Path(str(built)+'.ram').read_bytes();initial=[[old[PARAMETERS['board']+0xc80+r*8+x] for x in range(7)] for r in range(47)]
 histories={};previous={};actor_samples=[]
 for frame in range(1,PARAMETERS['fill_frames']+1):
  ram=Path(str(filled)+f'.frame{frame:05}.ram').read_bytes()
  actor_samples.append({'frame':frame,'y':struct.unpack_from('<i',ram,PARAMETERS['actor']+4)[0]/65536,
   'vy':struct.unpack_from('<i',ram,PARAMETERS['actor']+0x18)[0]/65536,
   'float_ticks':struct.unpack_from('<i',ram,PARAMETERS['board']+0xec4)[0]})
  for y in range(47):
   for x in range(7):
    owner=ram[PARAMETERS['board']+0xc80+y*8+x]
    if not owner or initial[y][x]:continue
    descriptor=[struct.unpack_from('<H',ram,PARAMETERS['board']+(y*2+dy)*32+x*4+dx*2)[0] for dy in range(2) for dx in range(2)]
    key=(x,46-y)
    if descriptor!=previous.get(key):
     histories.setdefault(key,[]).append({'frame':frame,'descriptors':descriptor,'owner':owner});previous[key]=descriptor
 assert len(histories)==6,(stage,histories)
 record={'stage':stage,'build_source':str(built.relative_to(ROOT)),'growth_source':str(filled.relative_to(ROOT)),
  'build_parameters':json.loads(Path(str(built)+'.json').read_text(encoding='utf-8')),
  'growth_parameters':json.loads(Path(str(filled)+'.json').read_text(encoding='utf-8')),
  'source_ram_sha256':hashlib.sha256(old).hexdigest(),
  'initial_x':(struct.unpack_from('<i',old,PARAMETERS['actor'])[0]/65536+16)/16,
  'initial_y':(720-struct.unpack_from('<i',old,PARAMETERS['actor']+4)[0]/65536)/16,
  'initial_vy':-struct.unpack_from('<i',old,PARAMETERS['actor']+0x18)[0]/65536*60/16,
  'actor_samples':actor_samples,
  'before_rows_bottom_up':list(reversed(initial)),
  'cells':[{'x':x,'y':y,'events':events} for (x,y),events in histories.items()]}
 record['cells'].sort(key=lambda c:c['events'][0]['owner'])
 assert all(len(c['events'])==3 for c in record['cells']),stage
 assert all([e['descriptors'] for e in c['events']]==[e['descriptors'] for e in record['cells'][0]['events']] for c in record['cells']),stage
 # Extract exactly the three distinct pictures written by the original.
 first=Path(str(filled)+'.frame00001');vram=Path(str(first)+'.memory3').read_bytes();palette_bytes=Path(str(first)+'.0x5000000').read_bytes();io=Path(str(first)+'.0x4000000').read_bytes()
 charbase=((struct.unpack_from('<H',io,8)[0]>>2)&3)*0x4000
 raw=np.frombuffer(palette_bytes,dtype='<u2');palette=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(512,255)),axis=1).astype('uint8')
 atlas=Image.new('RGBA',(48,16));record['art_hashes']={'vram':hashlib.sha256(vram).hexdigest(),'palette':hashlib.sha256(palette_bytes).hexdigest()}
 for phase,event in enumerate(record['cells'][0]['events']):
  assert phase<3
  pixels=np.zeros((16,16,4),dtype='uint8')
  for corner,d in enumerate(event['descriptors']):
   at=charbase+(d&1023)*32;data=np.frombuffer(vram[at:at+32],dtype='uint8');indices=np.stack((data&15,data>>4),axis=1).reshape(8,8);tile=palette[indices+(d>>12)*16].copy();tile[indices==0,3]=0
   if d&1024:tile=tile[:,::-1]
   if d&2048:tile=tile[::-1]
   pixels[(corner//2)*8:(corner//2+1)*8,(corner%2)*8:(corner%2+1)*8]=tile
  atlas.paste(Image.fromarray(pixels),(phase*16,0));event['pixel_sha256']=hashlib.sha256(pixels.tobytes()).hexdigest()
 for destination in [out/f'filler-{stage}.png',ROOT/f'renderer/games/eggo-mania/assets/filler-{stage}.png']:atlas.save(destination)
 records.append(record);print(f'Filler growth {stage}: {len(histories)} cells',flush=True)
fixture={'parameters':PARAMETERS,'stages':records}
(out/'measurements.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
(ROOT/'tests/fixtures/eggo-filler-art-gba.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
(ROOT/'renderer/games/eggo-mania/assets/filler-pieces.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
with (out/'transitions.csv').open('w',encoding='utf-8',newline='') as stream:
 writer=csv.writer(stream);writer.writerow(['stage','x','y','frame','owner','descriptors'])
 for stage in records:
  for cell in stage['cells']:
   for event in cell['events']:writer.writerow([stage['stage'],cell['x'],cell['y'],event['frame'],event['owner'],json.dumps(event['descriptors'])])
print(out)
