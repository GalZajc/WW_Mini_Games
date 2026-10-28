// Invalid diagnostic: this script omits gameplay draws between rounds and
// consequently uses the wrong field seeds after round 1. Retained for audit
// history only. The replacement reads the actual recorded pass inputs.
throw Error('Use scripts/eggo-native-prefill-work-audit.mjs --inputs=<extracted native inputs.json>; synthetic inter-round RNG invalidates this audit.');
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULTS,RULES,Tower,randomFrom,nativeRandomStep,nativeSurvivalRoundStart,advanceNativeRandom} from '../renderer/games/eggo-mania/model.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SETTINGS=Object.freeze({seed:1492,rounds:16,columns:7,passes:2,prefillSteps:320,fieldCount:2,recording:'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
  loadAudit:'scripts/OUTPUT/eggo-loading-audit_2026-10-21_22-55-39/loading.json'});
let actorSeed=nativeRandomStep(SETTINGS.seed);const rows=[];const original=Tower.prototype.advancePickupSpawn;
for(let round=1;round<=SETTINGS.rounds;round++){
 const start=nativeSurvivalRoundStart(round,actorSeed);actorSeed=start.globalSeed;
 const config=start.config;const p={...DEFAULTS,mode:'survival',difficulty:'hard',hazards:true,columns:SETTINGS.columns,
   seed:(SETTINGS.seed+round-1)&0xffff,nativeConfig:config,nativeEnemySeed:start.fieldSeed,nativePickupPrefillPasses:SETTINGS.passes};
 const fields=[];
 for(let field=0;field<SETTINGS.fieldCount;field++){
  const passSummaries=[];let tracked=null,pass=null;
  Tower.prototype.advancePickupSpawn=function(){
   const stream=this.nativePickups;
   if(stream!==tracked){if(pass)passSummaries.push(pass);tracked=stream;pass={calls:0,activeListVisits:0,visibleListVisits:0,maxActive:0,spawnedThisPass:0,kindVisits:Array(13).fill(0),sparkEligibleVisits:0,finalClock:null};}
   pass.calls++;pass.activeListVisits+=this.crates.length;pass.maxActive=Math.max(pass.maxActive,this.crates.length);
   for(const c of this.crates){if(c.y<160)pass.visibleListVisits++;if(Number.isInteger(c.nativeKind)&&c.nativeKind>=0&&c.nativeKind<13)pass.kindVisits[c.nativeKind]++;if(c.nativeKind>=8)pass.sparkEligibleVisits++;}
   const before=this.crates.length;original.call(this);if(this.crates.length>before)pass.spawnedThisPass++;
   pass.finalClock=stream.clock;
  };
  const tower=new Tower(p,randomFrom(p.seed^(field?0x9e3779b9:0)),field);
  if(pass)passSummaries.push(pass);Tower.prototype.advancePickupSpawn=original;
  fields.push({field,passSummaries,finalCrates:tower.crates.length,finalFieldSeed:tower.nativeEnemySeed});
 }
 rows.push({round,arena:['factory','dragon','castle','pirate','space','jungle','park','beanstalk'][(round-1+1)%8],
  config:{level:config.level,primary:config.primary,secondary:config.secondary,divisor:config.divisor,weights:config.weights},
  fieldSeed:start.fieldSeed,fields});
 actorSeed=advanceNativeRandom(actorSeed,SETTINGS.passes*RULES.pickupGlobalRngCallsPerPass);
}
const audit=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(ROOT,SETTINGS.loadAudit),'utf8'));
const hidden=new Map(audit.map(x=>[x.start,x.hidden_ticks]));
for(let i=0;i<15;i++){const boundary=[8981,17512,24045,29929,39430,49632,57703,64820,69695,75047,80654,85290,91325,98099,104335][i];rows[i+1].recordedStart=boundary;rows[i+1].nativeHiddenTicks=hidden.get(boundary)??null;}
const folder=path.join(ROOT,'scripts/OUTPUT','eggo-prefill-work-audit_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(folder,{recursive:true});
const params={...SETTINGS,method:'Instrument production Tower.advancePickupSpawn; count linked pickup updates before each deterministic spawn/motion step; compare to captured native round-load duration',
 sourceSha256:Object.fromEntries(['renderer/games/eggo-mania/model.js','renderer/games/eggo-mania/native-rescue.js','scripts/eggo-prefill-work-audit.mjs'].map(async f=>[f,createHash('sha256').update(await (await import('node:fs/promises')).readFile(path.join(ROOT,f))).digest('hex')]))};
// Resolve hash promises into a plain, deterministic JSON object.
params.sourceSha256=Object.fromEntries(await Promise.all(Object.entries(params.sourceSha256).map(async([k,v])=>[k,await v])));
await writeFile(path.join(folder,'parameters.json'),JSON.stringify(params,null,2)+'\n');await writeFile(path.join(folder,'work.json'),JSON.stringify(rows,null,2)+'\n');
console.log(folder);for(const r of rows)console.log(r.round,r.arena,'hidden',r.nativeHiddenTicks,'activeVisits',r.fields[0].passSummaries.reduce((n,p)=>n+p.activeListVisits,0),'sparkVisits',r.fields[0].passSummaries.reduce((n,p)=>n+p.sparkEligibleVisits,0),'kindVisits',r.fields[0].passSummaries.map(p=>p.kindVisits),'max',Math.max(...r.fields.map(f=>Math.max(...f.passSummaries.map(p=>p.maxActive)))));
