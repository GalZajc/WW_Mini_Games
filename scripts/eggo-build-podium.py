"""Build original podium background, lettering, decimal font and both actor animations."""
from pathlib import Path
from datetime import datetime
import json,hashlib,shutil
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'renderer/games/eggo-mania/assets'
PARAMETERS={'background':'scripts/OUTPUT/eggo-reference_2026-10-04_21-46-00_586686/survival-loss-result.frame00300',
 'game_over':'scripts/OUTPUT/eggo-reference_2026-10-04_21-52-47_847032/survival-podium.frame00360',
 'win':'scripts/OUTPUT/eggo-reference_2026-10-04_21-53-41_653359/podium',
 'loss':'scripts/OUTPUT/eggo-reference_2026-10-04_21-53-43_346639/podium',
 'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'digit_offset':0x1e2fc8,'digit_stride':128,'digits':10,'palette':5,'win_period':56,'seed':None,
 'display_conversion':'mGBA RGB565: green5 << 1, then floor(green6 * 255 / 63)'}
out=ROOT/'scripts/OUTPUT'/('eggo-podium_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
records=[]
def source(path):
 path=ROOT/path;data=path.read_bytes();records.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(data).hexdigest()});return path
base=PARAMETERS['background']
Image.open(source(base+'.bg0.png')).crop((0,0,240,160)).save(ASSETS/'podium-background.png')
Image.open(source(base+'.sprites/003.png')).save(ASSETS/'podium-wins.png')
Image.open(source(PARAMETERS['game_over']+'.sprites/002.png')).save(ASSETS/'podium-game-over.png')
palette_raw=source(base+'.0x5000000').read_bytes();raw=np.frombuffer(palette_raw,dtype='<u2')[256+PARAMETERS['palette']*16:256+(PARAMETERS['palette']+1)*16]
colors=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
rom=Path(PARAMETERS['rom']).read_bytes();PARAMETERS['rom_sha256']=hashlib.sha256(rom).hexdigest()
atlas=Image.new('RGBA',(160,16))
for digit in range(PARAMETERS['digits']):
 picture=np.zeros((16,16,4),dtype='uint8')
 for ty in range(2):
  for tx in range(2):
   at=PARAMETERS['digit_offset']+digit*PARAMETERS['digit_stride']+(ty*2+tx)*32
   data=np.frombuffer(rom[at:at+32],dtype='uint8');indices=np.stack((data&15,data>>4),axis=1).reshape(8,8)
   tile=colors[indices].copy();tile[indices==0]=0;picture[ty*8:ty*8+8,tx*8:tx*8+8]=tile
 atlas.paste(Image.fromarray(picture),(digit*16,0))
def visible_bytes(image):
 pixels=np.array(image.convert('RGBA'));pixels[pixels[:,:,3]==0]=0;return pixels.tobytes()
assert visible_bytes(atlas.crop((0,0,16,16)))==visible_bytes(Image.open(source(base+'.sprites/004.png')))
assert visible_bytes(atlas.crop((64,0,80,16)))==visible_bytes(Image.open(source('tests/artifacts/eggo-reference/win4.sprites/005.png')))
atlas.save(ASSETS/'podium-digits.png')
motions={}
for mode in ['win','loss']:
 folder=PARAMETERS[mode];data=json.loads(source(folder+'/poses.json').read_text(encoding='utf-8'));sequence=data['records']
 replay_meta=json.loads(source(str(Path(folder).parent/f'survival-{mode}-podium.json')).read_text(encoding='utf-8'))
 assert replay_meta['writes']==[]
 if mode=='win':
  period=PARAMETERS['win_period'];signature=lambda r:tuple((k,str(v)) for k,v in r.items() if k!='frame')
  assert all(signature(sequence[i])==signature(sequence[i+period]) for i in range(len(sequence)-period))
  sequence=sequence[:period]
 motions[mode]=[[r['frame'],r['picture'],r['x'],r['y']] for r in sequence]
 assert all(not r['matrix'] and not r['flip_x'] and not r['flip_y'] for r in sequence)
 shutil.copyfile(source(folder+'/actor-atlas.png'),ASSETS/f'podium-{mode}-actor.png')
for path in ASSETS.glob('podium-*.png'):
 pixels=np.array(Image.open(path).convert('RGBA'))
 green5=np.rint(pixels[:,:,1].astype('float64')*31/255).astype('uint16')
 pixels[:,:,1]=(green5*2*255//63).astype('uint8')
 Image.fromarray(pixels).save(path)
manifest={'parameters':PARAMETERS,'sources':records,'motions':motions,
 'limits':'Yolko podium art/poses only. Win cycle sampled from an existing diagnostic win checkpoint; loss sequence input-only. Other selectable characters and result audio remain open.'}
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
for path in [out/'measurement.json',ASSETS/'podium.json']:path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(ASSETS/'podium-motion.js').write_text('// Original OAM poses; provenance in podium.json.\nexport const PODIUM_MOTION='+json.dumps(motions,separators=(',',':'))+';\n',encoding='utf-8')
for path in ASSETS.glob('podium-*.png'):shutil.copyfile(path,out/path.name)
print(out)
