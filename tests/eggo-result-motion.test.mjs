import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createResultView,advanceResultView,resultGlyphPosition,PODIUM_VIEW,podiumPose,resultOpacity} from '../renderer/games/eggo-mania/result-view.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-result-motion-gba.json',import.meta.url),'utf8'));
test('result letters follow all 1674 positions from the ordinary-input original replay',()=>{
 const states=fixture.initial.map(s=>({...s,previousX:s.x,previousY:s.y}));
 for(const sample of fixture.samples){
  advanceResultView(states);
  assert.deepEqual(states.map(resultGlyphPosition),sample.positions,`frame ${sample.frame}`);
 }
});
test('Survival completes the result transition, freezes its finished arena at the podium and continues the streak only after confirmation',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.wins=3;g.startRound({intro:false});
 let submissions=0;g.submitScore=()=>submissions++;g.player.won=true;g.finish();
 assert.equal(g.wins,4);g.elapsed=12;
 g.input={isActionJustDown:a=>a==='continue',isActionDown:()=>false,getFirstGamepadAxis:()=>0};g.update(0);
 assert.equal(g.round,1,'confirmation cannot skip the native result transition');assert.equal(g.phase,'won');
 for(let i=1;i<PODIUM_VIEW.roundTicks+PODIUM_VIEW.entryDelay;i++)g.updateResult(RULES.step);
 const arenaTime=g.player.time;
 g.updateResult(RULES.step*40);
 assert.equal(g.player.time,arenaTime);assert.equal(g.elapsed,12);assert.equal(submissions,1);
 assert.ok(g.resultTicks>=PODIUM_VIEW.confirmTick);assert.equal(resultOpacity(g.resultTicks),1);
 assert.ok(podiumPose(true,100));assert.equal(podiumPose(false,180),null);
 g.update(0);
 assert.equal(g.phase,'won','confirmation starts the outgoing palette fade');
 g.updateResult(RULES.step*(PODIUM_VIEW.fadeTicks+2));
 assert.equal(g.round,2);assert.equal(g.wins,4);assert.equal(g.phase,'countdown');assert.equal(g.resultTicks,0);
});
test('the result initializer reaches the original checkpoint after its three initial ticks',()=>{
 const states=[...createResultView(false,0),...createResultView(true,1)];
 for(let i=0;i<3;i++)advanceResultView(states);
 for(const [i,state] of states.entries())for(const [key,value] of Object.entries(fixture.initial[i]))assert.equal(state[key],value,`${i} ${key}`);
});
