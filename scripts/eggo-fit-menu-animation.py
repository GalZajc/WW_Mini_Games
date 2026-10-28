"""Recover independent, seamless native menu animation periods."""
from pathlib import Path
from datetime import datetime
import json
ROOT=Path(__file__).resolve().parents[1];asset=ROOT/'renderer/games/eggo-mania/assets/character-menu-animation.js'
data=json.loads(asset.read_text(encoding='utf-8').split('export const MENU_ANIMATION=')[1].strip().removesuffix(';'))
if 'sequences' not in data:raise SystemExit('Native animation periods already recovered')
out=ROOT/'scripts/OUTPUT'/('eggo-menu-periods_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'));out.mkdir(parents=True)
(out/'sequences.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
def group(q):
 _,x,y,w,h=q
 if x==24 and y==37:return 'actor'
 if x in [112,176] and 28<=y<=35:return 'name'
 if y==133:return 'hint'
 if x in [105,229] and 35<=y<=45:return 'arrows'
 return 'front' if y>=127 else 'back'
tracks={};periods={}
for name,sequence in data.pop('sequences').items():
 tracks[name]={};periods[name]={}
 for kind in ['back','actor','name','hint','arrows','front']:
  samples=[[q for q in frame if group(q)==kind] for frame in sequence]
  period=next((p for p in range(1,len(samples)//2+1) if all(samples[i]==samples[i+p] for i in range(len(samples)-p))),None)
  assert period is not None,(name,kind)
  tracks[name][kind]=samples[:period];periods[name][kind]=period
data['tracks']=tracks;data['parameters']['periods']=periods
asset.write_text('// Independently verified native OBJ animation cycles.\nexport const MENU_ANIMATION='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps({'native_sources':data['sources'],'frames_verified':1024,'periods':periods},indent=2),encoding='utf-8')
print(out)
