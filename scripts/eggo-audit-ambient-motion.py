"""Read-only ambient-object motion oracle; never writes to the application."""
from pathlib import Path
from datetime import datetime
import argparse,hashlib,json,struct,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from capture import frames

def main():
 ap=argparse.ArgumentParser()
 ap.add_argument('recording',type=Path)
 ap.add_argument('--first',type=int,required=True,help='First native field tick after arena initialization')
 ap.add_argument('--last',type=int,required=True)
 ap.add_argument('--stage',choices=['pirate','beanstalk','jungle'],default='pirate')
 a=ap.parse_args();out=ROOT/'scripts/OUTPUT'/('eggo-ambient-motion_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
 parameters_path=a.recording/'parameters.json';parameters=json.loads(parameters_path.read_text(encoding='utf-8'))
 offsets={};pos=0
 for name,size in parameters['layout'][1:]:offsets[name]=(pos,size);pos+=size
 rows=[]
 for record,video,memory in frames(a.recording,first=a.first,last=a.last):
  n=record['frame']
  if n<a.first:continue
  offset,size=offsets['02000000'];ram=memory[offset:offset+size]
  i=lambda at:struct.unpack_from('<i',ram,at)[0]
  rows.append({'frame':n,'rng':i(0x11aac)&65535,
   'actors':[{'x':i(at),'y':i(at+4)} for at in [0x3bd4,0x4f50]],
   'floors':[i(at+0xec8) for at in [0xf404,0x10650]],
   'items':[{name:i(at+o) for name,o in {'x':0,'y':4,'vx':0x24,'vy':0x28,'top':0x30,'bottom':0x38,'clock':0x3c}.items()} for at in [0x30f38,0x30f78,0x30fb8,0x30ff8]]})
 (out/'frames.json').write_text(json.dumps(rows),encoding='utf-8')
 module=ROOT/'renderer/games/eggo-mania/native-ambient.js'
 meta={**vars(a),'recording':str(a.recording),'sampling':'read-only recorded RAM; independent equation validation, not a production replay',
  'recording_parameters_sha256':hashlib.sha256(parameters_path.read_bytes()).hexdigest(),
  'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),module]}}
 (out/'parameters.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
 program="""
import fs from 'node:fs/promises';
import {createNativeAmbient,advanceNativeAmbient} from './renderer/games/eggo-mania/native-ambient.js';
const path=process.argv[2],stage=process.argv[3],rows=JSON.parse(await fs.readFile(path+'/frames.json','utf8'));
const state=createNativeAmbient(stage);let failure=null,matched=0;
for(const row of rows){
 advanceNativeAmbient(state,stage,row.actors,row.floors);
 for(let slot=0;slot<state.length&&!failure;slot++)for(const key of Object.keys(row.items[slot]))
  if(state[slot][key]!==row.items[slot][key]){failure={frame:row.frame,slot,key,app:state[slot][key],native:row.items[slot][key]};break;}
 if(failure)break;matched++;
}
const result={matched,firstDifference:failure};await fs.writeFile(path+'/report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
"""
 subprocess.run(['node','--input-type=module','-',str(out),a.stage],input=program,text=True,encoding='utf-8',cwd=ROOT,check=True)
 print(out)
if __name__=='__main__':main()
