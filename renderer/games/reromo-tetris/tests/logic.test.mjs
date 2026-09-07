import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { performance } from 'node:perf_hooks';

import {
    buildWeightedSampler,
    decodePolyomino,
    defaultOrderWeights,
    getActivePiecePreviewBounds,
    getPieceGeometry,
    getPreviewCells,
    MAX_POLYOMINO_ORDER,
    POLYOMINO_CATALOG,
    POLYOMINO_COUNTS,
} from '../polyominoes.js';
import ReRoMoTetris from '../game.js';
import {
    buildMobiusMesh,
    buildMobiusTemplate,
    decodeMobiusTemplate,
    encodeMobiusTemplate,
    mobiusPoint,
    pairedMobiusPointError,
    TAU,
} from '../mobius-geometry.js';
import {
    GRID_PRESETS,
    mobiusTemplateCacheKey,
} from '../projection-cache.js';
import {
    CONTROL_DEFINITIONS,
    createDefaultSettings,
    getDefaultBindings,
    getFrameworkSettingsSchema,
    importPayload,
    normalizeBindings,
    normalizeSettings,
    SETTINGS_GROUPS,
    settingsRecordKey,
    validateSettings,
} from '../settings.js';
import {
    analyzeStructuralStability,
    splitDisconnectedBodies,
} from '../structural-stability.js';

const EXPECTED_COUNTS = [0, 1, 1, 2, 7, 18, 60, 196, 704, 2500, 9189];

test('zero speed increase is accepted as a constant-speed profile', () => {
    const settings = createDefaultSettings();
    settings.speedIncrease = 0;
    assert.equal(validateSettings(settings), true);
});

test('zero initial speed uses the bounded fastest-drop profile', () => {
    const settings = createDefaultSettings();
    settings.initialSpeed = 0;
    assert.equal(validateSettings(settings), true);
});

test('zero speed increase keeps the drop interval constant after a level-up', () => {
    const game = Object.create(ReRoMoTetris.prototype);
    game.settings = {
        initialSpeed: 400,
        speedIncrease: 0,
        initialLockDelay: 1500,
        lockDelayDecrease: 80,
    };
    game.linesCleared = 9;
    game.level = 1;
    game.gameSpeed = 400;
    game.lockDelay = 1500;
    game.state = 'playing';
    game.structuralBodyGrid = null;
    game.canHold = false;
    game._updateHighValues = () => {};
    game._saveLegacyHighScores = () => {};
    game._beginStructuralToppleIfNeeded = () => false;
    game._spawnPiece = () => {};
    game.invalidate = () => {};
    game._completeLineClear(1);
    assert.equal(game.level, 2);
    assert.equal(game.gameSpeed, 400);
});

test('game card uses the programmatic 16:10 polar T icon', () => {
    const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
    assert.equal(config.iconImage, 'icon.svg');
    const svg = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8');
    assert.match(svg, /viewBox="0 0 1024 640"/);
    const tetrominoGroup = svg.match(/<g transform="translate\(0 20\)" fill="url\(#t-purple\)"[\s\S]*?<\/g>/)?.[0] || '';
    assert.equal((tetrominoGroup.match(/<path\b/g) || []).length, 4);
    assert.doesNotMatch(svg, /<text\b/i);
});

function isConnected(cells) {
    const remaining = new Set(cells.map(([row, column]) => `${row},${column}`));
    const queue = [cells[0]];
    remaining.delete(`${cells[0][0]},${cells[0][1]}`);
    while (queue.length) {
        const [row, column] = queue.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const key = `${row + dr},${column + dc}`;
            if (!remaining.delete(key)) continue;
            queue.push([row + dr, column + dc]);
        }
    }
    return remaining.size === 0;
}

function normalizedCellSignature(cells) {
    const minRow = Math.min(...cells.map(cell => cell[0]));
    const minColumn = Math.min(...cells.map(cell => cell[1]));
    return cells
        .map(([row, column]) => `${row - minRow},${column - minColumn}`)
        .sort()
        .join(';');
}

function oneSidedSignature(cells) {
    const signatures = [];
    let rotated = cells.map(cell => [...cell]);
    for (let turn = 0; turn < 4; turn++) {
        signatures.push(normalizedCellSignature(rotated));
        rotated = rotated.map(([row, column]) => [column, -row]);
    }
    return signatures.sort()[0];
}

test('catalog contains every one-sided 1–10-omino exactly once', () => {
    assert.deepEqual([...POLYOMINO_COUNTS], EXPECTED_COUNTS);
    assert.equal(POLYOMINO_CATALOG.all.length, 12678);
    const ids = new Set();
    for (let order = 1; order <= MAX_POLYOMINO_ORDER; order++) {
        assert.equal(POLYOMINO_CATALOG.byOrder[order].length, EXPECTED_COUNTS[order]);
        const rotationalClasses = new Set();
        for (const entry of POLYOMINO_CATALOG.byOrder[order]) {
            assert.equal(entry.order, order);
            const cells = decodePolyomino(entry.encoded);
            assert.equal(cells.length, order);
            assert.ok(isConnected(cells), `Disconnected ${entry.id}`);
            assert.ok(!ids.has(entry.id), `Duplicate ${entry.id}`);
            ids.add(entry.id);
            const signature = oneSidedSignature(cells);
            assert.ok(!rotationalClasses.has(signature), `Rotation/translation duplicate ${entry.id}`);
            rotationalClasses.add(signature);
        }
    }
});

