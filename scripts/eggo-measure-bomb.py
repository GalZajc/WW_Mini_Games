"""Document the same native boxed bomb surviving beyond the prototype fuse."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_12-34-13_873422',
            'initial':'scripts/OUTPUT/eggo-reference_2026-10-03_12-31-35_687909/bomb-first-1.frame00729.ram',
            'entity':0x4bc4,'type_offset':12,'position_offset':24,
            'native_texture_index':3,'frames':[30,60,90,120,150,180,210],
            'identity_probe':'scripts/OUTPUT/eggo-reference_2026-10-03_12-42-07_974244',
            'prototype_fuse_seconds':3,'frames_per_second':60}
folder=ROOT/PARAMETERS['source']
params=json.loads((folder/'bomb-lifetime.json').read_text(encoding='utf-8'))
assert params['writes']==[]
probe_folder=ROOT/PARAMETERS['identity_probe']
probe=json.loads((probe_folder/'bomb-identify.json').read_text(encoding='utf-8'))
assert len(probe['writes'])==1 and probe['writes'][0][0]==PARAMETERS['entity']+PARAMETERS['position_offset']
probe_trace=json.loads((probe_folder/'item-trace.json').read_text(encoding='utf-8'))['records']
probe_bombs=[r for r in probe_trace if r['kind']=='bomb']
assert probe_bombs[1]['x']-probe_bombs[0]['x']==32
trace=json.loads((folder/'item-trace.json').read_text(encoding='utf-8'))['records']
samples=[]
for frame in PARAMETERS['frames']:
    path=folder/f'bomb-lifetime.frame{frame:05d}.ram';ram=path.read_bytes()
    kind=struct.unpack_from('<I',ram,PARAMETERS['entity']+PARAMETERS['type_offset'])[0]
    x,y=struct.unpack_from('<ii',ram,PARAMETERS['entity']+PARAMETERS['position_offset'])
    assert kind==PARAMETERS['native_texture_index']
    picture=next((r for r in trace if r['frame']==frame and r['kind']=='bomb'),None)
    if picture:assert picture['held_by'] is None
    samples.append({'frame':frame,'native_texture_index':kind,'x_pixels':x/65536,
                    'y_pixels':y/65536,'ram_sha256':hashlib.sha256(ram).hexdigest(),
                    'picture_sha256':picture['image_sha256'] if picture else None})
assert all(b['y_pixels']>a['y_pixels'] for a,b in zip(samples,samples[1:]))
assert samples[-1]['picture_sha256'], 'Final observation must confirm the boxed bomb visually'
fixture={'parameters':PARAMETERS,'source_parameters':params,'identity_probe_parameters':probe,'samples':samples,
         'minimum_unarmed_frames':samples[-1]['frame'],
         'observed_visible_frames':max(r['frame'] for r in trace if r['kind']=='bomb'),
         'limits':'Boxed falling bomb only. Does not measure fuse activation, armed duration, throw or blast.'}
out=ROOT/'scripts/OUTPUT'/('eggo-measure-bomb_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True,exist_ok=True)
for path in [out/'parameters.json',ROOT/'tests/fixtures/eggo-bomb-gba.json']:
    path.write_text(json.dumps(fixture,indent=2),encoding='utf-8')
print(json.dumps({'output':str(out),'minimum_unarmed_frames':fixture['minimum_unarmed_frames']}))
