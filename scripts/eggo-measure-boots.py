"""Preserve input-only native boots kinematics and observed effect countdown."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
    'profiles':{
        'neutral':'scripts/OUTPUT/eggo-reference_2026-10-03_03-35-31_795765/boots-expiry',
        'fast':'scripts/OUTPUT/eggo-reference_2026-10-03_03-35-31_697093/boots-fast',
        'walk':'scripts/OUTPUT/eggo-reference_2026-10-03_03-35-09_701433/boots-speed'},
    'catch':'scripts/OUTPUT/eggo-reference_2026-10-03_03-34-04_875572/boots-held',
    'expired':'scripts/OUTPUT/eggo-reference_2026-10-03_03-37-55_279613/boots-expired',
    'timer_address':0x4500,'frame_rate':60,'sample_frames':[1,2,8,9,10,16,24],
}
OUT=ROOT/'scripts/OUTPUT'/('eggo-boots-measurements_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
def provenance(relative):
    base=ROOT/relative
    p=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
    assert p['writes']==[]
    return {'source':relative,'writes':p['writes'],'steps':p['steps'],
            'initial_state_sha256':p['initial_state_sha256'],
            'trace_sha256':hashlib.sha256(Path(str(base)+'.trace.json').read_bytes()).hexdigest(),
            'rom_sha256':p['rom_sha256'],'core_sha256':p['core_sha256']}
profiles=[]
for kind,relative in PARAMETERS['profiles'].items():
    trace=json.loads(Path(str(ROOT/relative)+'.trace.json').read_text(encoding='utf-8'))
    samples=[{k:s[k] for k in ['frame','keys','world_x','world_y']}
             for s in trace if s['frame'] in (range(1,9) if kind=='walk' else PARAMETERS['sample_frames'])]
    profiles.append({'kind':kind,**provenance(relative),'samples':samples})
base=ROOT/PARAMETERS['catch'];timers=[]
for path in sorted(base.parent.glob(base.name+'.frame*.ram')):
    frame=int(path.name.split('.frame')[1][:5])
    timers.append({'frame':frame,'steps_remaining':struct.unpack_from('<I',path.read_bytes(),PARAMETERS['timer_address'])[0]})
assert all(t['steps_remaining']==623-t['frame'] for t in timers if t['frame']>=25)
assert provenance(PARAMETERS['catch'])['steps']==[[2,'R'],[27,'LEFT+UP'],[21,'UP']]
expired=struct.unpack_from('<I',Path(str(ROOT/PARAMETERS['expired'])+'.frame00501.ram').read_bytes(),PARAMETERS['timer_address'])[0]
assert expired==0
fixture={'parameters':PARAMETERS,'profiles':profiles,'automatic_catch':{
    **provenance(PARAMETERS['catch']),'timer_samples':timers,
    'inferred_activation_frame':23,'duration_frames':600},
    'expiry':{**provenance(PARAMETERS['expired']),'observed_remaining_frames':expired}}
(OUT/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
(OUT/'measurements.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
with (OUT/'samples.csv').open('w',encoding='utf-8',newline='') as file:
    writer=csv.DictWriter(file,fieldnames=['kind','frame','keys','world_x','world_y']);writer.writeheader()
    for p in profiles:writer.writerows({'kind':p['kind'],**s} for s in p['samples'])
(ROOT/'tests/fixtures/eggo-boots-gba.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
print(OUT)
