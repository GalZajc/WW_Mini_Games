"""Decode the entire CPU underwater BG3 window, not only its first 18 rows."""
from pathlib import Path
from datetime import datetime
import importlib.util,json,struct
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];assets=ROOT/'renderer/games/eggo-mania/assets'
spec=importlib.util.spec_from_file_location('bg3',ROOT/'scripts/eggo-build-factory-waterline-bg3.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.SOURCE_Y=np.arange(80,256,dtype=np.int32)
sources=json.loads((assets/'arena-water.json').read_text(encoding='utf-8'))['sources']
sources={'factory':{'prefix':'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics'},**sources}
out=ROOT/'scripts/OUTPUT'/('eggo-water-depth_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'));out.mkdir(parents=True)
for stage,source in sources.items():
 sheet=Image.new('RGBA',(112,176*60));seen=set()
 for frame in range(1,601 if stage=='factory' else 61):
  p=ROOT/(source['prefix']+f'.frame{frame:05d}')
  phase=struct.unpack_from('<I',Path(str(p)+'.ram').read_bytes(),0x11a9c)[0]%60
  if phase in seen:continue
  seen.add(phase)
  rgba=m.decode_alt_bg3_source(Path(str(p)+'.memory3').read_bytes(),Path(str(p)+'.0x5000000').read_bytes())
  sheet.paste(Image.fromarray(rgba),(0,phase*176))
  if len(seen)==60:break
 assert len(seen)==60
 sheet.save(assets/(stage+'-water-bg3-body.png'));print(stage,flush=True)
(out/'parameters.json').write_text(json.dumps({'sources':sources,'source_y':[80,256],'frames':60,'seed':'native checkpoints'},indent=2),encoding='utf-8')
print(out)
