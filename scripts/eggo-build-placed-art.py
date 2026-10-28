"""Decode original placement tile templates rather than infer corner artwork."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,csv
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'map_offsets':[0x1f4758,0x1f7b00,0x1fb8a8,0x1ff550,0x202758,0x206cbc,0x20a6bc,0x20d164],
 'stage_order':['beanstalk','factory','dragon','castle','pirate','space','jungle','park'],
 'kinds':8,'rotations':4,'map_bytes':128,'map_stride':8,'picture_size':48,'tile_size':8,
 'color_conversion':'mGBA RGB565 output: R/B use value*255//31; GBA green is expanded as (green5*2)*255//63',
 'factory_source':'scripts/OUTPUT/eggo-reference_2026-10-03_01-40-12_808881/camera-throw',
 'reference_board':0x10084,'columns':7,'floor_row':47,'floor_descriptor':0x8260,
 'random_seed':'preserved in the source states'}
sources=json.loads((ROOT/'tests/fixtures/eggo-stage-backgrounds-gba.json').read_text())['parameters']['sources']
sources['factory']=PARAMETERS['factory_source'];PARAMETERS['sources']=sources
out=ROOT/'scripts/OUTPUT'/('eggo-placed-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
rom=Path(PARAMETERS['rom']).read_bytes();PARAMETERS['rom_sha256']=hashlib.sha256(rom).hexdigest()
mask_source=(ROOT/'renderer/games/eggo-mania/assets/native-piece-masks.js').read_text(encoding='utf-8');masks=json.loads(mask_source.split('=',1)[1].strip().rstrip(';'))
records=[];hashes={}
for stage,offset in zip(PARAMETERS['stage_order'],PARAMETERS['map_offsets']):
 prefix=ROOT/sources[stage];blobs={s:Path(str(prefix)+s).read_bytes() for s in ['.memory3','.0x5000000','.0x4000000','.ram']}
 hashes[stage]={s:hashlib.sha256(b).hexdigest() for s,b in blobs.items()}
 control=struct.unpack_from('<H',blobs['.0x4000000'],8)[0];charbase=((control>>2)&3)*0x4000
 raw=np.frombuffer(blobs['.0x5000000'],dtype='<u2')
 green5=(raw>>5)&31
 palette=np.stack(((raw&31)*255//31,(green5*2)*255//63,((raw>>10)&31)*255//31,
  np.full(512,255)),axis=1).astype('uint8')
 def tile(descriptor):
  at=charbase+(descriptor&1023)*32;data=np.frombuffer(blobs['.memory3'][at:at+32],dtype='uint8')
  indices=np.stack((data&15,data>>4),axis=1).reshape(8,8);pixels=palette[indices+(descriptor>>12)*16].copy();pixels[indices==0,3]=0
  if descriptor&1024:pixels=pixels[:,::-1]
  if descriptor&2048:pixels=pixels[::-1]
  return pixels
 atlas=Image.new('RGBA',(8*48,4*48))
 for rotation in range(4):
  for kind in range(8):
   address=offset+(rotation*8+kind)*128;descriptors=struct.unpack_from('<64H',rom,address)
   picture=np.zeros((48,48,4),dtype='uint8')
   for y in range(6):
    for x in range(6):picture[y*8:y*8+8,x*8:x*8+8]=tile(descriptors[y*8+x])
   occupied=[[x,y] for y in range(3) for x in range(3) if any(descriptors[(y*2+dy)*8+x*2+dx] for dx in range(2) for dy in range(2))]
   assert sorted(occupied)==sorted(masks[rotation*8+kind]),(stage,kind,rotation,occupied)
   atlas.paste(Image.fromarray(picture),(kind*48,rotation*48))
   records.append({'stage':stage,'kind':kind,'rotation':rotation,'rom_offset':address,
    'pixel_sha256':hashlib.sha256(picture.tobytes()).hexdigest(),'descriptors':list(descriptors)})
   if stage=='factory' and kind==6 and rotation==0:
    # Compare the ROM template to cells committed by the ordinary-input
    # throw, including their exact native tile descriptors and pixel data.
    screenbase=((control>>8)&31)*0x800;screen=struct.unpack_from('<1024H',blobs['.memory3'],screenbase)
    floor=next(y*8 for y in range(32) if screen[y*32]==PARAMETERS['floor_descriptor'])
    for x,y in masks[6]:
     row=45+y;column=2+x;py=(floor-(47-row)*16)%256
     for dx in range(2):
      for dy in range(2):
       actual=screen[((py//8+dy)%32)*32+column*2+dx]
       expected=descriptors[(y*2+dy)*8+x*2+dx]
       assert actual==expected,(row,column,actual,expected)
       assert np.array_equal(tile(actual),picture[y*16+dy*8:y*16+dy*8+8,x*16+dx*8:x*16+dx*8+8])
 for destination in [out/f'placed-{stage}.png',ROOT/f'renderer/games/eggo-mania/assets/placed-{stage}.png']:atlas.save(destination)
 print(f'Placement templates {stage}: 32',flush=True)
manifest={'parameters':PARAMETERS,'source_hashes':hashes,'entries':records,
 'limits':'Original ROM tile templates and captured native palettes/graphics; ordinary-input commit comparison covers one factory piece. Completed-row replacement has separate artwork.'}
for destination in [out/'parameters.json',ROOT/'renderer/games/eggo-mania/assets/placed-pieces.json']:destination.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
with (out/'templates.csv').open('w',encoding='utf-8',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=['stage','kind','rotation','rom_offset','pixel_sha256']);writer.writeheader();writer.writerows({k:r[k] for k in writer.fieldnames} for r in records)
print(out)
