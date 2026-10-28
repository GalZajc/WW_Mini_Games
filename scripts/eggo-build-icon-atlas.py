"""Extract the original 16px falling-item pictures from input-only captures."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower',
    'size':16,'palette':2,'exclude_objects':[2,3],'columns':8,
    'derived':[{'source_index':18,'flip':'horizontal',
        'source_sha256':'60c15c87087864499981cb13889addb93d86550db0878f33776d69b52e3472ac',
        'purpose':'Unobserved fourth L3 orientation'}],
    'help_icons':[{'kind':'hammer','source':'scripts/OUTPUT/eggo-reference_2026-10-03_03-00-50_443266/hammer-help.png',
        'rectangle':[84,30,100,46],'note':'Native help-page picture; live gameplay palette still needs observation.'}]}
OUT=ROOT/'scripts/OUTPUT'/('eggo-icon-atlas_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
base=ROOT/PARAMETERS['source']
source_parameters=json.loads(base.with_suffix('.json').read_text(encoding='utf-8'))
assert source_parameters['writes']==[]
images=[];records=[];seen=set()
for path in sorted(base.parent.glob(base.name+'.frame*.0x7000000')):
    prefix=Path(str(path).removesuffix('.0x7000000'))
    oam=path.read_bytes();vram=Path(str(prefix)+'.memory3').read_bytes()
    palraw=Path(str(prefix)+'.0x5000000').read_bytes();io=Path(str(prefix)+'.0x4000000').read_bytes()
    raw=np.frombuffer(palraw,dtype='<u2')[256+32:256+48]
    pal=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,
        ((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
    for i in range(128):
        a0,a1,a2=struct.unpack_from('<HHH',oam,i*8)
        if i in PARAMETERS['exclude_objects'] or a0&0x300==0x200 or a0>>14 or a1>>14!=1 or a2>>12!=2:continue
        out=np.zeros((16,16,4),dtype='uint8')
        for y in range(2):
            for x in range(2):
                number=(a2&1023)+y*(2 if struct.unpack_from('<H',io)[0]&64 else 32)+x
                data=np.frombuffer(vram[0x10000+number*32:0x10000+(number+1)*32],dtype='uint8')
                indices=np.stack((data&15,data>>4),axis=1).reshape(8,8)
                tile=pal[indices].copy();tile[indices==0]=0
                out[y*8:y*8+8,x*8:x*8+8]=tile
        if not a0&256:
            if a1&4096:out=out[:,::-1]
            if a1&8192:out=out[::-1]
        digest=hashlib.sha256(out.tobytes()).hexdigest()
        if digest in seen:continue
        seen.add(digest);images.append(Image.fromarray(out));records.append({'source':str(prefix.relative_to(ROOT)),
            'object':i,'tile':a2&1023,'image_sha256':digest,
            'source_affine':bool(a0&256),'note':'Raw tile picture; affine motion is not baked into the icon.',
            'graphics_sha256':hashlib.sha256(vram+palraw+oam+io).hexdigest()})
for derived in PARAMETERS['derived']:
    source=derived['source_index']
    assert len(records)==28,'Source icon order changed; revalidate the mapping'
    assert records[source]['image_sha256']==derived['source_sha256']
    image=images[source].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    images.append(image);records.append({'derived_from_index':source,'transform':derived['flip'],
        'purpose':derived['purpose'],'image_sha256':hashlib.sha256(np.asarray(image).tobytes()).hexdigest()})
for entry in PARAMETERS['help_icons']:
    path=ROOT/entry['source'];image=Image.open(path).convert('RGBA').crop(tuple(entry['rectangle']))
    assert image.size==(16,16);images.append(image)
    records.append({**entry,'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'image_sha256':hashlib.sha256(np.asarray(image).tobytes()).hexdigest()})
atlas=Image.new('RGBA',(16*len(images),16))
columns=PARAMETERS['columns'];contact=Image.new('RGB',(columns*64,((len(images)+columns-1)//columns)*80),'#173b52')
draw=ImageDraw.Draw(contact)
for i,image in enumerate(images):
    atlas.paste(image,(i*16,0));large=image.resize((48,48),Image.Resampling.NEAREST)
    contact.paste(large,((i%columns)*64,(i//columns)*80+16),large)
    draw.text(((i%columns)*64,(i//columns)*80),str(i),fill='white')
assets=ROOT/'renderer/games/eggo-mania/assets'
atlas.save(assets/'item-icons.png');contact.save(OUT/'icons.png')
manifest={'parameters':PARAMETERS,'initial_state_sha256':source_parameters['initial_state_sha256'],
    'icons':records}
(assets/'item-icons.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(OUT,'icons',len(images))
