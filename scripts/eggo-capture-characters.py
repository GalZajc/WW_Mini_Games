"""Diagnostic character-ID probes, with original menu/animation evidence preserved."""
from pathlib import Path
from datetime import datetime
import subprocess,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'decoded':'scripts/OUTPUT/eggo-characters_2026-10-04_22-34-09_814879',
 'selection_address':0x3d4,'active_character_address':0x3d8,'hard_menu':'tests/artifacts/eggo-reference/survival-hard.state',
 'win_state':'tests/artifacts/eggo-reference/win4.state',
 'loss_state':'scripts/OUTPUT/eggo-reference_2026-10-04_21-46-00_586686/survival-loss-result.frame00220.state',
 'game_steps':[[8,'A'],[420,'']], 'win_steps':[[1100,'']], 'loss_steps':[[500,'']],
 'seed':'encoded in each original emulator checkpoint; only selected character ID is written'}
out=ROOT/'scripts/OUTPUT'/('eggo-character-captures_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
decoded=json.loads((ROOT/PARAMETERS['decoded']/'measurement.json').read_text(encoding='utf-8'))
records={}
for name,character in decoded['characters'].items():
 records[name]={}
 for kind in ['game','win','loss']:
  state=PARAMETERS['hard_menu' if kind=='game' else kind+'_state']
  args=[sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--name',name+'-'+kind,'--load',state,
        '--writes',json.dumps([[PARAMETERS['selection_address'],character['id']],
         *([[PARAMETERS['active_character_address'],character['id']]] if kind!='game' else [])]),
        '--steps',json.dumps(PARAMETERS[kind+'_steps'])]
  if kind=='game':args+=['--sample-graphics','--arena-trace','--snapshot-at','[428]']
  else:args+=['--podium-trace','--podium-palette',str(ROOT/PARAMETERS['decoded']/(name+'-palette.bin'))]
  result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
  base=Path(result.stdout.strip().splitlines()[-1]).with_suffix('')
  records[name][kind]=str(base.relative_to(ROOT))
  print(name,kind,flush=True)
 (out/'captures.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
parameters={**PARAMETERS,'characters':decoded['characters'],'sources':{
 k:{'path':PARAMETERS[k],'sha256':hashlib.sha256((ROOT/PARAMETERS[k]).read_bytes()).hexdigest()}
 for k in ['hard_menu','win_state','loss_state']}}
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
print(out)
