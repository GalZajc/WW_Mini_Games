"""Replay real construction inputs, then dive off that tower into water."""
from pathlib import Path
from datetime import datetime
import hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-18_00-17-03_048519/extended-input.json'
data=json.loads(source.read_text(encoding='utf-8'))
print('Source parameter keys:',list(data),flush=True)
steps=data.get('steps')
if not isinstance(steps,list):raise ValueError('Native construction capture must contain its input steps')
tail=[[1,'A'],[39,''],[90,'L'],[600,'']]
out=ROOT/'scripts/OUTPUT'/('eggo-built-water_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True);tape=out/'steps.json';tape.write_text(json.dumps(steps+tail)+'\n',encoding='utf-8')
parameters={'experiment':'Ordinary-input water recovery from a built tower','checkpoint':'hard-idle',
 'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'tail':tail,'frames':sum(n for n,_ in steps+tail),'writes':[],
 'random_seed':'Preserved in original hard-idle checkpoint',
 'checkpoint_sha256':hashlib.sha256((ROOT/'tests/artifacts/eggo-reference/hard-idle.state').read_bytes()).hexdigest()}
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
print(f'Capturing {parameters["frames"]} native frames...',flush=True)
run=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load','hard-idle',
 '--steps-file',str(tape),'--sample-every','1','--sample-graphics','--actor-motion-trace',
 '--camera-trace','--ai-trace','--enemy-trace','--pickup-trace','--arena-trace',
 '--board-events','--oam-trace','--name','built-water-input'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
(out/'capture.log').write_text(run.stdout+'\n'+run.stderr,encoding='utf-8')
if run.returncode:raise RuntimeError(run.stderr)
prefix=Path(run.stdout.strip().splitlines()[-1]).with_suffix('')
(out/'capture.json').write_text(json.dumps({'prefix':str(prefix.relative_to(ROOT))},indent=2)+'\n',encoding='utf-8')
print(prefix,flush=True)
