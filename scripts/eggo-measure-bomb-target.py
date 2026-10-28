"""Validate the launch-height table lookup against three input-only throws."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'height_table':0x1151c,'bomb_position':0x10388,'tile_pixels':16,
 'profiles':[
  ['scripts/OUTPUT/eggo-reference_2026-10-03_14-00-49_792819','bomb-launch-detail',3],
  ['scripts/OUTPUT/eggo-reference_2026-10-03_14-04-30_488582','bomb-target-column',21],
  ['scripts/OUTPUT/eggo-reference_2026-10-03_14-08-10_973155','bomb-target-left',21]]}
samples=[]
for path,name,frame in PARAMETERS['profiles']:
 folder=ROOT/path
 source=json.loads((folder/(name+'.json')).read_text(encoding='utf-8'))
 assert source['writes']==[]
 ram=(folder/(name+f'.frame{frame:05d}.ram')).read_bytes()
 x,y,origin,target=struct.unpack_from('<4i',ram,PARAMETERS['bomb_position'])
 table=struct.unpack_from('<8i',ram,PARAMETERS['height_table'])
 column=origin//(65536*PARAMETERS['tile_pixels'])
 assert target==table[column+1]*PARAMETERS['tile_pixels']*65536
 samples.append({'name':name,'frame':frame,'origin_x_pixels':origin/65536,
                 'column':column,'height_table':list(table),'target_y_pixels':target/65536,
                 'ram_sha256':hashlib.sha256(ram).hexdigest(),'source_parameters':source})
fixture={'parameters':PARAMETERS,'samples':samples,
         'limits':'First-stage player throws only. Original table has a leading boundary entry; row-to-world offsets must be preserved.'}
out=Path(__file__).resolve().parent/'OUTPUT'/('eggo-bomb-target_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for path in [out/'measurement.json',ROOT/'tests/fixtures/eggo-bomb-target-gba.json']:
 path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