test('tetromino defaults are the seven classic pieces with their legacy rotations', () => {
    const names = POLYOMINO_CATALOG.byOrder[4].map(entry => entry.classicName).sort();
    assert.deepEqual(names, ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
    for (const entry of POLYOMINO_CATALOG.byOrder[4]) {
        const geometry = getPieceGeometry(entry);
        assert.equal(geometry.rotations.length, 4);
        assert.equal(geometry.rotations[0].length, 4);
        assert.equal(geometry.rotates, entry.classicName !== 'O');
        if (entry.classicName === 'T') {
            assert.equal(geometry.rotations[0].filter(cell => cell.r === -1).length, 1);
            assert.equal(geometry.rotations[0].filter(cell => cell.r === 0).length, 3);
            assert.deepEqual(getPreviewCells(entry), [[0, 1], [1, 0], [1, 1], [1, 2]]);
        }
    }
});

test('ordinary Cartesian pieces keep catalogue chirality for every polyomino', () => {
    const game = Object.create(ReRoMoTetris.prototype);
    game.settings = { mode: 'rectangular' };
    game.columns = 256;
    for (const entry of POLYOMINO_CATALOG.all) {
        const piece = { entry, r: 20, phi: 20, rotation: 0 };
        const boardCells = game._blocksFor(piece).map(block => [block.r, block.phi]);
        assert.equal(
            oneSidedSignature(boardCells),
            oneSidedSignature(getPreviewCells(entry)),
            `Cartesian board mirrored ${entry.id}`,
        );
    }
});

test('HOLD and NEXT derive one shared field scale from all enabled pieces', () => {
    const defaults = defaultOrderWeights();
    assert.deepEqual(getActivePiecePreviewBounds(defaults, {}), {
        rows: 3,
        columns: 4,
        count: 7,
    });

    const monomino = POLYOMINO_CATALOG.byOrder[1][0];
    const wideAndTall = POLYOMINO_CATALOG.byId.get('10:00010203040510203040');
    const disabledOrders = Object.fromEntries(
        Array.from({ length: MAX_POLYOMINO_ORDER }, (_, index) => [index + 1, 0]),
    );
    assert.deepEqual(getActivePiecePreviewBounds(disabledOrders, {
        [monomino.id]: 1,
        [wideAndTall.id]: 1,
    }), {
        rows: 5,
        columns: 6,
        count: 2,
    });
});

test('next-piece queue follows the configured preview count', () => {
    const game = Object.create(ReRoMoTetris.prototype);
    const monomino = POLYOMINO_CATALOG.byOrder[1][0];
    game.settings = { nextPreviewCount: 4 };
    game.nextPieces = [];
    game.sampler = { sample: () => monomino };
    game._fillQueue();
    assert.equal(game.nextPieces.length, 5);

    game.settings.nextPreviewCount = 1;
    game.nextPieces = [];
    game._fillQueue();
    assert.equal(game.nextPieces.length, 2);
});

test('Cartesian wall rotations use only the minimum wall translation', () => {
    const makeGame = () => {
        const game = Object.create(ReRoMoTetris.prototype);
        game.settings = { mode: 'rectangular' };
        game.rows = 20;
        game.columns = 10;
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.lineClear = null;
        game.dirty = false;
        return game;
    };
    const entry = POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');

    const left = makeGame();
    left.currentPiece = { entry, r: 4, phi: 0, rotation: 3 };
    assert.equal(left._rotatePiece(1), true);
    assert.deepEqual(
        { phi: left.currentPiece.phi, rotation: left.currentPiece.rotation },
        { phi: 1, rotation: 0 },
    );

    const right = makeGame();
    right.currentPiece = { entry, r: 4, phi: 9, rotation: 1 };
    assert.equal(right._rotatePiece(1), true);
    assert.deepEqual(
        { phi: right.currentPiece.phi, rotation: right.currentPiece.rotation },
        { phi: 8, rotation: 2 },
    );

    const blocked = makeGame();
    blocked.currentPiece = { entry, r: 4, phi: 0, rotation: 3 };
    blocked.grid[4][2] = entry.index + 1;
    assert.equal(blocked._rotatePiece(1), false);
    assert.deepEqual(
        { phi: blocked.currentPiece.phi, rotation: blocked.currentPiece.rotation },
        { phi: 0, rotation: 3 },
    );
});

test('Cartesian frame follows the rectangular grid instead of its square layout slot', () => {
    const game = Object.create(ReRoMoTetris.prototype);
    game.settings = { mode: 'rectangular' };
    game.layout = { board: { x: 10, y: 20, size: 640 } };
    game.projection = {
        rectangular: { x: 170, y: 20, gridWidth: 320, gridHeight: 640 },
    };
    assert.deepEqual(game._boardFrameRect(), { x: 170, y: 20, width: 320, height: 640 });
    Object.defineProperties(game, { w: { value: 1280 }, h: { value: 720 } });
    game.columns = 10; game.rows = 20;
    game.layout = game._calculateLayout();
    assert.equal(game.layout.hud.x, game.layout.board.x + game.layout.board.width + 6);
    assert.equal(game.layout.hud.y, game.layout.board.y);
    assert.equal(game.layout.hud.height, game.layout.board.height);
    assert.equal(game.layout.board.height, 704);
    assert.equal(game.layout.board.width, 352);
});

test('left/down and right/down expose all four release-lock continuations', () => {
    const monomino = POLYOMINO_CATALOG.byOrder[1][0];
    const actions = ['moveClockwise', 'moveCounterClockwise'];
    for (const firstAction of actions) {
        for (const thirdAction of actions) {
            const game = Object.create(ReRoMoTetris.prototype);
            game.settings = { mode: 'rectangular', comboTime: 120 };
            game.rows = 20;
            game.columns = 10;
            game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
            game.currentPiece = { entry: monomino, r: 0, phi: 5, rotation: 0 };
            game.horizontal = { action: null, direction: 0, elapsed: 0, repeatElapsed: 0, repeating: false };
            game.gravityElapsed = 0;
            game.groundedElapsed = 0;
            game.softDropActive = false;
            game.softDropElapsed = 0;
            game.lastSoftDropPressTime = -Infinity;
            game.lastHorizontalComboPress = null;
            game.comboReleaseLock = null;
            game.lineClear = null;
            game.state = 'playing';
            game.dirty = false;

            game._performHorizontalDropCombo(firstAction);
            assert.equal(game.currentPiece.r, 19);
            assert.equal(game.currentPiece.phi, firstAction === 'moveClockwise' ? 0 : 9);

            game.input = {
                isActionJustDown: action => action === thirdAction,
                isActionJustUp: () => false,
            };
            assert.equal(game._updateHorizontalDropCombo(1), true);
            assert.equal(game.comboReleaseLock.action, thirdAction);
            assert.equal(
                game.currentPiece.phi,
                firstAction === 'moveClockwise'
                    ? (thirdAction === 'moveCounterClockwise' ? 1 : 0)
                    : (thirdAction === 'moveClockwise' ? 8 : 9),
            );
        }
    }
});

test('two-key horizontal/down combo waits for the configurable combo window', () => {
    const game = Object.create(ReRoMoTetris.prototype);
    const monomino = POLYOMINO_CATALOG.byOrder[1][0];
    game.settings = { mode: 'rectangular', comboTime: 120 };
    game.rows = 20;
    game.columns = 10;
    game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
    game.currentPiece = { entry: monomino, r: 0, phi: 5, rotation: 0 };
    game.horizontal = { action: null, direction: 0, elapsed: 0, repeatElapsed: 0, repeating: false };
    game.gravityElapsed = 0;
    game.groundedElapsed = 0;
    game.softDropActive = false;
    game.softDropElapsed = 0;
    game.lastSoftDropPressTime = -Infinity;
    game.lastHorizontalComboPress = null;
    game.comboReleaseLock = null;
    game.dirty = false;
    game.input = { isActionJustDown: () => false };
    let locks = 0;
    game._lockPiece = () => locks++;

    game._performHorizontalDropCombo('moveClockwise');
    game._updateHorizontalDropCombo(119);
    assert.equal(locks, 0);
    game._updateHorizontalDropCombo(1);
    assert.equal(locks, 1);
});

test('release-lock combo ends immediately when a lateral move leaves support', () => {
    const game = Object.create(ReRoMoTetris.prototype);
    const monomino = POLYOMINO_CATALOG.byOrder[1][0];
    game.settings = { mode: 'rectangular' };
    game.rows = 10;
    game.columns = 10;
    game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
    game.grid[6][1] = monomino.index + 1;
    game.currentPiece = { entry: monomino, r: 5, phi: 1, rotation: 0 };
    game.comboReleaseLock = { action: 'moveCounterClockwise', piece: game.currentPiece };
    game.lineClear = null;
    game.state = 'playing';
    game.gameSpeed = 400;
    game.gravityElapsed = 50;
    game.groundedElapsed = 100;
    game.softDropActive = false;
    game.dirty = false;

    assert.equal(game._movePiece(0, 1), true);
    assert.equal(game.currentPiece.phi, 2);
    assert.equal(game.comboReleaseLock, null);
    assert.equal(game.groundedElapsed, 0);
    assert.equal(game.gravityElapsed, 400);
    game._updateGravityAndLock(0);
    assert.equal(game.currentPiece.r, 6);
});

test('landing and locking emit distinct volume-scaled effects exactly once', () => {
    const game = Object.create(ReRoMoTetris.prototype);
    const monomino = POLYOMINO_CATALOG.byOrder[1][0];
    const landingVolumes = [];
    const lockVolumes = [];
    game.settings = { mode: 'rectangular', sfxVolume: 0.5 };
    game.rows = 10;
    game.columns = 10;
    game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
    game.currentPiece = { entry: monomino, r: 9, phi: 2, rotation: 0 };
    game.pieceGrounded = false;
    game.lineClear = null;
    game.structuralBodyGrid = null;
    game.audio = {
        playTetrisLanding: volume => landingVolumes.push(volume),
        playTetrisLock: volume => lockVolumes.push(volume),
    };
    game._resetRepeats = () => {};
    game._completeLineClear = () => {};

    assert.equal(game._markPieceGrounded(), true);
    assert.equal(game._markPieceGrounded(), false);
    game._lockPiece();
    assert.deepEqual(landingVolumes, [0.14]);
    assert.deepEqual(lockVolumes, [0.18]);
    assert.equal(game.grid[9][2], monomino.index + 1);
});

test('default and overridden draw factors implement P_i = p_i / sum_j p_j', () => {
    const weights = defaultOrderWeights();
    const base = buildWeightedSampler(weights, {});
    assert.equal(base.size, 7);
    assert.equal(base.total, 7);
    for (const entry of POLYOMINO_CATALOG.byOrder[4]) {
        assert.equal(base.probabilityOf(entry), 1 / 7);
    }

    const iPiece = POLYOMINO_CATALOG.byOrder[4].find(entry => entry.classicName === 'I');
    const overridden = buildWeightedSampler(weights, { [iPiece.id]: 3 });
    assert.equal(overridden.total, 9);
    assert.equal(overridden.probabilityOf(iPiece), 1 / 3);
    for (const entry of POLYOMINO_CATALOG.byOrder[4]) {
        if (entry !== iPiece) assert.equal(overridden.probabilityOf(entry), 1 / 9);
    }

    const allOrders = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, 1]));
    const all = buildWeightedSampler(allOrders, {});
    assert.equal(all.size, 12678);
    assert.equal(all.total, 12678);
});

