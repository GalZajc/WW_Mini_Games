import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreNativeCandidate,projectNativeCandidate,planNativePiece,scoreNativeHole,nativeColumnGap,advanceNativeSweep,NativePieceSweep,nativeSweepDirection} from '../renderer/games/eggo-mania/native-cpu.js';
import {Tower,settings,randomFrom,rotate} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_PIECE_MASKS} from '../renderer/games/eggo-mania/assets/native-piece-masks.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-candidates-gba.json',import.meta.url),'utf8'));
const holes=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-holes-gba.json',import.meta.url),'utf8'));
const sweepFixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cpu-sweep-gba.json',import.meta.url),'utf8'));

test('incremental search counters and retained best choices match native instruction execution',()=>{
 let count=0,wraps=0,improvements=0;
 for(const call of [...sweepFixture.calls,...sweepFixture.diagnostics])for(const s of call.sweeps){
  const actual={...s.before};
  advanceNativeSweep(actual,s,s.emptyFirstField);
  assert.deepEqual(actual,s.after);count++;
  if(s.before.rotation===3&&s.before.column===6)wraps++;
  if(s.after.bestScore>s.before.bestScore)improvements++;
 }
 assert.equal(count,14);assert.ok(wraps>0);assert.ok(improvements>0);
});

test('live incremental planner inspects one combination per frame and continues after the first sweep',()=>{
 const t=new Tower(settings({hazards:false}),randomFrom(1));
 const mask=NATIVE_PIECE_MASKS[0],minX=Math.min(...mask.map(c=>c[0])),maxY=Math.max(...mask.map(c=>c[1]));
 t.held={nativeKind:0,nativeVariant:0,cells:mask.map(([x,y])=>[x-minX,maxY-y])};
 const search=new NativePieceSweep();
 for(let frame=0;frame<27;frame++)assert.equal(search.step(t),undefined);
 const first=search.step(t);assert.ok(first);assert.equal(search.state,2);
 assert.equal(search.clock,28);assert.equal(search.column,0);assert.equal(search.rotation,0);
 search.step(t);assert.equal(search.clock,29);assert.equal(search.column,1);
 assert.ok(search.bestScore>=first.score,'retains its best choice across successive sweeps');
});

test('incomplete-sweep steering targets the first highest column in ROM scan order',()=>{
 const makeTower=columns=>{
  const t=new Tower(settings({hazards:false,columns:7,mode:'survival'}),randomFrom(19));
  for(const column of columns)t.setCell(column,10,3);
  t.egg.x=2.5;t.egg.y=20;
  return t;
 };
 // Column 3 is checked first but is lower; the ROM skips it and steers left
 // toward the only highest stack at column 0.
 assert.equal(nativeSweepDirection(makeTower([0])),-1);
 // Tied highest columns use the ROM order, so column 5 wins over column 0.
 assert.equal(nativeSweepDirection(makeTower([0,5])),1);
});

test('incremental gameplay search produces the original candidate score and resulting brain state',()=>{
 let count=0;
 for(const call of [...sweepFixture.calls,...sweepFixture.diagnostics]){
  const s=call.sweeps[0],c=call.candidates[0],p=call.projections[0];if(!s||!c||!p)continue;
  const t=new Tower(settings({hazards:false}),randomFrom(1));
  for(let y=0;y<47;y++)for(let x=0;x<7;x++)if(p.board[y*8+x])t.setCell(x,46-y,p.board[y*8+x]);
  const mask=NATIVE_PIECE_MASKS[c.actorRotation*8+c.kind];
  const minX=Math.min(...mask.map(v=>v[0])),maxY=Math.max(...mask.map(v=>v[1]));
  t.held={nativeKind:c.kind,nativeVariant:c.actorRotation,cells:mask.map(([x,y])=>[x-minX,maxY-y])};
  t.egg.x=c.actorColumn+0.5;
  // Recover the native integer waterline used by the recorded urgency.
  const waterTile=c.urgency+c.height-1+c.progress;t.water=(728-1-waterTile*16)/16;
  const search=new NativePieceSweep();Object.assign(search,s.before,{clock:s.before.clock-1});
  search.step(t);
  const actual=Object.fromEntries(Object.keys(s.after).map(k=>[k,search[k]]));
  assert.deepEqual(actual,s.after,`native call ${call.frame??JSON.stringify(call.selection)}`);count++;
 }
 assert.equal(count,14);
});

