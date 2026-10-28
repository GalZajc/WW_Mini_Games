import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_PIECE_MASKS} from '../renderer/games/eggo-mania/assets/native-piece-masks.js';
import {throwPiecePose,nativeReciprocal} from '../renderer/games/eggo-mania/view.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-throw-gba.json',import.meta.url),'utf8'));
test('native throw follows every recorded actor position and commits on frame twenty-eight',()=>{
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
 t.egg.x=(fixture.start_x+16)/16;t.egg.y=(720-fixture.start_y)/16;
 const mask=NATIVE_PIECE_MASKS[fixture.kind],minX=Math.min(...mask.map(c=>c[0])),maxY=Math.max(...mask.map(c=>c[1]));
 t.held={nativeKind:fixture.kind,nativeVariant:fixture.rotation,color:1,cells:mask.map(([x,y])=>[x-minX,maxY-y])};
 for(const sample of fixture.samples){
  t.update(RULES.step,{use:sample.frame===1,nativeMotion:true});
  assert.ok(Math.abs((t.egg.x-1)*16-sample.world_x)<1/65536,`frame ${sample.frame}: x`);
  assert.ok(Math.abs((45-t.egg.y)*16-sample.world_y)<1/65536,`frame ${sample.frame}: y`);
  assert.equal(Boolean(t.placing),sample.frame<28,`frame ${sample.frame}: placement`);
 }
 assert.equal(t.egg.vy,13.125);
 assert.equal(t.cell(2,1),1);assert.equal(t.cell(3,0),1);assert.equal(t.cell(4,0),1);
});
test('throw graphic position, growth and preceding-frame OAM matrix match native capture',()=>{
 const p={eggX:(fixture.start_x+16)/16,eggY:(720-fixture.start_y)/16,
  targetX:(fixture.target_x+16)/16,targetY:(720-fixture.target_y)/16};
 assert.equal(nativeReciprocal(14*65536),RULES.throwReciprocal);
 for(const sample of fixture.graphics){
  const pose=throwPiecePose(p,sample.frame-1);
  assert.equal(pose.x,Math.floor(sample.x));
  assert.ok(Math.abs(pose.worldY-sample.y)<1/65536,`frame ${sample.frame}: graphic y`);
  assert.equal(pose.scale,sample.scale,`frame ${sample.frame}: graphic scale`);
  assert.equal(throwPiecePose(p,sample.frame-2).matrix,sample.matrix,`frame ${sample.frame}: OAM matrix`);
 }
});
