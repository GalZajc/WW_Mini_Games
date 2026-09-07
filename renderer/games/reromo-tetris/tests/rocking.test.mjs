import assert from 'node:assert/strict';
import test from 'node:test';
import ReRoMoTetris from '../game.js';
import { createDefaultSettings, normalizeSettings, validateSettings, settingsRecordKey } from '../settings.js';
import { analyzeStructuralStability, normalizeStructuralPhysics } from '../structural-stability.js';
import { rockingGeometry, rockingAssembly, rockingKinematics, rockingAcceleration, stepRocking, rowsToCollapse } from '../rocking-physics.js';
import { getPieceGeometry, POLYOMINO_CATALOG } from '../polyominoes.js';

function gameFixture(mode = 'rocking') {
    const game = Object.create(ReRoMoTetris.prototype);
    const settings = { ...createDefaultSettings(), mode, rockingLengthCells: 5, rockingAllowOverhang: true };
    Object.assign(game, { settings, columns: 5, rows: 5,
        grid: Array.from({ length: 5 }, () => new Int32Array(5)),
        structuralBodyGrid: Array.from({ length: 5 }, () => new Int32Array(5)),
        overhangGrid: new Map(), structuralPhysics: normalizeStructuralPhysics({ walls: false }),
        rocking: { angle: 0, omega: 0, alpha: 0 }, state: 'playing', nextStructuralBodyId: 10,
        invalidate() {}, _resetRepeats() {}, _playLockSound() {}, _markPieceGrounded() {},
        _completeLineClear(count) { this.cleared = count; }, _gameOver(reason) { this.state = 'gameover'; this.gameOverReason = reason; },
    });
    game.rockingShape = rockingGeometry(1.5, 60, 20);
    game._refreshRockingMass();
    return game;
}

function makeMovingFrameBenchmarkGrid() {
    const rows = 10, columns = 20;
    const grid = Array.from({ length: rows }, () => new Int32Array(columns));
    let bodyId = 1;
    for (let row = 4; row < rows; row += 2) {
        for (let column = 0; column < columns; column += 2) {
            for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) grid[row + dr][column + dc] = bodyId;
            bodyId++;
        }
    }
    return grid;
}

function seededRectangularStack(seed) {
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    const rows = 4 + Math.floor(random() * 3), columns = 3 + Math.floor(random() * 4);
    const grid = Array.from({ length: rows }, () => new Int32Array(columns));
    let bodyId = 1;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns;) {
            const width = Math.min(columns - column, 1 + Math.floor(random() * 2));
            for (let offset = 0; offset < width; offset++) grid[row][column + offset] = bodyId;
            column += width;
            bodyId++;
        }
    }
    const frame = {
        angle: (random() - 0.5) * 0.08,
        omega: (random() - 0.5) * 0.4,
        alpha: (random() - 0.5) * 0.3,
        originX: columns / 2,
        originY: rows,
    };
    const friction = 0.35 + random() * 0.65;
    const physics = normalizeStructuralPhysics({
        cellSizeMeters: 0.3,
        blockMassKg: 1,
        gravity: 9.81,
        pieceFriction: friction,
        platformFriction: friction,
        wallFriction: friction,
        walls: true,
        frame,
    });
    return { grid, physics };
}

