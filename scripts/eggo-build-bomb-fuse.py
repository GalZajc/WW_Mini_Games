"""Extract the bomb body plus its separately animated fuse from native OAM."""
from pathlib import Path
from datetime import datetime
import struct,json,hashlib,importlib.util
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'capture':'scripts/OUTPUT/eggo-reference_2026-10-18_19-46-19_307262/bomb-fuse-grounded',
 'frames':250,'size':32,'body_offset':[8,8],'maximum_body_alpha_changes':32,'remaining_counter':'Before actor update: 251 - capture frame',
 'seed':'hard-idle checkpoint RNG retained; inventory and known fuse counter initialized explicitly'}
spec=importlib.util.spec_from_file_location('ppu',ROOT/'scripts/eggo-compose-native-layers.py');ppu=importlib.util.module_from_spec(spec);spec.loader.exec_module(ppu)
base=np.array(Image.open(ROOT/'renderer/games/eggo-mania/assets/bomb-armed.png').convert('RGBA'))[:,:,3]>0
prefix=ROOT/PARAMETERS['capture'];images=[];lookup=[-1]*251;records=[];hashes={};bodies={};flames=[]
for frame in range(2,251):
 p=Path(str(prefix)+f'.frame{frame:05d}');oam=Path(str(p)+'.0x7000000').read_bytes();vram=Path(str(p)+'.memory3').read_bytes()
 palette=ppu.palette_555(Path(str(p)+'.0x5000000').read_bytes());io=Path(str(p)+'.0x4000000').read_bytes();found=[]
 for i in range(24,128):
  a,b,c=struct.unpack_from('<HHH',oam,i*8)
  if a&0x300 or a>>14 or b>>14!=1 or c>>12!=2 or b&511>=112:continue
  obj=ppu.decode_object(vram,palette,io,oam,i)
  difference=int(np.count_nonzero(obj['visible']!=base))
  if difference<=PARAMETERS['maximum_body_alpha_changes']:found.append((difference,i,obj))
 assert len(found)==1,(frame,len(found))
 alpha_changes,index,body=found[0];fuse=ppu.decode_object(vram,palette,io,oam,index-1)
 assert abs(fuse['x']-body['x'])<=8 and abs(fuse['y']-body['y'])<=8,(frame,index)
 image=Image.new('RGBA',(32,32))
 pictures=[]
 for obj in [body,fuse]:
  rgba=np.dstack([ppu.color5_to_rgb8(obj['pixels']),obj['visible'].astype('uint8')*255]);rgba[~obj['visible']]=0
  picture=Image.fromarray(rgba);pictures.append(picture)
  image.alpha_composite(picture,(8+obj['x']-body['x'],8+obj['y']-body['y']))
 digest=hashlib.sha256(image.tobytes()).hexdigest()
 if digest not in hashes:hashes[digest]=len(images);images.append(image)
 remaining=251-frame;lookup[remaining]=hashes[digest]
 body_phase=(remaining>>5)&1 if remaining>120 else 2 if remaining>50 else 1+((remaining>>3)&1)
 if body_phase in bodies:assert bodies[body_phase].tobytes()==pictures[0].tobytes(),(frame,'body')
 bodies[body_phase]=pictures[0]
 clock=struct.unpack_from('<I',Path(str(p)+'.ram').read_bytes(),0x16c)[0]
 flames.append((clock,pictures[1]))
 records.append({'frame':frame,'remaining':remaining,'clock':clock,'body_object':index,'body_alpha_changes':alpha_changes,'fuse_offset':[fuse['x']-body['x'],fuse['y']-body['y']],
  'image':hashes[digest],'graphics_sha256':hashlib.sha256(vram+oam).hexdigest()})
lookup[0]=lookup[1];lookup[250]=lookup[249]
valid=[]
for delay in range(8):
 phases={};ok=True
 for clock,picture in flames:
  phase=((clock-delay)%24)//8
  if phase in phases and phases[phase].tobytes()!=picture.tobytes():ok=False;break
  phases[phase]=picture
 if ok:valid.append((delay,phases))
assert len(valid)==1,[v[0] for v in valid]
delay,flames=valid[0];PARAMETERS['global_clock_oam_delay']=delay
out=ROOT/'scripts/OUTPUT'/('eggo-bomb-fuse_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
sheet=Image.new('RGBA',(32*len(images),32))
for i,image in enumerate(images):sheet.paste(image,(32*i,0))
assets=ROOT/'renderer/games/eggo-mania/assets';sheet.save(assets/'bomb-fuse.png');sheet.save(out/'bomb-fuse.png')
data={'parameters':PARAMETERS,'sources':records,'lookup':lookup,'images':len(images)}
for path in [out/'parameters.json',assets/'bomb-fuse.json']:path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
parts=Image.new('RGBA',(96,16))
for i in range(3):parts.paste(bodies[i],(16*i,0));parts.paste(flames[i],(16*(i+3),0))
parts.save(assets/'bomb-parts.png');parts.save(out/'bomb-parts.png')
(assets/'bomb-fuse.js').write_text('// ROM 0x0800efc0..f090: body blink, shortened wick, independent global flame clock.\nexport const NATIVE_BOMB_ART=Object.freeze('+json.dumps({'size':16,'destinationSize':32,'clockPeriod':24,'clockOamDelay':delay,'flameTicks':8,'bodySlowThreshold':120,'bodyFastThreshold':50,'wickStart':270,'wickShift':6},separators=(',',':'))+');\n',encoding='utf-8')
print(out);print('Unique body/fuse images:',len(images))
