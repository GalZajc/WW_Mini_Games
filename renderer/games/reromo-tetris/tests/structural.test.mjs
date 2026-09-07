import assert from 'node:assert/strict';
import test from 'node:test';
import {
    analyzeStructuralStability as analyze,
    normalizeStructuralPhysics,
    splitDisconnectedBodies,
} from '../structural-stability.js';
import { structuralSolver, STRUCTURAL_SOLVER_OPTIONS } from '../structural-solver.js';
import ReRoMoTetris from '../game.js';
import { createDefaultSettings } from '../settings.js';
import {
    rockingAcceleration,
    rockingAssembly,
    rockingGeometry,
    rockingKinematics,
} from '../rocking-physics.js';

const bridge = [
    [1, 1, 1, 1, 1, 1, 1],
    [2, 2, 2, 3, 4, 4, 4],
    [0, 0, 2, 3, 4, 0, 0],
    [0, 0, 2, 3, 4, 0, 0],
    [0, 0, 2, 3, 4, 0, 0],
];

const stationaryFrame = (originX = 0, originY = 0) => ({
    angle: 0, omega: 0, alpha: 0, ax: 0, ay: 0, originX, originY,
});

test('reused contact reactions agree with full solves and invalidate after grid or friction changes', () => {
    const grid = Array.from({ length: 6 }, () => new Int32Array(6));
    let id = 1;
    for (let r = 0; r < 6; r += 2) for (let c = 0; c < 6; c += 2) {
        grid[r][c] = grid[r + 1][c] = grid[r + 1][c + 1] = id++;
        grid[r][c + 1] = id++;
    }
    const physics = { forceCoupled: true, pieceFriction: .5, platformFriction: 1, walls: true,
        frame: { angle: .03, omega: .04, alpha: -.015, originX: 3, originY: 6 } };
    analyze(grid, physics);
    physics.frame.angle = .0301;
    const reused = analyze(grid, physics);
    assert.equal(reused.reusedReactions, true);
    assert.equal(reused.stable, analyze(grid, { ...physics, reuseReactions: false }).stable);
    grid[0][0] = 0;
    const edited = analyze(grid, physics);
    assert.notEqual(edited.reusedReactions, true);
    assert.equal(edited.stable, analyze(grid, { ...physics, reuseReactions: false }).stable);
    physics.walls = false; physics.pieceFriction = 0; physics.platformFriction = 0;
    const slippery = analyze(grid, physics);
    assert.notEqual(slippery.reusedReactions, true);
    assert.equal(slippery.stable, false);
    assert.equal(slippery.stable, analyze(grid, { ...physics, reuseReactions: false }).stable);
});

test('a finite stationary platform tips a horizontal rod with either overhang', () => {
    const grid = [[1, 1, 1, 1, 1]];
    const left = analyze(grid, {
        floorMinColumn: 0, floorMaxColumn: 2, frame: stationaryFrame(2.5, 1),
    });
    const right = analyze(grid, {
        floorMinColumn: 3, floorMaxColumn: 5, frame: stationaryFrame(2.5, 1),
    });
    assert.equal(left.stable, false);
    assert.equal(right.stable, false);
    assert.equal(left.instability.direction, 1);
    assert.equal(right.instability.direction, -1);
    for (const result of [left, right]) {
        assert.ok(result.contactReactions.every(contact => contact.kind !== 'platform'
            || (contact.x >= result.physics.floorMinColumn - 1e-9
                && contact.x <= result.physics.floorMaxColumn + 1e-9)));
    }
});

test('a centered one-cell support has a neutral 50/50 reaction and remains stable', () => {
    const result = analyze([[1, 1, 1, 1, 1]], {
        floorMinColumn: 2, floorMaxColumn: 3, frame: stationaryFrame(2.5, 1),
    });
    assert.equal(result.stable, true);
    assert.equal(result.solver, 'contact-certificate');
    const reactions = result.contactReactions.filter(contact => contact.kind === 'platform');
    assert.equal(reactions.length, 2);
    assert.ok(Math.abs(reactions[0].forceN - reactions[1].forceN) < 1e-10);
});

test('a body supported by another body is included in the equilibrium chain', () => {
    const result = analyze([[0, 0, 1, 0, 0], [2, 2, 2, 2, 2]], {
        frame: stationaryFrame(2.5, 2), platformFriction: 0,
    });
    assert.equal(result.stable, true);
    assert.equal(result.solver, 'contact-certificate');
    assert.ok(result.contactReactions.some(contact => contact.kind === 'piece'
        && contact.a === 1 && contact.b === 2));
});

