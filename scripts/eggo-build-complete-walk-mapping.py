"""Complete both seven-cel walk tables from decoded native character resources."""
from pathlib import Path
from datetime import datetime
import hashlib,json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
asset=ROOT/'renderer/games/eggo-mania/assets';manifest_path=asset/'yolko-native-poses.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'));source=ROOT/manifest['source_resource_sheet']
sheet=Image.open(source).convert('RGBA')
cells=manifest['cells'];known={(c['source_resource_row'],c['source_resource_column']):c['index'] for c in cells}
for column in range(2,7):
 if (3,column) not in known:
  known[3,column]=len(cells);cells.append({'index':len(cells),'source_resource_row':3,'source_resource_column':column})
atlas=Image.new('RGBA',(64*len(cells),64))
for c in cells:
 r,x=c['source_resource_row'],c['source_resource_column']
 atlas.paste(sheet.crop((x*64,(r-1)*64,x*64+64,r*64)),(c['index']*64,0))
atlas.save(asset/'yolko-native-poses.png')
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
mapping={}
for i in range(7):
 mapping[f'4|0x083f222c|{i}']=({'state':'walk-free','row':7,'frame':i} if i<2 else
  {'state':'walk-free','sheet':'yolko-native-poses','row':0,'column':known[3,i]})
 mapping[f'4|0x083f2248|{i}']={'state':'walk','row':1,'frame':i}
target=ROOT/'renderer/games/eggo-mania/native-player-animation-map.js';text=target.read_text(encoding='utf-8')
start=text.index('export const NATIVE_PLAYER_WALK_ART')
text=text[:start]+'export const NATIVE_PLAYER_WALK_ART = Object.freeze('+json.dumps(mapping,indent=4)+');\n'
target.write_text(text,encoding='utf-8')
out=ROOT/'scripts/OUTPUT'/('eggo-walk-mapping_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
parameters={'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'descriptor_tables':['0x083f222c','0x083f2248'],'random_seed':None,'cells':cells,'mapping':mapping,
 'asset_sha256':hashlib.sha256((asset/'yolko-native-poses.png').read_bytes()).hexdigest()}
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
print(out)
