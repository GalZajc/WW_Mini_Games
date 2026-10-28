"""Frame-exact unobstructed flight from a naturally caught bomb checkpoint."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_14-00-49_792819',
            'name':'bomb-launch-detail','position':0x10388,'velocity':0x10398,
            'first_frame':3,'last_unobstructed_frame':77,'pixels_per_cell':16,
            'collision_frames':[78,79,80],'destination_height_table':0x1151c,
            'baseline_world_y':720,'native_baseline_row':45}
folder=ROOT/PARAMETERS['source']
source=json.loads((folder/(PARAMETERS['name']+'.json')).read_text(encoding='utf-8'))
assert source['writes']==[] and source['steps']==[[2,'RIGHT'],[8,'A'],[70,'']]
samples=[]
for frame in range(PARAMETERS['first_frame'],PARAMETERS['last_unobstructed_frame']+1):
    ram=(folder/(PARAMETERS['name']+f'.frame{frame:05d}.ram')).read_bytes()
    x,y,origin_x,target_y=struct.unpack_from('<4i',ram,PARAMETERS['position'])
    samples.append({'frame':frame,'x':x/65536,'y':y/65536,'target_y':target_y/65536,
                    'vy':struct.unpack_from('<i',ram,PARAMETERS['velocity'])[0]/65536,
                    'ram_sha256':hashlib.sha256(ram).hexdigest()})
initial=samples[0]
x,y,vy=initial['x'],initial['y'],initial['vy']
for s in samples[1:]:
    if y>initial['target_y']:y-=4
    else:x+=2;y+=vy;vy+=0.125
    assert abs(x-s['x'])<1e-6 and abs(y-s['y'])<1e-6 and abs(vy-s['vy'])<1e-6,s
fixture={'parameters':PARAMETERS,'source_parameters':source,'samples':samples,
         'limits':'Only pre-collision flight. Does not establish target-height selection or landing/bounce rules.'}
collision=[]
for frame in PARAMETERS['collision_frames']:
    ram=(folder/(PARAMETERS['name']+f'.frame{frame:05d}.ram')).read_bytes()
    x,y=struct.unpack_from('<ii',ram,PARAMETERS['position'])
    table=struct.unpack_from('<8i',ram,PARAMETERS['destination_height_table'])
    collision.append({'frame':frame,'x':x/65536,'y':y/65536,
                      'vy':struct.unpack_from('<i',ram,PARAMETERS['velocity'])[0]/65536,
                      'surface_heights':[PARAMETERS['native_baseline_row']-v for v in table[1:]],
                      'ram_sha256':hashlib.sha256(ram).hexdigest()})
fixture['collision_samples']=collision
fixture['limits']='Pre-collision flight and first bounce only; later collision/catching/targeting rules need broader captures.'
out=Path(__file__).resolve().parent/'OUTPUT'/('eggo-bomb-launch_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for path in [out/'measurement.json',ROOT/'tests/fixtures/eggo-bomb-launch-gba.json']:
    path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
