// Deterministic native-bag integration check, not an original-controller replay.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
import {CPU_PARAMETERS,CPU_WEIGHTS} from '../renderer/games/eggo-mania/native-cpu.js';
const parameters={settings:settings({hazards:true,waterSpeed:0,seed:42}),seed:42,round:1,
 startingStage:0,step:RULES.step,maxFrames:18000,sampleEvery:60,physics:RULES,
 cpuParameters:CPU_PARAMETERS,cpuWeights:CPU_WEIGHTS,sourceHashes:{},
 limits:'Reconstructed native inventory, candidate score/search, route and steering gates, pickup targeting, special-item dispatch, enemy avoidance/contact centers, and projectile targeting. This deterministic model-only run checks that the integrated planner reaches rescue; it is not a synchronized replay of the original CPU. Full match trajectories, all shared RNG consumers, and unmeasured transition/contact phases remain unverified.'};
for(const file of ['renderer/games/eggo-mania/model.js','renderer/games/eggo-mania/game.js',
 'renderer/games/eggo-mania/native-cpu.js','renderer/games/eggo-mania/assets/native-piece-masks.js']){
 parameters.sourceHashes[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
}
const out=new URL('./OUTPUT/eggo-native-cpu-replay_'+new Date().toISOString().replace(/[:.]/g,'-')+'/',import.meta.url);
await mkdir(out,{recursive:true});await writeFile(new URL('parameters.json',out),JSON.stringify(parameters,null,2)+'\n');
const g=new Game();g.p=parameters.settings;g.seed=parameters.seed;g.round=parameters.round;
g.startingStage=parameters.startingStage;g.startRound({intro:false});
parameters.nativeRoundConfig=g.cpu.p.nativeConfig;
await writeFile(new URL('parameters.json',out),JSON.stringify(parameters,null,2)+'\n');
let frame=0,maxHeight=0,attempts=0;const placements=[],samples=[];
const use=g.cpu.use.bind(g.cpu);
g.cpu.use=(...args)=>{
 attempts++;const inventory=g.cpu.held?.nativeKind,ok=use(...args);
 if(ok&&g.cpu.placing)placements.push({frame,inventory,x:g.cpu.placing.x,y:g.cpu.placing.y,cells:g.cpu.placing.cells});
 return ok;
};
for(;frame<parameters.maxFrames&&!g.cpu.won&&!g.cpu.lost;frame++){
 g.updateCPU(parameters.step);maxHeight=Math.max(maxHeight,g.cpu.height());
 assert.ok(Number.isFinite(g.cpu.egg.x)&&Number.isFinite(g.cpu.egg.y));
 if(frame%parameters.sampleEvery===0)samples.push([frame,g.cpu.egg.x,g.cpu.egg.y,g.cpu.height(),g.cpu.lines,g.cpu.held?.nativeKind??-1,
  g.aiTiming.clock,g.aiTiming.period,g.aiTiming.stall]);
}
const result={frames:frame,placements:placements.length,attempts,maxHeight,won:g.cpu.won,lost:g.cpu.lost,
 actor:{...g.cpu.egg},goal:g.cpu.p.goal,placementEvents:placements,limits:parameters.limits};
await writeFile(new URL('result.json',out),JSON.stringify(result,null,2)+'\n');
await writeFile(new URL('trajectory.csv',out),'frame,x,y,height,lines,inventory,cpu_clock,cpu_period,cpu_wait\n'+samples.map(s=>s.join(',')).join('\n')+'\n');
assert.ok(placements.length>0,'Must actually exercise native inventory placement');
assert.ok(g.cpu.won,'The integrated planner must still reach the rescue balloon');
console.log({frames:frame,placements:placements.length,maxHeight,won:g.cpu.won,output:fileURLToPath(out)});
