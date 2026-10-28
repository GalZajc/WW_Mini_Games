import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULTS,RULES,Tower,randomFrom,advancePickupMotion} from '../renderer/games/eggo-mania/model.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// ROM 09630 initializes 020125C4..02014DC4: 256 descriptors of 40 bytes.
// Both fields have identical pickup streams and are updated alternately.
const SETTINGS=Object.freeze({columns:7,prefillSteps:320,fieldCount:2,renderPoolSlots:256,
  inputs:process.argv.find(x=>x.startsWith('--inputs='))?.slice(9)});
if(!SETTINGS.inputs)throw Error('Provide --inputs=scripts/OUTPUT/eggo-prefill-inputs_<timestamp>/inputs.json; synthetic inter-round seeds are invalid.');
const inputs=JSON.parse(await readFile(path.resolve(ROOT,SETTINGS.inputs),'utf8'));
const original=Tower.prototype.advancePickupSpawn;
const results=[];
try{
 for(const round of inputs){
  const words=round.config;
  const config={words,round:round.round,primary:words[0],secondary:words[1],height:words[17],
    weights:RULES.pickupConfigOffsets.map(o=>words[o/4]),divisor:words[18]};
  const passes=[];
  for(const [index,name] of ['first_pass','second_pass'].entries()){
   const source=round[name],fields=[];
   for(let field=0;field<SETTINGS.fieldCount;field++){
    const seed=source.initial_seeds[field],camera=source.samples[0].camera_y[field];
    const work={calls:0,activeVisits:0,state1Visits:0,state2Visits:0,potentialVisibleVisits:0,
      kindVisits:Array(13).fill(0),waitVisits:0,spawns:0,negativeVx:0,negativeVy:0,
      renderAllocations:0,specialAllocations:0,allocatedKinds:Array(13).fill(0)};
    Tower.prototype.advancePickupSpawn=function(){
     const before=this.crates.length;original.call(this);work.calls++;
     work.spawns+=Math.max(0,this.crates.length-before);
     for(const item of this.crates){
      const d=item.nativeMotion;work.activeVisits++;work.kindVisits[item.nativeKind]++;
      if(d.state===1)work.state1Visits++;else if(d.state===2)work.state2Visits++;
      if(d.wait>0)work.waitVisits++;
      if(d.vx<0)work.negativeVx++;if(d.vy+RULES.pickupGravity<0)work.negativeVy++;
      const after=advancePickupMotion({...d},RULES.nativeBoardFloor+RULES.bubbleWaterlineBias);
      const x=Math.floor(after.x),y=Math.floor(after.y)-Math.floor(camera);
      if(x>=-15&&x<=111&&y>-16&&y<160){
       work.potentialVisibleVisits++;
       if(work.renderAllocations<SETTINGS.renderPoolSlots/SETTINGS.fieldCount){
        work.renderAllocations++;work.allocatedKinds[item.nativeKind]++;
        if(item.nativeKind>=8)work.specialAllocations++;
       }
      }
     }
    };
    const p={...DEFAULTS,mode:'survival',difficulty:'hard',hazards:true,columns:SETTINGS.columns,
      seed,nativeEnemySeed:seed,nativeConfig:config,nativePickupPrefillPasses:1};
    const tower=new Tower(p,randomFrom(seed),field);
    Tower.prototype.advancePickupSpawn=original;
    const prefillFinalSeed=tower.nativeEnemySeed,finalClock=tower.nativePickups.clock;
    const finalItems=tower.crates.map(c=>({kind:c.nativeKind,...c.nativeMotion}));
    // The reference endpoint for pass 2 is native_frame=1, after the hidden
    // first intro update. A clock of zero legitimately consumes four draws
    // there; do not misdiagnose it as a prefill RNG discrepancy.
    if(index===1)tower.advanceIntroPickups();
    fields.push({field,initialSeed:seed,finalSeed:tower.nativeEnemySeed,
      prefillFinalSeed,postPrefillTicks:index===1?1:0,
      expectedFinalSeed:source.expected_final_seeds[field],
      finalSeedMatches:tower.nativeEnemySeed===source.expected_final_seeds[field],
      finalClock,finalItems,work});
    if(work.calls!==SETTINGS.prefillSteps)throw Error(`Unexpected pass length ${work.calls}`);
   }
   passes.push({pass:index+1,fields,cycles:index===1?round.second_prefill_cycles:null});
  }
  results.push({round:round.round,arena:round.arena,passes});
 }
}finally{Tower.prototype.advancePickupSpawn=original;}
const folder=path.join(ROOT,'scripts/OUTPUT','eggo-native-prefill-work_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(folder,{recursive:true});
const sources=['renderer/games/eggo-mania/model.js','scripts/eggo-native-prefill-work-audit.mjs',SETTINGS.inputs];
const sourceSha256=Object.fromEntries(await Promise.all(sources.map(async name=>[name,createHash('sha256').update(await readFile(path.resolve(ROOT,name))).digest('hex')])));
const params={...SETTINGS,sourceSha256,method:'Independent one-pass production Tower warmups using the native seeds/config captured before that exact pass; count updates after spawning, validate final field RNG against recorded RAM. No game-state injection in a production replay.'};
await writeFile(path.join(folder,'parameters.json'),JSON.stringify(params,null,2)+'\n');
await writeFile(path.join(folder,'work.json'),JSON.stringify(results,null,2)+'\n');
const mismatches=[];
for(const r of results)for(const p of r.passes){
 const visits=p.fields.reduce((n,f)=>n+f.work.activeVisits,0);
 const ok=p.fields.every(f=>f.finalSeedMatches);
 if(!ok)mismatches.push({round:r.round,pass:p.pass,fields:p.fields.map(f=>[f.finalSeed,f.expectedFinalSeed])});
 console.log(`round ${r.round} pass ${p.pass}: visits=${visits}, cycles=${p.cycles}, seeds=${ok?'exact':'DIFFER'}`);
}
await writeFile(path.join(folder,'validation.json'),JSON.stringify({passes:results.length*2,seedMismatches:mismatches},null,2)+'\n');
console.log(folder);
