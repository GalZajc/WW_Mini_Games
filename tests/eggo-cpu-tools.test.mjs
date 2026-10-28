import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeToolDecision,NativePlacementGate,nativeBombCanCommit} from '../renderer/games/eggo-mania/native-cpu.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-tools-gba.json',import.meta.url),'utf8'));
test('bomb urgency and filler/bomb destination match original instruction execution',()=>{
 assert.equal(fixture.cases.length,48);
 for(const c of fixture.cases){
  const state={...c.before};assert.equal(nativeToolDecision(state,c.input),c.action,JSON.stringify(c.input));
  assert.deepEqual(state,c.after);
 }
});
test('bomb fuse guard and special-item commit countdown match native instruction boundaries',()=>{
 assert.equal(fixture.commit_cases.length,20);
 for(const c of fixture.commit_cases)assert.equal(nativeBombCanCommit(c.input),c.canCommit,JSON.stringify(c.input));
 const placement=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-placement-gba.json',import.meta.url),'utf8'));
 const tools=placement.cases.filter(c=>c.input.kind>7);assert.equal(tools.length,16);
 for(const c of tools){
  const gate=new NativePlacementGate();gate.wait=c.input.wait;
  const action=gate.step(c.input);
  assert.equal(gate.wait,c.afterWait);
  assert.equal(action,c.address===0x0800678c?'defer':c.address===0x08007abc?'wait':'use');
 }
});
test('held bomb travels before committing and filler waits for the next eligible even frame',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.held={item:'bomb',nativeKind:8,nativeVariant:0,fuse:RULES.bombFuse};
 g.aiTiming.period=1;g.updateCPU(RULES.step);
 assert.equal(t.bombs.length,0,'period expiry must not bypass bomb targeting');assert.ok(t.held);
 assert.equal(g.aiTiming.period,0);assert.equal(g.aiPlacement.wait,0,'high fuse must not start commit countdown');
 assert.equal(nativeBombCanCommit({fuse:250,rotation:0,roughness:47,frame:200}),false);
 assert.equal(nativeBombCanCommit({fuse:100,rotation:0,roughness:47,frame:200}),true);
 const gate=new NativePlacementGate();
 assert.equal(gate.step({kind:10,frame:200}),'wait');assert.equal(gate.wait,1);
 assert.equal(gate.step({kind:10,frame:201}),'defer');
 assert.equal(gate.step({kind:10,frame:202}),'use');
});
test('aligned filler uses the native even-frame commit path without steering past its target',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0,columns:7});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.egg.x=3;t.egg.y=4;t.egg.vy=0;t.nativeFrame=0;
 t.held={item:'filler',nativeKind:10,nativeVariant:0,cells:null};
 g.aiTiming.clock=14;g.aiTiming.stall=0;g.aiPlacement.wait=0;
 const odd={};g.nativeToolControl(t,odd);
 assert.equal(odd.nativeEarly,true);assert.equal(odd.use,false);assert.equal(odd.move,undefined);
 assert.equal(g.aiPlacement.wait,0,'filler alignment does not consume the ordinary placement counter');
 t.nativeFrame=1;g.aiTiming.clock=15;g.aiTiming.stall=0;
 const even={};g.nativeToolControl(t,even);
 assert.equal(even.nativeEarly,true);assert.equal(even.use,true);assert.equal(even.move,undefined);
 assert.equal(g.aiTiming.clock,0);assert.equal(g.aiTiming.stall,36);
});
test('automatic tools retain native clock and consume on an eligible frame',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.held={item:'hammer',nativeKind:11};g.aiTiming.period=100;g.aiTiming.clock=123;
 g.updateCPU(RULES.step);assert.ok(t.held);assert.equal(g.aiTiming.stall,0);
 g.updateCPU(RULES.step);assert.ok(t.held,'automatic tool use is queued on its native decision frame');
 assert.equal(g.aiTiming.stall,36);assert.equal(g.aiTiming.clock,125);
 g.updateCPU(RULES.step);assert.equal(t.held,null);assert.equal(g.aiTiming.stall,35);assert.equal(g.aiTiming.clock,125);
});
