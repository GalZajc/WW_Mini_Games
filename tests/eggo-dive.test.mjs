import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
import Game from '../renderer/games/eggo-mania/game.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-dive-gba.json',import.meta.url),'utf8'));
test('drop-through matches native displacement, velocity and nine-tick support bypass',()=>{
 for(const p of fixture.profiles){
  const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
  for(let y=0;y<p.rows.length;y++)for(let x=0;x<7;x++)if(p.rows[y][x])t.setCell(x,y,p.rows[y][x]);
  t.egg.x=p.initial_x;t.egg.y=t.top(Math.floor(t.egg.x));const start=t.egg.y;
  for(const sample of p.samples){
   t.update(RULES.step,{dive:sample.frame<=p.held_frames});
   assert.ok(Math.abs(p.initial_y+(start-t.egg.y)*16-sample.world_y)<0.002,`frame ${sample.frame}: position`);
   assert.ok(Math.abs(-t.egg.vy*16/60-sample.velocity)<0.0001,`frame ${sample.frame}: velocity`);
   assert.equal(t.egg.dropTicks,sample.drop_ticks,`frame ${sample.frame}: bypass`);
  }
 }
});
test('CPU descends to a buried gap before committing its single-cell piece',()=>{
 const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
 const t=g.cpu;t.spawn=Infinity;
 // A roof over a one-cell opening with a supporting floor below it.
 for(const y of [0,1,2])t.setCell(0,y,1);
 for(let y=0;y<4;y++)t.setCell(1,y,1);
 t.setCell(0,4,1,99);t.setCell(1,4,1,99);t.egg.x=0.5;t.egg.y=5;
 // Keep this as a legacy synthetic piece: assigning a ROM inventory kind
 // would also activate the unrelated native CPU timing gate in this fixture.
 t.held={cells:[[0,0]],color:2};
 g.aiHeld=t.held;g.aiSearch=null;g.aiClock=0;g.aiPlan={x:0.5,r:1,dive:true,gapY:3};
 g.aiTiming.period=1000;
 let throwStarted=false;
 for(let frame=0;frame<140;frame++){
  g.updateCPU(RULES.step);
  if(t.placing){throwStarted=true;assert.equal(t.placing.x,0);assert.equal(t.placing.y,3);}
  if(t.cell(0,3))break;
 }
 assert.ok(throwStarted,'must throw after reaching the opening');
 assert.equal(t.cell(0,3),2);assert.equal(t.cell(0,5),0,'must not add the piece on top of the roof');
});
