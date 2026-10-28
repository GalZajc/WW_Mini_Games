import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {advancePickupMotion} from '../renderer/games/eggo-mania/model.js';
const capture=process.argv[2];if(!capture)throw Error('A project-relative capture prefix is required');
const raw=await readFile(capture+'.trace.json'),trace=JSON.parse(raw),scale=65536;
const stats=[0,1,2].map(delay=>({delay,compared:0,mismatches:0,first:null}));
for(let i=2;i<trace.length;i++)for(let side=0;side<2;side++){
 const old=trace[i-1].pickups[side].items;
 for(const next of trace[i].pickups[side].items){
  const prior=old.find(x=>x.address===next.address&&x.kind===next.kind&&x.variant===next.variant);
  if(!prior)continue;
  for(const s of stats){
   const d={...prior,active:true};for(const k of ['x','y','vx','vy'])d[k]/=scale;
   const line=trace[i-s.delay].enemies.find(x=>x.field===side).waterline/scale;
   advancePickupMotion(d,line);s.compared++;
   const delta=Object.fromEntries(['x','y','vx','vy'].map(k=>[k,Math.round(d[k]*scale)-next[k]]));
   if(Object.values(delta).some(Boolean)||d.state!==next.state){
    s.mismatches++;s.first??={frame:i+1,side,address:next.address,delta,prior,next,waterline:line};
   }
  }
 }
}
const out=path.join('scripts/OUTPUT','eggo-pickup-motion_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'parameters.json'),JSON.stringify({capture,traceSha256:createHash('sha256').update(raw).digest('hex'),
 sourceParameters:JSON.parse(await readFile(capture+'.json','utf8')),stats},null,2));
console.log(JSON.stringify({out,stats},null,2));