test('platform, wall, and piece friction use separate contact cones', () => {
    const frame = { angle: 0.2 };
    assert.equal(analyze([[0, 1, 0]], { frame, platformFriction: 0, wallFriction: 1 }).stable, false);
    assert.equal(analyze([[0, 1, 0]], { frame, platformFriction: Math.tan(0.2), wallFriction: 0 }).stable, true);

    const stacked = [[0, 0, 1, 0, 0], [2, 2, 2, 2, 2]];
    assert.equal(analyze(stacked, { frame, platformFriction: 1, pieceFriction: 0 }).stable, false);
    assert.equal(analyze(stacked, { frame, platformFriction: 1, pieceFriction: 0.3 }).stable, true);

    const wall = [[0, 1], [0, 0]];
    assert.equal(analyze(wall, { frame: { angle: Math.PI / 3 }, walls: true,
        platformFriction: 0, wallFriction: 0 }).stable, false);
    assert.equal(analyze(wall, { frame: { angle: Math.PI / 3 }, walls: true,
        platformFriction: 0, wallFriction: 0.8 }).stable, true);
});

test('moving-platform frame loads include transformed gravity, translation, rotation, and COM moment', () => {
    const shape = rockingGeometry(1.5, 60, 20);
    const state = { angle: 0.12, omega: 0.4, alpha: -0.3 };
    const kinematics = rockingKinematics(shape, state);
    const physics = normalizeStructuralPhysics({
        cellSizeMeters: 0.3, blockMassKg: 2, gravity: 9.81,
        platformFriction: 10,
        frame: { ...state, ax: kinematics.ax, ay: kinematics.ay, originX: 0.5, originY: 1 },
    });
    const result = analyze([[1]], physics);
    assert.equal(result.stable, true);
    const body = result.bodies[0];
    const g = physics.gravity, scale = physics.cellSizeMeters;
    const rx = (body.comX - physics.frame.originX) * scale;
    const ry = (body.comY - physics.frame.originY) * scale;
    const ax = physics.frame.ax * Math.cos(state.angle) + physics.frame.ay * Math.sin(state.angle);
    const ay = -physics.frame.ax * Math.sin(state.angle) + physics.frame.ay * Math.cos(state.angle);
    assert.ok(Math.abs(body.forceX - (body.mass * (g * Math.sin(state.angle) - ax
        + state.alpha * ry + state.omega ** 2 * rx) / g)) < 1e-12);
    assert.ok(Math.abs(body.forceY - (body.mass * (g * Math.cos(state.angle) - ay
        - state.alpha * rx + state.omega ** 2 * ry) / g)) < 1e-12);
    assert.ok(Math.abs(body.momentLoad + body.inertia * scale * state.alpha / g) < 1e-12);
});

test('near-flat rocking acceleration may legitimately stabilize an offset rod', () => {
    const cellSizeMeters = 0.3, columns = 5, rows = 5;
    const physics = normalizeStructuralPhysics({ cellSizeMeters, blockMassKg: 1, gravity: 9.81,
        platformFriction: 0.5 });
    const shape = rockingGeometry(columns * cellSizeMeters, 60, 20);
    const physicalColumns = [-3, -2, -1, 0, 1];
    const lockedCells = physicalColumns.map(column => ({ row: rows - 1, column }));
    const assembly = rockingAssembly(shape, lockedCells, rows, columns, physics);
    const alpha = rockingAcceleration(assembly, 0, 0, physics.gravity, 0);
    const state = { angle: 0, omega: 0, alpha };
    const kinematics = rockingKinematics(shape, state);
    const minColumn = -3;
    const grid = Array.from({ length: rows }, () => new Int32Array(columns - minColumn));
    for (const column of physicalColumns) grid[rows - 1][column - minColumn] = 1;
    const frame = { ...state, ax: kinematics.ax, ay: kinematics.ay,
        originX: columns / 2 - minColumn, originY: rows };
    const result = analyze(grid, { ...physics, frame,
        floorMinColumn: -minColumn, floorMaxColumn: columns - minColumn });
    const forced = analyze(grid, { ...physics, frame,
        floorMinColumn: -minColumn, floorMaxColumn: columns - minColumn, forceCoupled: true });
    assert.equal(result.stable, true);
    assert.equal(forced.stable, true);
    assert.equal(result.solver, 'contact-certificate');
    assert.ok(alpha < 0);
});

