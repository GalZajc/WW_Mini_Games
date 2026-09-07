import assert from 'node:assert/strict';
import { DEFAULT_GAME_ORDER, sortGamesByPriority } from '../renderer/core/GameLoader.js';

// 1. Verify exact length and IDs of DEFAULT_GAME_ORDER
assert.equal(DEFAULT_GAME_ORDER.length, 25);
assert.equal(DEFAULT_GAME_ORDER[0], 'reromo-tetris');
assert.equal(DEFAULT_GAME_ORDER[1], 'pogo-cloud-jump');
assert.equal(DEFAULT_GAME_ORDER[2], 'flappy');
assert.equal(DEFAULT_GAME_ORDER[3], 'sky-pilot-3d');
assert.equal(DEFAULT_GAME_ORDER[4], 'dino-runner');
assert.equal(DEFAULT_GAME_ORDER[5], 'rod-balance');
assert.equal(DEFAULT_GAME_ORDER[6], 'wheelie-balance');
assert.equal(DEFAULT_GAME_ORDER[7], 'cup-shuffle');
assert.equal(DEFAULT_GAME_ORDER[8], 'rubiks-cuboid');
assert.equal(DEFAULT_GAME_ORDER[9], 'robot-island');
assert.equal(DEFAULT_GAME_ORDER[10], 'curve-memory');
assert.equal(DEFAULT_GAME_ORDER[11], 'rhythm-memory');
assert.equal(DEFAULT_GAME_ORDER[12], 'number-memory');
assert.equal(DEFAULT_GAME_ORDER[13], 'reaction-time');
assert.equal(DEFAULT_GAME_ORDER[14], 'click-speed');
assert.equal(DEFAULT_GAME_ORDER[15], 'cup-and-ball');
assert.equal(DEFAULT_GAME_ORDER[16], 'n-in-a-row');
assert.equal(DEFAULT_GAME_ORDER[17], 'tic-tac-toe');
assert.equal(DEFAULT_GAME_ORDER[18], 'sudoku');
assert.equal(DEFAULT_GAME_ORDER[19], 'spherical-bowl-balance');
assert.equal(DEFAULT_GAME_ORDER[20], 'lava-path-tilt');
assert.equal(DEFAULT_GAME_ORDER[21], 'tarzan-swing');
assert.equal(DEFAULT_GAME_ORDER[22], 'standing-swing-jump');
assert.equal(DEFAULT_GAME_ORDER[23], 'card-lounge');
assert.equal(DEFAULT_GAME_ORDER[24], 'classic-board');

// 2. Test sorting a shuffled array of all 25 games
const shuffled = [...DEFAULT_GAME_ORDER]
    .map(id => ({ _id: id, name: id }))
    .sort(() => Math.random() - 0.5);

sortGamesByPriority(shuffled);
assert.deepEqual(
    shuffled.map(g => g._id),
    [...DEFAULT_GAME_ORDER],
    'Shuffled games must be sorted exactly to DEFAULT_GAME_ORDER',
);

// 3. Test that unranked / untested games appear at the end in alphabetical order
const withUntested = [
    { _id: 'zebra-test', name: 'Zebra Test' },
    { _id: 'pogo-cloud-jump', name: 'Pogo Jump' },
    { _id: 'alpha-prototype', name: 'Alpha Prototype' },
    { _id: 'reromo-tetris', name: 'ReRoMo Tetris' },
];

sortGamesByPriority(withUntested);
assert.deepEqual(
    withUntested.map(g => g._id),
    [
        'reromo-tetris',
        'pogo-cloud-jump',
        'alpha-prototype',
        'zebra-test',
    ],
    'Untested/unranked games must be placed at the end sorted alphabetically',
);

console.log('Game order logic tests passed.');
