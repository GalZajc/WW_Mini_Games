"""Record original regular-piece travel inputs at ordinary-input checkpoints."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building',
 'checkpoint_frames':list(range(20,301,20)),'fixture':'tests/fixtures/eggo-cpu-travel-replay-gba.json',
 'script_sha256':hashlib.sha256((ROOT/'scripts/eggo-measure-cpu-policy.py').read_bytes()).hexdigest()}
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-travel-replay_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
records=[]
for index,frame in enumerate(PARAMETERS['checkpoint_frames']):
 source=PARAMETERS['source'];args=[sys.executable,str(ROOT/'scripts/eggo-measure-cpu-policy.py'),
  '--source',source+f'.frame{frame:05}','--next-source',source+f'.frame{frame+1:05}']
 result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 path=Path(result.stdout.strip().splitlines()[-1]);m=json.loads((path/'measurement.json').read_text(encoding='utf-8'))
 records.append({'frame':frame+1,'parameters':m['parameters'],'oracle_output':str(path),
  'returned_keys':m['returned_keys'],'recorded_keys':m['recorded_next_keys'],'travels':m['travels']})
 print(f'\rOriginal travel [{index+1}/{len(PARAMETERS["checkpoint_frames"])}]',end='',flush=True)
fixture={'parameters':PARAMETERS,'calls':records,
 'limits':'Original CPU regular travel inputs from ordinary-input checkpoints; isolated instruction calls, not a complete trajectory replay.'}
for path in [out/'measurement.json',ROOT/PARAMETERS['fixture']]:path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
with (out/'travel.csv').open('w',encoding='utf-8',newline='') as stream:
 rows=[{'frame':r['frame'],'kind':t['input']['kind'],'start':t['input']['start'],'target':t['input']['target'],
  'row':t['input']['row'],'velocity':t['input']['vy'],'loopRegister':t['input']['loopRegister'],
  'keysBefore':t['input']['keys'],'keysAfter':t['keys'],'waypoint':t['after']['waypoint']} for r in records for t in r['travels']]
 writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print('\n'+str(out))
