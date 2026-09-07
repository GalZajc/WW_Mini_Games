import test from 'node:test';
import assert from 'node:assert/strict';
import Game from '../game.js';
import { createDefaultSettings, normalizeBindings } from '../settings.js';
import { normalizeStructuralPhysics } from '../structural-stability.js';
import { rockingGeometry } from '../rocking-physics.js';

function fixture() {
    const game = Object.create(Game.prototype);
    Object.assign(game, {
        rows: 8, columns: 10, state: 'playing', currentPiece: null, rocking: null, rockingShape: null,
        settings: { ...createDefaultSettings(), mode: 'structural' },
        structuralPhysics: normalizeStructuralPhysics({ walls: false }),
        overhangGrid: new Map(), grid: Array.from({ length: 8 }, () => new Int32Array(10)),
        structuralBodyGrid: Array.from({ length: 8 }, () => new Int32Array(10)),
        gameSpeed: 50, lineClear: null, spawnCount: 0,
        invalidate() {}, _resetRepeats() {}, _refreshPieceProjection() {},
        _spawnPiece() { this.spawnCount++; this.currentPiece = { fixture: true }; },
        _gameOver(reason) { this.state = 'gameover'; this.gameOverReason = reason; },
    });
    game.pieceIdentityGrid = game.structuralBodyGrid;
    return game;
}

test('gentle rocking of a supported high-friction pile stays in statics', () => {
    const game = fixture();
    game.settings.mode = 'rocking';
    game.structuralPhysics = normalizeStructuralPhysics({ walls: false, pieceFriction: 1000, platformFriction: 1000 });
    game.rockingShape = rockingGeometry(3, 60, 20);
    game.rocking = { angle: .015, omega: .02, alpha: 0, tipped: false };
    game._rebuildProjectionCache = () => {};
    for (let row = 5; row < 8; row++) for (const column of [4, 5])
        game._storeLockedCell({ row, column, value: 1, bodyId: row * 10 + column });
    game._refreshRockingMass();
    for (let i = 0; i < 30; i++) game._updateRocking(1 / 120);
    assert.equal(game.state, 'playing');
    assert.equal(game.collapseSimulation, undefined);
});

test('an accelerating near-balanced overhang falls instead of repeatedly restoring', () => {
    const game = fixture();
    game.settings.mode = 'rocking';
    game.structuralPhysics = normalizeStructuralPhysics({ pieceFriction: .5, platformFriction: 1, wallFriction: .5, walls: true });
    game.rockingShape = rockingGeometry(3, 80, 20);
    game.rocking = { angle: .025, omega: .02, alpha: 0, tipped: false };
    game._rebuildProjectionCache = () => {};
    const bottom = [
        [0,0,0,0,0,0,11,12,0,0], [0,0,0,0,0,0,11,11,0,0],
        [6,0,0,10,0,0,9,0,0,0], [6,6,0,8,0,0,9,0,0,0],
        [0,3,0,1,0,7,9,9,5,0], [0,3,0,1,0,7,7,0,5,0],
        [0,3,3,1,1,2,0,4,5,5],
    ];
    bottom.forEach((row, r) => row.forEach((id, column) => {
        if (id) game._storeLockedCell({ row: r + 1, column, value: id, bodyId: id });
    }));
    game._refreshRockingMass();
    assert.equal(game._beginStructuralToppleIfNeeded(), true);
    assert.deepEqual(game.structuralAnalysis.instability.bodyIds, [11, 12]);
    // These two pieces balance at a support edge on a level stationary deck.
    // Here the deck acceleration creates a real clockwise tipping moment.
    assert.ok(game.structuralAnalysis.instability.netTorqueNm > .4);
    let observedFall = false;
    for (let i = 0; i < 481 && game.state === 'toppling'; i++) {
        game._updateToppling(1 / 60);
        const s = game.collapseSnapshot;
        observedFall ||= Math.abs(s.bodies.find(b => b.id === 11).angle - s.platform.angle) > .5;
        assert.notEqual(game.state, 'recovering', 'the unstable arrangement must not be restored mid-fall');
    }
    assert.ok(observedFall, 'contact position corrections must not freeze the falling body');
    assert.equal(game.state, 'gameover');
});

test('the pictured low pile remains in statics over a complete rocking cycle', () => {
    const game = fixture();
    game.settings.mode = 'rocking';
    game.structuralPhysics = normalizeStructuralPhysics({ pieceFriction: .5, platformFriction: 1, wallFriction: .5, walls: true });
    game.rockingShape = rockingGeometry(3, 80, 20);
    game.rocking = { angle: 0, omega: 0, alpha: 0, tipped: false };
    game._rebuildProjectionCache = () => {};
    const groups = [
        [[7,0],[7,1],[7,2],[7,3],[6,1]], [[4,0],[5,0],[6,0]],
        [[4,1],[5,1],[5,2],[6,2]], [[6,6],[7,6],[7,7],[7,8],[7,9]],
    ];
    groups.forEach((cells, i) => cells.forEach(([row, column]) => game._storeLockedCell({ row, column, value: i + 1, bodyId: i + 1 })));
    game._refreshRockingMass();
    for (let i = 0; i < 360; i++) {
        game._updateRocking(1 / 60);
        assert.equal(game.state, 'playing');
    }
});

