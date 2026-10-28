import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES,fillerPhase,nativeCellArt} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-filler-art-gba.json',import.meta.url),'utf8'));
const ordinary=JSON.parse(readFileSync(new URL('./fixtures/eggo-filler-gba.json',import.meta.url),'utf8'));
const multi=JSON.parse(readFileSync(new URL('./fixtures/eggo-filler-multi-gba.json',import.meta.url),'utf8'));
for(const c of multi.cases)test(`filler completes ${c.rows} native rows without bonus cells`,()=>{
 const t=new Tower(settings({hazards:false}),randomFrom(1));
 for(let y=0;y<c.rows;y++)for(let x=0;x<c.existingColumns;x++)t.setCell(x,y,1,1);
 Object.assign(t.egg,c.actor);t.held={item:'filler'};t.use();
 const occupied=t.rows.flatMap((row,y)=>Array.from(row.cells).flatMap((value,x)=>value?[[x,y]]:[]));
 assert.deepEqual(occupied.sort(),c.cells.map(([x,y])=>[x,y]).sort());
 assert.equal(t.lines,c.rows);
 assert.ok(t.rows.every(row=>row.filler.every(cell=>!cell?.bonus)));
});

test('the instruction-backed filler walk also reproduces the independent input-only CPU capture',()=>{
 const t=new Tower(settings({hazards:false}),randomFrom(1));t.nextOwner=4;
 ordinary.before_rows_bottom_up.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)t.setCell(x,y,owner,owner);}));
 Object.assign(t.egg,{x:3.5,y:2});t.held={item:'filler'};t.use();
 assert.deepEqual(t.rows.map(row=>Array.from(row.owners)),ordinary.after_rows_bottom_up);
 assert.equal(t.lines,ordinary.completed_rows_after);
});

test('filler creation order and all graphic transitions match the eight original arenas',()=>{
 for(const stage of fixture.stages){
  const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
  stage.before_rows_bottom_up.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)t.setCell(x,y,1,owner);}));
  Object.assign(t.egg,{x:stage.initial_x,y:stage.initial_y});t.held={item:'filler'};
  t.update(RULES.step,{use:true});
  const born=t.nativeFrame;
  for(let index=0;index<stage.cells.length;index++){
   const cell=stage.cells[index],filler=t.rows[cell.y]?.filler[cell.x];
   assert.ok(filler,`${stage.stage}: missing cell ${cell.x},${cell.y}`);
   assert.equal(filler.index,index,`${stage.stage}: creation order`);
   for(let frame=1;frame<=70;frame++){
    const expected=cell.events.filter(e=>e.frame<=frame).length-1;
    assert.equal(fillerPhase(filler,born+frame-1),expected,`${stage.stage}: cell ${index}, frame ${frame}`);
   }
  }
 }
});

test('filler metadata survives falls and completed native rows retain their template',()=>{
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
 const art=nativeCellArt(6,0,0,0);
 for(let x=0;x<6;x++)t.setCell(x,0,1,3,0,art);
 t.setCell(6,0,7,4,1,0,{born:1,index:0});t.complete();
 assert.equal(t.rows[0].sealed,true);assert.equal(t.rows[0].nativeArt[0],art);
 t.setCell(2,2,7,17,1,0,{born:1,index:3});t.nativeFrame=2;t.advanceLoosePieces();
 assert.deepEqual(t.rows[1].filler[2],{born:1,index:3});
 assert.equal(t.rows[2].filler[2],null);
 t.removeFloor(0);assert.deepEqual(t.rows[0].filler[2],{born:1,index:3});
 t.setCell(2,0,0);assert.equal(t.rows[0].filler[2],null);
});

test('a filler cell below the actor launches the original hop after movement and grants twenty-two float ticks',()=>{
 for(const stage of fixture.stages.filter(s=>s.initial_vy===0)){
  const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
  t.egg.x=stage.initial_x;t.egg.y=stage.initial_y;t.held={item:'filler'};
  for(const sample of stage.actor_samples){
   t.update(RULES.step,{use:sample.frame===1});
   assert.ok(Math.abs(RULES.nativeActorFloor-t.egg.y*16-sample.y)<1/65536,`${stage.stage}: frame ${sample.frame} position`);
   assert.ok(Math.abs(-t.egg.vy*16/60-sample.vy)<0.0001,`${stage.stage}: frame ${sample.frame} velocity`);
   assert.equal(t.egg.fillerFloatTicks,sample.float_ticks,`${stage.stage}: frame ${sample.frame} float counter`);
  }
 }
});
