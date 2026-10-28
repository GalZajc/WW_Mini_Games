"""Index decoded water surface atlases by their native shared wave clock."""
from pathlib import Path
from datetime import datetime
import json,struct,hashlib
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'renderer/games/eggo-mania/assets'
parameters={'source':'renderer/games/eggo-mania/assets/arena-water.json',
            'native_frame_offset':0x11a9c,'wave_clock_offset':0x329c,'period':60,
            'routine':'0x080197b0','random_seed':None}
sources=json.loads((ROOT/parameters['source']).read_text(encoding='utf-8'))['sources']
offsets={};records={}
for stage,source in sources.items():
    path=ROOT/(source['prefix']+'.frame00001.ram');raw=path.read_bytes()
    frame=struct.unpack_from('<I',raw,parameters['native_frame_offset'])[0]
    clock=struct.unpack_from('<I',raw,parameters['wave_clock_offset'])[0]
    offsets[stage]=(frame-clock)%parameters['period']
    records[stage]={'source':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest(),
                    'native_frame':frame,'wave_clock':clock,'atlas_phase_offset':offsets[stage]}
out=ROOT/'scripts/OUTPUT'/('eggo-water-animation-clock_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(parameters,indent=2),encoding='utf-8')
(out/'results.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
(ASSETS/'water-animation-phases.js').write_text('// Atlas sample counter minus shared wave clock (ROM 0x080197b0).\nexport const WATER_SURFACE_PHASE_OFFSETS='+json.dumps(offsets)+';\n',encoding='utf-8')
print(out)
