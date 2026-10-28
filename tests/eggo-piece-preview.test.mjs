import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES,nativePreviewAngleStep,nativePreviewAngleMatrix} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_PIECE_MASKS} from '../renderer/games/eggo-mania/assets/native-piece-masks.js';
import EggoMania from '../renderer/games/eggo-mania/game.js';
import {nativePreviewRenderState} from '../renderer/games/eggo-mania/pixel-renderer.js';
import {nativeAffinePixelMap} from '../renderer/games/eggo-mania/view.js';

const reference=JSON.parse(readFileSync(new URL('./fixtures/eggo-preview-origin-oam-gba.json',import.meta.url),'utf8'));
const nativeCells=mask=>{const minX=Math.min(...mask.map(([x])=>x)),maxY=Math.max(...mask.map(([,y])=>y));
 return mask.map(([x,y])=>[x-minX,maxY-y]);};
function scene(field=0,kind=6,rotation=0){
 const tower=new Tower(settings({columns:7,hazards:false,waterSpeed:0}),randomFrom(42),field);
 tower.spawn=Infinity;tower.artStage='factory';
 Object.assign(tower.egg,{x:3.5,y:10,vy:0,ground:false});
 tower.held={nativeKind:kind,nativeVariant:rotation,cells:nativeCells(NATIVE_PIECE_MASKS[rotation*8+kind])};
 tower.advanceNativePreviewPosition();
 const game=Object.create(EggoMania.prototype);
 Object.assign(game,{views:[{camera:0},{camera:0}],camera:[0,0],nativeActorRandomSeed:27399,audio:null});
 return {tower,step:control=>game.updateTower(tower,RULES.step,{nativeMotion:true,nativeFreezeActor:true,...control},null)};
}

test('ROM angle recurrence reproduces all 48 captured quarter-turn matrices',()=>{
 for(let orientation=0;orientation<4;orientation++){
  let angle=orientation*RULES.nativeQuarterTurn;
  const target=((orientation+1)&3)*RULES.nativeQuarterTurn;
  for(const matrix of reference.clockwise_turn_matrices_by_start_orientation[orientation]){
   angle=nativePreviewAngleStep(angle,target);
   assert.deepEqual(nativePreviewAngleMatrix(angle),matrix);
  }
  assert.equal(((angle%RULES.nativeFullTurn)+RULES.nativeFullTurn)%RULES.nativeFullTurn,target);
 }
});

test('a new target changes the in-progress turn immediately, including reversal across zero',()=>{
 const {tower,step}=scene();step({rotate:1});
 assert.equal(tower.nativePreviewRotation.nativeAngle,0x1000000);
 assert.deepEqual(nativePreviewRenderState(tower).visual.affineMatrix,[256,0,0,256]);
 step({rotate:1});
 assert.equal(tower.nativePreviewRotation.nativeAngle,0x2c00000,
  'the second target is used by the next native approach, without a queued animation');
 const reverse=scene();reverse.step({rotate:-1});
 assert.equal(reverse.tower.nativePreviewRotation.nativeAngle,-0x1000000);
 reverse.step({rotate:1});assert.equal(reverse.tower.nativePreviewRotation.nativeAngle,-0xc00000);
});

test('outline position approaches in signed fixed point and snaps within two pixels',()=>{
 const {tower}=scene(),target={...tower.nativePreviewPosition};
 tower.nativePreviewPosition={xQ16:target.xQ16-16*65536,yQ16:target.yQ16+16*65536};
 tower.advanceNativePreviewPosition();
 assert.deepEqual(tower.nativePreviewPosition,{xQ16:target.xQ16-12*65536,yQ16:target.yQ16+12*65536});
 tower.nativePreviewPosition={xQ16:target.xQ16-2*65536,yQ16:target.yQ16+2*65536};
 tower.advanceNativePreviewPosition();assert.deepEqual(tower.nativePreviewPosition,target);
});

test('both fields retain the old outline on throw start, including a rising player',()=>{
 for(const field of [0,1]){
  const {tower,step}=scene(field,6,3),before=tower.preview();step({use:true});
  assert.equal(tower.held,null);assert.ok(tower.placing);
  tower.nativeRenderFrame.animationPose={state:'rise'};
  const shown=nativePreviewRenderState(tower);
  assert.equal(shown.preview.nativeKind,before.nativeKind);
  assert.equal(shown.preview.nativeRotation,before.nativeRotation);
  assert.deepEqual(shown.visual.affineMatrix,[0,-256,256,0]);
 }
});

test('an outline waits for native position initialization',()=>{
 const {tower,step}=scene();tower.nativePreviewPosition=null;
 step({});assert.equal(nativePreviewRenderState(tower).preview,null);
 step({});assert.ok(nativePreviewRenderState(tower).preview);
});

test('native affine mapping uses the hardware center pixel and clips the OBJ box',()=>{
 const identity=nativeAffinePixelMap(0),clockwise=nativeAffinePixelMap([0,256,-256,0]);
 for(let i=0;i<64*64;i++)assert.equal(identity[i],i);
 assert.equal(clockwise[32*64+32],32*64+32);
 assert.equal(clockwise[32*64+33],31*64+32);
 assert.equal(clockwise[33*64+32],32*64+33);
 assert.ok(nativeAffinePixelMap(Math.PI/4).some(index=>index<0));
});