test('a detached stack lands in integer steps and resumes without game over', () => {
    const game = fixture();
    game._storeLockedCell({ row: 2, column: 4, value: 1, bodyId: 1 });
    game._storeLockedCell({ row: 3, column: 4, value: 1, bodyId: 2 });
    assert.equal(game._beginStructuralToppleIfNeeded(), true);
    assert.equal(game.state, 'settling-grid');
    assert.equal(game._lockedCells().length, 0);
    game._updateGridFalling(0.05);
    assert.deepEqual(game.gridFalling.bodies.map(cells => cells[0].row).sort(), [3, 4]);
    for (let i = 0; i < 12 && game.state === 'settling-grid'; i++) game._updateGridFalling(0.05);
    assert.equal(game.state, 'playing');
    assert.equal(game.spawnCount, 1);
    assert.equal(game.structuralBodyGrid[6][4], 1);
    assert.equal(game.structuralBodyGrid[7][4], 2);
    assert.equal(game.structuralAnalysis.stable, true);
});

test('5×1 overhang with only two supported cells enters rigid collapse', () => {
    const game = fixture();
    for (let column = -3; column < 2; column++) game._storeLockedCell({ row: 7, column, value: 1, bodyId: 1 });
    assert.equal(game._beginStructuralToppleIfNeeded(), true);
    assert.equal(game.state, 'toppling');
    assert.equal(game.gridFalling, null);
    assert.equal(game.collapseSnapshot.bodies.length, 1);
    for (let i = 0; i < 60; i++) game._updateToppling(1 / 120);
    assert.ok(Math.abs(game.collapseSnapshot.bodies[0].angle) > 0.01);
    assert.equal(game.collapseSnapshot.bodies[0].cells.length, 5);
});

test('wall friction without a normal load does not turn pure descent into game over', () => {
    const game = fixture();
    game.structuralPhysics = normalizeStructuralPhysics({ walls: true, wallFriction: 1 });
    game._storeLockedCell({ row: 4, column: 0, value: 1, bodyId: 1 });
    game._beginStructuralToppleIfNeeded();
    assert.equal(game.state, 'settling-grid');
    for (let i = 0; i < 8 && game.state === 'settling-grid'; i++) game._updateGridFalling(0.05);
    assert.equal(game.state, 'playing');
    assert.equal(game.structuralBodyGrid[7][0], 1);
});

test('a wholly off-platform vertical miss leaves no frozen mass and continues', () => {
    const game = fixture();
    game.settings.mode = 'rocking'; game.settings.rockingAllowOverhang = true;
    game.currentPiece = { entry: { index: 0 }, r: 7, phi: -1, rotation: 0 };
    game._blocksFor = () => [{ r: 7, phi: -1 }];
    game._isValidState = () => false;
    game._lockPiece();
    assert.equal(game.state, 'playing');
    assert.equal(game.spawnCount, 1);
    assert.equal(game._lockedCells().length, 0);
});

test('stable recovery glows before committing and starts the next piece', () => {
    const game = fixture();
    game.state = 'toppling';
    game._rebuildProjectionCache = () => {};
    const recovered = { cells: [{ row: 7, column: 4, value: 1, bodyId: 1 }] };
    assert.equal(game._prepareGridRecovery(recovered), true);
    assert.equal(game.state, 'recovering');
    assert.equal(game._lockedCells().length, 0);
    game._updateGridRecovery(.25);
    assert.equal(game.state, 'recovering');
    game._updateGridRecovery(.25);
    assert.equal(game.state, 'playing');
    assert.equal(game._lockedCells().length, 1);
    assert.equal(game.spawnCount, 1);
    assert.equal(game.collapseSnapshot, null);
});

test('a static prediction cannot veto geometrically aligned recovery', () => {
    const game = fixture();
    const cells = [-3, -2, -1, 0, 1].map(column => ({ row: 7, column, value: 1, bodyId: 1 }));
    assert.equal(game._prepareGridRecovery({ cells }), true);
    assert.equal(game._lockedCells().length, 0);
});

test('playing with an empty active-piece slot repairs the spawn lifecycle', () => {
    const game = fixture();
    game.input = { isActionJustDown: () => false };
    game._updateComboReleaseLock = () => true;
    game.update(1 / 60);
    assert.equal(game.spawnCount, 1);
    assert.ok(game.currentPiece);
});

