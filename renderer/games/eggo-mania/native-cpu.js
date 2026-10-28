// Original candidate evaluation, ROM 0x08007208..0x08007706.
// Coordinates here use native rows (downwards); owner 2 marks a temporary
// candidate, not a real board owner. The controller/geometry are separate.
import {NATIVE_PIECE_MASKS} from './assets/native-piece-masks.js';
export const CPU_PARAMETERS=Object.freeze({hardDifficulty:6,waterAnchorPixels:728,cellPixels:16,holeSearchRows:5,initialBestScore:-9999,
 survivalDifficultyWord:16,survivalScriptedRounds:8,survivalWeakRoundsEnd:12,
 periodDifficultyBase:11,periodScale:256,rotationRepeatTicks:15,
 candidateScoreImprovementWaitDivisor:2,
 fixedScale:65536,noPickupTarget:0xd8f10000,pickupSteeringMargin:2,
 idleWindowLeft:10,idleWindowRight:6,columnWindowLeft:12,columnWindowRight:4,
 sweepScanStart:3,sweepBaseKeys:64,
 leftKey:32,rightKey:16,reversalWaitTicks:20,releasedDirectionWaitTicks:15,
 placementWaitBase:7,placementWaitDifficulty:4,actorNativeFloor:720,actorRowBias:36,actorColumnBias:17,framesPerSecond:60,columns:7,routeThirdMargin:4,normalJumpMargin:4,bootsJumpMargin:7,upKey:64,diveKey:512,useKey:1,
 pickupActorXBias:8,pickupBelowMargin:8,pickupVerticalBias:100,pickupHorizontalMargin:4,
 pickupHeightLimit:150,pickupHeightLimitScale:4,pickupInitialCost:9999,
 pickupIdlePixels:40,pickupIdleColumn:3,pickupIdleTicks:70,pickupIdleXBias:8,
 bombPanicFuseBase:105,bombPanicColumnBias:6,bombPanicWaitScale:3,bombPanicWaitBias:1,
 bombCommitFuseBase:104,bombCommitDifficultyScale:12,bombCommitNoiseMask:31,
 toolFrameShift:7,fillerNoiseMask:15,fillerCommitTicks:1,
 avoidanceFrameMask:511,avoidanceDifficultyWindow:50,
 avoidanceHorizontalRange:80,avoidanceHorizontalHeight:40,
 avoidanceVerticalWidth:19,avoidanceVerticalRange:80,avoidanceCloseRange:30,
 emptySafeHazardKinds:Object.freeze([1,8,10,11,2,13]),missileLateLife:49,
 projectileSlots:7,projectileColumnBias:8,projectileRowBias:5,
 projectileFieldColumns:8,projectileTargetBias:16,projectileDiscardBias:4,
 projectileNoiseMask:15,projectileOwnNoiseColumn:2,projectileEnemyNoiseColumn:5});
