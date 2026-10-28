import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-built-water-gba.json',import.meta.url),'utf8'));
test('real built tower: repeated L contacts, water entry, carry, release and landing match GBA Q16',()=>{
 const {initial,samples}=fixture,words=initial.config_words;
 const t=new Tower(settings({hazards:false,waterSpeed:0,nativeConfig:{words,height:words[17]}}),randomFrom(1));
 t.rows=[];initial.rows.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)t.setCell(x,y,1,owner);}));
 t.spawn=Infinity;t.nativePickups=null;t.nativeFrame=initial.native_frame;
 t.time=fixture.parameters.start*RULES.step;
 t.water=(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-initial.waterline_q16/RULES.actorFixedScale)/RULES.projectilePixels;
 const a=initial.actor;
 Object.assign(t.egg,{x:a.x_q16/RULES.actorFixedScale/16+1,
  y:(720-a.y_q16/RULES.actorFixedScale)/16,
  vy:-a.vy_q16/RULES.actorFixedScale/16/RULES.step,
  ground:false,introDescent:false,dropTicks:initial.drop_ticks});
 t.collapseTimers=new Map(initial.timers.map(([y,timer])=>[y,{timer,initial:timer}]));
 t.collapse.active=t.collapseTimers.size>0;
 for(const sample of samples){
  t.update(RULES.step,{nativeMotion:true,dive:sample.keys.includes('L')});
  assert.equal(Math.round((720-t.egg.y*16)*65536),sample.actor.y_q16,`frame ${sample.frame}: Y`);
  assert.equal(Math.round(-t.egg.vy*16*RULES.step*65536)||0,sample.actor.vy_q16,`frame ${sample.frame}: velocity`);
  assert.equal(t.nativeActorState??0,sample.actor.state,`frame ${sample.frame}: state`);
 }
});
