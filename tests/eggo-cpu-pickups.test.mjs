import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNativePickupTarget,advanceNativeTravel} from '../renderer/games/eggo-mania/native-cpu.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-pickup-targets-gba.json',import.meta.url),'utf8'));
test('Survival pickup targets match actual intermediate states in the original CPU policy',()=>{
 let count=0,real=0;
 for(const call of [...fixture.calls,{frame:"diagnostic",targets:fixture.diagnostics}]){
  if(call.frame!=="diagnostic")assert.equal(call.returned_keys,call.recorded_keys,`frame ${call.frame}: original commands`);
  for(const t of call.targets){
   assert.equal(t.input.special,false);assert.equal(t.input.elevated,false);
   const state=structuredClone(t.before),choice=selectNativePickupTarget(state,t.input);
   assert.deepEqual(state,t.after,`frame ${call.frame}: target`);
   assert.deepEqual(choice,{selected:t.selected,nearPickup:t.nearPickup},`frame ${call.frame}: choice`);count++;if(call.frame!=="diagnostic")real++;
  }
 }
 assert.equal(real,2,'both original empty-handed selection calls must be checked');
 assert.equal(count,18,'also checks sixteen original instruction boundary cases');
});

test('empty-handed travel matches the original commands and route state after pickup selection',()=>{
 let checked=0;
 for(const call of fixture.calls)for(const t of call.travels){
  const state=structuredClone(t.before),result=advanceNativeTravel(state,t.input);
  assert.deepEqual(result,{keys:t.keys,early:t.early},`frame ${call.frame}: commands`);
  assert.deepEqual(state,t.after,`frame ${call.frame}: route`);checked++;
 }
 assert.ok(checked>=2);
});
test('live Survival CPU targets the native reachable pickup and idles at the tallest roof',()=>{
 const g=new Game();g.p=settings({hazards:false});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.egg.x=3.0;t.egg.y=3;t.egg.vy=0;t.egg.ground=true;
 for(let x=0;x<7;x++)for(let y=0;y<17;y++)t.setCell(x,y,1);
 // The geometrically nearest item is buried below its column roof.
 t.crates=[{nativeKind:0,nativeMotion:{x:40,y:500,active:true},x:3,y:15.25},
  {nativeKind:0,nativeMotion:{x:72,y:440,active:true},x:5,y:19}];
 const controls={};g.nativeEmptyControl(t,controls);
 assert.equal(g.aiTravel.targetColumn,5);assert.equal(g.aiTravel.idleTarget,72*65536);
 t.crates=[];t.rows=[];
 for(let y=0;y<5;y++)t.setCell(6,y,1);
 g.nativeEmptyControl(t,{});assert.equal(g.aiTravel.targetColumn,6);
});