export const CPU_WEIGHTS=Object.freeze({
 cell:22,unsupported:36,isolatedSupport:24,deepHole:24,sideHole:15,
 supportedSide:1,edge:1,existingAbove:40,progress:10,urgentLine:20,
 specialUrgentLine:30,specialProgress:25,specialBonus:40,soloLine:999,
 specialNoLine:20,excessHeight:120,roughness:8,span:4,
 stair:24,flat:4,rising:10,falling:10,deepStep:25,valley:8,
 elevatedHeight:32,elevatedCenter:4,elevatedSide:2,
 sameRotation:2,nextRotation:1,noiseBase:4,noiseOffset:7,
 holeBase:55,holeDifficulty:4,
});
// ROM 080021ba / 08002276..22e8. Survival adjusts the table's CPU
// strength separately from the selected menu difficulty and enemy strength.
export function nativeSurvivalCpuDifficulty(config,round){
 const p=CPU_PARAMETERS;
 if(round>p.survivalScriptedRounds)return round<=p.survivalWeakRoundsEnd?1:0;
 let difficulty=config.words[p.survivalDifficultyWord];
 if(difficulty>=5&&difficulty<=7)difficulty++;
 if(difficulty<5)difficulty+=2;
 return difficulty;
}
export function nativeHeldRotation(item){
 if(!Number.isInteger(item?.nativeKind)||item.nativeKind<0||item.nativeKind>7||!item.cells?.length)return null;
 const signature=c=>c.map(p=>p.join(',')).sort().join(';'),wanted=signature(item.cells);
 const rotations=[item.nativeVariant??0,0,1,2,3];
 for(const r of rotations){
  const cells=NATIVE_PIECE_MASKS[(r&3)*8+item.nativeKind];
  const minX=Math.min(...cells.map(p=>p[0])),maxY=Math.max(...cells.map(p=>p[1]));
  if(signature(cells.map(([x,y])=>[x-minX,maxY-y]))===wanted)return r&3;
 }
 return null;
}
export function nativeBoardContext(tower){
 const board=new Uint8Array(49*8),heights=Array(7).fill(47);let progress=0;
 for(let y=0;y<47;y++){
  const row=tower.rows[y];if(!row)continue;let count=0;
  for(let x=0;x<7;x++)if(row.cells[x]){
   // Existing owners must never alias the native temporary candidate ID 2.
   board[(46-y)*8+x]=3;heights[x]=Math.min(heights[x],46-y);count++;
  }
  if(count>0&&count<7)progress++;
 }
 for(let y=47;y<49;y++)board.fill(255,y*8,y*8+7);
 return{board,heights,progress,height:Math.min(...heights),roughness:Math.max(...heights)};
}
// Incomplete piece sweeps reposition the actor using the ROM's center-out
// column walk (3,4,5,6,0,1,2), independently of the current best candidate.
export function nativeSweepDirection(tower){
 const p=CPU_PARAMETERS,context=nativeBoardContext(tower);
 const x=Math.round((tower.egg.x*p.cellPixels-p.cellPixels)*p.fixedScale);
 const actorColumn=Math.floor((Math.floor(x/p.fixedScale)+p.actorColumnBias)/p.cellPixels);
 const actorRow=Math.floor((Math.floor(p.actorNativeFloor-tower.egg.y*p.cellPixels)+p.actorRowBias)/p.cellPixels);
 if(actorRow>=context.height)return 0;
 let column=p.sweepScanStart;
 for(let i=0;i<p.columns;i++,column=(column+1)%p.columns){
  // The ROM first finds the next column tied for the highest stack, then
  // compares the actor with that column. Empty/lower columns are skipped.
  if(context.heights[column]!==context.height)continue;
  if(actorColumn>column)return -1;
  if(actorColumn<column)return 1;
  return 0;
 }
 return 0;
}
export function nativePreview(tower,held=tower.held,origin=tower.egg){
 if(tower.p.columns!==7)return undefined;
 // State 1 may catch inventory while the creature lifts the actor, but its
 // handler keeps +0x880 clear until ordinary actor control resumes.
 if(tower.nativeWaterRecovery)return null;
 const rotation=nativeHeldRotation(held);if(rotation===null)return undefined;
 const mask=NATIVE_PIECE_MASKS[rotation*8+held.nativeKind];
 const {board}=nativeBoardContext(tower);
 const p=projectNativeCandidate({cells:mask,board,startX:Math.floor(origin.x-1),startY:Math.floor(45-origin.y)});
 if(!p.valid)return null;
 const minX=Math.min(...mask.map(c=>c[0])),maxY=Math.max(...mask.map(c=>c[1]));
 const visual=tower.nativePreviewRotation;
 return{cells:held.cells,x:p.anchorX+minX,y:46-p.anchorY-maxY,
  nativeKind:held.nativeKind,nativeRotation:rotation,
  rotationAngle:visual?.held===held?visual.angle:rotation*Math.PI/2};
}
export function evaluateNativePiece(tower,rotation,column,clock=tower.nativeFrame,difficulty=CPU_PARAMETERS.hardDifficulty){
 if(tower.p.columns!==7)return undefined;
 const current=nativeHeldRotation(tower.held),kind=tower.held?.nativeKind;
 if(current===null)return undefined;
 const context=nativeBoardContext(tower);
 const invalid={score:0,column,rotation,anchorX:0,anchorY:46,valid:false};
 if(kind===2&&rotation===1){
  const gap=nativeColumnGap(context,column);if(!gap)return invalid;
  return{score:scoreNativeHole({...context,column,rotation,kind,difficulty}),
   column,rotation,anchorX:column-1,anchorY:gap-1,valid:true,dive:true,gapY:46-gap};
 }
 const cells=NATIVE_PIECE_MASKS[rotation*8+kind];
 const p=projectNativeCandidate({cells,board:context.board,startX:column-1,startY:context.heights[column]-2});
 if(!p.valid)return invalid;
 const scratch=context.board.slice();for(const [x,y]of cells)scratch[(p.anchorY+y)*8+p.anchorX+x]=2;
 const waterPixel=Math.floor(CPU_PARAMETERS.waterAnchorPixels-tower.water*CPU_PARAMETERS.cellPixels-1);
 const urgency=Math.trunc(waterPixel/CPU_PARAMETERS.cellPixels)-(context.height-1)-context.progress;
 const actorX=Math.round((tower.egg.x*CPU_PARAMETERS.cellPixels-CPU_PARAMETERS.cellPixels)*CPU_PARAMETERS.fixedScale);
 const actorColumn=Math.floor((Math.floor(actorX/CPU_PARAMETERS.fixedScale)+CPU_PARAMETERS.actorColumnBias)/CPU_PARAMETERS.cellPixels);
 const c={...context,...p,board:scratch,rotation,column,actorColumn,actorRotation:current,
  kind,difficulty,clock:Math.max(0,clock),urgency,mode:5,special:false,bonus:0,elevated:false};
 return{...p,column,rotation,score:scoreNativeCandidate(c)};
}
export function planNativePiece(tower,reachable=()=>true,difficulty=CPU_PARAMETERS.hardDifficulty){
 if(tower.p.columns!==7||nativeHeldRotation(tower.held)===null)return undefined;
 let best=null;const current=nativeHeldRotation(tower.held);
 for(let rotation=0;rotation<4;rotation++)for(let column=0;column<7;column++){
  if(!reachable(column))continue;
  const candidate=evaluateNativePiece(tower,rotation,column,tower.nativeFrame,difficulty);
  if(!candidate.valid)continue;
  if(!best||candidate.score>best.score)best=candidate;
 }
 return best?nativeCandidatePlan(best,current):null;
}
function nativeCandidatePlan(candidate,current){
 return{score:candidate.score,x:candidate.column+0.5,r:(candidate.rotation-current+4)&3,
  ...(candidate.dive?{dive:true,gapY:candidate.gapY}:{})};
}
// Original sweep counters and strict best-choice update, 0x080070ac..7762.
export function advanceNativeSweep(search,candidate,emptyFirstField=false){
 const column=search.column,rotation=search.rotation;
 search.column++;
 if(search.column===7){search.column=0;search.rotation=(search.rotation+1)&3;}
 if(search.column===0&&search.rotation===0)search.state=2;
 if(candidate&&candidate.score>search.bestScore){
  search.bestScore=candidate.score;search.bestRotation=rotation;
  search.targetColumn=emptyFirstField?(column<=3?column+1:column-1):column;
  search.anchorX=candidate.anchorX;search.anchorY=candidate.anchorY;
 }
 return search;
}
export class NativePieceSweep {
 constructor(){
  Object.assign(this,{state:1,column:0,rotation:0,clock:0,bestScore:CPU_PARAMETERS.initialBestScore,
   bestRotation:0,targetColumn:0,anchorX:0,anchorY:46,best:null});
 }
 step(tower,clock=this.clock+1,difficulty=CPU_PARAMETERS.hardDifficulty){
  const current=nativeHeldRotation(tower.held);
  if(tower.p.columns!==7||current===null)return undefined;
  if(this.state===0)this.state=1;
  this.clock=clock;
  const actorReady=(tower.nativeActorState??0)===0;
  const candidate=actorReady?evaluateNativePiece(tower,this.rotation,this.column,this.clock,difficulty):null;
  if(candidate&&candidate.score>this.bestScore)this.best=candidate;
  advanceNativeSweep(this,candidate);
  if(this.state!==2)return undefined;
  return this.bestScore>0&&this.best?nativeCandidatePlan(this.best,current):null;
 }
}
// Original ordinary-piece timer gates, 0x080066ac..6800 and 6d84..704c.
// Keep this state across inventories: +0xc8 is not a per-piece age.
export class NativeCpuTiming {
 constructor(){Object.assign(this,{clock:0,counterCC:0,counterD0:0,period:0,stall:0});}
 begin(){
  if(this.stall>0){this.stall--;return false;}
  if(this.counterCC>0)this.counterCC--;
  if(this.counterD0>0)this.counterD0--;
  this.clock++;return true;
 }
 inventoryGate(kind,frame,difficulty=CPU_PARAMETERS.hardDifficulty,mode=5){
  if(this.period!==0&&difficulty>0&&mode!==7)this.period--;
  // Bombs and filler select a destination before the expiry/automatic-use gate.
  if(kind===8||kind===10)return 'plan';
  if(this.period!==0&&kind!==9&&kind!==11&&kind!==12)return 'plan';
  if(this.period!==0&&(frame&1))return 'defer';
  if(this.period===0)this.period=(CPU_PARAMETERS.periodDifficultyBase-difficulty)*CPU_PARAMETERS.periodScale;
  this.waitAfterAction(difficulty);
  if(kind<=7)this.clock=0;
  return 'use';
 }
 pieceGate(difficulty=CPU_PARAMETERS.hardDifficulty){return this.inventoryGate(0,0,difficulty)==='use';}
 waitAfterAction(difficulty=CPU_PARAMETERS.hardDifficulty){this.stall=difficulty*difficulty;}
 // ROM 0x0800705e branches around this half-square delay once a best score
 // already exists; it is only applied when the initial -9999 sentinel wins.
 waitAfterScoreImprovement(difficulty=CPU_PARAMETERS.hardDifficulty){
  this.stall=Math.trunc(difficulty*difficulty/CPU_PARAMETERS.candidateScoreImprovementWaitDivisor);
 }
}
// Original clockwise input gate, 0x0800819a..0x080081fc (Survival).
export class NativeRotationGate {
 constructor(){this.wait=0;}
 request(current,target){
  if(current===target)return 0;
  if(this.wait!==0){this.wait--;return 0;}
  this.wait=CPU_PARAMETERS.rotationRepeatTicks;return 1;
 }
}
// Survival bomb/filler target selection, original ROM 0x08006db4..6fd4.
export function nativeToolDecision(state,{kind,actorColumn,heights,enemyHeights,gaps,
 fuse,frame,fieldIndex=1,difficulty=CPU_PARAMETERS.hardDifficulty,
 pickupTarget=CPU_PARAMETERS.noPickupTarget,elevated=false}){
 const p=CPU_PARAMETERS,noPickup=(pickupTarget>>>0)===p.noPickupTarget;
 if(kind===8){
  const panic=fuse<p.bombPanicFuseBase-difficulty*(actorColumn+p.bombPanicColumnBias)||!noPickup||elevated;
  if(panic){
   if(!state.panicTimer)state.panicTimer=p.bombPanicWaitScale*difficulty+p.bombPanicWaitBias;
   else if(--state.panicTimer===0){
    if(frame&1){state.panicTimer=1;return 'defer';}
    return 'use';
   }
  }else state.panicTimer=0;
 }
 let best=kind===8?0:-1;
 for(let col=0;col<p.columns;col++){
  let score;
  if(kind===8){
   score=enemyHeights[col]+difficulty*(heights[col]&3);
   if(col>0)score+=enemyHeights[col]-enemyHeights[col-1]-1;
   if(col<p.columns-1)score+=enemyHeights[col]-enemyHeights[col+1]-1;
  }else{
   score=gaps[col]+heights[col];
   if(col>0)score+=gaps[col-1];
   if(col<p.columns-1)score+=gaps[col+1];
   score+=difficulty*((frame>>p.toolFrameShift)&p.fillerNoiseMask);
  }
  score-=Math.abs(actorColumn-col);
  if(score>best){best=score;state.targetColumn=kind===10&&fieldIndex===0&&Math.min(...heights)===47?p.columns-1-col:col;}
 }
 return 'plan';
}
export function nativeBombCanCommit({fuse,rotation,roughness,frame,difficulty=CPU_PARAMETERS.hardDifficulty,
 pickupTarget=CPU_PARAMETERS.noPickupTarget}){
 const p=CPU_PARAMETERS;
 return (pickupTarget>>>0)!==p.noPickupTarget||fuse<p.bombCommitDifficultyScale*difficulty+p.bombCommitFuseBase+
  ((rotation*roughness+(frame>>p.toolFrameShift))&p.bombCommitNoiseMask);
}
// Original enemy avoidance, 0x08007ef0..819a, after steering and before
// rotation/direction latching. Positions/velocities use native signed 16.16.
export function nativeAvoidHazards({actorX,actorY,actorVy,kind,frame,hazards,keys=0,
 difficulty=CPU_PARAMETERS.hardDifficulty}){
 const p=CPU_PARAMETERS,s=p.fixedScale;
 if((frame&p.avoidanceFrameMask)<=p.avoidanceDifficultyWindow*difficulty)return keys;
 for(const h of hazards){
  if(!h.active||h.collisionActive!==1||h.sameField===false)continue;
  if(kind===-1&&p.emptySafeHazardKinds.includes(h.kind))continue;
  if(h.kind===15&&h.life>p.missileLateLife)continue;
  const dx=Math.floor((h.x-actorX)/s),dy=Math.floor((h.y-actorY)/s);
  if(dx>0&&dx<p.avoidanceHorizontalRange&&dy>-p.avoidanceHorizontalHeight&&dy<p.avoidanceHorizontalHeight){
   if(h.vx<0){keys=(keys|p.leftKey)&~p.rightKey;if(dy<0)keys|=p.upKey;}
   else keys&=~p.rightKey;
  }
  if(dx<0&&dx>-p.avoidanceHorizontalRange&&dy>-p.avoidanceHorizontalHeight&&dy<p.avoidanceHorizontalHeight){
   if(h.vx>0){keys=(keys|p.rightKey)&~p.leftKey;if(dy<0)keys|=p.upKey;}
   else keys&=~p.leftKey;
  }
  if(Math.abs(dx)<=p.avoidanceVerticalWidth&&dy>-p.avoidanceVerticalRange&&dy<p.avoidanceVerticalRange&&
   ((dy>0&&h.vy<0)||(dy<0&&h.vy>0))){
   keys=h.vx<=0?(keys|p.rightKey)&~p.leftKey:(keys|p.leftKey)&~p.rightKey;
   if(dy<0)keys|=p.upKey;
  }
  if(dy<0&&dy>-p.avoidanceCloseRange&&Math.abs(dx)<p.avoidanceCloseRange&&(h.vy<0||actorVy>0))keys|=p.upKey;
 }
 return keys;
}
// Incoming projectile scan, 0x08006930..69f6. Slot order is significant:
// empty hands stop at the first candidate; held tools retain the last one.
export function nativeProjectileTarget(state,{projectiles,heights,enemyHeights,
 fieldIndex,kind,frame,difficulty=CPU_PARAMETERS.hardDifficulty}){
 const p=CPU_PARAMETERS,s=p.fixedScale;
 let pickupTarget=p.noPickupTarget;
 for(const h of projectiles){
  if(!h.active||h.flightCounter<=0)continue;
  const column=Math.trunc((Math.floor(h.x/s)+p.projectileColumnBias)/p.cellPixels)-fieldIndex*p.projectileFieldColumns;
  const row=Math.trunc((Math.floor(h.y/s)+p.projectileRowBias)/p.cellPixels);
  if(row>=heights[column])continue;
  pickupTarget=h.x-p.projectileTargetBias*s;
  if(kind===-1){state.targetColumn=column;return{action:'catch',pickupTarget};}
  if(kind<=7&&difficulty+p.projectileDiscardBias<
   ((heights[p.projectileOwnNoiseColumn]+enemyHeights[p.projectileEnemyNoiseColumn])&p.projectileNoiseMask)){
   return{action:(frame&1)?'defer':'discard',pickupTarget};
  }
 }
 return{action:'continue',pickupTarget};
}
// Native Survival pickup selection, 0x08006a14..0x08006d58. Inputs are
// signed 16.16 coordinates in original linked-list order (newest first).
// Solo/special/elevated filtering is deliberately separate from Survival.
export function selectNativePickupTarget(state,{actorX,actorY,heights,pickups,
 difficulty=CPU_PARAMETERS.hardDifficulty}){
 const p=CPU_PARAMETERS,s=p.fixedScale,last=p.columns-1;
 let best=null,cost=p.pickupInitialCost;
 for(const item of pickups){
  const dy=Math.floor((actorY-item.y)/s);
  const dx=Math.abs(Math.floor((actorX-item.x)/s)+p.pickupActorXBias);
  const column=Math.max(0,Math.min(last,Math.floor(item.x/(s*p.cellPixels))));
  if(dy>0&&Math.floor(item.y/p.cellPixels)>heights[column]*s)continue;
  if(dy<-p.pickupBelowMargin)continue;
  const vertical=dy+p.pickupVerticalBias;
  if(vertical<=dx+p.pickupHorizontalMargin||vertical>=(p.pickupHeightLimit-difficulty)*p.pickupHeightLimitScale)continue;
  const score=dx+vertical;
  if(score<cost){cost=score;best=item;}
 }
 if(best){
  state.targetColumn=Math.max(0,Math.min(last,Math.floor((best.x+p.pickupActorXBias*s)/(s*p.cellPixels))));
  state.idleTarget=best.x;
 }else {
  state.idleTarget=p.pickupIdlePixels*s;state.targetColumn=p.pickupIdleColumn;
  const highest=Math.min(...heights);
  for(let index=0;index<=last;index++){
   const column=index&1?last-(index>>1):index>>1;
   if(heights[column]===highest){
    state.targetColumn=column;state.idleTarget=(column*p.cellPixels-p.pickupIdleXBias)*s;
    state.counterD4=p.pickupIdleTicks;
   }
  }
 }
 return{selected:best?.id??0,nearPickup:Boolean(best)};
}
// Original bounded route search, ROM 0x08005f48..0x08006316.
// Heights are native rows (smaller means higher). Route labels and parents
// persist in the CPU memory; unreachable searches preserve the old waypoint.
export function createNativeTravel(){
 const p=CPU_PARAMETERS;
 return{waypoint:-1,labels:Array(p.columns).fill(0),parents:Array(p.columns).fill(0),groundRow:47,counterD4:0};
}
export function nativeRoute(state,heights,start,target,margin=CPU_PARAMETERS.normalJumpMargin){
 if(start===target)return true;
 const p=CPU_PARAMETERS,last=p.columns-1,labels=state.labels,parents=state.parents;
 labels.fill(-1);labels[start]=0;
 for(const direction of [-1,1]){
  for(let column=start+direction;column>=0&&column<=last;column+=direction){
   if(heights[column]<heights[start]-margin)break;
   labels[column]=1;
  }
 }
 if(labels[target]===1){state.waypoint=target;return true;}
 if(!labels.some(label=>label===1))return false;
 for(let level=1;level<=2;level++){
  const reach=level===1?margin:p.routeThirdMargin;
  for(let source=0;source<=last;source++)if(labels[source]===level){
   for(const direction of [-1,1]){
    for(let column=source+direction;column>=0&&column<=last;column+=direction){
     if(heights[column]<heights[source]-reach)break;
     if(heights[column]===heights[source]-margin&&
      ((source===0&&column===last)||(source===last&&column===0)))continue;
     if(labels[column]===-1){labels[column]=level+1;parents[column]=source;}
    }
   }
  }
  if(labels[target]===level+1){
   state.waypoint=level===1?parents[target]:parents[parents[target]];
   return true;
  }
  if(!labels.some(label=>label===level+1))return false;
 }
 return false;
}
// Native ordinary travel decisions, 0x08007abc..0x08007dc4, before horizontal
// steering, enemy avoidance and rotation. The caller supplies preceding keys.
export function advanceNativeTravel(state,{heights,start,target,row,vy,kind,
 margin=CPU_PARAMETERS.normalJumpMargin,keys=0,sideFlag=0,elevated=false,
 loopRegister=0,frame=0,nearPickup=false}){
 const p=CPU_PARAMETERS,last=p.columns-1;
 if((state.waypoint>>>0)>p.columns)state.waypoint=start;
 if(kind===-1&&start===target&&vy<=0&&nearPickup){keys|=p.upKey;state.counterD4=0;}
 if(kind===-1&&start!==target&&vy>0)state.waypoint=target;
 const use=()=>({keys:(frame&1)?0:p.useKey,early:true});
 if(sideFlag)state.waypoint=target;
 else {
  let loop=loopRegister;
  if(start!==target){
   for(loop=0;loop<=last;loop++){
    if(loop<Math.min(start,target)||loop>Math.max(start,target))continue;
    if(row>heights[loop]){loop=100;if(vy!==0)keys|=p.upKey;break;}
   }
   if(loop<=98){keys|=p.upKey;state.waypoint=target;}
  }
  if(loop!==99){
   if(vy!==0){
    if(start!==state.waypoint){keys|=p.upKey;state.counterD4=0;}
   }else if(nativeRoute(state,heights,start,target,margin)){
    const waypoint=state.waypoint,direction=Math.sign(waypoint-start);
    for(let column=start+direction;direction&&
     (direction>0?column<=waypoint:column>=waypoint);column+=direction){
     const neighbour=column-direction;
     if(heights[column]!==heights[neighbour]||heights[column]<state.groundRow){
      keys|=p.upKey;state.counterD4=0;
     }
    }
   }else if(kind>7||(elevated&&kind>=0))return use();
   else {keys|=p.diveKey;state.waypoint=target;}
  }
 }
 if(row>heights[start]+margin){
  if(vy===0&&kind<=7){keys|=p.diveKey;state.counterD4=0;state.waypoint=target;}
  if(kind>7&&vy>=0)return use();
 }
 return{keys,early:false};
}
// Original ordinary commit timer, 0x0800797a..0x08007dae. This advances
// only after position/orientation/preview readiness, not on every frame.
export class NativePlacementGate {
 constructor(){this.wait=0;}
 step({kind,targetRotation,actorRow,roofRow,frame,difficulty=CPU_PARAMETERS.hardDifficulty}){
  if(this.wait===0){
   this.wait=kind===10?CPU_PARAMETERS.fillerCommitTicks:CPU_PARAMETERS.placementWaitBase+CPU_PARAMETERS.placementWaitDifficulty*difficulty;
   return 'wait';
  }
  if(--this.wait!==0)return 'wait';
  if(frame&1){this.wait=1;return 'defer';}
  return kind===2&&targetRotation===1&&actorRow===roofRow?'dive':'use';
 }
}
// Original horizontal target windows, 0x08007dc4..0x08007ef0.
// x, vy and pickup/idle targets retain native signed 16.16 coordinates.
export function nativeSteeringKeys({x,vy,actorColumn,targetColumn,waypointColumn,
 pickupTarget=CPU_PARAMETERS.noPickupTarget,idleTarget=0,kind,keys=0}){
 const p=CPU_PARAMETERS,s=p.fixedScale,noPickup=(pickupTarget>>>0)===p.noPickupTarget;
 if(!noPickup&&vy===0){
  if(pickupTarget>x+p.pickupSteeringMargin*s)keys|=p.rightKey;
  else if(pickupTarget<x-p.pickupSteeringMargin*s)keys|=p.leftKey;
 }else if(actorColumn===targetColumn&&noPickup&&kind===-1){
  const position=Math.floor(x/s)*s;
  if(position<idleTarget-p.idleWindowLeft*s)keys|=p.rightKey;
  if(position>idleTarget-p.idleWindowRight*s)keys|=p.leftKey;
 }else {
  const position=Math.floor(x/s),edge=waypointColumn*p.cellPixels;
  if(position<=edge-p.columnWindowLeft)keys|=p.rightKey;
  else if(position>=edge-p.columnWindowRight)keys|=p.leftKey;
 }
 return keys;
}
// Final native direction latch, 0x080081fc..0x08008274. begin() has already
// decremented the two counters; blocked keys leave the other input bits intact.
export function filterNativeDirection(timer,keys,previousKeys=0){
 const p=CPU_PARAMETERS;
 if(keys&p.leftKey){
  if(timer.counterCC!==0)keys&=~p.leftKey;
  else timer.counterD0=p.reversalWaitTicks;
 }else if(keys&p.rightKey){
  if(timer.counterD0!==0)keys&=~p.rightKey;
  else timer.counterCC=p.reversalWaitTicks;
 }else if(previousKeys&(p.leftKey|p.rightKey)){
  timer.counterCC=timer.counterD0=p.releasedDirectionWaitTicks;
 }
 return keys;
}
// Original hole scan 0x08006408 and single-cell branch 0x08007134.
export function nativeColumnGap({board,heights},column){
 const top=heights[column];
 for(let offset=0;offset<CPU_PARAMETERS.holeSearchRows&&top+offset<=47;offset++){
  const row=top+offset+1;if(!board[row*8+column])return row;
 }
 return 0;
}
export function scoreNativeHole(c){
 const gap=nativeColumnGap(c,c.column);if(!gap)return 0;
 const score=gap+(c.heights[c.column]>>2)+CPU_WEIGHTS.holeBase-c.difficulty*CPU_WEIGHTS.holeDifficulty;
 return nativeScoreNoise(score,c);
}
function nativeScoreNoise(score,c){
 const w=CPU_WEIGHTS;
 if(score!==0&&c.difficulty+w.noiseBase>((c.rotation+c.column+7)*(c.kind+c.height+3)&15)){
  const noise=((c.rotation+3)*(c.kind+4+c.column)&15)-w.noiseOffset;
  score+=(c.difficulty+2*(c.difficulty>>2))*noise;
 }
 return score;
}
// Exact bounded search used for a CPU dry run (0x0800c884..0x0800cbc0).
// Keep the original 3x3 mask offsets: normalizing them changes the anchor.
export function projectNativeCandidate({cells,board,startX,startY}){
 let x=startX,y=Math.max(7,Math.min(47,startY));
 const left=cells.some(p=>p[0]===0)?0:1,right=cells.some(p=>p[0]===2)?3:2;
 if(x+left<0)x=0-left;if(x+right>7)x=7-right;
 const blocked=yy=>cells.some(([cx,cy])=>Boolean(board[(yy+cy)*8+x+cx]));
 const down=Math.min(y+12,47),up=Math.max(y-4,7);let scan=y,last=0,found=false;
 for(;scan<down;scan++){
  if(!blocked(scan)){last=scan;found=true;}
  else if(found)break;
 }
 if(!blocked(scan))found=false;
 const limit=found?Math.max(7,y-Math.trunc((last-y)/2)):up;
 let previous=blocked(y+1);
 for(scan=y;scan>limit;scan--){
  const collision=blocked(scan);
  if(!collision&&previous)return{valid:true,anchorX:x,anchorY:scan};
  previous=collision;
 }
 return found?{valid:true,anchorX:x,anchorY:last}:{valid:false};
}
export function scoreNativeCandidate(c){
 const w=CPU_WEIGHTS,b=c.board,at=(x,y)=>b[y*8+x]||0;
 const h=c.heights.slice();let score=15*Math.trunc(c.clock/150),low=50,high=0,lines=0;
 for(let y=c.anchorY;y<c.anchorY+3;y++){
  let empty=false,added=false;
  for(let x=0;x<7;x++){
   const owner=at(x,y);empty||=!owner;added||=owner===2;
   if(x<c.anchorX||x>=c.anchorX+3||owner!==2)continue;
   h[x]=Math.min(h[x],y);score+=w.cell;high=Math.max(high,y);low=Math.min(low,y);
   if(!at(x,y+1)){
    score-=w.unsupported;
    if((x===0||at(x-1,y+1))&&(x===6||at(x+1,y+1)))score-=w.isolatedSupport;
    if(!at(x,y+2)){score-=w.deepHole;if(!at(x,y+3))score-=w.deepHole;}
   }
   if(!c.elevated){
    if(x<6&&!at(x+1,y)){if(at(x+1,y-1))score-=w.sideHole;score--;}
    else score+=w.supportedSide;
    if(x>0&&!at(x-1,y)){score--;if(at(x-1,y-1))score-=w.sideHole;}
    else score+=w.supportedSide;
    if(x===0||x===6)score+=w.edge;
   }
   if(at(x,y-1)>2)score+=w.existingAbove;
  }
  if(added&&!empty){
   if(!c.special||c.mode===7){
    score+=c.progress*w.progress;
    if(c.urgency<=2)score+=(3-c.urgency)*w.urgentLine;
   }else{
    if(c.urgency<=1)score+=(3-c.urgency)*w.specialUrgentLine;
    score+=(c.progress-5)*w.specialProgress+c.bonus*w.specialBonus;
   }
   if(c.mode===0)score+=w.soloLine;lines++;
  }
  if(c.special&&!lines&&c.bonus>0&&c.specialAvailable)score-=c.bonus*w.specialNoLine;
 }
 if(low<c.height&&c.progress-lines+c.height-low>7)score-=w.excessHeight;
 if(c.elevated){
  score=(46-low)*w.elevatedHeight+(46-h[3])*w.elevatedCenter+
   (46-h[2])*w.elevatedSide+(46-h[4])*w.elevatedSide;
 }else{
  score-=c.roughness*w.roughness;score+=(high+low)*w.span;
  if(h.slice(1,6).some((v,i)=>v===h[i]+1&&v===h[i+2]+1))score+=w.stair;
  if(h.slice(1,6).some((v,i)=>v===h[i]&&v===h[i+2]))score+=w.flat;
  if(h.slice(1).some((v,i)=>v===h[i]+1))score+=w.rising;
  if(h.slice(0,6).some((v,i)=>v===h[i+1]+1))score+=w.falling;
  for(let x=1;x<=5;x++){
   if(c.heights[x]<c.heights[x+1]-4)score+=w.deepStep;
   if(c.heights[x]<c.heights[x-1]-4)score+=w.deepStep;
  }
  for(let x=0;x<7;x++){
   if(x<6&&h[x]<h[x+1]-4)score-=w.deepStep;
   if(x>0&&h[x]<h[x-1]-4)score-=w.deepStep;
  }
  const valleys=a=>{
   let total=0;
   if(a[0]>a[1]+1)total+=(a[1]-a[0])*w.valley;
   if(a[6]>a[5]+1)total+=(a[5]-a[6])*w.valley;
   for(let x=1;x<=5;x++){
    const edge=Math.max(a[x-1],a[x+1]);
    if(a[x]>edge+1)total+=(edge-a[x])*w.valley;
   }return total;
  };
  score-=valleys(c.heights);score+=valleys(h);
 }
 score-=Math.abs(c.column-c.actorColumn);
 if(c.rotation===c.actorRotation)score+=w.sameRotation;
 if(c.rotation===((c.actorRotation+1)&3))score+=w.nextRotation;
 return nativeScoreNoise(score,c);
}