test('weighted sampler observes cumulative interval boundaries', () => {
    const weights = defaultOrderWeights();
    const first = buildWeightedSampler(weights, {}, () => 0).sample();
    const last = buildWeightedSampler(weights, {}, () => 1 - Number.EPSILON).sample();
    assert.equal(first.order, 4);
    assert.equal(last.order, 4);
    assert.notEqual(first.id, last.id);
});

test('legacy standalone settings and controls migrate without losing keys', () => {
    const migrated = importPayload({
        mode: 'mobius',
        gameplay: {
            das: 75,
            arr: 40,
            softDropSpeed: 12,
            initialSpeed: 500,
            speedIncrease: 90,
            initialLockDelay: 1400,
            lockDelayDecrease: 85,
            quickMotionMultiplier: 4,
        },
        movement: { comboTime: 135 },
        grid: { phiSegments: 24, rSegments: 20 },
        visuals: {
            centralHoleColor: '#112233',
            outerSpaceColor: '#334455',
            lineClearDuration: 40,
            mobiusGridOpacity: 0.65,
            rectBackgroundColor: '#010203',
            dropPathOpacity: 0.4,
        },
        controls: {
            rotateClockwise: 'Z',
            hardDrop: ' ',
            quickMotion: '6',
        },
    });
    assert.equal(migrated.settings.mode, 'mobius');
    assert.equal(migrated.settings.das, 75);
    assert.equal(migrated.settings.comboTime, 135);
    assert.equal(migrated.settings.rSegments, 20);
    assert.deepEqual(migrated.bindings.rotateClockwise, [{ type: 'keyboard', code: 'KeyZ', key: 'Z', match: 'key' }]);
    assert.deepEqual(migrated.bindings.hardDrop, [{ type: 'keyboard', code: 'Space', key: ' ', match: 'key' }]);
    assert.deepEqual(migrated.bindings.quickMotion, [{ type: 'keyboard', code: 'Digit6', key: '6', match: 'key' }]);
});

