import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeSkeletalFishMatrix} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-fish-affine-gba.json',import.meta.url),'utf8'));
test('skeletal fish faces along both native arcs with the exact recorded OAM matrices',()=>{
 assert.ok(fixture.cases.length>=10,'both native fields must be covered');
 for(const sample of fixture.cases)
  assert.deepEqual(nativeSkeletalFishMatrix(sample.angle,sample.variant),sample.matrix,`side ${sample.side}, frame ${sample.frame}`);
});
