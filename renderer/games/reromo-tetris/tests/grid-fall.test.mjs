import test from 'node:test';
import assert from 'node:assert/strict';
import { findGridFallBodies } from '../grid-fall.js';

const physics = { walls: true, pieceFriction: 0, wallFriction: 0 };
const cell = (row, column, bodyId) => ({ row, column, bodyId, value: 1 });
test('a disconnected vertical stack falls together; anchored stack stays', () => {
    const cells = [cell(2, 2, 1), cell(3, 2, 2), cell(4, 5, 3), cell(5, 5, 4)];
    assert.deepEqual([...findGridFallBodies(cells, 6, 8, physics)].sort(), [1, 2]);
});
test('a partly supported cantilever must use rigid dynamics, not grid falling', () => {
    const rod = Array.from({ length: 5 }, (_, i) => cell(5, i - 3, 1));
    assert.equal(findGridFallBodies(rod, 6, 8, physics).size, 0);
    assert.deepEqual([...findGridFallBodies([cell(5, -2, 2)], 6, 8, physics)], [2]);
});
test('unsupported cells use grid descent even with extreme side friction', () => {
    const cells = [cell(3, 0, 1), cell(4, 0, 2)];
    assert.equal(findGridFallBodies(cells, 6, 8, { ...physics, wallFriction: 1000, pieceFriction: 1000 }).size, 2);
    assert.equal(findGridFallBodies(cells, 6, 8, physics).size, 2);
});
