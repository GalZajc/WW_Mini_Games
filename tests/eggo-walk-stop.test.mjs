import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceNativePlayerPose,advanceNativeRivalPose} from '../renderer/games/eggo-mania/view.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-walk-stop-gba.json',import.meta.url),'utf8'));

test('native rival finishes the walk cycle before consuming idle RNG',()=>{
 const [initial,...samples]=fixture.profiles['rival-stop'];
 const tower={artStage:'factory',fieldIndex:1,time:0,placing:null,held:{cells:[[0,0]]},
  egg:{ground:true,walking:false,vy:0,facing:-1},nativeRivalPoseState:'walk',
  nativeRivalAnimationSelector:4,nativeRivalAnimationPhase:initial.phase,nativeActorPhase:initial.phase};
 let calls=0;
 for(const sample of samples){
  advanceNativeRivalPose(tower,()=>{calls++;return sample.random_step*32;});
  assert.equal(tower.nativeRivalAnimationPhase,sample.phase,`frame ${sample.frame}`);
  assert.equal(calls,sample.selector===2?1:0,`frame ${sample.frame}: idle RNG consumption`);
 }
});

test('jumping during the final walk cycle retains its takeoff handler',()=>{
 const [initial,...samples]=fixture.profiles['player-stop-jump'];
 const tower={fieldIndex:0,placing:null,held:null,egg:{ground:true,walking:false,vy:0,facing:-1},
  nativePlayerPoseState:'walk-free',nativePlayerAnimationSelector:initial.selector,
  nativePlayerAnimationPhase:initial.phase,nativePlayerAnimationState:4,
  nativePlayerAnimationTable:'0x083f222c',nativePlayerAnimationPeriod:7,nativePlayerAnimationStep:0x4000};
 let previous={state:'walk-free',row:7,frame:0};
 for(const sample of samples){
  tower.actorVisualPose=null;
  if(sample.frame>=1411)Object.assign(tower.egg,{ground:false,vy:13.125-(sample.frame-1411)*0.375});
  previous=advanceNativePlayerPose(tower,previous,()=>assert.fail('No idle RNG draw during stop/takeoff'));
  assert.equal(tower.nativePlayerAnimationSelector,sample.selector,`frame ${sample.frame}: selector`);
  assert.equal(tower.nativePlayerAnimationPhase,sample.phase,`frame ${sample.frame}: phase`);
 }
});
