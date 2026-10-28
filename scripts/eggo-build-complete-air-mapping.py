"""Complete all held/free, moving/still Yolko air descriptor tables."""
from pathlib import Path
from datetime import datetime
import hashlib,json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
asset=ROOT/'renderer/games/eggo-mania/assets'
manifest_path=asset/'yolko-native-poses.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
source=ROOT/manifest['source_resource_sheet'];sheet=Image.open(source).convert('RGBA')
cells=manifest['cells'];known={(c['source_resource_row'],c['source_resource_column']):c['index'] for c in cells}
tables={7:(0x083f2274,'rise-free'),9:(0x083f2284,'rise'),
        11:(0x083f2294,'fall-free'),13:(0x083f22a4,'fall-moving')}
mapping={}
for state,(table,label) in tables.items():
    for held in (False,True):
        group=state if held else state-1
        for cel in range(2):
            if (group,cel) not in known:
                known[group,cel]=len(cells)
                cells.append({'index':len(cells),'source_resource_row':group,'source_resource_column':cel})
            mapping[f'{state}|0x{table+8*held:08x}|{cel}']={
                'state':label,'sheet':'yolko-native-poses','row':0,'column':known[group,cel]}
atlas=Image.new('RGBA',(64*len(cells),64))
for cell in cells:
    row,col=cell['source_resource_row'],cell['source_resource_column']
    atlas.paste(sheet.crop((col*64,(row-1)*64,col*64+64,row*64)),(cell['index']*64,0))
atlas.save(asset/'yolko-native-poses.png')
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
target=ROOT/'renderer/games/eggo-mania/native-player-animation-map.js'
text=target.read_text(encoding='utf-8')
start=text.index('export const NATIVE_PLAYER_AIR_ART')
end=text.index('export const NATIVE_PLAYER_WALK_ART',start)
text=text[:start]+'export const NATIVE_PLAYER_AIR_ART = Object.freeze('+json.dumps(mapping,indent=4)+');\n\n'+text[end:]
target.write_text(text,encoding='utf-8')
out=ROOT/'scripts/OUTPUT'/('eggo-air-mapping_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
parameters={'experiment':'Complete native airborne descriptor mapping','source':str(source.relative_to(ROOT)),
    'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'random_seed':None,
    'mapping':mapping,'asset_sha256':hashlib.sha256((asset/'yolko-native-poses.png').read_bytes()).hexdigest()}
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
print(out)
