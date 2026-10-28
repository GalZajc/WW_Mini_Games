import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_RESCUE,nativeRescueBoat} from '../renderer/games/eggo-mania/native-rescue.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-rescue-gates-gba.json',import.meta.url),'utf8'));
const boats=JSON.parse(readFileSync(new URL('./fixtures/eggo-arena-boats-gba.json',import.meta.url),'utf8'));
test('both airships in all seven other arenas match native fixed-point positions',()=>{
 for(const sample of boats.samples){
  const actual=nativeRescueBoat(sample.frame,sample.side,null,sample.stage);
  assert.deepEqual([actual.x,actual.y],[sample.x,sample.y],`${sample.stage}/${sample.side}/${sample.frame}`);
 }
});
for(const profile of fixture.rescue)test(`native rescue gate and attraction: ${profile.name}`,()=>{
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
 t.nativeFrame=profile.samples[0].clock-1;
 const [phaseX,phaseY]=profile.samples[0].boat_phases;
 t.nativeRescueOrigin={frame:t.nativeFrame,phaseX:(phaseX-NATIVE_RESCUE.xStep)&NATIVE_RESCUE.turnMask,
  phaseY:(phaseY-NATIVE_RESCUE.yStep)&NATIVE_RESCUE.turnMask};
 t.egg.x=1+fixture.rescue[0].samples[0].actor_x/16;t.egg.y=(720-profile.y)/16;t.egg.vy=0;t.egg.ground=false;
 if(profile.forced){
  for(let y=0;y<profile.height;y++)for(let x=0;x<7;x++)t.setCell(x,y,1,y+1);
  t.egg.nativeWaterRise=true;
 }
 for(const sample of profile.samples){
  t.update(RULES.step,{nativeMotion:true},null,Boolean(t.won));
  assert.equal(t.won,sample.game_state===1,`frame ${sample.frame}: win gate`);
  const boat=nativeRescueBoat(t.nativeFrame,0,t.nativeRescueOrigin);
  assert.deepEqual([boat.x,boat.y],sample.boat,`frame ${sample.frame}: airship`);
  if(t.won){
   assert.equal(Math.round((720-t.egg.y*16)*65536),Math.round(sample.actor_y*65536),`frame ${sample.frame}: rescue Y`);
   assert.equal(Math.round((t.egg.x-1)*16*65536),Math.round(sample.actor_x*65536),`frame ${sample.frame}: rescue X`);
  }
 }
});
