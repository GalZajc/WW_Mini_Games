"""Decode all eight native floor-destruction pictures from an input-only trace."""
from pathlib import Path
from datetime import datetime
import json,hashlib,struct,csv
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_17-18-51_654025/floor-wave-animation',
 'phase_frames':[28,32,36,40,44,48,52,56],'positions':[-8,56],
 'size':[112,32],'sprite_size':[64,32],'palette':2,'timer':0x333c+0x12ac+41*4,
 'samples':80,'random_seed':'preserved in the original source state',
 'warning_source':'scripts/OUTPUT/eggo-reference_2026-10-03_02-24-57_001399/build-oam.frame01920.sprites/007.png'}
out=ROOT/'scripts/OUTPUT'/('eggo-destructive-wave_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
prefix=ROOT/PARAMETERS['source'];meta=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf-8'))
assert meta['writes']==[]
PARAMETERS['original_run']=meta
stage_sources=json.loads((ROOT/'tests/fixtures/eggo-stage-backgrounds-gba.json').read_text(encoding='utf-8'))['parameters']['sources']
stage_sources['factory']=PARAMETERS['source']+'.frame00028'
PARAMETERS['stage_palette_sources']=stage_sources
palette_hashes={stage:hashlib.sha256(Path(str(ROOT/source)+'.0x5000000').read_bytes()[576:608]).hexdigest() for stage,source in stage_sources.items()}
assert len(set(palette_hashes.values()))==1
PARAMETERS['stage_palette_hashes']=palette_hashes
atlas=Image.new('RGBA',(112*8,32));records=[];signatures={}
for phase,frame in enumerate(PARAMETERS['phase_frames']):
 sample=Path(str(prefix)+f'.frame{frame:05}')
 blobs={s:Path(str(sample)+s).read_bytes() for s in ['.memory3','.0x5000000','.0x7000000','.0x4000000']}
 raw=np.frombuffer(blobs['.0x5000000'],dtype='<u2')
 palette=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(512,255)),axis=1).astype('uint8')
 image=Image.new('RGBA',(112,32));objects=[];signature=[]
 assert struct.unpack_from('<H',blobs['.0x4000000'])[0]&64,'Expected one-dimensional OBJ mapping'
 for index,(a,b,d,_) in enumerate(struct.iter_unpack('<4H',blobs['.0x7000000'])):
  x=b&511;x=x-512 if x>=256 else x
  if a>>14!=1 or b>>14!=3 or a&0x300 or x not in PARAMETERS['positions'] or d>>12!=PARAMETERS['palette']:continue
  assert not b&0x3000
  pixels=np.zeros((32,64,4),dtype='uint8');tile=d&1023
  for ty in range(4):
   for tx in range(8):
    at=0x10000+(tile+ty*8+tx)*32;data=np.frombuffer(blobs['.memory3'][at:at+32],dtype='uint8')
    indices=np.stack((data&15,data>>4),axis=1).reshape(8,8).astype('int16');part=palette[256+(d>>12)*16+indices].copy();part[indices==0]=0
    pixels[ty*8:(ty+1)*8,tx*8:(tx+1)*8]=part
  image.paste(Image.fromarray(pixels),(x,0));objects.append({'index':index,'x':x,'y':a&255,'attributes':[a,b,d]})
  signature.append((x,hashlib.sha256(blobs['.memory3'][0x10000+tile*32:0x10000+tile*32+1024]).hexdigest()))
 assert len(objects)==2
 signatures[tuple(sorted(signature))]=phase
 atlas.paste(image,(phase*112,0));image.save(out/f'phase-{phase}.png')
 records.append({'phase':phase,'frame':frame,'objects':objects,'pixel_sha256':hashlib.sha256(image.tobytes()).hexdigest(),
  'source_hashes':{s:hashlib.sha256(b).hexdigest() for s,b in blobs.items()}})
assert len(signatures)==8
timeline=[]
for frame in range(1,PARAMETERS['samples']+1):
 ram=Path(str(prefix)+f'.frame{frame:05}.ram').read_bytes()
 oam=Path(str(prefix)+f'.frame{frame:05}.0x7000000').read_bytes();vram=Path(str(prefix)+f'.frame{frame:05}.memory3').read_bytes();signature=[]
 for a,b,d,_ in struct.iter_unpack('<4H',oam):
  x=b&511;x=x-512 if x>=256 else x
  if a>>14==1 and b>>14==3 and not a&0x300 and x in PARAMETERS['positions'] and d>>12==2:
   at=0x10000+(d&1023)*32;signature.append((x,hashlib.sha256(vram[at:at+1024]).hexdigest()))
 phase=signatures.get(tuple(sorted(signature))) if signature else None
 assert not signature or phase is not None
 timeline.append({'frame':frame,'timer':struct.unpack_from('<i',ram,PARAMETERS['timer'])[0],'phase':phase})
data={'parameters':PARAMETERS,'phases':records,'timeline':timeline}
assets=ROOT/'renderer/games/eggo-mania/assets';atlas.save(assets/'destructive-wave.png')
warning_path=ROOT/PARAMETERS['warning_source'];Image.open(warning_path).convert('RGBA').save(assets/'water-warning.png')
for target,value in [(out/'parameters.json',PARAMETERS),(out/'measurements.json',data),(assets/'destructive-wave.json',data),(ROOT/'tests/fixtures/eggo-wave-art-gba.json',data)]:
 target.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
with (out/'timeline.csv').open('w',encoding='utf-8',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=['frame','timer','phase']);writer.writeheader();writer.writerows(timeline)
print(out)