test('every standalone setting and key binding keeps its original default', () => {
    const settings = createDefaultSettings();
    assert.deepEqual({
        das: settings.das,
        arr: settings.arr,
        quickMotionMultiplier: settings.quickMotionMultiplier,
        softDropSpeed: settings.softDropSpeed,
        comboTime: settings.comboTime,
        comboMode: settings.comboMode,
        initialSpeed: settings.initialSpeed,
        speedIncrease: settings.speedIncrease,
        initialLockDelay: settings.initialLockDelay,
        lockDelayDecrease: settings.lockDelayDecrease,
        phiSegments: settings.phiSegments,
        rSegments: settings.rSegments,
        centralHoleColor: settings.centralHoleColor,
        outerSpaceColor: settings.outerSpaceColor,
        lineClearDuration: settings.lineClearDuration,
        mobiusGridOpacity: settings.mobiusGridOpacity,
        rectBackgroundColor: settings.rectBackgroundColor,
        dropPathOpacity: settings.dropPathOpacity,
        pieceOutlineWidth: settings.pieceOutlineWidth,
        nextPreviewCount: settings.nextPreviewCount,
        nextPreviewCellScale: settings.nextPreviewCellScale,
        holdPreviewCellScale: settings.holdPreviewCellScale,
        previewFramed: settings.previewFramed,
        widgetLayout: settings.widgetLayout,
        sfxVolume: settings.sfxVolume,
        structuralCellSizeMeters: settings.structuralCellSizeMeters,
        structuralBlockMassKg: settings.structuralBlockMassKg,
        structuralGravity: settings.structuralGravity,
        structuralPieceFriction: settings.structuralPieceFriction,
        structuralPlatformFriction: settings.structuralPlatformFriction,
        structuralWallFriction: settings.structuralWallFriction,
        rockingLengthCells: settings.rockingLengthCells,
        rockingRollingFriction: settings.rockingRollingFriction,
        rockingFrameWidthCells: settings.rockingFrameWidthCells,
        rockingFrameHeadroomCells: settings.rockingFrameHeadroomCells,
        structuralStabilityMarginCells: settings.structuralStabilityMarginCells,
        structuralToppleDampingPerSecond: settings.structuralToppleDampingPerSecond,
        structuralToppleInitialAngularSpeed: settings.structuralToppleInitialAngularSpeed,
        structuralToppleGameOverAngleDegrees: settings.structuralToppleGameOverAngleDegrees,
        structuralToppleMaximumSeconds: settings.structuralToppleMaximumSeconds,
        mode: settings.mode,
    }, {
        das: 60,
        arr: 80,
        quickMotionMultiplier: 3,
        softDropSpeed: 15,
        comboTime: 120,
        comboMode: 'release-lock',
        initialSpeed: 400,
        speedIncrease: 80,
        initialLockDelay: 1500,
        lockDelayDecrease: 80,
        phiSegments: 24,
        rSegments: 18,
        centralHoleColor: '#333333',
        outerSpaceColor: '#333333',
        lineClearDuration: 30,
        mobiusGridOpacity: 0.8,
        rectBackgroundColor: '#000000',
        dropPathOpacity: 0.25,
        pieceOutlineWidth: 2,
        nextPreviewCount: 2,
        nextPreviewCellScale: 1,
        holdPreviewCellScale: 1,
        previewFramed: true,
        widgetLayout: {
            version: 1,
            assignments: {
                next: 'top-right-inner',
                stats: 'top-right-outer',
                controls: 'bottom-right-inner',
            },
        },
        sfxVolume: 0.5,
        structuralCellSizeMeters: 0.3,
        structuralBlockMassKg: 1,
        structuralGravity: 9.81,
        structuralPieceFriction: 0,
        structuralPlatformFriction: 0,
        structuralWallFriction: 0,
        rockingLengthCells: 10,
        rockingRollingFriction: 0,
        rockingFrameWidthCells: 0,
        rockingFrameHeadroomCells: 0,
        structuralStabilityMarginCells: 0,
        structuralToppleDampingPerSecond: 0.35,
        structuralToppleInitialAngularSpeed: 0.08,
        structuralToppleGameOverAngleDegrees: 72,
        structuralToppleDampingPerSecond: 0.35,
        structuralToppleInitialAngularSpeed: 0.08,
        structuralToppleGameOverAngleDegrees: 72,
        structuralToppleMaximumSeconds: 3,
        mode: 'circular',
    });

    const settingKeys = SETTINGS_GROUPS.flatMap(group => group.fields.map(field => field.key)).sort();
    assert.deepEqual(settingKeys, [
        'arr', 'centralHoleColor', 'comboMode', 'comboTime', 'das', 'dropPathOpacity', 'gridPreset', 'holdPreviewCellScale',
        'initialLockDelay', 'initialSpeed', 'lineClearDuration', 'lockDelayDecrease',
        'mobiusGridOpacity', 'mode', 'nextPreviewCellScale', 'nextPreviewCount', 'outerSpaceColor', 'phiSegments',
        'pieceOutlineWidth', 'previewFramed', 'quickMotionMultiplier', 'rSegments', 'rectBackgroundColor',
        'rockingAllowOverhang', 'rockingArcDegrees', 'rockingCollapseMassKg', 'rockingFrameHeadroomCells', 'rockingFrameWidthCells', 'rockingLengthCells', 'rockingMassKg', 'rockingRollingFriction',
        'ruleMode', 'sfxVolume', 'softDropSpeed', 'speedIncrease', 'sprintLines', 'structuralBlockMassKg',
        'structuralCellSizeMeters', 'structuralGravity', 'structuralPieceFriction',
        'structuralPlatformFriction', 'structuralRecoveryTolerance', 'structuralWallFriction', 'widgetLayout',
    ]);

    const controls = Object.fromEntries(CONTROL_DEFINITIONS.map(control => [control.action, control.key]));
    assert.deepEqual(controls, {
        moveClockwise: 'ArrowLeft',
        moveCounterClockwise: 'ArrowRight',
        rotateClockwise: 'z',
        rotateCounterClockwise: 't',
        rotate180: 'ArrowUp',
        softDrop: 'ArrowDown',
        hardDrop: ' ',
        holdPiece: 'u',
        pause: '¸',
        restart: 'r',
        quickMotion: '6',
        checkCollapse: 'Enter',
    });
    const bindings = getDefaultBindings();
    assert.equal(bindings.pause[0].code, 'Backquote');
    assert.equal(bindings.pause[0].match, 'code');
    for (const [action, actionBindings] of Object.entries(bindings)) {
        if (action === 'pause') continue;
        for (const binding of actionBindings) assert.equal(binding.match, 'key');
    }
    assert.deepEqual(normalizeBindings({
        ...bindings,
        pause: [{ type: 'keyboard', code: 'Escape', key: 'Escape', match: 'key' }],
    }).pause, [{ type: 'keyboard', code: 'Backquote', key: '¸', match: 'code' }]);

    const schema = getFrameworkSettingsSchema();
    assert.ok(schema.every(field => field.type !== 'custom'));
    assert.equal(schema.find(field => field.key === 'comboMode').type, 'select');
    assert.equal(schema.find(field => field.key === 'nextPreviewCount').max, 5);
    assert.equal(schema.find(field => field.key === 'sfxVolume').type, 'range');
    assert.equal(schema.find(field => field.key === 'orderWeights').type, 'game-custom');
    assert.equal(schema.find(field => field.key === 'pieceOverrides').type, 'hidden');
    assert.equal(schema.find(field => field.key === 'phiSegments').max, 256);
    assert.equal(schema.find(field => field.key === 'rSegments').max, 256);
});