test('single-cell buried-gap scores match the original special CPU branch',()=>{
 let positive=0;
 for(const call of holes.diagnostics)for(const c of call.candidates){
  assert.equal(nativeColumnGap(c,c.column),c.gap);
  assert.equal(scoreNativeHole(c),c.score,`column ${c.column}`);
  if(c.gap)positive++;
 }
 assert.equal(positive,2,'both actual holes on the captured board must be compared');
});

test('isolated CPU calls return the original commands at fifteen real replay checkpoints',()=>{
 for(const c of fixture.calls)assert.equal(c.returned_keys,c.recorded_keys,`frame ${c.frame}`);
});

test('gameplay preview preserves native mask padding and matches original placement anchors',()=>{
 for(const call of [...fixture.calls,...fixture.diagnostics])for(const p of call.projections){
  const signature=c=>c.map(p=>p.join(',')).sort().join(';');
  const index=NATIVE_PIECE_MASKS.findIndex(m=>signature(m)===signature(p.cells));
  assert.ok(index>=0);const minX=Math.min(...p.cells.map(c=>c[0])),maxY=Math.max(...p.cells.map(c=>c[1]));
  const t=new Tower(settings({hazards:false}),randomFrom(1));t.rows=[];
  for(let y=0;y<47;y++)for(let x=0;x<7;x++)if(p.board[y*8+x])t.setCell(x,46-y,p.board[y*8+x]);
  t.held={nativeKind:index%8,nativeVariant:Math.floor(index/8),cells:p.cells.map(([x,y])=>[x-minX,maxY-y])};
  t.egg.x=p.startX+1.25;t.egg.y=45-p.startY-0.25;
  const actual=t.preview();
  if(!p.valid){assert.equal(actual,null);continue;}
  assert.equal(actual.x,p.anchorX+minX);assert.equal(actual.y,46-p.anchorY-maxY);
  // Rotation matching must also survive legacy callers that rotate cells
  // without updating their inventory metadata.
  for(let i=0;i<4;i++)t.held.cells=rotate(t.held.cells);
  const restored=t.preview();
  assert.equal(restored.x,actual.x);assert.equal(restored.y,actual.y);
  assert.equal(signature(restored.cells),signature(actual.cells));
 }
});

test('candidate geometry and scores match execution of the original Thumb instructions',()=>{
 let scores=0,projections=0;
 for(const call of [...fixture.calls,...fixture.diagnostics]){
  const label=call.frame??JSON.stringify(call.selection);
  for(const p of call.projections){
   const got=projectNativeCandidate(p);projections++;
   assert.equal(got.valid,p.valid,`${label}: valid`);
   if(p.valid){assert.equal(got.anchorX,p.anchorX,`${label}: x`);assert.equal(got.anchorY,p.anchorY,`${label}: y`);}
  }
  for(const c of call.candidates){scores++;assert.equal(scoreNativeCandidate(c),c.score,`${label}: score`);}
 }
 assert.equal(scores,54);assert.equal(projections,54);
});

test('gameplay planner chooses the original highest-scoring candidate on the captured board',()=>{
 const records=fixture.diagnostics.filter(r=>r.selection.kind===0);
 const p=records[0].projections[0],c=records[0].candidates[0];
 const t=new Tower(settings({hazards:false}),randomFrom(1));t.rows=[];
 for(let y=0;y<47;y++)for(let x=0;x<7;x++)if(p.board[y*8+x])t.setCell(x,46-y,p.board[y*8+x]);
 const mask=NATIVE_PIECE_MASKS[c.actorRotation*8];
 t.held={nativeKind:0,nativeVariant:c.actorRotation,cells:mask.map(([x,y])=>[x,2-y])};
 t.egg.x=c.actorColumn+0.5;t.nativeFrame=c.clock;t.water=-2;
 let best=null;
 for(const r of records)for(const candidate of r.candidates)if(!best||candidate.score>best.score)best=candidate;
 const result=planNativePiece(t,col=>[0,3,6].includes(col));
 assert.deepEqual(result,{score:best.score,x:best.column+0.5,r:(best.rotation-c.actorRotation+4)&3});
});
