"""Extract original 64px piece sprites from diagnostic inventory selections.

Only inventory kind/orientation is changed. The original game builds its
sprite, palette and affine output. These are art probes, not played rounds.
"""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct,subprocess,sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'load':'hard-idle','actor':0x3bd4,'inventory':0x864,'orientation':0x868,
 'kinds':8,'rotations':4,'sprite_size':64,'snapshot_frame':4,'steps':[[4,'A']],
 'random_seed':'preserved in source state','affine_index':1,
 'reciprocal_offset':0xd9550,'reciprocal_words':1024,
 'limits':'Diagnostic inventory writes; original emulator-generated graphics, not ordinary-input completion evidence.'}
out=ROOT/'scripts/OUTPUT'/('eggo-throw-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
atlas=Image.new('RGBA',(PARAMETERS['kinds']*64,PARAMETERS['rotations']*64));records=[]
mask_source=(ROOT/'renderer/games/eggo-mania/assets/native-piece-masks.js').read_text(encoding='utf-8')
masks=json.loads(mask_source.split('=',1)[1].strip().rstrip(';'))
for rotation in range(PARAMETERS['rotations']):
 for kind in range(PARAMETERS['kinds']):
  name=f'throw-{kind}-{rotation}'
  writes=[[PARAMETERS['actor']+PARAMETERS['inventory'],kind],[PARAMETERS['actor']+PARAMETERS['orientation'],0]]
  # Real B inputs also exercise the original graphic rotation path.
  steps=[[1,'B'],[1,'']]*rotation+PARAMETERS['steps'];frame=4+2*rotation
  result=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load',PARAMETERS['load'],
   '--name',name,'--writes',json.dumps(writes),'--steps',json.dumps(steps),
   '--snapshot-at',json.dumps([frame])],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
  prefix=Path(result.stdout.strip().splitlines()[-1]).with_suffix('')
  meta=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf-8'))
  sample=Path(str(prefix)+f'.frame{frame:05}')
  blobs={s:Path(str(sample)+s).read_bytes() for s in ['.memory3','.0x5000000','.0x7000000','.0x4000000','.ram']}
  candidates=[]
  for j in range(128):
   a,b,c=struct.unpack_from('<HHH',blobs['.0x7000000'],j*8)
   if a&0x300==0x100 and a>>14==0 and b>>14==3 and (b&511)<112 and (b>>9)&31==PARAMETERS['affine_index']:candidates.append((j,a,b,c))
  assert len(candidates)==1,(kind,rotation,candidates)
  j,a,b,c=candidates[0];palette_index=c>>12
  raw=np.frombuffer(blobs['.0x5000000'],dtype='<u2')[256+palette_index*16:256+(palette_index+1)*16]
  palette=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(16,255)),axis=1).astype('uint8');palette[0]=0
  one=bool(struct.unpack_from('<H',blobs['.0x4000000'])[0]&64);pixels=np.zeros((64,64,4),dtype='uint8')
  for y in range(8):
   for x in range(8):
    tile=(c&1023)+y*(8 if one else 32)+x
    data=np.frombuffer(blobs['.memory3'][0x10000+tile*32:0x10000+(tile+1)*32],dtype='uint8')
    indices=np.stack((data&15,data>>4),axis=1).reshape(8,8)
    pixels[y*8:y*8+8,x*8:x*8+8]=palette[indices]
  # The full-sized image stays in orientation zero. Native affine OAM
  # supplies its quarter turns, unlike the pre-rotated inventory icons.
  matrix=[struct.unpack_from('<h',blobs['.0x7000000'],32+n)[0] for n in [6,14,22,30]]
  turn=[None,Image.Transpose.ROTATE_270,Image.Transpose.ROTATE_180,Image.Transpose.ROTATE_90][rotation]
  image=Image.fromarray(pixels)
  if turn is not None:image=image.transpose(turn)
  pixels=np.asarray(image)
  observed=[[x,y] for y in range(3) for x in range(3) if pixels[16+y*16,16+x*16,3]]
  assert sorted(observed)==sorted(masks[rotation*8+kind]),(kind,rotation,observed,masks[rotation*8+kind])
  atlas.paste(image,(kind*64,rotation*64));image.save(out/(name+'.png'))
  records.append({'kind':kind,'rotation':rotation,'object':j,'palette':palette_index,
   'pixel_sha256':hashlib.sha256(pixels.tobytes()).hexdigest(),'source_affine_matrix':matrix,
   'applied_clockwise_quarter_turns':rotation,'source_parameters':meta,
   'source_hashes':{s:hashlib.sha256(data).hexdigest() for s,data in blobs.items()}})
  print(f'Throw artwork {len(records)}/32',flush=True)
manifest={'parameters':PARAMETERS,'entries':records}
assets=ROOT/'renderer/games/eggo-mania/assets'
rom=Path(records[0]['source_parameters']['rom']).read_bytes()
reciprocal=struct.unpack_from('<1024I',rom,PARAMETERS['reciprocal_offset'])
reciprocal_metadata={'rom_sha256':hashlib.sha256(rom).hexdigest(),
 'offset':PARAMETERS['reciprocal_offset'],'bytes':4*PARAMETERS['reciprocal_words'],'encoding':'unsigned 32-bit little endian'}
reciprocal_js='// Original fixed-point reciprocal lookup; provenance in native-reciprocal.json.\nexport const NATIVE_RECIPROCAL=Object.freeze('+json.dumps(reciprocal,separators=(',',':'))+');\n'
for target in [out,assets]:
 (target/'native-reciprocal.js').write_text(reciprocal_js,encoding='utf-8')
 (target/'native-reciprocal.json').write_text(json.dumps(reciprocal_metadata,indent=2)+'\n',encoding='utf-8')
for target in [out/'throw-pieces.png',assets/'throw-pieces.png']:atlas.save(target)
for target in [out/'parameters.json',assets/'throw-pieces.json']:target.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
with (out/'sprites.csv').open('w',encoding='utf-8',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=['kind','rotation','object','palette','pixel_sha256']);writer.writeheader();writer.writerows({k:r[k] for k in writer.fieldnames} for r in records)
print(out)
