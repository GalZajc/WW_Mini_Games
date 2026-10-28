"""Restore both native group-1 idle pictures in each character's player sheet."""
from pathlib import Path
from datetime import datetime
import json,hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879',
 'native_group':1,'pictures':[0,1],'target_row':13,'cell_size':64,'seed':None}
assets=ROOT/'renderer/games/eggo-mania/assets';source=ROOT/PARAMETERS['source'];records=[]
metadata=assets/'characters.js'
text=metadata.read_text(encoding='utf-8')
text=text.replace('"recovery-free":{"row":13,"frames":1','"recovery-free":{"row":13,"frames":2')
text=text.replace('"recovery-held":{"row":14,"frames":1','"recovery-held":{"row":14,"frames":2')
metadata.write_text(text,encoding='utf-8')
for target in sorted(assets.glob('*-player-poses.png')):
 name=target.name.removesuffix('-player-poses.png');raw=source/(name+'.png')
 if not raw.exists():continue
 sheet=Image.open(target).convert('RGBA');native=Image.open(raw).convert('RGBA')
 for picture in PARAMETERS['pictures']:
  sheet.paste(native.crop((picture*64,0,(picture+1)*64,64)),(picture*64,13*64))
  sheet.paste(native.crop((picture*64,64,(picture+1)*64,128)),(picture*64,14*64))
 sheet.save(target)
 records.append({'file':str(target.relative_to(ROOT)),'source_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
  'output_sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
out=ROOT/'scripts/OUTPUT'/('eggo-free-idle-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
(out/'results.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(out)
