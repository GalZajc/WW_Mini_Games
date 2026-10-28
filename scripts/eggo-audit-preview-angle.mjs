// Check the ROM's landing-outline angle recurrence and emitted OAM matrices.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativePreviewAngleStep as approach,nativePreviewAngleMatrix as matrix} from '../renderer/games/eggo-mania/model.js';
const root=path.resolve(import.meta.dirname,'..');
const parameters={capture:'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876',
 prefix:'eggo-replay-full-graphics',frames:600,actors:[0x3bd4,0x4f50],
 fullTurn:0x10000000,halfTurn:0x8000000,snapAngle:0x38e38e,blendShift:2,
 routine:'0x0800cc04',randomSeed:null};
const out=path.join(root,'scripts/OUTPUT/eggo-preview-angle_'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const records=[],previous=[null,null];
for(let frame=1;frame<=parameters.frames;frame++){
 const base=path.join(root,parameters.capture,parameters.prefix+'.frame'+String(frame).padStart(5,'0'));
 const ram=fs.readFileSync(base+'.ram'),oam=fs.readFileSync(base+'.0x7000000');
 for(const [field,actor] of parameters.actors.entries()){
  const read=o=>ram.readInt32LE(actor+o),current={valid:read(0x880),target:read(0x88c),
   angle:read(0x8a8),state:read(0x874),kind:read(0x864)};
  const prior=previous[field];
  if(prior?.valid&&current.valid&&prior.state===0&&current.state===0){
   const candidates=[];
   for(let i=26;i<128;i++){
    const a0=oam.readUInt16LE(i*8),a1=oam.readUInt16LE(i*8+2),a2=oam.readUInt16LE(i*8+4);
    if(!(a0&256)||a0>>14||a1>>14!==3||a2>>12!==13+field)continue;
    const offset=((a1>>9)&31)*32;
    candidates.push([6,14,22,30].map(d=>oam.readInt16LE(offset+d)));
   }
   const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   records.push({frame,field,priorAngle:prior.angle,angle:current.angle,target:current.target,
    recurrenceCurrentTarget:approach(prior.angle,current.target)===current.angle,
    recurrencePreviousTarget:approach(prior.angle,prior.target)===current.angle,
    matrixPrevious:candidates.some(m=>same(m,matrix(prior.angle))),
    matrixCurrent:candidates.some(m=>same(m,matrix(current.angle))),
    oamMatrices:JSON.stringify(candidates)});
  }
  previous[field]=current;
 }
}
const summary={frames:records.length};
for(const k of ['recurrenceCurrentTarget','recurrencePreviousTarget','matrixPrevious','matrixCurrent'])
 summary[k]={exact:records.filter(r=>r[k]).length,firstMismatch:records.find(r=>!r[k])??null};
parameters.sourceSha256=crypto.createHash('sha256').update(fs.readFileSync(import.meta.filename)).digest('hex');
fs.writeFileSync(path.join(out,'parameters.json'),JSON.stringify(parameters,null,2));
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));
fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify(records));
console.log(JSON.stringify({out,...summary},null,2));
