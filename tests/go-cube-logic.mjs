import assert from 'node:assert/strict';
import { GoCubeModel } from '../renderer/games/go-cube/game.js';

const topology = new GoCubeModel(5);
for (let face = 0; face < 6; face++) {
    for (let coordinate = 0; coordinate < topology.size; coordinate++) {
        for (const point of [
            { face, x: coordinate, y: 0 },
            { face, x: coordinate, y: topology.size - 1 },
            { face, x: 0, y: coordinate },
            { face, x: topology.size - 1, y: coordinate },
        ]) {
            for (const neighbor of topology.neighbors(point)) {
                assert.ok(topology.neighbors(neighbor).some(candidate =>
                    candidate.face === point.face && candidate.x === point.x && candidate.y === point.y
                ));
            }
        }
    }
}

const capture = new GoCubeModel(5);
capture.board.set('2-2-2', 2);
capture.board.set('2-1-2', 1);
capture.board.set('2-3-2', 1);
capture.board.set('2-2-1', 1);
capture.player = 1;
assert.equal(capture.place({ face: 2, x: 2, y: 3 }), true);
assert.equal(capture.board.has('2-2-2'), false);
assert.equal(capture.captures[1], 1);

assert.equal(capture.pass(), true);
assert.equal(capture.pass(), true);
assert.equal(capture.gameOver, true);
assert.ok(capture.scores[1].total >= capture.captures[1]);

console.log('Go Cube topology and capture tests passed.');
