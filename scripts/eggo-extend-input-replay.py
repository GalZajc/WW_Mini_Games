"""Capture a longer ordinary-input tape, with no bot or RAM modifications."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, subprocess, sys, argparse

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--frames',type=int,default=1200);a=p.parse_args()
source=ROOT/'scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.trace.csv'
rows=list(csv.DictReader(source.open(encoding='utf-8')))
if not 0<a.frames<=len(rows):raise ValueError('Requested tape exceeds captured inputs')
steps=[]
for row in rows[:a.frames]:
 if steps and steps[-1][1]==row['keys']:steps[-1][0]+=1
 else:steps.append([1,row['keys']])
out=ROOT/'scripts/OUTPUT'/('eggo-extended-input_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True);tape=out/'steps.json'
tape.write_text(json.dumps(steps)+'\n',encoding='utf-8')
parameters={'frames':a.frames,'source':str(source.relative_to(ROOT)),
 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'checkpoint':'hard-idle',
 'checkpoint_sha256':hashlib.sha256((ROOT/'tests/artifacts/eggo-reference/hard-idle.state').read_bytes()).hexdigest(),
 'random_seed':'Preserved in the original checkpoint','writes':[],
 'description':'Recorded input bytes only; bot disabled in both independent replays.'}
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
print(f'Capturing {a.frames} native frames...',flush=True)
run=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-reference.py'),'--load','hard-idle',
 '--steps-file',str(tape),'--sample-every','1','--sample-graphics','--actor-motion-trace',
 '--camera-trace','--ai-trace','--enemy-trace','--pickup-trace','--arena-trace',
 '--board-events','--oam-trace','--name','extended-input'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
(out/'capture.log').write_text(run.stdout+'\n'+run.stderr,encoding='utf-8')
if run.returncode:raise RuntimeError(run.stderr)
image=Path(run.stdout.strip().splitlines()[-1]);prefix=image.with_suffix('')
(out/'capture.json').write_text(json.dumps({'prefix':str(prefix.relative_to(ROOT))},indent=2)+'\n',encoding='utf-8')
print(prefix,flush=True)
