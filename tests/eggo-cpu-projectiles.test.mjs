import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeProjectileTarget} from '../renderer/games/eggo-mania/native-cpu.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES,Tower,randomFrom} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-projectiles-gba.json',import.meta.url),'utf8'));
test('bombs and hammers share seven slots and a saturated allocator preserves held inventory, as in the ROM',()=>{
 const capacity=JSON.parse(readFileSync(new URL('./fixtures/eggo-projectile-capacity-gba.json',import.meta.url),'utf8'));
 for(const c of capacity.cases){
  const p=settings({hazards:false,waterSpeed:0}),owner=new Tower(p,randomFrom(1),c.field),target=new Tower(p,randomFrom(2),1-c.field);
  for(let slot=0;slot<c.occupied.length;slot++)if(c.occupied[slot]){
   (slot%2?owner.hammers:owner.bombs).push({nativeSlot:slot,pending:false});
  }
  const held={item:c.kind===8?'bomb':'hammer',nativeKind:c.kind};owner.held=held;
  assert.equal(owner.use(target),Boolean(c.returned));
  assert.equal(owner.held===held,c.held_after===c.kind);
  const launched=[...owner.bombs,...owner.hammers].find(p=>p.pending);
  assert.equal(launched?.nativeSlot??null,c.selected_slot);
  if(launched){assert.equal(owner.launchProjectile(launched,target),true);assert.equal(launched.nativeSlot,c.selected_slot);}
 }
});
test('incoming-projectile slot, roof, counter, inventory and parity choices match native instructions',()=>{
 assert.equal(fixture.cases.length,85);
 for(const c of fixture.cases){
  const state={...c.before},result=nativeProjectileTarget(state,c.input);
  assert.equal(result.action,c.result.action,JSON.stringify(c.input));
  assert.equal(result.pickupTarget>>>0,c.result.pickupTarget);
  assert.deepEqual(state,c.after);
 }
});
test('projectile target also matches an ordinary-input original call and its recorded subsequent keys',()=>{
 const call=fixture.ordinary_call;assert.deepEqual(call.parameters.diagnostic_writes,[]);
 assert.equal(call.returned_keys,call.recorded_keys);
 for(const c of call.projectile_targets){
  const state={...c.before},result=nativeProjectileTarget(state,c.input);
  assert.equal(result.action,c.action);assert.equal(result.pickupTarget,c.pickupTarget);
  assert.deepEqual(state,c.after);
 }
});
test('live CPU defers/discards before ordinary inventory expiry and then prioritizes the incoming bomb',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;t.held={nativeKind:2,nativeVariant:0,cells:[[0,0]],color:2};
 g.aiTiming.period=100;
 g.player.bombs.push({nativeSlot:0,flightCounter:250,pending:false,x:10.5,y:2,phase:'arc',fuse:3});
 g.updateCPU(RULES.step);
 assert.ok(t.held);assert.equal(g.aiTiming.period,100,'odd projectile decision bypasses the ordinary expiry gate');
 g.updateCPU(RULES.step);
 assert.ok(t.held,'the CPU discard command is queued for the following actor frame');
 g.updateCPU(RULES.step);
 assert.equal(t.held,null);assert.equal(g.aiTiming.period,100);assert.equal(t.crates.length,1);
 g.updateCPU(RULES.step);
 assert.equal(g.aiTravel.targetColumn,3,'incoming bomb outranks the just-discarded pickup');
 assert.equal(g.aiProjectileTarget,10.5*16*65536-16*65536);
});
test('projectile slots are reused and the native catch counter starts on first landing without resetting on rebounds',()=>{
 const p=settings({hazards:false,waterSpeed:0}),owner=new Tower(p,randomFrom(1),0),target=new Tower(p,randomFrom(2),1);
 target.held={cells:[[0,0]],color:2};
 const first={pending:true},second={pending:true};owner.bombs=[first,second];
 owner.launchProjectile(first,target);owner.launchProjectile(second,target);
 assert.equal(first.nativeSlot,0);assert.equal(second.nativeSlot,1);
 assert.equal(first.flightCounter,-1);
 owner.bombs.splice(0,1);const third={pending:true};owner.bombs.push(third);owner.launchProjectile(third,target);
 assert.equal(third.nativeSlot,0);
 Object.assign(third,{phase:'arc',x:11,y:0.9,vy:-1,targetX:11,fuse:10});owner.bombs=[third];
 owner.update(RULES.step,{},target);
 assert.equal(third.landed,true);assert.equal(third.flightCounter,250);
 owner.update(RULES.step,{},target);assert.equal(third.flightCounter,249);
});
