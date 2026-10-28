"""Extract native WIN!/LOSE! glyphs from the input-only result capture."""
from pathlib import Path
from datetime import datetime
import hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_13-55-10_161647/bomb-right-expiry.frame00248',
 'replay':'bomb-right-expiry','objects':list(range(2,11)),'letters':'LOSE!WIN!','size':16,'palette':12}
base=ROOT/PARAMETERS['source'];sprites=Path(str(base)+'.sprites')
source=json.loads((base.parent/(PARAMETERS['replay']+'.json')).read_text(encoding='utf-8'))
assert source['writes']==[]
objects=json.loads((sprites/'objects.json').read_text(encoding='utf-8'))
atlas=Image.new('RGBA',(16*9,16));selected=[]
for i,number in enumerate(PARAMETERS['objects']):
 obj=next(o for o in objects if o['id']==number)
 assert obj['w']==obj['h']==16 and obj['palette']==12
 image=Image.open(sprites/f'{number:03d}.png').convert('RGBA')
 atlas.paste(image,(i*16,0));selected.append(obj)
manifest={'parameters':PARAMETERS,'source_parameters':source,'objects':selected,
 'image_sha256':hashlib.sha256(atlas.tobytes()).hexdigest(),
 'graphics_sha256':{suffix:hashlib.sha256(Path(str(base)+suffix).read_bytes()).hexdigest()
 for suffix in ['.memory3','.0x5000000','.0x7000000','.0x4000000']}}
out=ROOT/'scripts/OUTPUT'/('eggo-result-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
for dest in [out,ROOT/'renderer/games/eggo-mania/assets']:
 atlas.save(dest/'result-letters.png')
 (dest/'result-letters.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(out)
