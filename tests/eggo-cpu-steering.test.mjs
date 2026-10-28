import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeSteeringKeys,filterNativeDirection,NativePlacementGate} from '../renderer/games/eggo-mania/native-cpu.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-steering-gba.json',import.meta.url),'utf8'));
test('horizontal target windows and reversal latch match execution of original instructions',()=>{
 for(const c of fixture.steering)assert.equal(nativeSteeringKeys(c.input),c.keys,c.input.name);
 for(const c of fixture.direction){
  const timer={counterCC:c.input.counterCC,counterD0:c.input.counterD0};
  assert.equal(filterNativeDirection(timer,c.input.keys,c.input.previousKeys),c.keys);
  assert.deepEqual(timer,{counterCC:c.counterCC,counterD0:c.counterD0});
  assert.equal(c.previousKeys,c.keys);
 }
});
test('live CPU accepts the native interior window instead of seeking the exact column centre',()=>{
 const g=new Game();g.p=settings({hazards:false});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.held={nativeKind:2,nativeVariant:0,cells:[[0,0]],color:2};
 t.egg.x=3.3125;t.egg.y=0;t.egg.vy=0;t.egg.ground=true;
 g.aiHeld=t.held;g.aiPlan={x:3.5,r:0};g.aiClock=Infinity;g.aiTiming.period=1000;
 const x=t.egg.x;g.updateCPU(RULES.step);assert.equal(t.egg.x,x);
});

const placement=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-placement-gba.json',import.meta.url),'utf8'));
test('eligible commit waits, even-frame use and single-cell dive match original code',()=>{
 for(const c of placement.cases){
  const gate=new NativePlacementGate();gate.wait=c.input.wait;const action=gate.step(c.input);
  assert.equal(gate.wait,c.afterWait);
  assert.equal(action,c.keys===1?'use':c.keys===512?'dive':c.address===0x0800678c?'defer':'wait');
  assert.equal(c.afterStall,action==='use'?c.input.difficulty**2:0);
  assert.equal(c.afterClock,action==='use'&&c.input.kind<=7?0:c.input.clock);
 }
});
