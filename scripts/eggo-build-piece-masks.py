"""Extract native 3x3 placement masks, retaining original padding/orientation."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'rom':'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 'offset':0x1f4758,'kinds':8,'rotations':4,'kind_stride':128,'rotation_stride':1024,
 'row_stride':32,'column_stride':4,'fixture':'tests/fixtures/eggo-cpu-candidates-gba.json'}
rom=Path(PARAMETERS['rom']).read_bytes();PARAMETERS['rom_sha256']=hashlib.sha256(rom).hexdigest()
masks=[]
for rotation in range(PARAMETERS['rotations']):
 for kind in range(PARAMETERS['kinds']):
  offset=PARAMETERS['offset']+kind*PARAMETERS['kind_stride']+rotation*PARAMETERS['rotation_stride']
  masks.append([[x,y] for x in range(3) for y in range(3)
   if struct.unpack_from('<H',rom,offset+y*PARAMETERS['row_stride']+x*PARAMETERS['column_stride'])[0]])
fixture=json.loads((ROOT/PARAMETERS['fixture']).read_text(encoding='utf-8'));comparisons=0
for record in fixture['diagnostics']:
 s=record['selection']
 for p in record['projections']:
  assert masks[s['rotation']*8+s['kind']]==p['cells'];comparisons+=1
out=ROOT/'scripts/OUTPUT'/('eggo-piece-masks_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
manifest={'parameters':PARAMETERS,'masks':masks,'original_instruction_comparisons':comparisons}
for path in [out/'parameters.json',ROOT/'renderer/games/eggo-mania/assets/native-piece-masks.json']:
 path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(ROOT/'renderer/games/eggo-mania/assets/native-piece-masks.js').write_text(
 '// Original 8 types x 4 rotations, native top-down 3x3 masks. See native-piece-masks.json.\n'
 'export const NATIVE_PIECE_MASKS='+json.dumps(masks,separators=(',',':'))+';\n',encoding='utf-8')
print(out);print('Matched original instruction masks:',comparisons)
