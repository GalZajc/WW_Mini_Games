"""Record the independently observed loss of carried inventory at water entry."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_13-41-42_291613',
            'name':'dive-inventory','inventory':0x4438,'world_y':0x3bd8,
            'baseline_world_y':720.0440673828125,'tile_pixels':16,'water_height_cells':-2,
            'entry_offset_cells':0.25}
folder=ROOT/PARAMETERS['source']
params=json.loads((folder/(PARAMETERS['name']+'.json')).read_text(encoding='utf-8'))
assert params['writes']==[] and params['steps']==[[2,'L'],[88,'']]
trace_path=folder/'inventory-trace.json'
trace=json.loads(trace_path.read_text(encoding='utf-8'))['records']
assert all(r['ids'][0]==6 for r in trace[:13]) and trace[13]['ids'][0]==-1
samples=[]
for frame in [10,12,14,16]:
    path=folder/(PARAMETERS['name']+f'.frame{frame:05d}.ram');ram=path.read_bytes()
    y=struct.unpack_from('<i',ram,PARAMETERS['world_y'])[0]/65536
    item=struct.unpack_from('<i',ram,PARAMETERS['inventory'])[0]
    samples.append({'frame':frame,'world_y':y,'height_cells':(PARAMETERS['baseline_world_y']-y)/16,
                    'inventory_id':item,'ram_sha256':hashlib.sha256(ram).hexdigest()})
assert samples[1]['height_cells']>-1.75 and samples[2]['height_cells']<-1.75
fixture={'parameters':PARAMETERS,'source_parameters':params,'samples':samples,
         'carried_through_frame':13,'lost_on_frame':14,
         'inventory_trace_sha256':hashlib.sha256(trace_path.read_bytes()).hexdigest(),
         'limits':'Normal carried piece; does not measure bomb fuse, discarded-object motion or underwater pickup eligibility.'}
out=ROOT/'scripts/OUTPUT'/('eggo-water-inventory_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True,exist_ok=True)
for path in [out/'parameters.json',ROOT/'tests/fixtures/eggo-water-inventory-gba.json']:
    path.write_text(json.dumps(fixture,indent=2),encoding='utf-8')
print(json.dumps({'output':str(out),'lost_on_frame':14}))
