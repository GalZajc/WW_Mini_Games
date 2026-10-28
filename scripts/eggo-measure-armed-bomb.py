"""Measure a naturally caught bomb; no item/timer initialization writes."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
    'source':'scripts/OUTPUT/eggo-reference_2026-10-03_13-55-10_161647',
    'name':'bomb-right-expiry','entity_position':0x10388,'entity_velocity':0x10398,
    'fuse_counter':0x103a4,'fixed_scale':65536,'rate':60,
    'pickup_checkpoint':'scripts/OUTPUT/eggo-reference_2026-10-03_13-32-22_191046/inventory-bomb-0.frame03567.ram',
    'held_counter':0x10640,
    'frames':[20,30,40,50,60,70,248,249,250,251],
    'burst_first_frame':251,
}
folder=ROOT/PARAMETERS['source']
source=json.loads((folder/(PARAMETERS['name']+'.json')).read_text(encoding='utf-8'))
assert source['writes']==[] and source['steps']==[[2,'RIGHT'],[8,'A'],[270,'']]
pickup=(ROOT/PARAMETERS['pickup_checkpoint']).read_bytes()
assert struct.unpack_from('<i',pickup,0x4438)[0]==8
assert struct.unpack_from('<i',pickup,PARAMETERS['held_counter'])[0]==250
samples=[]
for frame in PARAMETERS['frames']:
    path=folder/(PARAMETERS['name']+f'.frame{frame:05d}.ram')
    ram=path.read_bytes()
    x,y=struct.unpack_from('<ii',ram,PARAMETERS['entity_position'])
    samples.append({'frame':frame,'x':x/65536,'y':y/65536,
                    'vertical_velocity':struct.unpack_from('<i',ram,PARAMETERS['entity_velocity'])[0]/65536,
                    'remaining_frames':struct.unpack_from('<i',ram,PARAMETERS['fuse_counter'])[0],
                    'ram_sha256':hashlib.sha256(ram).hexdigest()})
assert all(s['remaining_frames']==max(0,250-s['frame']) for s in samples)
flight=samples[:6]
assert all(b['x']-a['x']==20 for a,b in zip(flight,flight[1:]))
assert all(b['vertical_velocity']-a['vertical_velocity']==1.25 for a,b in zip(flight,flight[1:]))
fixture={'parameters':PARAMETERS,'source_parameters':source,'samples':samples,
         'pickup_ram_sha256':hashlib.sha256(pickup).hexdigest(),
         'armed_frames':250,'flight_pixels_per_frame':2,'flight_acceleration_pixels_per_frame_squared':0.125,
         'limits':'Flight constants apply after the initial upward release. Bounce, targeting and damage remain uncalibrated.'}
out=Path(__file__).resolve().parent/'OUTPUT'/('eggo-armed-bomb_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for path in [out/'measurement.json',ROOT/'tests/fixtures/eggo-armed-bomb-gba.json']:
    path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