test('grid dimensions accept arbitrary integers through 256 and derive preset state', () => {
    const defaults = createDefaultSettings();
    const classicCartesian = normalizeSettings({
        ...defaults,
        mode: 'rectangular',
        phiSegments: 10,
        rSegments: 20,
    });
    assert.equal(classicCartesian.phiSegments, 10);
    assert.equal(classicCartesian.rSegments, 20);
    assert.equal(classicCartesian.gridPreset, 'custom');

    const custom = normalizeSettings({ ...defaults, phiSegments: 100, rSegments: 137 });
    assert.equal(custom.phiSegments, 100);
    assert.equal(custom.rSegments, 137);
    assert.equal(custom.gridPreset, 'custom');

    const maximum = normalizeSettings({ ...defaults, phiSegments: 256, rSegments: 256 });
    assert.equal(maximum.phiSegments, 256);
    assert.equal(maximum.rSegments, 256);
    assert.equal(maximum.gridPreset, '256x256');
    assert.equal(normalizeSettings({ ...defaults, phiSegments: 999, rSegments: 999 }).phiSegments, 256);
    assert.equal(normalizeSettings({ ...defaults, phiSegments: 999, rSegments: 999 }).rSegments, 256);
});

test('Cartesian and rocking dimensions use width and height settings', () => {
    const gridGroup = SETTINGS_GROUPS.find(group => group.title === 'Grid & Visuals');
    const physicsGroup = SETTINGS_GROUPS.find(group => group.title === 'Structural Physics');
    const width = gridGroup.fields.find(field => field.key === 'phiSegments');
    const height = gridGroup.fields.find(field => field.key === 'rSegments');
    const rockingWidth = gridGroup.fields.find(field => field.key === 'rockingLengthCells');
    const rollingFriction = physicsGroup.fields.find(field => field.key === 'rockingRollingFriction');

    assert.equal(width.label, 'Grid Width (cells)');
    assert.equal(height.label, 'Grid Height (cells)');
    assert.equal(CONTROL_DEFINITIONS.find(control => control.action === 'moveClockwise').label, 'Move Left');
    assert.equal(CONTROL_DEFINITIONS.find(control => control.action === 'moveCounterClockwise').label, 'Move Right');
    assert.equal(rockingWidth.label, 'Grid Width (cells)');
    assert.equal(rockingWidth.fundamental, true);
    assert.deepEqual(rockingWidth.modes, ['rocking', 'rocking-pressure']);
    assert.equal(rollingFriction.fundamental, true);

    const labels = SETTINGS_GROUPS.flatMap(group => group.fields.flatMap(field => [
        field.label,
        ...(field.options || []).map(option => option.label),
    ])).join(' ');
    assert.doesNotMatch(labels, /\bangular\b|\bradial\b/i);
    assert.equal(SETTINGS_GROUPS.flatMap(group => group.fields).some(field =>
        field.key === 'structuralToppleDampingPerSecond' ||
        field.key === 'structuralToppleInitialAngularSpeed' ||
        field.key === 'structuralToppleGameOverAngleDegrees' ||
        field.key === 'structuralToppleMaximumSeconds'), false);
});