function assertCertificateBalances(result, physics, tolerance = 1e-7) {
    assert.equal(result.solver, 'contact-certificate');
    const forceScale = physics.blockMassKg * physics.gravity;
    const balances = new Map(result.bodies.map(body => [body.id, {
        body,
        forceX: body.forceX * forceScale,
        forceY: body.forceY * forceScale,
        torque: body.momentLoad * forceScale * physics.cellSizeMeters,
    }]));
    for (const reaction of result.contactReactions) {
        assert.ok(reaction.forceN >= -tolerance, `negative normal reaction ${reaction.forceN}`);
        const friction = reaction.kind === 'platform' ? physics.platformFriction
            : reaction.kind === 'wall' ? physics.wallFriction : physics.pieceFriction;
        assert.ok(Math.abs(reaction.nx) <= friction + tolerance,
            `reaction exceeds its Coulomb cone: ${Math.abs(reaction.nx)} > ${friction}`);
        const tangent = reaction.nx * reaction.forceN;
        const normal = reaction.forceN;
        const upper = balances.get(reaction.a);
        assert.ok(upper, `missing upper body ${reaction.a}`);
        upper.forceX -= tangent;
        upper.forceY -= normal;
        upper.torque -= ((reaction.x - upper.body.comX) * normal
            - (reaction.y - upper.body.comY) * tangent) * physics.cellSizeMeters;
        if (reaction.b !== -1) {
            const lower = balances.get(reaction.b);
            assert.ok(lower, `missing lower body ${reaction.b}`);
            lower.forceX += tangent;
            lower.forceY += normal;
            lower.torque += ((reaction.x - lower.body.comX) * normal
                - (reaction.y - lower.body.comY) * tangent) * physics.cellSizeMeters;
        }
    }
    for (const [id, balance] of balances) {
        assert.ok(Math.abs(balance.forceX) <= tolerance, `body ${id} horizontal balance ${balance.forceX}`);
        assert.ok(Math.abs(balance.forceY) <= tolerance, `body ${id} vertical balance ${balance.forceY}`);
        assert.ok(Math.abs(balance.torque) <= tolerance, `body ${id} moment balance ${balance.torque}`);
    }
}

test('friction defaults are zero and rocking settings preserve both modes and records', () => {
    const defaults = createDefaultSettings();
    assert.equal(defaults.structuralPieceFriction, 0);
    assert.equal(defaults.structuralPlatformFriction, 0);
    assert.equal(defaults.structuralWallFriction, 0);
    for (const mode of ['rocking', 'rocking-pressure']) {
        const settings = { ...defaults, mode, rockingLengthCells: 7, rockingArcDegrees: 115, rockingAllowOverhang: true };
        assert.equal(validateSettings(settings), true);
        assert.deepEqual(normalizeSettings(settings, { strict: true }), normalizeSettings(settings));
        assert.notEqual(settingsRecordKey(settings), settingsRecordKey({ ...settings, rockingMassKg: 40 }));
    }
    for (const lengthCells of [1, 256]) {
        assert.equal(validateSettings({ ...defaults, mode: 'rocking', rockingLengthCells: lengthCells }), true);
    }
    for (const arcDegrees of [5, 180]) {
        assert.equal(validateSettings({ ...defaults, mode: 'rocking', rockingArcDegrees: arcDegrees }), true);
    }
    for (const lengthCells of [0, 257, 1.5]) {
        assert.throws(() => validateSettings({ ...defaults, mode: 'rocking', rockingLengthCells: lengthCells }));
    }
    for (const arcDegrees of [4.999, 180.001]) {
        assert.throws(() => validateSettings({ ...defaults, mode: 'rocking', rockingArcDegrees: arcDegrees }));
    }
    assert.throws(() => validateSettings({ ...defaults, rockingLengthCells: 7.5 }));
    assert.throws(() => validateSettings({ ...defaults, structuralPieceFriction: -0.01 }));

    const game = gameFixture('rocking');
    const baseStem = game._legacyScoreStem();
    for (const key of ['structuralPieceFriction', 'structuralPlatformFriction', 'structuralWallFriction', 'rockingRollingFriction']) {
        game.settings[key] = 0.25;
        assert.notEqual(game._legacyScoreStem(), baseStem, `${key} must isolate legacy scores`);
        game.settings[key] = defaults[key];
    }
    game.settings.mode = 'rocking-pressure';
    const pressureStem = game._legacyScoreStem();
    game.settings.rockingCollapseMassKg += 1;
    assert.notEqual(game._legacyScoreStem(), pressureStem, 'pressure threshold must isolate legacy scores');
});

