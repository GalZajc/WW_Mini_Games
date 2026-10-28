"""Verify all native flight/rebound samples through expiry, including floor loss."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_14-19-49_228560',
 'name':'bomb-full-flight','position':0x10388,'velocity':0x10398,'height_table':0x1151c,
 'first_frame':3,'last_frame':250,'baseline_world_y':720,'baseline_row':45,
 'field_span_pixels':128,'size_pixels':16,'fuse_counter':0x103a4}
folder=ROOT/PARAMETERS['source']
source=json.loads((folder/(PARAMETERS['name']+'.json')).read_text(encoding='utf-8'))
assert source['writes']==[] and source['steps']==[[2,'RIGHT'],[8,'A'],[255,'']]
samples=[]
for frame in range(PARAMETERS['first_frame'],PARAMETERS['last_frame']+1):
 ram=(folder/(PARAMETERS['name']+f'.frame{frame:05d}.ram')).read_bytes()
 x,y,origin,target=struct.unpack_from('<4i',ram,PARAMETERS['position'])
 table=struct.unpack_from('<8i',ram,PARAMETERS['height_table'])
 samples.append({'frame':frame,'x':x/65536,'y':y/65536,'lift_y':target/65536,
  'vy':struct.unpack_from('<i',ram,PARAMETERS['velocity'])[0]/65536,
  'remaining_frames':struct.unpack_from('<i',ram,PARAMETERS['fuse_counter'])[0],
  'height_table':list(table),'ram_sha256':hashlib.sha256(ram).hexdigest()})
initial=samples[0];x,y,v=initial['x'],initial['y'],initial['vy'];landed=False
prev=initial['height_table']
for s in samples[1:]:
 old=y
 if s['remaining_frames']>0:
  if y>initial['lift_y'] and not landed and x==initial['x']:y-=4
  else:
   if not landed:x+=2
   y+=v;v+=.125
   if x>=128 and v>0:
    column=int((x+8-128)//16);surface=prev[column+1]*16
    if (old if landed else y)+16>=surface:
     v=0 if abs(v)<=.125 else -v*.5;landed=True
 assert abs(x-s['x'])<2e-5 and abs(y-s['y'])<2e-5 and abs(v-s['vy'])<2e-5,s
 prev=s['height_table']
fixture={'parameters':PARAMETERS,'source_parameters':source,'samples':samples,
 'limits':'One natural player throw with changing floor heights; alternate launch columns, catches and blast damage still require verification.'}
out=Path(__file__).resolve().parent/'OUTPUT'/('eggo-bomb-rebounds_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for path in [out/'measurement.json',ROOT/'tests/fixtures/eggo-bomb-rebounds-gba.json']:
 path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