test('structural friction fields and piece outline settings validate independently', () => {
    const defaults = createDefaultSettings();
    assert.equal(defaults.pieceOutlineWidth, 2);
    assert.equal(defaults.structuralPieceFriction, 0);
    assert.equal(defaults.structuralPlatformFriction, 0);
    assert.equal(defaults.structuralWallFriction, 0);
    assert.equal(defaults.rockingRollingFriction, 0);

    const normalized = normalizeSettings({
        ...defaults,
        pieceOutlineWidth: 3.5,
        structuralPieceFriction: 0.2,
        structuralPlatformFriction: 0.3,
        structuralWallFriction: 0.4,
    });
    assert.equal(normalized.pieceOutlineWidth, 3.5);
    assert.equal(normalized.structuralPieceFriction, 0.2);
    assert.equal(normalized.structuralPlatformFriction, 0.3);
    assert.equal(normalized.structuralWallFriction, 0.4);
    assert.equal(validateSettings(normalized), true);
    assert.throws(() => validateSettings({ ...defaults, pieceOutlineWidth: -0.01 }));
    assert.throws(() => validateSettings({ ...defaults, structuralPlatformFriction: -0.01 }));
    assert.throws(() => validateSettings({ ...defaults, structuralWallFriction: -0.01 }));

    const legacy = normalizeSettings({ ...defaults, structuralPlatformFriction: undefined, structuralWallFriction: 0.45 });
    assert.equal(legacy.structuralPlatformFriction, 0.45);
});

