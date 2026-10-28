"""Decode decorative bat/insect tiles, retaining arena OBJ palette indices."""
from pathlib import Path
from datetime import datetime
import hashlib,json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'renderer/games/eggo-mania/assets'
PARAMETERS={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'stages':{'pirate':{'offset':0x111060,'frames':5,'palette_bank':2},
 'beanstalk':{'offset':0x111320,'frames':8,'palette_bank':10},
 'jungle':{'offset':0x111320,'frames':8,'palette_bank':10}},'size':16,'bytes_per_frame':128}
def main():
 out=ROOT/'scripts/OUTPUT'/('eggo-ambient-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
 rom=Path(PARAMETERS['rom']).read_bytes();sources=json.loads((ASSETS/'placed-pieces.json').read_text(encoding='utf-8'))['parameters']['sources'];report={}
 for stage,p in PARAMETERS['stages'].items():
  path=ROOT/(sources[stage]+'.0x5000000');palette=path.read_bytes();raw=np.frombuffer(palette,dtype='<u2',count=16,offset=512+p['palette_bank']*32).astype(np.uint32)
  colors=np.stack(((raw&31)*255//31,((raw>>5)&31)*2*255//63,((raw>>10)&31)*255//31,np.full(16,255)),axis=-1).astype(np.uint8)
  atlas=np.zeros((16,p['frames']*16,4),dtype=np.uint8)
  for frame in range(p['frames']):
   packed=np.frombuffer(rom,dtype=np.uint8,count=128,offset=p['offset']+frame*128)
   indices=np.stack((packed&15,packed>>4),axis=1).reshape(2,2,8,8).transpose(0,2,1,3).reshape(16,16)
   pixels=colors[indices].copy();pixels[indices==0]=0;atlas[:,frame*16:(frame+1)*16]=pixels
  name=f'ambient-{stage}.png';Image.fromarray(atlas).save(ASSETS/name)
  report[name]={'sha256':hashlib.sha256((ASSETS/name).read_bytes()).hexdigest(),'palette_source':str(path),'palette_source_sha256':hashlib.sha256(palette).hexdigest()}
 (out/'parameters.json').write_text(json.dumps({**PARAMETERS,'rom_sha256':hashlib.sha256(rom).hexdigest(),'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},indent=2),encoding='utf-8')
 (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(out)
if __name__=='__main__':main()
