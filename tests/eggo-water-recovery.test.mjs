import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
import {advanceActorVisual,advanceNativePlayerPose,actorPose,advanceView,createView} from '../renderer/games/eggo-mania/view.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-water-recovery-gba.json',import.meta.url),'utf8'));
for(const profile of fixture.profiles)test(`native water recovery: ${profile.name}`,()=>{
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
 const view=createView();
 for(let y=0;y<profile.height;y++)for(let x=0;x<7;x++)
  if(y!==profile.gap_row||![3,4].includes(x))t.setCell(x,y,1,y+1);
 Object.assign(t.egg,{x:profile.initial.x,y:profile.initial.y,vy:0,ground:true});
 for(const sample of profile.samples){
  t.nativeRenderFrame={camera:(640-sample.camera_before_q16/65536)/16};
  t.update(RULES.step,{nativeMotion:true,dive:sample.keys.includes('L')});
  advanceView(view,t,RULES.step,{});
  assert.equal(view.nativeCameraPosition*65536,sample.camera_after_q16,`frame ${sample.frame}: foreground camera`);
  assert.equal(Math.round((720-t.egg.y*16)*65536),sample.y_q16,`frame ${sample.frame}: Y`);
  assert.equal(Math.round(-t.egg.vy*16/60*65536)||0,sample.vy_q16,`frame ${sample.frame}: velocity`);
  assert.equal(t.nativeActorState??0,sample.state,`frame ${sample.frame}: actor state`);
  assert.equal(t.nativeActorNextState??0,sample.next_state,`frame ${sample.frame}: next state`);
  if(sample.creature){
   const expected=sample.creature,c=t.nativeWaterCreature;
   for(const key of ['x','y','velocity','active','carrying','fade','counter','splashed'])
    assert.equal(c[key],expected[key],`frame ${sample.frame}: creature ${key}`);
  }
  if(sample.creature_draw){
   const draw=t.nativeWaterCreatureRender,expected=sample.creature_draw;
   assert.ok(draw,`frame ${sample.frame}: creature descriptor exists`);
   assert.equal(Math.floor(draw.x/65536)&511,expected.x,`frame ${sample.frame}: creature OAM X`);
   assert.equal((Math.floor(draw.y/65536)-Math.floor(sample.camera_before_q16/65536))&255,expected.y,
    `frame ${sample.frame}: creature OAM Y`);
   assert.ok(expected.frames.includes(draw.frame),`frame ${sample.frame}: creature ROM art frame ${draw.frame}`);
  }
 }
 if(profile.start_on_roof){assert.ok(Math.abs(t.egg.y-profile.height)<.1,'return above the complete tower');
  assert.equal(t.egg.vy,0,'settle on the roof after recovery');
 }else if(profile.gap_row!==undefined){assert.equal(Math.floor(t.egg.y),profile.gap_row-1);
  assert.equal(t.egg.vy,0,'land inside the genuine opening');}
});
test('native water animation clocks and carried-actor RNG consumption',()=>{
 const profile=fixture.profiles.find(p=>p.name==='empty');
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
 Object.assign(t.egg,{x:profile.initial.x,y:profile.initial.y,vy:0,ground:true});
 for(const sample of profile.samples){
  const previous=actorPose(t);advanceActorVisual(t,null,true);
  t.nativeRenderFrame={camera:(640-sample.camera_before_q16/65536)/16};
  t.update(RULES.step,{nativeMotion:true,dive:sample.keys.includes('L')});
  let randomCalls=0;
  advanceNativePlayerPose(t,previous,()=>{randomCalls++;return sample.animation.step<<5;});
  if(sample.state!==1)continue;
  assert.equal(t.nativePlayerAnimationSelector,sample.animation.selector,`frame ${sample.frame}: selector`);
  assert.equal(t.nativePlayerAnimationPhase,sample.animation.phase,`frame ${sample.frame}: animation phase`);
  assert.equal(t.nativePlayerAnimationStep,sample.animation.step,`frame ${sample.frame}: animation step`);
  assert.equal(randomCalls,Number(sample.animation.selector===2),`frame ${sample.frame}: shared RNG consumption`);
 }
});
