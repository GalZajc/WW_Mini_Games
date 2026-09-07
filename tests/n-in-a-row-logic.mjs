import assert from 'node:assert/strict';
import { NInRowBoard } from '../renderer/games/n-in-a-row/game.js';

const rotated = new NInRowBoard(3, 4, 3);
rotated.grid[3][0] = 1;
rotated.grid[2][2] = 2;
rotated.rotate(1);
assert.equal(rotated.columns, 4);
assert.equal(rotated.rows, 3);
rotated.settle();
assert.equal(rotated.grid[2].filter(Boolean).length, 2);

const shot = new NInRowBoard(5, 4, 4);
assert.deepEqual(shot.shoot('left', 2, 1, false), { row: 2, column: 4 });
assert.deepEqual(shot.shoot('left', 2, 2, false), { row: 2, column: 3 });
assert.deepEqual(shot.shoot('top', 0, 1, false), { row: 3, column: 0 });

const pushed = new NInRowBoard(5, 4, 4);
pushed.grid[1][0] = 1;
pushed.grid[1][1] = 2;
assert.deepEqual(pushed.shoot('left', 1, 1, true), { row: 1, column: 2 });
assert.deepEqual(pushed.grid[1], [0, 0, 1, 1, 2]);
const emptyPush = new NInRowBoard(5, 4, 4);
assert.deepEqual(emptyPush.shoot('right', 2, 2, true), { row: 2, column: 0 });
assert.deepEqual(emptyPush.grid[2], [2, 0, 0, 0, 0]);

const win = new NInRowBoard(7, 6, 4);
for (let column = 1; column <= 4; column++) win.grid[5][column] = 2;
assert.equal(win.winningCells(2).length, 4);
assert.equal(win.winningCells(1).length, 0);

console.log('N-in-a-row logic tests passed.');
