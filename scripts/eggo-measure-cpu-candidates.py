"""Reproduce the native CPU geometry/scoring fixture from real checkpoints.

Diagnostic candidates change only the logged inventory and CPU sweep fields.
They are instruction comparisons, not a fabricated full-game CPU replay.
"""
from pathlib import Path
from datetime import datetime
import argparse,hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'source':'scripts/OUTPUT/eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building',
 'checkpoint_frames':list(range(20,301,20)),'diagnostic_frame':200,
 'kinds':[0,1,3,7],'rotations':[0,1,2,3],'columns':[0,3,6],
 'fixture':'tests/fixtures/eggo-cpu-candidates-gba.json'}
parser=argparse.ArgumentParser();parser.add_argument('--holes-only',action='store_true');parser.add_argument('--sweep-only',action='store_true');args=parser.parse_args()
if args.holes_only:
 PARAMETERS.update(checkpoint_frames=[],diagnostic_frame=80,kinds=[2],rotations=[1],columns=list(range(7)),
  fixture='tests/fixtures/eggo-cpu-holes-gba.json')
if args.sweep_only:
 PARAMETERS.update(kinds=[0,2],rotations=[0,3],columns=[0,6],fixture='tests/fixtures/eggo-cpu-sweep-gba.json')
PARAMETERS['script_sha256']=hashlib.sha256((ROOT/'scripts/eggo-measure-cpu-policy.py').read_bytes()).hexdigest()
out=ROOT/'scripts/OUTPUT'/('eggo-cpu-candidates_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
total=len(PARAMETERS['checkpoint_frames'])+len(PARAMETERS['kinds'])*len(PARAMETERS['rotations'])*len(PARAMETERS['columns']);done=0
def run(frame,selection=None):
 global done
 source=PARAMETERS['source'];argv=[sys.executable,str(ROOT/'scripts/eggo-measure-cpu-policy.py'),
  '--source',source+f'.frame{frame:05}','--next-source',source+f'.frame{frame+1:05}']
 if selection is not None:argv+=['--candidate',json.dumps(selection)]
 result=subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
 path=Path(result.stdout.strip().splitlines()[-1]);m=json.loads((path/'measurement.json').read_text(encoding='utf-8'))
 record={'parameters':m['parameters'],'candidates':m['candidates'],'projections':m['projections'],'sweeps':m['sweeps']}
 if selection is None:record.update(frame=frame+1,returned_keys=m['returned_keys'],recorded_keys=m['recorded_next_keys'])
 else:record['selection']=selection
 done+=1;print(f'\rNative CPU measurements [{done}/{total}]',end='',flush=True)
 return record
fixture={'limits':'Isolated original CPU calls at ordinary-input replay checkpoints; not a full controller replay.',
 'calls':[run(n) for n in PARAMETERS['checkpoint_frames']],
 'diagnostics':[run(PARAMETERS['diagnostic_frame'],{'kind':k,'rotation':r,'column':c})
  for k in PARAMETERS['kinds'] for r in PARAMETERS['rotations'] for c in PARAMETERS['columns']]}
for path in [out/'measurement.json',ROOT/PARAMETERS['fixture']]:path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
print('\n'+str(out))