test('Coulomb floor friction holds at mu = tan(angle) and slips below it', () => {
    const frame = { angle: 0.2 };
    assert.equal(analyzeStructuralStability([[0, 1, 0]], { frame, platformFriction: 0 }).stable, false);
    assert.equal(analyzeStructuralStability([[0, 1, 0]], { frame, platformFriction: Math.tan(0.2) }).stable, true);
    assert.equal(analyzeStructuralStability([[0, 1, 0]], { frame, platformFriction: 0.3 }).stable, true);

    const sliding = analyzeStructuralStability([[0, 1, 0]], { frame, platformFriction: 0.1 });
    assert.equal(sliding.stable, false);
    assert.equal(sliding.instability.reason, 'sliding');
    assert.ok(sliding.instability.bodyMotions.length > 0);
    const motion = sliding.instability.bodyMotions[0];
    assert.ok(motion.vx > 0);
    assert.equal(motion.vy, 0);
    assert.equal(motion.omega, 0);
    const expectedAcceleration = 9.81 * (Math.sin(0.2) - 0.1 * Math.cos(0.2)) / 0.3;
    assert.ok(Math.abs(sliding.instability.generalizedAcceleration - expectedAcceleration) < 1e-10);
});

test('piece, platform, and wall friction are independent contacts', () => {
    const grid = [[0, 0, 1, 0, 0], [2, 2, 2, 2, 2]], frame = { angle: 0.2 };
    assert.equal(analyzeStructuralStability(grid, { frame, platformFriction: 0.5, pieceFriction: 0 }).stable, false);
    assert.equal(analyzeStructuralStability(grid, { frame, platformFriction: 0.5, pieceFriction: 0.3 }).stable, true);
    const wall = [[0, 1], [0, 0]], sideFrame = { angle: Math.PI / 3 };
    assert.equal(analyzeStructuralStability(wall, { frame: sideFrame, walls: true, wallFriction: 0 }).stable, false);
    assert.equal(analyzeStructuralStability(wall, { frame: sideFrame, walls: true, wallFriction: 0.8 }).stable, true);
});

test('contact-force certificate balances moving-frame stacks like the forced coupled solve', () => {
    const benchmarkPhysics = normalizeStructuralPhysics({
        cellSizeMeters: 0.3, blockMassKg: 1, gravity: 9.81,
        pieceFriction: 1, platformFriction: 1, wallFriction: 1, walls: true,
        frame: { angle: 0.05, omega: 0.1, alpha: 0.1, originX: 5, originY: 20 },
    });
    const cases = [{ grid: makeMovingFrameBenchmarkGrid(), physics: benchmarkPhysics }];
    for (let i = 0; i < 8; i++) cases.push(seededRectangularStack(12345 + i * 7919));

    for (const [index, { grid, physics }] of cases.entries()) {
        const certificate = analyzeStructuralStability(grid, physics);
        const coupled = analyzeStructuralStability(grid, { ...physics, forceCoupled: true });
        assert.equal(certificate.stable, coupled.stable, `stability mismatch in case ${index}`);
        assert.equal(certificate.solver, 'contact-certificate', `certificate path in case ${index}`);
        assert.equal(coupled.solver, 'coupled-equilibrium', `reference path in case ${index}`);
        assertCertificateBalances(certificate, physics);
    }
});

test('uniform semicircular platform has analytic centroid and inertia', () => {
    const shape = rockingGeometry(2, 180, 3);
    assert.ok(Math.abs(shape.radius - 1) < 1e-12);
    assert.ok(Math.abs(shape.centroidFromCircle - 4 / (3 * Math.PI)) < 1e-12);
    assert.ok(Math.abs(shape.inertiaAtCom - 3 * (0.5 - (4 / (3 * Math.PI)) ** 2)) < 1e-12);
});

