"""Assemble the original small height-indicator portraits; record every source."""
from pathlib import Path
from datetime import datetime
import hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'size':16,'stages':['factory','dragon','castle','pirate','space','jungle','park','beanstalk'],
    'player':'scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.frame00840.sprites/002.png',
    'rivals':['scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.frame00840.sprites/003.png',
        *[f'tests/artifacts/eggo-reference/{name}.sprites/003.png' for name in ['dragon-assets','castle-assets','pirate-assets','round5','round6','round7','round8']]]}
OUT=ROOT/'scripts/OUTPUT'/('eggo-progress-atlas_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
atlas=Image.new('RGBA',(16*9,16));records=[]
for i,source in enumerate([PARAMETERS['player'],*PARAMETERS['rivals']]):
    path=ROOT/source;image=Image.open(path).convert('RGBA');assert image.size==(16,16),(source,image.size)
    atlas.paste(image,(i*16,0));records.append({'source':source,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
atlas.save(ROOT/'renderer/games/eggo-mania/assets/progress-portraits.png')
metadata={'parameters':PARAMETERS,'sources':records}
(OUT/'parameters.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
(ROOT/'renderer/games/eggo-mania/assets/progress-portraits.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
print(OUT)
