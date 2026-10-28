"""Recover all 13 native inventory types in all four orientations."""
from pathlib import Path
from datetime import datetime
import hashlib,json,re
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'palette_source':'scripts/OUTPUT/eggo-reference_2026-10-04_02-09-36_941624/jungle-native-drop-long.frame00400.0x5000000',
 'graphic_offset':0x214f04,'types':13,'orientations':4,'picture_bytes':128,'palette':2,'size':16}
rom=Path(PARAMETERS['rom']).read_bytes();palraw=(ROOT/PARAMETERS['palette_source']).read_bytes()
raw=np.frombuffer(palraw,dtype='<u2')[288:304]
pal=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
old=json.loads((ROOT/'renderer/games/eggo-mania/assets/item-icons.json').read_text(encoding='utf-8'))
known={entry['image_sha256']:i for i,entry in enumerate(old['icons'])}
text=(ROOT/'renderer/games/eggo-mania/icons.js').read_text(encoding='utf-8')
geometry={int(index):json.loads(cells) for index,cells in re.findall(r'\[(\d+),(\[\[.*?\]\])\]',text)}
atlas=Image.new('RGBA',(13*16,4*16));entries=[]
for variant in range(4):
 for kind in range(13):
  at=PARAMETERS['graphic_offset']+(variant*13+kind)*128;pixels=np.zeros((16,16,4),dtype='uint8')
  for ty in range(2):
   for tx in range(2):
    b=np.frombuffer(rom[at+(ty*2+tx)*32:at+(ty*2+tx+1)*32],dtype='uint8')
    indices=np.stack((b&15,b>>4),axis=1).reshape(8,8);tile=pal[indices].copy();tile[indices==0]=0
    pixels[ty*8:ty*8+8,tx*8:tx*8+8]=tile
  digest=hashlib.sha256(pixels.tobytes()).hexdigest();index=known.get(digest)
  record={'kind':kind,'variant':variant,'offset':at,'pixel_sha256':digest,'old_icon':index}
  if kind<=7 and index in geometry:record['cells']=geometry[index]
  atlas.paste(Image.fromarray(pixels),(kind*16,variant*16));entries.append(record)
# Every ordinary picture must have geometry backed by the existing observed
# icon mapping; missing orientations are resolved from the same native type.
for kind in range(8):
 group=[e for e in entries if e['kind']==kind]
 for e in group:
  if 'cells' in e:continue
  anchor=next(e2 for e2 in group if 'cells' in e2);cells=anchor['cells']
  for _ in range((e['variant']-anchor['variant'])%4):
   cells=[[y,-x] for x,y in cells];mx=min(x for x,y in cells);my=min(y for x,y in cells);cells=[[x-mx,y-my] for x,y in cells]
  e['cells']=cells;e['geometry_from_variant']=anchor['variant']
manifest={'parameters':PARAMETERS,'rom_sha256':hashlib.sha256(rom).hexdigest(),'palette_sha256':hashlib.sha256(palraw).hexdigest(),'entries':entries}
out=ROOT/'scripts/OUTPUT'/('eggo-native-items_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'native-items.png');atlas.resize((624,192),Image.Resampling.NEAREST).save(out/'items.png')
for dest in [out/'parameters.json',assets/'native-items.json']:dest.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
data=[{'cells':e.get('cells'),'icon':e['old_icon']} for e in entries]
(assets/'native-items.js').write_text('// Original 13 types x 4 orientations; provenance in native-items.json.\nexport const NATIVE_ITEMS='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
print(out);print([(e['kind'],e['variant'],e['old_icon'],e.get('geometry_from_variant')) for e in entries])
