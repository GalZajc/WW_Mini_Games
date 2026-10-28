import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NativeCpuTiming,NativeRotationGate,NativePieceSweep} from '../renderer/games/eggo-mania/native-cpu.js';
import {NATIVE_PIECE_MASKS} from '../renderer/games/eggo-mania/assets/native-piece-masks.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-timing-gba.json',import.meta.url),'utf8'));
const rotationFixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-rotation-gba.json',import.meta.url),'utf8'));
const inventoryFixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-inventory-gba.json',import.meta.url),'utf8'));
test('inventory dispatch and automatic-tool parity gates match original instruction execution',()=>{
 assert.equal(inventoryFixture.cases.length,64);
 for(const c of inventoryFixture.cases){
  const timer=new NativeCpuTiming();timer.clock=inventoryFixture.parameters.clock;timer.period=c.period;
  assert.equal(timer.inventoryGate(c.kind,c.frame),c.action,JSON.stringify(c));
  for(const key of ['clock','period','stall'])assert.equal(timer[key],c.after[key]);
 }
});
test('clockwise input and rotation wait match direct execution of the original rotation segment',()=>{
 for(const c of rotationFixture.cases){
  const gate=new NativeRotationGate();gate.wait=c.wait;
  const input=gate.request(c.current,c.target);
  assert.equal(gate.wait,c.after_wait);
  assert.equal(c.keys_before|(input?c.rotation_binding:0),c.keys_after);
  assert.equal(c.mode,5,'the oracle must run in Survival');
 }
});
test('native rotation is still emitted when hands are empty and actor orientation is stale',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0,columns:7});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.held=null;t.nativeActorRotation=3;g.aiRotationTarget=0;g.aiRotation.wait=0;
 let observed;g.updateTower=(_tower,_dt,control)=>{observed={...control};};
 g.updateCPU(RULES.step);
 assert.equal(g.lastModelControl.rotate,1,'the CPU emits the clockwise command on its decision frame');
 assert.equal(observed.rotate,1,'the actor consumes the native rotation command in the same update');
 assert.equal(g.aiRotation.wait,15);
 g.updateCPU(RULES.step);
 assert.equal(observed.rotate,0,'the one-shot rotation command is not repeated');
 assert.equal(g.lastModelControl.rotate,0);assert.equal(g.aiRotation.wait,14);
 g.updateCPU(RULES.step);
 assert.equal(observed.rotate,0);assert.equal(g.aiRotation.wait,13);
});
test('CPU performs three separate clockwise inputs and waits for the final orientation before throwing',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;const mask=NATIVE_PIECE_MASKS[0];
 const minX=Math.min(...mask.map(v=>v[0])),maxY=Math.max(...mask.map(v=>v[1]));
 t.held={nativeKind:0,nativeVariant:0,cells:mask.map(([x,y])=>[x-minX,maxY-y]),color:2};
 g.aiHeld=t.held;g.aiPlan={x:t.egg.x,r:3};g.aiClock=0;g.aiTiming.period=1000;
 const turns=[];let previous=0;
 for(let frame=1;frame<=70;frame++){
  g.updateCPU(RULES.step);
  const current=t.held?.nativeVariant??t.placing?.nativeHeld.nativeVariant;
  if(current!==previous){assert.equal(current,(previous+1)&3);turns.push(frame);previous=current;}
  if(frame<=33)assert.equal(t.placing,null,'no throw until all individual rotation inputs finish');
  if(t.placing){assert.ok(frame>=65,'native commit wait starts after orientation readiness');break;}
 }
 assert.deepEqual(turns,[1,17,33],'the actor rotates in the frame each native AI key is emitted');assert.ok(t.placing);assert.equal(t.placing.nativeHeld.nativeVariant,3);
});
test('native CPU timer gates reproduce original wait, increment, expiry and immediate-use boundaries',()=>{
 for(const c of fixture.cases){
  const timer=new NativeCpuTiming();Object.assign(timer,c.timing.before);
  const running=timer.begin();
  assert.equal(running,Boolean(c.timing.begin));
  assert.deepEqual({...timer},c.timing.begin??c.timing.afterWait);
  if(c.timing.pieceGate){
   assert.equal(timer.pieceGate(),c.timing.forcedUse);
   assert.deepEqual({...timer},c.timing.pieceGate);
  }
 }
});
test('a completed candidate sweep with no positive plan is handled as an empty choice',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0,columns:7});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu,mask=NATIVE_PIECE_MASKS[0],minX=Math.min(...mask.map(v=>v[0])),maxY=Math.max(...mask.map(v=>v[1]));
 t.spawn=Infinity;t.held={nativeKind:0,nativeVariant:0,cells:mask.map(([x,y])=>[x-minX,maxY-y]),color:2};
 g.aiHeld=t.held;g.aiClock=0;g.aiTiming.period=1000;g.aiSearch=new NativePieceSweep();
 Object.assign(g.aiSearch,{state:1,column:6,rotation:3,bestScore:Infinity,best:null});
 assert.doesNotThrow(()=>g.updateCPU(RULES.step));
 assert.equal(g.aiSearch.state,2);assert.equal(g.aiPlan,null);
});
test('CPU pauses decisions while the actor and world keep moving, then preserves its clock across inventory changes',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.egg.y=5;t.egg.ground=false;t.egg.vy=-1;
 g.aiTiming.clock=100;g.aiTiming.period=10;g.aiTiming.stall=3;
 for(let i=0;i<3;i++)g.updateCPU(RULES.step);
 assert.equal(g.aiTiming.clock,100);assert.equal(g.aiTiming.period,10);
 assert.equal(t.nativeFrame,3);assert.ok(t.egg.y<5);
 t.egg.y=0;t.egg.ground=true;t.egg.vy=0;
 t.held={nativeKind:2,nativeVariant:0,cells:[[0,0]],color:2};g.updateCPU(RULES.step);
 assert.equal(g.aiTiming.clock,101);assert.equal(g.aiTiming.period,9);assert.equal(g.aiSearch.clock,101);
 g.aiTiming.stall=0;
 t.held={nativeKind:2,nativeVariant:0,cells:[[0,0]],color:3};g.updateCPU(RULES.step);
 assert.equal(g.aiTiming.clock,102);assert.equal(g.aiTiming.period,8);assert.equal(g.aiSearch.clock,102);
});
test('expired native CPU counter applies Use in the same actor update and pauses without freezing the throw',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.held={nativeKind:2,nativeVariant:0,cells:[[0,0]],color:2};
 g.aiTiming.clock=100;g.aiTiming.period=1;g.updateCPU(RULES.step);
 assert.ok(t.placing,'the actor commits Use in the frame the CPU emits it');
 assert.equal(g.aiTiming.clock,0);assert.equal(g.aiTiming.period,1280);assert.equal(g.aiTiming.stall,36);
 const initial=t.placing.time;g.updateCPU(RULES.step);
 assert.ok(t.placing.time<initial);assert.equal(g.aiTiming.stall,35);assert.equal(g.aiTiming.clock,0);
 const afterOneWait=t.placing.time;g.updateCPU(RULES.step);
 assert.ok(t.placing.time<afterOneWait);assert.equal(g.aiTiming.stall,34);assert.equal(g.aiTiming.clock,0);
});
