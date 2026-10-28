import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';

test('a distant neighboring block cannot cancel the native side-wall contact',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-horizontal-contact-gba.json',import.meta.url),'utf8'));
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
 for(const [y,row] of f.rows.entries())for(const [x,value] of row.entries())if(value)t.setCell(x,y,1,value);
 Object.assign(t.egg,{x:f.before.x_q16/65536/16+1,y:(720-f.before.y_q16/65536)/16,
  vy:-f.before.vy_q16/65536*60/16,ground:false,offTower:false});
 t.update(RULES.step,{nativeMotion:true,move:-1});
 assert.equal(Math.round((t.egg.x-1)*16*65536),f.after.x_q16);
 assert.equal(Math.round((720-t.egg.y*16)*65536),f.after.y_q16);
});
