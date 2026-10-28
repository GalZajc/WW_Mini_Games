import test from 'node:test';
import assert from 'node:assert/strict';
import {Tower,settings,randomFrom,RULES,nativeCellArt} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_PIECE_MASKS} from '../renderer/games/eggo-mania/assets/native-piece-masks.js';
import {NATIVE_ITEMS} from '../renderer/games/eggo-mania/assets/native-items.js';
import {nativePickupDisplayVariant,nativePreviewGridOrigin,pixelArtScale} from '../renderer/games/eggo-mania/pixel-renderer.js';
test('native placement keeps the raw template cell for every padded orientation',()=>{
 for(let rotation=0;rotation<4;rotation++)for(let kind=0;kind<8;kind++){
  const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
  const mask=NATIVE_PIECE_MASKS[rotation*8+kind],minX=Math.min(...mask.map(c=>c[0])),maxY=Math.max(...mask.map(c=>c[1]));
  t.held={nativeKind:kind,nativeVariant:rotation,color:1,cells:mask.map(([x,y])=>[x-minX,maxY-y])};
  const preview=t.preview();assert.ok(preview);
  for(let frame=0;frame<28;frame++)t.update(RULES.step,{use:frame===0});
  for(const [x,y] of mask){
   const row=preview.y+maxY-y,column=preview.x+x-minX;
   const r=mask.length===1?0:rotation; // 1x1: atlas rows 1-3 are not rotations
   assert.equal(t.rows[row].nativeArt[column],1+(r*8+kind)*9+y*3+x);
  }
 }
});
test('a whole-owner drop and a floor deletion preserve cell artwork without recomputing edges',()=>{
 const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
 const artA=nativeCellArt(6,0,0,1),artB=nativeCellArt(6,0,1,1);
 t.setCell(2,2,1,17,0,artA);t.setCell(3,2,1,17,0,artB);
 t.nativeFrame=2;t.advanceLoosePieces();
 assert.equal(t.rows[1].nativeArt[2],artA);assert.equal(t.rows[1].nativeArt[3],artB);
 assert.equal(t.rows[2].nativeArt[2],0);
 t.removeFloor(0);
 assert.equal(t.rows[0].nativeArt[2],artA);assert.equal(t.rows[0].nativeArt[3],artB);
 t.setCell(2,0,0);assert.equal(t.rows[0].nativeArt[2],0);
});
test('the native preview uses the current landing cell outside turns and only keeps the captured turn offset',()=>{
 const mask=NATIVE_PIECE_MASKS[0],minX=Math.min(...mask.map(([x])=>x)),maxY=Math.max(...mask.map(([,y])=>y)),
  preview={nativeKind:0,nativeRotation:0,x:4,y:6},live={x:preview.x-minX,y:preview.y+maxY+1},
  stale={spriteGridX:-10,spriteGridY:20.25,targetSpriteGridY:20,turn:null};
 assert.deepEqual(nativePreviewGridOrigin(preview,stale),live,
  'an idle preview follows the landing cell computed after this frame’s actor movement');
 assert.deepEqual(nativePreviewGridOrigin(preview,{...stale,turn:{tick:5}}),{x:live.x,y:live.y+0.25},
  'an active affine turn keeps its measured pixel offset relative to the live target');
});
test('held-piece artwork keeps its true rotation even when its occupied cells are symmetric',()=>{
 for(let kind=0;kind<8;kind++)for(let rotation=0;rotation<4;rotation++){
  const item={...NATIVE_ITEMS[rotation*13+kind],nativeKind:kind,nativeVariant:rotation};
  assert.equal(nativePickupDisplayVariant(item),rotation,`kind ${kind}, rotation ${rotation}`);
 }
});
test('the GBA scene uses whole-pixel enlargement when the window can fit it',()=>{
 assert.equal(pixelArtScale(240,160,1264,643),4);
 assert.equal(pixelArtScale(240,160,700,643),2,'do not crop a nearly-fitting integer scale');
 assert.equal(pixelArtScale(240,160,120,100),0.5,'allow fractional downscaling only when the native image cannot fit');
});
