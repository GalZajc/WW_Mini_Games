"""Decode the original character selector's BG/OBJ resources and all actor clips."""
from pathlib import Path
from datetime import datetime
import hashlib, importlib.util, json, struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'renderer/games/eggo-mania/assets'
PARAMETERS={'menu_source':'scripts/OUTPUT/eggo-reference_2026-10-04_22-24-52_823457',
 'resources':'scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879',
 'difficulty_source':'scripts/OUTPUT/eggo-reference_2026-10-19_04-02-46_012404/character-hard',
 'snapshot_frames':[304,38,76,114,152,190,228,266],
 'order':['yolko','funky','robo','bebub','coolio','eggo','spike','astro'],
 'random_seed':'encoded in the recorded menu checkpoint','native_resolution':[240,160]}
out=ROOT/'scripts/OUTPUT'/('eggo-character-menu_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True)
spec=importlib.util.spec_from_file_location('decoder',ROOT/'scripts/eggo-compose-native-layers.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)

def decode(prefix):
 def read(suffix):return Path(str(prefix)+suffix).read_bytes()
 v,io,o,p=read('.memory3'),read('.0x4000000'),read('.0x7000000'),d.palette_555(read('.0x5000000'))
 bg,mask,*_=d.decode_text_bg(v,p,io,0)
 return image(bg,mask),{i:d.decode_object(v,p,io,o,i) for i in range(128)}

def image(pixels,mask):
 rgba=np.zeros((*mask.shape,4),dtype=np.uint8)
 rgba[:,:,:3]=d.color5_to_rgb8(pixels);rgba[:,:,3]=mask*255
 rgba[~mask]=0
 return Image.fromarray(rgba)

sources={};sprites=[];frames={};atlas=Image.new('RGBA',(64*64,64));cursor=0
def sprite(obj):
 global cursor
 picture=image(obj['pixels'],obj['visible']);index=cursor;cursor+=1
 assert cursor<=64
 atlas.paste(picture,(index*64,0))
 return {'cell':index,'x':obj['x'],'y':obj['y'],'width':picture.width,'height':picture.height}

hard=ROOT/PARAMETERS['difficulty_source']
# Legacy checkpoints store final graphics with these names as well.
_,hard_objects=decode(hard)
for name,tick in zip(PARAMETERS['order'],PARAMETERS['snapshot_frames']):
 prefix=ROOT/PARAMETERS['menu_source']/f'survival-roster.frame{tick:05d}'
 bg,objects=decode(prefix)
 sources[name]={'prefix':str(prefix.relative_to(ROOT)),
  'vram_sha256':hashlib.sha256(Path(str(prefix)+'.memory3').read_bytes()).hexdigest()}
 if not sprites:
  bg.save(ASSETS/'character-menu-background.png')
  _,common_objects=decode(ROOT/PARAMETERS['menu_source']/'survival-roster.frame00038')
  # Character arrows, native Survival heading, A/B hints and pedestal.
  for i in [29,22,23,2,3,4,5,7,8,10,11]:sprites.append(sprite(common_objects[i]))
  for i in [17,18]:sprites.append(sprite(hard_objects[i]))
 labels=[o for o in objects.values() if o and o['x'] in [112,176] and 28<=o['y']<=35 and o['width']==64]
 actor=next(o for o in objects.values() if o and o['x']==24 and o['y']==37 and o['width']==64)
 for label in labels:label['y']=32
 frames[name]=[sprite(o) for o in [*labels,actor]]
atlas.crop((0,0,cursor*64,64)).save(ASSETS/'character-menu-sprites.png')
data={'parameters':PARAMETERS,'sources':sources,'common':sprites,'characters':frames}
(ASSETS/'character-menu.js').write_text('// Native BG/OBJ selector resources; see character-menu.json.\nexport const CHARACTER_MENU_ART='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
(ASSETS/'character-menu.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')

# The old supplemental atlas was Yolko-only, causing other characters to
# change identity during native airborne/walking animation overrides.
cells=json.loads((ASSETS/'yolko-native-poses.json').read_text(encoding='utf-8'))['cells']
for name in PARAMETERS['order']:
 if name=='yolko':continue
 source=Image.open(ROOT/PARAMETERS['resources']/(name+'.png')).convert('RGBA')
 sheet=Image.new('RGBA',(64*len(cells),64))
 for cell in cells:
  x=cell['source_resource_column']*64;y=(cell['source_resource_row']-1)*64
  sheet.paste(source.crop((x,y,x+64,y+64)),(cell['index']*64,0))
 sheet.save(ASSETS/(name+'-native-poses.png'))
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
(out/'measurement.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(out)