test('the contact certificate agrees with the forced coupled solve for a moving stack', () => {
    const grid = [[0, 1, 0, 0, 0], [2, 2, 2, 2, 2]];
    const physics = normalizeStructuralPhysics({
        cellSizeMeters: 0.3, blockMassKg: 1, gravity: 9.81,
        platformFriction: 1, pieceFriction: 1, wallFriction: 0,
        frame: { angle: 0.05, omega: 0.1, alpha: 0.1, ax: 0.2, ay: -0.1, originX: 2.5, originY: 2 },
    });
    const certificate = analyze(grid, physics);
    const coupled = analyze(grid, { ...physics, forceCoupled: true });
    assert.equal(certificate.solver, 'contact-certificate');
    assert.equal(coupled.solver, 'coupled-equilibrium');
    assert.equal(certificate.stable, coupled.stable);
});

test('both support edges are stable, including old saved support insets', () => {
    for (const grid of [[[1, 1, 0], [2, 0, 0]], [[0, 1, 1], [0, 0, 2]]]) {
        for (const stabilityMarginCells of [0, 0.02, 0.5]) {
            const result = analyze(grid, { stabilityMarginCells });
            assert.equal(result.stable, true);
            assert.equal(result.instability, null);
            assert.ok(Math.abs(result.minimumMarginCells) < 1e-8);
        }
    }
});

test('a genuine overturning moment is detected with the correct mass and inertia', () => {
    const result = analyze([[1, 1, 1], [2, 0, 0]], { blockMassKg: 2, cellSizeMeters: 0.25 });
    assert.equal(result.stable, false);
    assert.equal(result.instability.pivotX, 1);
    assert.equal(result.instability.pivotY, 1);
    assert.equal(result.instability.massKg, 6);
    assert.ok(Math.abs(result.instability.torqueNm - 6 * 9.81 * 0.5 * 0.25) < 1e-9);
    assert.ok(Math.abs(result.instability.inertiaKgM2 - 0.5) < 1e-9);
});

test('global load redistribution keeps a three-support bridge standing', () => {
    const result = analyze(bridge);
    assert.equal(result.solver, 'coupled-equilibrium');
    assert.equal(result.stable, true);
    for (const body of result.bodies) {
        let fx = 0, fy = body.mass * result.physics.blockMassKg * result.physics.gravity, moment = 0;
        for (const contact of result.contactReactions) {
            const sign = contact.a === body.id ? -1 : contact.b === body.id ? 1 : 0;
            const x = sign * contact.nx * contact.forceN, y = sign * contact.ny * contact.forceN;
            fx += x; fy += y;
            moment += (contact.x - body.comX) * y - (contact.y - body.comY) * x;
        }
        assert.ok(Math.max(Math.abs(fx), Math.abs(fy), Math.abs(moment)) < 1e-8,
            `Body ${body.id} residual: ${fx}, ${fy}, ${moment}`);
    }
});

test('unsupported bodies fall on the integer grid without entering rigid collapse', () => {
    const result = analyze([[1, 0], [0, 0]]);
    assert.equal(result.stable, false);
    assert.equal(result.instability.reason, 'unsupported');
    assert.equal(result.instability.torqueNm, 0);
    assert.deepEqual(result.instability.bodyMotions.map(({ vx, vy, omega }) => [vx, vy, omega]), [[0, 1, 0]]);
    const game = Object.create(ReRoMoTetris.prototype);
    Object.assign(game, {
        rows: 2, columns: 2, state: 'playing', currentPiece: null, rocking: null, rockingShape: null,
        settings: { ...createDefaultSettings(), mode: 'structural' }, structuralPhysics: result.physics,
        overhangGrid: new Map(), grid: [Int32Array.from([1, 0]), Int32Array.from([0, 0])],
        structuralBodyGrid: [Int32Array.from([1, 0]), Int32Array.from([0, 0])],
        gameSpeed: 50, lineClear: null, invalidate() {}, _resetRepeats() {}, _refreshPieceProjection() {},
        _spawnPiece() { this.spawnCount = (this.spawnCount || 0) + 1; this.currentPiece = { fixture: true }; },
    });
    game.pieceIdentityGrid = game.structuralBodyGrid;
    assert.equal(game._beginStructuralToppleIfNeeded(), true);
    assert.equal(game.state, 'settling-grid');
    assert.deepEqual(game.gridFalling.bodies.map(cells => cells.map(cell => [cell.row, cell.column])), [[[0, 0]]]);
    game._updateGridFalling(0.05);
    assert.equal(game.state, 'settling-grid');
    assert.deepEqual(game.gridFalling.bodies.map(cells => cells.map(cell => [cell.row, cell.column])), [[[1, 0]]]);
    game._updateGridFalling(0.05);
    assert.equal(game.state, 'playing');
    assert.equal(game.gridFalling, null);
    assert.equal(game.structuralBodyGrid[1][0], 1);
    assert.equal(game.structuralAnalysis.stable, true);
    assert.equal(game.collapseSimulation, undefined);
    assert.equal(game.toppling, undefined);
});

