import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeRoute,advanceNativeTravel} from '../renderer/games/eggo-mania/native-cpu.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-route-gba.json',import.meta.url),'utf8'));
test('bounded route labels, parents and waypoints match execution of native route instructions',()=>{
 for(const [index,c] of fixture.route.entries()){
  const state=structuredClone(c.before);
  assert.equal(nativeRoute(state,c.input.heights,c.input.start,c.input.target,c.input.margin),c.reachable,`route ${index}`);
  assert.deepEqual(state,c.after,`route ${index}`);
 }
});
test('travel inputs and route mutations match native movement instructions',()=>{
 for(const [index,c] of fixture.travel.entries()){
  const state={...structuredClone(c.before),groundRow:c.input.groundRow,counterD4:c.input.counterD4};
  const result=advanceNativeTravel(state,{...c.input,frame:200});
  assert.equal(result.keys,c.keys,`travel ${index}: keys`);
  assert.equal(result.early,c.exit!==0x08007dc4,`travel ${index}: return`);
  assert.deepEqual({waypoint:state.waypoint,labels:state.labels,parents:state.parents},c.after,`travel ${index}: route`);
  assert.equal(state.counterD4,c.counterD4,`travel ${index}: jump clock`);
 }
});

test('live building-piece controller follows the first intermediate roof and uses the native jump input',()=>{
 const g=new Game();g.p=settings({hazards:false});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;
 for(let x=0;x<7;x++)for(let y=0;y<x*3;y++)t.setCell(x,y,1);
 t.egg.x=0.5;t.egg.y=0;t.egg.vy=0;t.egg.ground=true;
 t.held={nativeKind:2,nativeVariant:0,cells:[[0,0]],color:2};
 g.aiHeld=t.held;g.aiPlan={x:3.5,r:0};g.aiTiming.period=1000;
 g.updateCPU(RULES.step);g.updateCPU(RULES.step);
 assert.equal(g.aiTravel.waypoint,1);
 assert.ok(t.egg.x>0.5);assert.ok(t.egg.vy>0);assert.equal(t.placing,null);
});

const replay=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-travel-replay-gba.json',import.meta.url),'utf8'));
test('regular travel commands match actual intermediate states of the original CPU controller',()=>{
 let checked=0;
 for(const call of replay.calls){
  assert.equal(call.returned_keys,call.recorded_keys,`original frame ${call.frame}: final commands`);
  for(const t of call.travels){
   const state=structuredClone(t.before),result=advanceNativeTravel(state,t.input);
   assert.deepEqual(result,{keys:t.keys,early:t.early},`original frame ${call.frame}: travel`);
   assert.deepEqual(state,t.after,`original frame ${call.frame}: route memory`);checked++;
  }
 }
 assert.ok(checked>=5,'must exercise real held-piece controller branches');
});
