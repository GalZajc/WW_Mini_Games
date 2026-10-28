"""Compare original sound-wrapper requests against reconstruction event traces."""
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter,defaultdict
import argparse,csv,hashlib,json

ROOT=Path(__file__).resolve().parents[1]
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--native',required=True);parser.add_argument('--app',required=True);args=parser.parse_args()
 native=Path(args.native);app=Path(args.app)
 parameters={'native':str(native.resolve()),'app':str(app.resolve()),'start':401,'end':json.loads((native/'parameters.json').read_text())['end'],
  'comparison':'Wrapper requests, with direct countdown/result calls included from the admitted-stream diagnostic; PCM mixing is not certified by event matching.'}
 assert json.loads((native/'summary.json').read_text())['valid'],'Native instrumentation did not preserve original video'
 requested=defaultdict(list);reference={}
 for line in (native/'events.jsonl').read_text().splitlines():
  r=json.loads(line)
  if parameters['start']<=r['frame']<=parameters['end']:reference[r['frame']]=r['ids']
 if (app/'requested-sounds.json').exists():
  for r in json.loads((app/'requested-sounds.json').read_text()):
   if parameters['start']<=r['frame']<=parameters['end']:requested[r['frame']].append(r['id'])
 else:
  for r in json.loads((app/'sound-events.json').read_text()):requested[r['frame']].append(r['id'])
  for r in json.loads((app/'admitted-sounds.json').read_text()):
   if r['id'] in (17,18,19,38,39):requested[r['frame']].append(r['id'])
 missing=Counter();extra=Counter();rows=[];order_only=[]
 for f in sorted(reference.keys()|requested.keys()):
  a,b=reference.get(f,[]),requested.get(f,[])
  m,e=Counter(a)-Counter(b),Counter(b)-Counter(a);missing.update(m);extra.update(e)
  if not m and not e and a!=b:order_only.append(f)
  rows.append({'frame':f,'native_ids':a,'app_ids':b,'missing':list(m.elements()),'extra':list(e.elements()),'ordered_match':a==b})
 summary={'native_requested':sum(map(len,reference.values())),'app_requested':sum(map(len,requested.values())),
  'missing':dict(missing),'extra':dict(extra),'different_order_only':order_only,
  'mismatching_frames':[r['frame'] for r in rows if not r['ordered_match']]}
 out=ROOT/'scripts/OUTPUT'/('eggo-sound-comparison_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
 for path in [native/'events.jsonl',app/'sound-events.json',app/'admitted-sounds.json',*([app/'requested-sounds.json'] if (app/'requested-sounds.json').exists() else [])]:
  parameters.setdefault('source_sha256',{})[str(path)]=hashlib.sha256(path.read_bytes()).hexdigest()
 (out/'parameters.json').write_text(json.dumps(parameters,indent=2),encoding='utf-8')
 (out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
 with (out/'events.csv').open('w',encoding='utf-8',newline='') as stream:
  writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
 print(json.dumps({'out':str(out),**summary}))
if __name__=='__main__':main()