test('cyclic contacts do not weld a falling L piece to its grounded neighbor', () => {
    const grid = [[2, 1, 3, 3, 3], [4, 3, 3, 0, 5], [4, 4, 3, 5, 5], [3, 3, 3, 3, 0]];
    const result = analyze(grid);
    assert.equal(result.solver, 'coupled-equilibrium');
    assert.equal(result.stable, false);
    assert.deepEqual(result.instability.bodyIds, [5]);
    assert.ok(Math.abs(result.instability.pivotX - 4) < 1e-8);
    assert.ok(Math.abs(result.instability.pivotY - 3) < 1e-8);
});

test('zero gravity cannot cause a collapse, and physical scaling preserves stability', () => {
    assert.equal(analyze([[1], [0]], { gravity: 0 }).stable, true);
    for (const blockMassKg of [0.001, 1, 10000]) for (const cellSizeMeters of [0.01, 0.3, 10]) {
        assert.equal(analyze(bridge, { blockMassKg, cellSizeMeters }).stable, true);
        assert.equal(analyze([[1, 1, 1], [2, 0, 0]], { blockMassKg, cellSizeMeters }).stable, false);
    }
});

// Independent oracle: solve PRIMAL force/torque equations, rather than the
// production solver's DUAL nonpenetrating-motion inequalities or fast paths.
function forceOracle(grid) {
    const bodies = new Map(), edges = [];
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) {
        const id = grid[r][c];
        if (!id) continue;
        if (!bodies.has(id)) bodies.set(id, []);
        bodies.get(id).push([c + 0.5, r + 0.5]);
        const below = r === grid.length - 1 ? -1 : grid[r + 1][c];
        if (below && below !== id) for (const x of [c, c + 1]) edges.push([id, below, x, r + 1, 0, 1]);
        const right = grid[r][c + 1];
        if (right && right !== id) for (const y of [r, r + 1]) edges.push([id, right, c + 1, y, 1, 0]);
    }
    const constraints = [];
    for (const [id, cells] of bodies) {
        const cx = cells.reduce((s, p) => s + p[0], 0) / cells.length;
        const cy = cells.reduce((s, p) => s + p[1], 0) / cells.length;
        const equations = [[], [], []];
        edges.forEach(([a, b, x, y, nx, ny], i) => {
            const sign = a === id ? -1 : b === id ? 1 : 0;
            [nx, ny, (x - cx) * ny - (y - cy) * nx].forEach((v, axis) => {
                const coefficient = sign * v;
                if (coefficient) equations[axis].push(`${coefficient < 0 ? '-' : '+'} ${Math.abs(coefficient)} f${i}`);
            });
        });
        equations.forEach((eq, axis) => constraints.push(`${eq.join(' ') || '0 z'} = ${axis === 1 ? -cells.length : 0}`));
    }
    const model = `Minimize\nobj: ${edges.map((_, i) => `f${i}`).join(' + ') || '0 z'}\nSubject To\n${constraints.join('\n')}\nBounds\nz = 0\nEnd`;
    return structuralSolver.solve(model, STRUCTURAL_SOLVER_OPTIONS).Status === 'Optimal';
}

test('random connected-body boards match an independent force-equilibrium oracle', () => {
    let seed = 0x51ab2e;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let sample = 0; sample < 100; sample++) {
        const grid = Array.from({ length: 5 }, () => Array.from({ length: 6 }, () => random() < 0.25 ? 0 : 1 + Math.floor(random() * 4)));
        splitDisconnectedBodies(grid);
        const expected = forceOracle(grid);
        const result = analyze(grid);
        assert.equal(result.stable, expected, JSON.stringify(grid));
        const mirrored = grid.map(row => row.slice().reverse().map(id => id ? id + 100 : 0));
        assert.equal(analyze(mirrored).stable, expected, `Mirrored: ${JSON.stringify(grid)}`);
    }
});

test('maximum 256 by 256 board uses the linear column certificate', () => {
    const grid = Array.from({ length: 256 }, (_, r) => Int32Array.from({ length: 256 }, (_, c) => 1 + r * 256 + c));
    const result = analyze(grid);
    assert.equal(result.stable, true);
    assert.equal(result.solver, 'column-certificate');
    assert.equal(result.bodies.length, 65536);
});
