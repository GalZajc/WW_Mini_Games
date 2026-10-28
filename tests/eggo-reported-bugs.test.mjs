import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES,advancePickupMotion,nativeSurvivalConfig,nativePreviewAngleMatrix} from '../renderer/games/eggo-mania/model.js';
import {advanceActorVisual,advanceNativeRivalPose,rivalPose} from '../renderer/games/eggo-mania/view.js';
import {CONTROLS,migrateGamepadDefaults} from '../renderer/games/eggo-mania/controls.js';
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
const tower=side=>{const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1),side);t.spawn=Infinity;return t;};

test('Xbox Menu pauses; shipped View restart and Menu continue bindings are removed',()=>{
 const bindings={restart:[{type:'keyboard',code:'F5'},{type:'gamepad',code:8}],continue:[{type:'keyboard',code:'Enter'},{type:'gamepad',code:9}]};
 migrateGamepadDefaults(bindings);
 assert.deepEqual(bindings.restart,[{type:'keyboard',code:'F5'}]);
 assert.deepEqual(bindings.continue,[{type:'keyboard',code:'Enter'}]);
 assert.deepEqual(bindings.pause,[{type:'gamepad',code:9}]);
 assert.ok(CONTROLS.some(([action])=>action==='pause'));
});

test('bird returns an inert boxed bomb with the exact original pickup trajectory',()=>{
 const f=fixture('eggo-bird-returned-bomb-gba'),t=tower(0),b=f.before;
 t.artStage='park';Object.assign(t.parkSecondary,b,{active:true,animationClock:b.animation_clock,
  turnY:f.turn_y_q16/65536,stolen:{item:'bomb',nativeKind:8,nativeVariant:0,fuse:2}});
 for(const key of ['x','y','vx','vy'])t.parkSecondary[key]=b[key]/65536;
 Object.assign(t.egg,{x:(f.drop.actor_x/65536+16)/16,y:(720-f.drop.actor_y/65536)/16});
 t.advanceParkSecondary();assert.equal(t.parkSecondary.stolen,null);
 const item=t.crates.at(-1);assert.equal(item.fuse,undefined);assert.equal(item.nativeKind,8);
 for(const [i,s] of f.samples.entries()){
  if(i)advancePickupMotion(item.nativeMotion,760);
  for(const key of ['x','y','vx','vy'])assert.equal(Math.round(item.nativeMotion[key]*65536),s.motion[key],`frame ${s.frame}: ${key}`);
 }
});

test('rocket hit retains native fixed-point physics and rival injury pictures in every arena',()=>{
 const samples=fixture('eggo-space-secondary-gba').contact_samples;
 for(const stage of ['factory','dragon','castle','pirate','space','jungle','park','beanstalk']){
  const t=tower(1);t.artStage=stage;Object.assign(t.egg,{y:7.5,vy:0,ground:false});t.strikeLightning();
  for(const s of samples){
   advanceActorVisual(t,()=>1,true);t.update(RULES.step,{nativeMotion:true,move:1});advanceNativeRivalPose(t,()=>1);
   assert.equal(720-t.egg.y*16,s.actor_y,`${stage} hit frame ${s.frame}`);
   if(s.frame>1)assert.equal(rivalPose(t,stage).resource.sheet,`${stage}-rival-specials`);
  }
 }
});

test('an empty water-contact row defeats a swimming field, but submerged complete rows do not',()=>{
 for(const filled of [false,true]){
  const config=nativeSurvivalConfig(1,42),t=new Tower(settings({hazards:false,waterSpeed:0,nativeConfig:config}),randomFrom(1),1);
  t.rows=[];t.spawn=Infinity;t.nativeFrame=983;
  if(filled)for(let y=0;y<20;y++)for(let x=0;x<7;x++)t.setCell(x,y,1,1+y*7+x);
  t.water=(720+RULES.bubbleWaterlineBias-500)/16;
  Object.assign(t.egg,{y:0,ground:false,swimming:true,waterEjected:true});
  t.update(RULES.step,{nativeMotion:true});
  assert.equal(t.lost,!filled);
 }
});

test('hammer rotation matches all 37 captured native OAM matrices, including offscreen pauses',()=>{
 const f=fixture('eggo-hammer-visual-gba');
 for(const s of f.samples)assert.deepEqual(nativePreviewAngleMatrix(
  s.visible_ticks*RULES.hammerSpriteAngleStep%RULES.hammerSpriteAnglePeriod),s.matrix,`hammer frame ${s.frame}`);
});

test('rival injury cel and reflection match the independently captured original animation',()=>{
 const f=fixture('eggo-rival-injury-visual-gba'),t=tower(1);t.artStage='space';
 Object.assign(t.egg,{y:7.5,vy:0,ground:false});t.strikeLightning();
 for(let frame=1;frame<=24;frame++){
  t.nativeRenderFrame={rivalResourcePose:t.nativeRivalResourcePose&&{...t.nativeRivalResourcePose}};
  advanceActorVisual(t,()=>1,true);t.update(RULES.step,{nativeMotion:true});advanceNativeRivalPose(t,()=>1);
  const expected=f.samples.find(s=>s.frame===frame);if(!expected)continue;
  const pose=rivalPose(t,'space');assert.equal(pose.frame,expected.cel,`frame ${frame}`);
  assert.equal(pose.mirrorX,expected.mirrored,`reflection frame ${frame}`);
 }
});
