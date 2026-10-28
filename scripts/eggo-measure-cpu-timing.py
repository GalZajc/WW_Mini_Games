"""Native CPU timer boundaries; logged diagnostic changes, not a game replay."""
from pathlib import Path
from datetime import datetime
import hashlib,json,subprocess,sys,csv
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00200',
 'next_source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building.frame00201',
 'base':{'stall':0,'period':10,'clock':100,'kind':0,'actorState':0},
 'cases':[{'stall':3},{},{'period':1},{'period':0},{'actorState':4},{'actorState':6},{'actorState':2},{'kind':-1}],
 'fixture':'tests/fixtures/eggo-cpu-timing-gba.json'}
PARAMETERS['oracle_sha256']=hashlib.sha256((ROOT/'scripts/eggo-measure-cpu-policy.py').read_bytes()).hexdigest()
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-timing_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
cases=[]
for i,delta in enumerate(PARAMETERS['cases']):
 selection={**PARAMETERS['base'],**delta}
 result=subprocess.run([sys.executable,str(ROOT/'scripts/eggo-measure-cpu-policy.py'),
  '--source',PARAMETERS['source'],'--next-source',PARAMETERS['next_source'],'--timing',json.dumps(selection)],
  cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 path=Path(result.stdout.strip().splitlines()[-1]);m=json.loads((path/'measurement.json').read_text(encoding='utf-8'))
 cases.append({'selection':selection,'parameters':m['parameters'],'timing':m['timing'],'keys':m['returned_keys']})
 print(f'\rNative CPU timing [{i+1}/{len(PARAMETERS["cases"])}]',end='',flush=True)
fixture={'parameters':PARAMETERS,'cases':cases,'limits':'Isolated original instruction calls from a real checkpoint with all diagnostic writes logged.'}
for path,data in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',fixture),(ROOT/PARAMETERS['fixture'],fixture)]:
 path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (out/'boundaries.csv').open('w',encoding='utf-8',newline='') as stream:
 rows=[{'case':i,**c['selection'],'returned_keys':c['keys']} for i,c in enumerate(cases)]
 writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print('\n'+str(out))
