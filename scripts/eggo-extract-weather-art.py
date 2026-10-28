"""Rebuild Pirate BG rings from native palette indices for all lightning phases."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'renderer/games/eggo-mania/assets'
PARAMETERS={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'palettes':{'normal':0x217644,'short':0x217244,'long':0x217444},
 'field_objects':{'player':0x3910,'cpu':0x4c8c},'ring_pointer_offset':0x40,
 'tile_width':14,'tile_pixels':8,'ewram_base':0x02000000}

def main():
 out=ROOT/'scripts/OUTPUT'/('eggo-weather-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
 out.mkdir(parents=True)
 rom=Path(PARAMETERS['rom']).read_bytes()
 meta=json.loads((ASSETS/'background-rings.json').read_text(encoding='utf-8'))['assets']['pirate']
 report={};sources={}
 for field,obj in PARAMETERS['field_objects'].items():
  entry=meta[field];path=ROOT/(entry['source_capture']+'.ram');ram=path.read_bytes()
  sources[str(path)]=hashlib.sha256(ram).hexdigest()
  offset=struct.unpack_from('<I',ram,obj+PARAMETERS['ring_pointer_offset'])[0]-PARAMETERS['ewram_base']
  rows=entry['ring_rows'];stride=PARAMETERS['tile_width']*64
  indices=np.frombuffer(ram,dtype=np.uint8,count=rows*stride,offset=offset).reshape(rows,14,8,8).transpose(0,2,1,3).reshape(rows*8,112)
  for phase,at in PARAMETERS['palettes'].items():
   values=np.frombuffer(rom,dtype='<u2',count=256,offset=at).astype(np.uint32)
   palette=np.stack(((values&31)*255//31,((values>>5)&31)*255//31,((values>>10)&31)*255//31,np.full(256,255)),axis=-1).astype(np.uint8)
   pixels=palette[indices].copy();pixels[indices==0,3]=0
   if phase=='normal':
    assert np.array_equal(pixels,np.array(Image.open(ASSETS/entry['file']).convert('RGBA'))),field
   else:
    name=f'bg3-pirate-{field}-weather-{phase}.png';Image.fromarray(pixels).save(ASSETS/name)
    report[name]=hashlib.sha256((ASSETS/name).read_bytes()).hexdigest()
 parameters={**PARAMETERS,'rom_sha256':hashlib.sha256(rom).hexdigest(),'sources':sources,
  'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
 (out/'parameters.json').write_text(json.dumps(parameters,indent=2),encoding='utf-8')
 (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 print(out)

if __name__=='__main__':main()
