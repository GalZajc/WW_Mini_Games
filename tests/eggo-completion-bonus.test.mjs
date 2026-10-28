import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom} from '../renderer/games/eggo-mania/model.js';

test('native two-floor bonuses appear above each column and fall independently',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-completion-bonus-gba.json',import.meta.url),'utf8'));
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.rows=[];
 for(const [y,row] of f.before.entries()){
  for(const [x,owner] of row.entries())if(owner)t.setCell(x,y,1,owner);
  if(t.rows[y])t.rows[y].sealed=row.every(Boolean);
 }
 t.nativeFrame=f.nativeFrame;t.placing={nativeHeld:{nativeKind:4}};
 for(const [x,y] of f.placement)t.setCell(x,y,1,49);
 t.complete();
 for(const [y,row] of f.after.entries())for(const [x,owner] of row.entries())
  assert.equal(Boolean(t.cell(x,y)),Boolean(owner),`bonus placement ${x},${y}`);
 const owners=f.bonuses.map(([x,y])=>t.rows[y].owners[x]);assert.equal(new Set(owners).size,4);
 for(const [x,y] of f.bonuses)assert.equal(t.rows[y].filler[x].bonus,true);
 for(let frame=1717;frame<=1747;frame++){
  t.nativeFrame++;t.advanceLoosePieces();
  if(frame===1745)assert.equal(t.rows[6].owners[6],owners[3]);
  if(frame===1746)assert.equal(t.rows[5].owners[6],owners[3]);
  if(frame===1747)assert.equal(t.rows[6].owners[2],owners[1]);
 }
});
