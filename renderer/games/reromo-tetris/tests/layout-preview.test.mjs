import test from 'node:test';
import assert from 'node:assert/strict';
import { LayoutEditor } from '../../../core/LayoutEditor.js';

test('frame preview stays upright and preserves its floor and scale while dragging', () => {
    const editor = Object.create(LayoutEditor.prototype);
    const coordinates = [];
    const context = new Proxy({}, { get: (target, key) => target[key] || ((...args) => {
        if (['moveTo', 'lineTo', 'arc'].includes(key)) coordinates.push(...args.slice(0, 2));
    }) });
    const canvas = { width: 640, height: 300, getContext: () => context,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 300 }) };
    const preview = { rows: 20, columns: 10, groundY: 1,
        gridCorners: [{x:-5,y:-20},{x:5,y:-20},{x:5,y:0},{x:-5,y:0}],
        platformArc: [{x:-5,y:0},{x:0,y:1},{x:5,y:0}],
        frameBounds: { minX: -5, maxX: 5, minY: -20, maxY: 1 } };
    editor._drawFramePreview(canvas, preview);
    const before = { ...editor._frameCanvasTransform };
    editor._drawFramePreview(canvas, { ...preview, frameBounds: { minX:-7,maxX:7,minY:-22,maxY:1 } });
    const after = editor._frameCanvasTransform;
    for (const key of ['scale', 'originX', 'originY']) assert.equal(after[key], before[key]);
    assert.ok(coordinates.every(Number.isFinite));
    assert.equal(after.originY + preview.groundY * after.scale, 270);
    assert.ok(after.originY - 20 * after.scale < 270);
    const values = {};
    editor._frameData = preview; editor._frameDrag = { kind: 'top' };
    editor.root = { querySelector: () => canvas };
    editor._setNumberInput = (key, value) => { values[key] = value; };
    editor._scheduleFramePreview = () => {};
    editor._handleFramePointerMove({ clientX: after.originX, clientY: after.originY - 22 * after.scale, preventDefault() {} });
    assert.equal(values.rockingFrameHeadroomCells, 2);
});
