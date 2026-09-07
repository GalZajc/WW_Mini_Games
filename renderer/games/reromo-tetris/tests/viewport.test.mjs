import test from 'node:test';
import assert from 'node:assert/strict';
import { createRockingViewport, rockingFrame, FRAME_INSET } from '../rocking-viewport.js';
import { fitMobiusTemplate } from '../projection-bounds.js';

test('rocking only expands the exceeded frame edge without changing floor or scale', () => {
    const camera = createRockingViewport({ width: 1280, height: 720, columns: 10, rows: 20, sag: 1.5 });
    const original = structuredClone(camera);
    const base = rockingFrame(camera, camera.base);
    const right = rockingFrame(camera, { ...camera.base, maxX: 14 });
    const top = rockingFrame(camera, { ...camera.base, minY: -27 });
    assert.equal(right.x, base.x);
    assert.equal(right.y, base.y);
    assert.ok(right.width > base.width);
    assert.ok(Math.abs(top.y + top.height - base.y - base.height) < 1e-9);
    assert.deepEqual(camera, original);
    assert.deepEqual(rockingFrame(camera, camera.base), base);
});

test('curve bounds fit actual quadratic extrema instead of control points', () => {
    const template = { subdivisions: 1, boundaryStride: 6, boundaryData: new Float32Array([0, 0, 1, 0, .5, 1]) };
    const board = { x: 10, y: 20, width: 400, height: 200 };
    const fitted = fitMobiusTemplate(template, board);
    // The curve reaches y=.5 even though its control point is at y=1.
    assert.equal(fitted.y, board.y + FRAME_INSET);
    assert.equal(fitted.y + .5 * fitted.size, board.y + board.height - FRAME_INSET);
    assert.ok(fitted.x >= board.x + FRAME_INSET);
});
