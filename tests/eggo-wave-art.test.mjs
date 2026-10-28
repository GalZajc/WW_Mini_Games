import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom} from '../renderer/games/eggo-mania/model.js';
import {collapseWavePose} from '../renderer/games/eggo-mania/view.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-wave-art-gba.json',import.meta.url),'utf8'));
const queue=JSON.parse(readFileSync(new URL('./fixtures/eggo-collapse-queue-gba.json',import.meta.url),'utf8'));

test('floor wave visibility and all eight pictures follow the original OAM trace through successive floors',()=>{
 const t=new Tower(settings({hazards:false}),randomFrom(1));
 for(let y=0;y<=7;y++)t.setCell(0,y,1,y+3);
 for(const [floor,timer] of queue.continuation_initial_timers)t.collapseTimers.set(floor,{timer,initial:timer});
 // Source state's preceding draw call saw timer 16; its RAM already holds 15.
 t.collapseWave={floor:6,timer:16};
 for(const sample of fixture.timeline){
  t.advanceCollapseCounter();
  assert.equal(t.collapseTimers.get(5)?.timer??-1,sample.timer,`frame ${sample.frame}: live counter`);
  assert.equal(collapseWavePose(t)?.frame??null,sample.phase,`frame ${sample.frame}: original OAM picture`);
 }
});

test('completing the floor before the native cancellation threshold prevents a wave',()=>{
 const t=new Tower(settings({hazards:false}),randomFrom(1));
 for(let x=0;x<7;x++)t.setCell(x,0,1);
 t.collapseTimers.set(0,{timer:32,initial:41});
 t.advanceCollapseCounter();t.advanceCollapseCounter();
 assert.equal(t.collapseTimers.size,0);assert.equal(collapseWavePose(t),null);
});