test('elapsed time alone cannot declare a structure toppled', () => {
    const game = fixture();
    game.state = 'toppling'; game.toppling = { reason: 'topple' };
    game.collapseSimulation = { step() {}, snapshot: () => ({ elapsed: 8, settled: false, timedOut: true }) };
    game._updateToppling(1 / 60);
    assert.equal(game.state, 'toppling');
});

test('collapse continues past 15 seconds until rest or a manual check', () => {
    for (const offsetCells of [0, .2]) {
        const game = fixture();
        game.state = 'toppling'; game.toppling = { reason: 'topple', elapsed: 14.9 };
        const s = game.structuralPhysics.cellSizeMeters;
        const snapshot = { elapsed: 14.9, settled: false, relativeSettled: false,
            bodies: [{ id: 1, x: (-.5 + offsetCells) * s, y: -.5 * s, angle: 0,
                cells: [{ x: 0, y: 0, value: 1 }] }] };
        game.collapseSimulation = { step(dt) { snapshot.elapsed += dt; }, snapshot: () => snapshot };
        game._updateToppling(.05);
        assert.equal(game.state, 'toppling');
        game._updateToppling(.5);
        assert.ok(Math.abs(snapshot.elapsed - 15.45) < 1e-10);
        assert.equal(game.state, 'toppling');
        game._updateToppling(0, true);
        assert.equal(game.state, offsetCells === 0 ? 'recovering' : 'gameover');
    }
});

test('remappable collapse check immediately decides the current snapshot', () => {
    assert.equal(normalizeBindings({}).checkCollapse[0].key, 'Enter');
    const binding = { type: 'keyboard', code: 'KeyG', key: 'g', match: 'key' };
    assert.deepEqual(normalizeBindings({ checkCollapse: [binding] }).checkCollapse, [binding]);
    for (const offsetCells of [0, .2]) {
        const game = fixture();
        game.state = 'toppling'; game.toppling = { reason: 'topple', elapsed: .3 };
        game.input = { isActionJustDown: action => action === 'checkCollapse' };
        const s = game.structuralPhysics.cellSizeMeters;
        const snapshot = { elapsed: .3, settled: false, relativeSettled: false,
            bodies: [{ id: 1, x: (-.5 + offsetCells) * s, y: -.5 * s, angle: 0,
                cells: [{ x: 0, y: 0, value: 1 }] }] };
        game.collapseSimulation = { step(dt) { assert.equal(dt, 0); }, snapshot: () => snapshot };
        game.update(1 / 60);
        assert.equal(game.state, offsetCells === 0 ? 'recovering' : 'gameover');
    }
});

test('collapse consumes the full slow frame and reuses the integrator snapshot', () => {
    const game = fixture();
    game.state = 'toppling'; game.toppling = { reason: 'topple', elapsed: 0 };
    game.input = { isActionJustDown: () => false };
    let simulated = 0;
    game.collapseSimulation = {
        step(dt) { simulated += dt; return { elapsed: simulated, bodies: [] }; },
        snapshot() { assert.fail('the snapshot returned by step must not be built twice'); },
    };
    game.update(.05, .15);
    assert.equal(simulated, .15);
    assert.equal(game.toppling.elapsed, .15);
    assert.equal(game.state, 'toppling');
});

test('settled rigid snapshot follows recovery and resumes the game', () => {
    const game = fixture();
    game.state = 'toppling'; game.toppling = { reason: 'slide' };
    game._rebuildProjectionCache = () => {};
    const s = game.structuralPhysics.cellSizeMeters;
    const snapshot = { elapsed: 2, settled: true, hasRestContacts: true, timedOut: false, platform: null,
        bodies: [{ id: 1, x: -.5 * s, y: -.5 * s, angle: 0, cells: [{ x: 0, y: 0, value: 1 }] }] };
    game.collapseSimulation = { step() {}, snapshot: () => snapshot };
    game._updateToppling(1 / 60);
    assert.equal(game.state, 'toppling');
    snapshot.elapsed = 3.1;
    game._updateToppling(1 / 60);
    assert.equal(game.state, 'recovering');
    game._updateGridRecovery(.5);
    assert.equal(game.state, 'playing');
    assert.equal(game.spawnCount, 1);
});

test('time limit cannot recover a grid-aligned stack that has not settled', () => {
    const game = fixture();
    game.state = 'toppling'; game.toppling = { reason: 'topple' };
    const s = game.structuralPhysics.cellSizeMeters;
    game.collapseSimulation = { step() {}, snapshot: () => ({ elapsed: 8, settled: false, timedOut: true,
        bodies: [{ id: 1, x: -.5 * s, y: -.5 * s, angle: 0, cells: [{ x: 0, y: 0, value: 1 }] }] }) };
    game._updateToppling(1 / 60);
    assert.equal(game.state, 'toppling');
});