test('rolling translation has zero contact velocity and its acceleration matches finite differences', () => {
    const shape = rockingGeometry(3, 60, 20);
    const state = { angle: 0.2, omega: 0.3, alpha: -0.4 };
    const h = 1e-4;
    const angleAt = t => state.angle + state.omega * t + state.alpha * t * t / 2;
    const at = t => rockingKinematics(shape, { ...state, angle: angleAt(t) });
    const k = at(0), lo = at(-h), hi = at(h);
    assert.ok(Math.abs((hi.x - 2 * k.x + lo.x) / h ** 2 - k.ax) < 1e-6);
    assert.ok(Math.abs((hi.y - 2 * k.y + lo.y) / h ** 2 - k.ay) < 1e-6);

    // The circle's instantaneous ground contact is a material point. Build
    // its local coordinates from the circle center and differentiate the
    // rigid transform independently of the source's velocity expressions.
    const contactLocal = {
        x: shape.radius * Math.sin(state.angle),
        y: shape.radius * Math.cos(state.angle) - shape.d,
    };
    const materialContactAt = t => {
        const angle = angleAt(t), translation = at(t);
        return {
            x: translation.x + Math.cos(angle) * contactLocal.x - Math.sin(angle) * contactLocal.y,
            y: translation.y + Math.sin(angle) * contactLocal.x + Math.cos(angle) * contactLocal.y,
        };
    };
    const contact = materialContactAt(0), contactLo = materialContactAt(-h), contactHi = materialContactAt(h);
    assert.ok(Math.abs(contact.x - shape.radius * state.angle) < 1e-12);
    assert.ok(Math.abs(contact.y - shape.sag) < 1e-12);
    assert.ok(Math.abs((contactHi.x - contactLo.x) / (2 * h)) < 1e-7);
    assert.ok(Math.abs((contactHi.y - contactLo.y) / (2 * h)) < 1e-7);
});

test('symmetric mass stays neutral, an offset load drives rolling, resistance can hold it without overshoot', () => {
    const shape = rockingGeometry(3, 60, 20), physics = normalizeStructuralPhysics();
    const empty = rockingAssembly(shape, [], 5, 10, physics);
    assert.equal(rockingAcceleration(empty, 0, 0, 9.81, 0), 0);
    const loaded = rockingAssembly(shape, [{ row: 4, column: 8 }], 5, 10, physics);
    assert.ok(rockingAcceleration(loaded, 0, 0, 9.81, 0) > 0);
    const holdFriction = Math.abs(loaded.comX) / shape.radius;
    assert.ok(rockingAcceleration(loaded, 0, 0, 9.81, holdFriction * 0.99) > 0);
    assert.equal(rockingAcceleration(loaded, 0, 0, 9.81, holdFriction), 0);

    const held = { angle: 0, omega: 0, alpha: 0 };
    for (let i = 0; i < 120; i++) stepRocking(held, shape, loaded, physics, holdFriction, 1 / 240);
    assert.equal(held.angle, 0);
    assert.equal(held.omega, 0);

    // Kinetic friction must arrest a small motion inside the static holding
    // interval. Crossing the neutral angle would be a numerical overshoot.
    const arrest = { angle: -0.01, omega: 0.01, alpha: 0 };
    for (let i = 0; i < 240; i++) stepRocking(arrest, shape, loaded, physics, holdFriction * 2, 1 / 240);
    assert.equal(arrest.omega, 0);
    assert.ok(arrest.angle <= 0);
});

test('undamped rolling approximately conserves mechanical energy', () => {
    const shape = rockingGeometry(3, 60, 20), physics = normalizeStructuralPhysics();
    const mass = rockingAssembly(shape, [], 5, 10, physics), state = { angle: 0.15, omega: 0, alpha: 0 };
    const energy = () => {
        const t = state.angle, w = state.omega, { mass: m, radius: r, comX: x, comY: y } = mass;
        const k = mass.inertiaAtCircle + m * r * r - 2 * m * r * (x * Math.sin(t) + y * Math.cos(t));
        return 0.5 * k * w * w + m * physics.gravity * (y - x * Math.sin(t) - y * Math.cos(t));
    };
    const initial = energy();
    for (let i = 0; i < 600; i++) stepRocking(state, shape, mass, physics, 0, 1 / 240);
    // RK4 at the fixed 1/240 s step keeps this fixture within about 1e-8;
    // retain a cross-platform margin while rejecting the former 2.5% bound.
    assert.ok(Math.abs(energy() / initial - 1) < 1e-6);
    assert.equal(state.tipped, undefined);
});

