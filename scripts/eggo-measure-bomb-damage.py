"""Measure native whole-piece blast damage from the natural bomb replay."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_14-19-49_228560',
 'name':'bomb-full-flight','frames':[249,250],'board':0x112d0,'rows':47,'stride':8,
 'columns':7,'physical_row_offset':2,'world_origin':720,'field_span':128,
 'bomb_position':0x10388,'tile':16,'burst_first_frame':251}
folder=ROOT/PARAMETERS['source']
source=json.loads((folder/(PARAMETERS['name']+'.json')).read_text(encoding='utf-8'))
assert source['writes']==[]
captures=[]
for frame in PARAMETERS['frames']:
 ram=(folder/(PARAMETERS['name']+f'.frame{frame:05d}.ram')).read_bytes()
 rows=[list(ram[PARAMETERS['board']+y*8:PARAMETERS['board']+y*8+7]) for y in range(46,-1,-1)]
 captures.append({'frame':frame,'rows':rows,'ram_sha256':hashlib.sha256(ram).hexdigest()})
before,after=[s['rows'] for s in captures]
removed=[(x,y,before[y][x]) for y in range(47) for x in range(7) if before[y][x] and not after[y][x]]
owners=sorted({owner for x,y,owner in removed})
assert owners==[54,62]
assert all(not after[y][x] for y in range(47) for x in range(7) if before[y][x] in owners)
ram=(folder/(PARAMETERS['name']+'.frame00250.ram')).read_bytes()
x,y=struct.unpack_from('<ii',ram,PARAMETERS['bomb_position'])
center=[(x/65536-PARAMETERS['field_span'])/16+.5,(PARAMETERS['world_origin']-y/65536)/16-.5]
fixture={'parameters':PARAMETERS,'source_parameters':source,'captures':captures,
 'removed_cells':removed,'destroyed_owners':owners,'blast_center':center,
 'limits':'This proves whole-piece deletion. The exact initial footprint/radius requires additional blast positions.'}
out=Path(__file__).resolve().parent/'OUTPUT'/('eggo-bomb-damage_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for path in [out/'measurement.json',ROOT/'tests/fixtures/eggo-bomb-damage-gba.json']:
 path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
