"""Extract the native unboxed carried-bomb image from a documented catch probe."""
from pathlib import Path
from datetime import datetime
import hashlib,json
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_12-44-24_578471/bomb-afterthrow.frame00030',
            'object':30,'size':16,'kind':'armed bomb',
            'note':'Native art after a controlled pickup-position probe; not proof of natural AI decisions.'}
base=ROOT/PARAMETERS['source']
folder=Path(str(base)+'.sprites')
objects=json.loads((folder/'objects.json').read_text(encoding='utf-8'))
obj=next(o for o in objects if o['id']==PARAMETERS['object'])
assert obj['w']==obj['h']==PARAMETERS['size'] and obj['palette']==2
image=Image.open(folder/f'{PARAMETERS["object"]:03d}.png').convert('RGBA')
pixels=np.array(image);pixels[pixels[:,:,3]==0]=0;image=Image.fromarray(pixels)
parameters=json.loads((base.parent/'bomb-afterthrow.json').read_text(encoding='utf-8'))
manifest={'parameters':PARAMETERS,'object':obj,'source_parameters':parameters,
          'image_sha256':hashlib.sha256(image.tobytes()).hexdigest(),
          'source_graphics_sha256':{suffix:hashlib.sha256(Path(str(base)+suffix).read_bytes()).hexdigest()
             for suffix in ['.memory3','.0x5000000','.0x7000000','.0x4000000']}}
out=ROOT/'scripts/OUTPUT'/('eggo-bomb-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True,exist_ok=True)
assets=ROOT/'renderer/games/eggo-mania/assets'
for dest in [out,assets]:
    image.save(dest/'bomb-armed.png')
    (dest/'bomb-armed.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'output':str(out),'image_sha256':manifest['image_sha256']}))