test('normalized Möbius templates round-trip and every dropdown preset is bundled', async () => {
    const classicSizedMobius = await buildMobiusTemplate({ rows: 20, columns: 10, subdivisions: 7 });
    assert.equal(classicSizedMobius.rows, 20);
    assert.equal(classicSizedMobius.columns, 10);
    assert.equal(classicSizedMobius.physicalColumns, 5);

    const template = await buildMobiusTemplate({ rows: 37, columns: 100, subdivisions: 7 });
    const encoded = encodeMobiusTemplate(template);
    const decoded = decodeMobiusTemplate(encoded, { rows: 37, columns: 100, subdivisions: 7 });
    assert.equal(decoded.physicalColumns, 50);
    assert.equal(decoded.drawOrder.length, 50 * 37);
    assert.equal(decoded.boundaryData.length, 50 * 38 * 30);

    for (const preset of GRID_PRESETS) {
        const key = mobiusTemplateCacheKey(preset.rows, preset.columns, 7);
        const bytes = readFileSync(new URL(`../projection-presets/${key}.bin`, import.meta.url));
        const cached = decodeMobiusTemplate(bytes, {
            rows: preset.rows,
            columns: preset.columns,
            subdivisions: 7,
        });
        assert.equal(cached.rows, preset.rows);
        assert.equal(cached.columns, preset.columns);
    }
});

test('Möbius double traversal closes and its paired layers are coincident', () => {
    const radius = 216;
    for (let sample = 0; sample <= 100; sample++) {
        const t = sample / 100 * TAU;
        const v = -70 + sample / 100 * 140;
        assert.ok(pairedMobiusPointError(t, v, radius) < 1e-9);

        const start = mobiusPoint(t, v, radius);
        const closed = mobiusPoint(t + 2 * TAU, v, radius);
        assert.ok(Math.hypot(start.x - closed.x, start.y - closed.y, start.z - closed.z) < 1e-9);
    }
});

test('cached Möbius mesh pairs exact logical fields and uses curved projected edges', () => {
    const started = performance.now();
    const mesh = buildMobiusMesh({ size: 600, rows: 18, columns: 24, subdivisions: 7 });
    const elapsed = performance.now() - started;
    assert.equal(mesh.paired, true);
    assert.equal(mesh.traversalSpan, TAU);
    assert.equal(mesh.logicalCellCount, 24 * 18);
    assert.equal(mesh.projectedCellCount, 12 * 18);
    assert.equal(mesh.patches.length, 12 * 18);
    assert.ok(elapsed < 250, `Mesh generation took ${elapsed.toFixed(1)} ms`);

    let foundCurvature = false;
    let previousDepth = Infinity;
    for (const patch of mesh.patches) {
        assert.equal(patch.slotB, patch.slotA + 12);
        assert.equal(patch.rowB, 17 - patch.rowA);
        assert.ok(patch.depth <= previousDepth + 1e-9, 'Patches are not far-to-near sorted');
        previousDepth = patch.depth;
        assert.equal(patch.lower.points.length, 8);
        assert.equal(patch.lower.controls.length, 7);
        assert.equal(patch.upper.points.length, 8);
        assert.equal(patch.upper.controls.length, 7);
        for (let segment = 0; segment < patch.lower.controls.length; segment++) {
            const start = patch.lower.points[segment];
            const end = patch.lower.points[segment + 1];
            const control = patch.lower.controls[segment];
            const straightMidX = (start.x + end.x) / 2;
            const straightMidY = (start.y + end.y) / 2;
            if (Math.hypot(control.x - straightMidX, control.y - straightMidY) > 0.01) {
                foundCurvature = true;
            }
        }
    }
    assert.ok(foundCurvature, 'Projected edges unexpectedly collapsed to straight segments');

    const smoother = buildMobiusMesh({ size: 600, rows: 18, columns: 24, subdivisions: 14 });
    assert.equal(smoother.logicalCellCount, 24 * 18);
    assert.equal(smoother.projectedCellCount, 12 * 18);
    assert.equal(smoother.patches[0].lower.controls.length, 14);
});

