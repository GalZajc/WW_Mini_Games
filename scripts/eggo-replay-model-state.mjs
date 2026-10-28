// Physics/controller diagnostic only. Full pixel validation uses eggo-long-replay.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
import {nativePreview} from '../renderer/games/eggo-mania/native-cpu.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const parameters={steps:arg('steps','scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json'),
 seed:Number(arg('seed',1492)),startAfter:Number(arg('start-after',400)),
 first:Number(arg('first',18768)),last:Number(arg('last',18770)),rngOnly:arg('rng-only','false')==='true',
 hazardsOnly:arg('hazards-only','false')==='true',
 method:'fresh input-only model, no rendering; diagnostic states only, not pixel parity'};
const out=path.join(root,'scripts','OUTPUT','eggo-model-state_'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});
const digest=data=>createHash('sha256').update(data).digest('hex');
const steps=await fs.readFile(path.resolve(root,parameters.steps));parameters.stepsSha256=digest(steps);
parameters.sourceHashes={};
for(const name of (await fs.readdir(path.join(root,'renderer/games/eggo-mania'))).filter(n=>n.endsWith('.js'))){
 const file='renderer/games/eggo-mania/'+name;parameters.sourceHashes[file]=digest(await fs.readFile(path.join(root,file)));
}
parameters.gameSettings=settings({seed:parameters.seed});parameters.fixedStep=RULES.step;
parameters.scriptSha256=digest(await fs.readFile(fileURLToPath(import.meta.url)));
await fs.writeFile(path.join(out,'parameters.json'),JSON.stringify(parameters,null,2));
const g=new Game();g.p={...parameters.gameSettings};g.seed=parameters.seed;
let control={},previous=new Set();g.readPlayerControl=()=>control;
g.input={isActionJustDown:action=>(action==='place'||action==='continue')&&Boolean(control.use)};
g.resetSurvival();const records=[];let tick=0;
for(const [count,buttons] of JSON.parse(steps)){
 for(let i=0;i<count;i++){
  const frame=parameters.startAfter+(++tick);if(frame>parameters.last)break;
  const held=new Set(buttons?buttons.split('+'):[]);
  control={move:Number(held.has('RIGHT'))-Number(held.has('LEFT')),jump:held.has('UP'),float:held.has('UP'),
   fast:held.has('DOWN'),dive:held.has('L'),discard:held.has('R')&&!previous.has('R'),
   use:held.has('A')&&!previous.has('A'),rotate:held.has('B')&&!previous.has('B')?1:0};
  previous=held;g.update(RULES.step);
  if(frame>=parameters.first&&parameters.hazardsOnly)records.push(structuredClone({frame,rng:g.nativeActorRandomSeed,round:g.round,phase:g.phase,
   fields:[g.player,g.cpu].map(t=>({stage:t.artStage,nativeFrame:t.nativeFrame,water:t.water,previousWater:t.previousWater,
    egg:t.egg,parkPrimary:t.parkPrimary,parkSecondary:t.parkSecondary,
    beanstalkSecondary:t.beanstalkSecondary,nativeConfig:t.p.nativeConfig}))}));
  else if(frame>=parameters.first&&parameters.rngOnly)records.push({frame,rng:g.nativeActorRandomSeed,round:g.round,phase:g.phase,actors:[g.player,g.cpu].map(t=>({state:t.nativeActorState,selector:t.fieldIndex===0?t.nativePlayerAnimationSelector:t.nativeRivalAnimationSelector,step:t.nativeActorRandomStep,phase:t.nativeActorPhase}))});
  else if(frame>=parameters.first)records.push(structuredClone({frame,phase:g.phase,round:g.round,
   resultTicks:g.resultTicks,resultExitTicks:g.resultExitTicks,rng:g.nativeActorRandomSeed,
   controller:{travel:g.aiTravel,timing:g.aiTiming,rotation:g.aiRotation,rotationTarget:g.aiRotationTarget,search:g.aiSearch,plan:g.aiPlan,control:g.lastModelControl},
   weather:g.nativeWeather,ambient:structuredClone(g.nativeAmbient),
   fields:[g.player,g.cpu].map(t=>t?{egg:{...t.egg},rows:t.rows.map(r=>r?{cells:Array.from(r.cells),owners:Array.from(r.owners)}:null),
    nativeFrame:t.nativeFrame,nativePickupParticles:t.nativePickupParticles,nativeCommittedAnchorRow:t.nativeCommittedAnchorRow,
    nativeDividerProgress:t.nativeDividerProgress,nativeDividerPendingProgress:t.nativeDividerPendingProgress,
    nativeFullFloors:t.nativeCountFullFloors(),
    nativeCameraControl:t.nativeCameraControl,nativeWaterRecovery:t.nativeWaterRecovery,
    collapseWave:t.collapseWave,previousCollapseWave:t.previousCollapseWave,collapse:t.collapse,
    collapseTimers:Array.from(t.collapseTimers),
    won:t.won,lost:t.lost,water:t.water,nativeRescueBody:t.nativeRescueBody,
    nativeRenderFrame:t.nativeRenderFrame,held:t.held,placing:t.placing,nativeRenderPlacing:t.nativeRenderPlacing,nativePiecePaletteMaterial:t.nativePiecePaletteMaterial,nativePreviewPaletteInitialColor:t.nativePreviewPaletteInitialColor,
    nativeActorState:t.nativeActorState,nativeActorNextState:t.nativeActorNextState,
    playerAnimation:{selector:t.nativePlayerAnimationSelector,phase:t.nativePlayerAnimationPhase,
     state:t.nativePlayerPoseState,discarded:t.nativeDiscardedThisTick,control:t.nativeCameraControl},
    rivalAnimation:{selector:t.nativeRivalAnimationSelector,phase:t.nativeRivalAnimationPhase,
     postTicks:t.nativeRivalPostThrowPoseTicks,postActive:t.nativeRivalPostThrowPoseActive,
     state:t.nativeRivalPoseState,handlerState:t.nativeActorHandlerState,
     cancelled:t.nativeThrowCancelledThisTick,cancelledPrevious:t.nativeThrowCancelledPreviousTick,
     nativeAnimationGround:t.nativeAnimationGround,supportAtHandler:t.nativeActorSupportAtHandler,
     inputMove:t.nativeActorInputMove},
    nativeSupportBypassTicks:t.nativeSupportBypassTicks,
    placingPreview:t.placing?.nativeHeld?nativePreview(t,t.placing.nativeHeld,
     t.placing.nativeProjectionOrigin??{x:t.placing.eggX,y:t.placing.eggY}):null,
    placingPreviewCurrent:t.placing?.nativeHeld?nativePreview(t,t.placing.nativeHeld):null,
    bubble:t.bubble,factorySecondary:t.factorySecondary,space:t.space,spaceSecondary:t.spaceSecondary,jungleSecondary:t.jungleSecondary,jumper:t.jumper,
    parkPrimary:t.parkPrimary,parkSecondary:t.parkSecondary,beanstalkSecondary:t.beanstalkSecondary,nativeRenderCrates:t.nativeRenderCrates,
    projectiles:{bombs:t.bombs,hammers:t.hammers,render:t.nativeRenderProjectiles},
    clouds:t.clouds,nativeRenderClouds:t.nativeRenderClouds,
    nativeWaterCreature:t.nativeWaterCreature,nativeWaterCreatureRender:t.nativeWaterCreatureRender}:null),views:structuredClone(g.views)}));
  if(tick%3000===0)console.log(`${tick}/${parameters.last-parameters.startAfter}`);
 }
 if(parameters.startAfter+tick>=parameters.last)break;
}
await fs.writeFile(path.join(out,'states.json'),JSON.stringify(records));console.log(out);
