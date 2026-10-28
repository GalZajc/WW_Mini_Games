"""Preserve native full airborne traces, including terminal downward speeds."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'tile_pixels':16,'frame_rate':60,'profiles':[
    {'name':'neutral','source':'scripts/OUTPUT/eggo-reference_2026-10-03_01-32-34_765349/camera-jump','last_frame':63,'jump_frame':2,'float_through_frame':37,'boosted':False,'terminal_px_per_frame':3.5},
    {'name':'float','source':'scripts/OUTPUT/eggo-reference_2026-10-03_11-21-47_684890/fall-float','last_frame':80,'jump_frame':2,'float_through_frame':100,'boosted':False,'terminal_px_per_frame':1.75},
    {'name':'boots-neutral','source':'scripts/OUTPUT/eggo-reference_2026-10-03_03-35-31_795765/boots-expiry','last_frame':44,'jump_frame':2,'float_through_frame':9,'boosted':True,'terminal_px_per_frame':5},
    {'name':'boots-float','source':'scripts/OUTPUT/eggo-reference_2026-10-03_11-21-47_777898/boots-fall-float','last_frame':86,'jump_frame':2,'float_through_frame':120,'boosted':True,'terminal_px_per_frame':1.75},
    {'name':'boots-fast','source':'scripts/OUTPUT/eggo-reference_2026-10-03_11-21-47_811844/boots-fall-fast','last_frame':31,'jump_frame':2,'float_through_frame':9,'boosted':True,'fast':True,'terminal_px_per_frame':6},
    {'name':'fast-high','source':'scripts/OUTPUT/eggo-reference_2026-10-03_11-22-40_480122/fall-fast-high','last_frame':24,'initial_velocity_pixels':3.5,'jump_frame':None,'float_through_frame':0,'boosted':False,'fast':True,'fast_from_frame':2,'terminal_px_per_frame':5.5},
]}
OUT=ROOT/'scripts/OUTPUT'/('eggo-fall-measurements_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
profiles=[]
for profile in PARAMETERS['profiles']:
    base=ROOT/profile['source'];p=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
    assert p['writes']==[]
    trace=json.loads(Path(str(base)+'.trace.json').read_text(encoding='utf-8'))[:profile['last_frame']]
    samples=[{'frame':s['frame'],'keys':s['keys'],'world_y':s['world_y']} for s in trace]
    deltas=[b['world_y']-a['world_y'] for a,b in zip(samples,samples[1:])]
    assert sum(abs(d-profile['terminal_px_per_frame'])<.001 for d in deltas)>=2,profile
    profiles.append({**profile,'samples':samples,'writes':p['writes'],'steps':p['steps'],
                     'initial_state_sha256':p['initial_state_sha256'],
                     'trace_sha256':hashlib.sha256(Path(str(base)+'.trace.json').read_bytes()).hexdigest(),
                     'rom_sha256':p['rom_sha256'],'core_sha256':p['core_sha256']})
fixture={'parameters':PARAMETERS,'profiles':profiles}
(OUT/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
(OUT/'measurements.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
with (OUT/'samples.csv').open('w',encoding='utf-8',newline='') as file:
    writer=csv.DictWriter(file,fieldnames=['profile','frame','keys','world_y']);writer.writeheader()
    for profile in profiles:writer.writerows({'profile':profile['name'],**s} for s in profile['samples'])
(ROOT/'tests/fixtures/eggo-fall-gba.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
print(OUT)