test('Möbius and circular settings keep the same grid, including odd field counts', () => {
    const defaults = createDefaultSettings();
    assert.equal(normalizeSettings({ ...defaults, mode: 'mobius', phiSegments: 23 }).phiSegments, 23);
    assert.equal(normalizeSettings({ ...defaults, mode: 'circular', phiSegments: 23 }).phiSegments, 23);

    const mesh = buildMobiusMesh({ size: 600, rows: 18, columns: 23, subdivisions: 7 });
    assert.equal(mesh.paired, false);
    assert.equal(mesh.physicalColumns, 23);
    assert.equal(mesh.traversalSpan, 2 * TAU);
    assert.equal(mesh.logicalCellCount, 23 * 18);
    assert.equal(mesh.projectedCellCount, 23 * 18);
    assert.equal(mesh.patches.length, 23 * 18);
    assert.ok(mesh.patches.every(patch => patch.slotB === null && patch.rowB === null));
});

test('structural statics balances vertical forces and moments through a stack', () => {
    const bodyGrid = [
        Int32Array.from([0, 0, 0]),
        Int32Array.from([0, 1, 0]),
        Int32Array.from([0, 2, 0]),
    ];
    const analysis = analyzeStructuralStability(bodyGrid, {
        blockMassKg: 1,
        gravity: 9.81,
        cellSizeMeters: 0.3,
        stabilityMarginCells: 0.02,
    });
    assert.equal(analysis.stable, true);
    const lower = analysis.groups.find(group => group.bodyIds.includes(2));
    assert.ok(lower);
    assert.ok(Math.abs(lower.totalForceN - 19.62) < 1e-8);
    assert.ok(Math.abs(lower.reactions.reduce((sum, reaction) => sum + reaction.forceN, 0) - lower.totalForceN) < 1e-8);
    assert.ok(lower.resultantX >= lower.supportMin && lower.resultantX <= lower.supportMax);
});

test('structural statics detects an overturning moment and includes the carried load', () => {
    const bodyGrid = Array.from({ length: 5 }, () => new Int32Array(8));
    bodyGrid[2][4] = 1;
    bodyGrid[3][2] = bodyGrid[3][3] = bodyGrid[3][4] = 2;
    bodyGrid[4][2] = 3;
    const analysis = analyzeStructuralStability(bodyGrid, {
        blockMassKg: 2,
        gravity: 9.81,
        cellSizeMeters: 0.25,
        stabilityMarginCells: 0.02,
    });
    assert.equal(analysis.stable, false);
    assert.equal(analysis.instability.reason, 'torque');
    assert.equal(analysis.instability.direction, 1);
    assert.ok(analysis.instability.netTorqueNm > 0);
    assert.deepEqual(new Set(analysis.instability.bodyIds), new Set([1, 2]));
    assert.ok(analysis.instability.inertiaKgM2 > 0);
});

test('row clearing can split one rigid polyomino into independent bodies', () => {
    const bodyGrid = [
        Int32Array.from([0, 7, 0]),
        Int32Array.from([0, 0, 0]),
        Int32Array.from([0, 7, 0]),
    ];
    const split = splitDisconnectedBodies(bodyGrid, 8);
    assert.equal(split.bodyGrid[0][1], 7);
    assert.equal(split.bodyGrid[2][1], 8);
    assert.equal(split.nextBodyId, 9);
});

test('structural physics only splits records for the structural ruleset', () => {
    const defaults = createDefaultSettings();
    const changedGravity = { ...defaults, structuralGravity: 1.62 };
    assert.equal(settingsRecordKey(defaults), settingsRecordKey(changedGravity));
    assert.equal(settingsRecordKey(defaults), settingsRecordKey({ ...defaults, sfxVolume: 0 }));
    assert.notEqual(
        settingsRecordKey(defaults),
        settingsRecordKey({ ...defaults, nextPreviewCount: 4 }),
    );
    assert.notEqual(
        settingsRecordKey({ ...defaults, mode: 'structural' }),
        settingsRecordKey({ ...changedGravity, mode: 'structural' }),
    );

    const structuralKey = JSON.parse(settingsRecordKey({ ...defaults, mode: 'structural' }));
    assert.equal(structuralKey.structuralModelVersion, 4);
    assert.equal(structuralKey.structuralPlatformFriction, 0);
    assert.notEqual(
        settingsRecordKey({ ...defaults, mode: 'structural' }),
        settingsRecordKey({ ...defaults, mode: 'structural', structuralPlatformFriction: 0.25 }),
    );
    assert.equal(
        settingsRecordKey({ ...defaults, mode: 'structural' }),
        settingsRecordKey({ ...defaults, mode: 'structural', pieceOutlineWidth: 8 }),
    );
    assert.equal(
        settingsRecordKey({ ...defaults, mode: 'structural' }),
        settingsRecordKey({ ...defaults, mode: 'structural', structuralToppleMaximumSeconds: 8 }),
    );
});