test('only locked cells contribute mass; deleting a row updates the assembly', () => {
    const game = gameFixture();
    game.currentPiece = { entry: POLYOMINO_CATALOG.byOrder[1][0], r: 0, phi: 2, rotation: 0 };
    game._refreshRockingMass();
    assert.equal(game.rockingMass.mass, 20);
    game.grid[4][3] = 1; game.structuralBodyGrid[4][3] = 1;
    game._refreshRockingMass(); assert.equal(game.rockingMass.mass, 21);
    game.grid[4][3] = 0; game.structuralBodyGrid[4][3] = 0;
    game._refreshRockingMass(); assert.equal(game.rockingMass.mass, 20);
});

test('pressure mode uses total locked mass strictly ABOVE each occupied row', () => {
    const cells = [{ row: 0 }, { row: 1 }, { row: 1 }, { row: 3 }, { row: 3 }, { row: 3 }, { row: 4 }];
    assert.deepEqual(rowsToCollapse(cells, 5, 10, 'rocking-pressure', 2, 6), [3, 4]);
    assert.deepEqual(rowsToCollapse([...cells, { row: 3 }], 5, 10, 'rocking-pressure', 2, 8), [4]);
    assert.deepEqual(rowsToCollapse([{ row: 0 }, { row: 0 }, { row: 2 }], 5, 2, 'rocking', 2, 1), [0]);
});

test('side overhangs collide, survive locking and line shifts, and have no phantom floor', () => {
    const game = gameFixture();
    const piece = { entry: POLYOMINO_CATALOG.byOrder[1][0], r: 3, phi: -1, rotation: 0 };
    assert.equal(game._isValidState(piece, 3, -1, 0), true);
    game.settings.rockingAllowOverhang = false;
    assert.equal(game._isValidState(piece, 3, -1, 0), false);
    game.settings.rockingAllowOverhang = true;
    game.overhangGrid.set('4,-1', { row: 4, column: -1, value: 1, bodyId: 5 });
    assert.equal(game._isValidState(piece, 4, -1, 0), false);
    const frame = game._structuralFrame();
    assert.equal(frame.physics.floorMinColumn, 1);
    assert.equal(analyzeStructuralStability(frame.grid, frame.physics).stable, false);
    game.overhangGrid.clear();
    game.overhangGrid.set('2,-1', { row: 2, column: -1, value: 1, bodyId: 5 });
    game._finishLineClearAnimation({ rows: [4], rowSet: new Set([4]) });
    assert.equal(game.overhangGrid.get('3,-1').row, 3);
    assert.equal(game.cleared, 1);
});

test('overhang rendering draws active off-platform cells without a phantom ghost floor', () => {
    const game = gameFixture();
    const entry = POLYOMINO_CATALOG.byOrder[2][0];
    assert.equal(getPieceGeometry(entry).rotations[0].length, 2);
    game.currentPiece = { entry, r: 2, phi: -2, rotation: 0 };
    game.ghostR = 4;
    const calls = [];
    game.ctx = {
        fillRect(...args) { calls.push({ args, alpha: this.globalAlpha }); },
        globalAlpha: 1,
        fillStyle: '',
    };
    const cache = { x: 10, y: 20, cellSize: 4 };
    game._renderOverhang(cache);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => call.alpha), [1, 1]);

    // A locked overhang below the ghost supplies a real landing. The current
    // cells remain visible and a translucent ghost is restored above it.
    game.overhangGrid.set('4,-2', { row: 4, column: -2, value: 1, bodyId: 5 });
    game.ghostR = 3;
    calls.length = 0;
    game._renderOverhang(cache);
    assert.equal(calls.length, 5);
    assert.deepEqual(calls.map(call => call.alpha), [1, 0.25, 0.25, 1, 1]);
});
