import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createView,advanceView,nativeMeterPose} from '../renderer/games/eggo-mania/view.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-meter-gba.json',import.meta.url),'utf8'));

test('native meter positions, velocities, jitter and blinking match both original fields for eighty frames',()=>{
 for(let side=0;side<2;side++){
  const origin=side*128*65536,initial=fixture.initial.meters[side];
  const state=createView();Object.assign(state.meter,{position:initial.position-origin,velocity:initial.velocity});
  state.meterPose=nativeMeterPose(state.meter,initial.count,fixture.initial.frame);
  for(const sample of fixture.samples){
   const native=sample.meters[side];
   advanceView(state,{egg:{y:0,ground:true},incompleteFloors:native.count,nativeFrame:sample.native_frame},1/60);
   assert.deepEqual(state.previousMeterPose,{x:native.pointer.x,y:native.pointer.y,barY:native.bar_y,flashing:native.flashing},`side ${side}, frame ${sample.frame}: OAM`);
   assert.equal(state.meter.position,native.position-origin,`side ${side}, frame ${sample.frame}: position`);
   assert.equal(state.meter.velocity,native.velocity,`side ${side}, frame ${sample.frame}: velocity`);
  }
 }
});
