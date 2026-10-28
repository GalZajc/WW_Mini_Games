"""Measure waterline/camera submission latency using original OAM origins."""
from pathlib import Path
from datetime import datetime
import argparse,collections,csv,hashlib,json,math,struct

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--capture',required=True);a=p.parse_args()
base=ROOT/a.capture;trace_path=Path(str(base)+'.trace.json');trace=json.loads(trace_path.read_text(encoding='utf-8'))
out=ROOT/'scripts/OUTPUT'/('eggo-water-origin_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
records=[];errors=collections.Counter()
for frame in range(3,len(trace)+1):
 oam=Path(str(base)+f'.frame{frame:05d}.0x7000000').read_bytes()
 ys=[a0&255 for i in range(128) for a0,a1,a2 in [struct.unpack_from('<HHH',oam,i*8)]
  if a0>>14==1 and a1>>14==3 and a2>>12==4 and a1&511 in [504,56]]
 if not ys:continue
 assert len(set(ys))==1
 camera=trace[frame-2]['native_cameras']['player']['camera_position_q16']/65536
 for delay in range(3):
  line=trace[frame-delay-1]['enemies'][0]['waterline']/65536
  predicted=math.floor(line-camera)&255;error=int(predicted!=ys[0]);errors[delay]+=error
  records.append({'frame':frame,'waterline_delay':delay,'waterline':line,'camera':camera,
   'predicted_y':predicted,'native_y':ys[0],'mismatch':error})
parameters={'capture':a.capture,'trace_sha256':hashlib.sha256(trace_path.read_bytes()).hexdigest(),
 'native_parameters':json.loads(Path(str(base)+'.json').read_text(encoding='utf-8')),
 'formula':'floor(waterline[n-delay] - camera[n-1]) & 255',
 'compared_oam_pairs':len(records)//3,'mismatches_by_waterline_delay':dict(errors)}
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
with (out/'measurements.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
print(json.dumps({'output':str(out),'pairs':len(records)//3,'mismatches':dict(errors)}))
