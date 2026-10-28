import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeAvoidHazards} from '../renderer/games/eggo-mania/native-cpu.js';
import {updateNativeHitCenter,nativeHazards} from '../renderer/games/eggo-mania/native-hazards.js';
import {advanceDragonSecondaryMotion,RULES,settings} from '../renderer/games/eggo-mania/model.js';
import Game from '../renderer/games/eggo-mania/game.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-avoidance-gba.json',import.meta.url),'utf8'));
test('enemy avoidance frame, type, approach and distance boundaries match original instructions',()=>{
 assert.equal(fixture.cases.length,119);
 for(const c of fixture.cases)assert.equal(nativeAvoidHazards(c.input),c.keys,JSON.stringify(c.input));
});
const centers=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-hit-centers-gba.json',import.meta.url),'utf8'));
test('computed active contact centers agree with nonzero native stored centers; inactive phases preserve prior centers',()=>{
 let checked=0;
 for(const c of centers.cases){
  // A still-zero contact buffer records history rather than the current
  // sprite pose. Its subsequent update is verified below by stepping mGBA.
  if(c.hitX===0&&c.hitY===0)continue;
  const d={...c.state};updateNativeHitCenter(d,c.kind,c.contactBlocked);
  if(d.nativeHitX===undefined)continue;
  checked++;assert.ok(Math.abs(d.nativeHitX-c.hitX)<=1/65536,JSON.stringify(c));
  assert.ok(Math.abs(d.nativeHitY-c.hitY)<=1/65536,JSON.stringify(c));
 }
 assert.equal(checked,199);
 for(const [kind,patch] of [[14,{variant:1}],[7,{previousAnimation:0}],[16,{previousAnimation:0}],[5,{life:RULES.bubbleLife}]]){
  const d={active:true,x:50,y:600,nativeHitX:7,nativeHitY:8,...patch};
  updateNativeHitCenter(d,kind);assert.equal(d.nativeHitX,7);assert.equal(d.nativeHitY,8);
 }
});
test('zero rock contact buffer is populated on the following native motion ticks',()=>{
 const c=centers.cases.find(c=>c.kind===12&&c.hitX===0&&c.hitY===0);
 assert.ok(c);const d={...c.state,speed:0,nativeHitX:0,nativeHitY:0};
 for(const expected of centers.continuation){
  advanceDragonSecondaryMotion(d,600,760);updateNativeHitCenter(d,12);
  for(const [key,actual] of [['x',d.x],['y',d.y],['hitX',d.nativeHitX],['hitY',d.nativeHitY]])assert.equal(actual,expected[key]);
 }
});
test('live CPU uses a primary enemy contact center to reverse its planned direction',()=>{
 const g=new Game();g.p=settings({hazards:true,waterSpeed:0});g.seed=1;g.round=1;g.startingStage=0;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.nativeFrame=300;t.egg.x=3.5;t.egg.y=5;t.egg.vy=0;t.egg.ground=true;
 t.setCell(3,4,1,9);
 t.held={nativeKind:2,nativeVariant:0,cells:[[0,0]],color:2};
 g.aiHeld=t.held;g.aiPlan={x:5.5,r:0};g.aiTiming.period=1000;
 const x=t.egg.x*16-16,y=720-t.egg.y*16;
 Object.assign(t.bubble,{active:true,life:200,nativeHitX:x+20,nativeHitY:y-20,vx:-1,vy:0});
 const h=nativeHazards(t)[0];assert.equal(h.x,(x+20)*65536);
 const before=t.egg.x;g.updateCPU(RULES.step);g.updateCPU(RULES.step);
 assert.ok(t.egg.x<before,'incoming enemy overrides the rightward planned route');
 assert.ok(t.egg.vy>0,'enemy above requests Up');
});
