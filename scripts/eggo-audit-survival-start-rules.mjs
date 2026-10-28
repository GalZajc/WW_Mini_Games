// Deterministic ROM-rule audit; these explicit configurations are not replay states.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeInitialTowerPieces,RULES} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_ROUNDS} from '../renderer/games/eggo-mania/assets/native-rounds.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const parameters={experiment:'Survival initial-height and opponent handicap ROM rules',
 rom:'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 seed:null,method:'Explicit configurations; deterministic piece placement, no random draws',
 heights:[33,43,47],rounds:[1,8,9,15,16,24,32,40,48,50],difficulty:2,
 evidence:{configTable:'080d74b0',initialTerrain:'080053e4',
  handicap:'080055b8..08005624',verticalPieces:'080052b4'},
 constants:Object.fromEntries(Object.entries(RULES).filter(([k])=>k.startsWith('nativeInitialBoard')||k.startsWith('survival')))};
const digest=b=>createHash('sha256').update(b).digest('hex');
parameters.romSha256=digest(await fs.readFile(parameters.rom));
parameters.sourceHashes={};
for(const file of ['renderer/games/eggo-mania/model.js','renderer/games/eggo-mania/assets/native-rounds.js',path.relative(root,fileURLToPath(import.meta.url))])
 parameters.sourceHashes[file]=digest(await fs.readFile(path.join(root,file)));
const out=path.join(root,'scripts/OUTPUT','eggo-survival-start-rules_'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'parameters.json'),JSON.stringify(parameters,null,2));
const profiles=[];
for(const height of parameters.heights)for(const round of parameters.rounds){
 const fields=[0,1].map(side=>{
  const pieces=nativeInitialTowerPieces({height},round,side);
  const tops=Array.from({length:7},(_,x)=>Math.max(0,...pieces.flatMap(p=>p.cells.filter(c=>c.x===x).map(c=>c.y+1))));
  return {pieces:pieces.length,cells:pieces.reduce((n,p)=>n+p.cells.length,0),columnHeights:tops};
 });
 profiles.push({round,height,handicapCounter:Math.max(0,round+8*parameters.difficulty-24),fields});
}
const configurationHeights=NATIVE_ROUNDS.map((levels,difficulty)=>levels.map((words,i)=>{
 const raw=words[17];return {difficulty,level:i+1,rawHeight:raw,height:raw<=46&&raw%5===2?raw+1:raw};
}));
await fs.writeFile(path.join(out,'rules.json'),JSON.stringify({configurationHeights,profiles},null,2));
const csv=['round,configuration_height,handicap_counter,field,pieces,cells,column0,column1,column2,column3,column4,column5,column6'];
for(const p of profiles)for(const [i,f] of p.fields.entries())csv.push([p.round,p.height,p.handicapCounter,i,f.pieces,f.cells,...f.columnHeights].join(','));
await fs.writeFile(path.join(out,'starting-towers.csv'),csv.join('\n')+'\n');
console.log(out);
console.log(JSON.stringify(profiles.find(p=>p.height===33&&p.round===40)));
