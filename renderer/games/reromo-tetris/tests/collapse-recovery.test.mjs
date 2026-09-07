import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverGrid, observeRecoveryRest } from '../collapse-recovery.js';
import { createCollapseSimulation, COLLAPSE_NUMERICS } from '../collapse-physics.js';
import { rockingGeometry } from '../rocking-physics.js';
import Game from '../game.js';

function center(row, column, rows, columns, cellSize = 1) {
    return { x: (column + 0.5 - columns / 2) * cellSize, y: (row + 0.5 - rows) * cellSize };
}

test('intact screenshot-shaped pile resumes while its deck is still rocking', () => {
    const groups = [
        [[17,0],[18,0],[19,0],[19,1],[19,2]],
        [[19,4],[19,5]], [[19,6],[19,7],[19,8]],
        [[16,9],[17,8],[17,9],[18,9],[19,9]], [[18,8]],
    ];
    const cells = groups.flatMap((group, i) => group.map(([row, column]) => ({ row, column, value: i + 1, bodyId: i + 1 })));
    const shape = rockingGeometry(3, 90, 20);
    const physics = { cellSizeMeters: .3, gravity: 9.81, blockMassKg: 1,
        pieceFriction: 1000, platformFriction: 1000, walls: false };
    const simulation = createCollapseSimulation({ cells, rows: 20, columns: 10, physics,
        rockingShape: shape, rockingState: { angle: .03, omega: .03, alpha: 0 }, rollingFriction: 0 });
    const game = Object.create(Game.prototype);
    Object.assign(game, { collapseSimulation: simulation, toppling: { reason: 'topple' },
        state: 'toppling', rows: 20, columns: 10, structuralPhysics: physics, rockingShape: shape,
        settings: { structuralRecoveryTolerance: .1 }, rocking: {},
        _rebuildProjectionCache() {}, invalidate() {}, _allowsOverhang: () => false,
        _prepareGridRecovery(result) { if (!result) return false; this.recovered = result; this.state = 'recovering'; return true; },
        _gameOver() { this.state = 'gameover'; } });
    for (let i = 0; i < 481 && game.state === 'toppling'; i++) game._updateToppling(1 / 60);
    assert.equal(game.state, 'recovering', JSON.stringify({ snapshot: simulation.snapshot(), rest: game.recoveryRest }));
    assert.ok(game.collapseSnapshot.elapsed >= 2);
    assert.ok(game.recovered.maxErrorCells < .1);
    assert.equal(game.collapseSnapshot.settled, false, 'world-space rest has not been reached');
    assert.ok(Math.abs(game.collapseSnapshot.platform.omega) > 1e-8, 'deck is still moving');
    assert.equal(game.recovered.rockingState.omega, game.collapseSnapshot.platform.omega);
});

test('relative sliding cannot use common deck motion to pass the rest gate', () => {
    let rest;
    for (let i = 0; i <= 180; i++) {
        const elapsed = i / 60;
        const platform = { x: elapsed * .1, y: .1, angle: Math.sin(elapsed) * .1 };
        const body = bodyFor([{ row: 3, column: 2 }], { rows: 4, columns: 5, platform });
        body.x += elapsed * .02 * Math.cos(platform.angle);
        body.y += elapsed * .02 * Math.sin(platform.angle);
        rest = observeRecoveryRest({ elapsed, bodies: [body], platform, hasRestContacts: true }, rest, 1);
        assert.equal(rest.ready, false, 'continuous slow slip is not rest even inside the snap tolerance');
    }
});

test('sub-centicell vibrations count as rest through an actual return of the deck angle', () => {
    let rest;
    for (let i = 0; i <= 190; i++) {
        const elapsed = i / 60;
        const platform = { x: 0, y: 0, angle: .1 * Math.sin(elapsed * Math.PI / 3) };
        const body = bodyFor([{ row: 3, column: 2 }], { rows: 4, columns: 5, platform });
        const vibration = .009 * Math.sin(i * 1.7);
        body.x += vibration * Math.cos(platform.angle);
        body.y += vibration * Math.sin(platform.angle);
        rest = observeRecoveryRest({ elapsed, bodies: [body], platform, hasRestContacts: i % 3 !== 0,
            relativeSettled: false, relativeQuietSeconds: 0,
            oscillation: { halfPeriod: 3, equilibriumAngle: 0 } }, rest, 1);
        if (elapsed < 3) assert.equal(rest.ready, false);
    }
    assert.equal(rest.ready, true);
});

test('observable rest waits through motion and ignores small solver jitter at timeout', () => {
    const body = bodyFor([{ row: 3, column: 2 }], { rows: 4, columns: 5 });
    let state = null;
    const sample = (elapsed, x, contacts = true) => {
        body.x = x;
        state = observeRecoveryRest({ elapsed, hasRestContacts: contacts, bodies: [body] }, state, 1);
        return state?.ready || false;
    };
    assert.equal(sample(0, 0), false);
    assert.equal(sample(0.2, 0), false);
    assert.equal(sample(1, 0.04), false);
    assert.equal(sample(2, 0.08), false, 'still falling inside snap tolerance');
    assert.equal(sample(2.5, 0.081), false);
    assert.equal(sample(3.1, 0.079), true);
    assert.equal(sample(8, 0.08), true, 'timeout does not veto an observed quiet interval');
    assert.equal(sample(8.1, 0.08, false), true, 'a brief contact gap does not veto an already bounded trajectory');
});

test('caller-selected corner tolerance changes recovery threshold', () => {
    const body = bodyFor([{ row: 3, column: 2 }], { rows: 4, columns: 5 });
    body.x += 0.15;
    const args = { snapshot: { bodies: [body] }, rows: 4, columns: 5, cellSizeMeters: 1 };
    assert.equal(recoverGrid({ ...args, epsilonCells: 0.1 }), null);
    assert.ok(recoverGrid({ ...args, epsilonCells: 0.2 }));
});

test('a long rocking cycle waits beyond eight seconds and restarts after any relative motion', () => {
    let rest;
    const sample = (elapsed, slip = 0) => {
        const frequency = Math.PI / 12;
        const platform = { x: 0, y: 0, angle: .1 * Math.sin(elapsed * frequency),
            omega: .1 * frequency * Math.cos(elapsed * frequency) };
        const body = bodyFor([{ row: 3, column: 2 }], { rows: 4, columns: 5, platform });
        body.x += slip;
        rest = observeRecoveryRest({ elapsed, bodies: [body], platform, hasRestContacts: true,
            relativeSettled: true, oscillation: { halfPeriod: 12, equilibriumAngle: 0 } }, rest, 1);
        return rest.ready;
    };
    for (let i = 0; i < 720; i++) assert.equal(sample(i / 60), false);
    assert.equal(sample(12.05), true);
    assert.equal(sample(12.1, .02), false);
    for (let i = 727; i <= 1400; i++) assert.equal(sample(i / 60), false);
});

function bodyFor(cells, { rows, columns, angle = 0, platform = null, cellSize = 1, id = 1 } = {}) {
    const centres = cells.map(cell => center(cell.row, cell.column, rows, columns, cellSize));
    const com = centres.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    com.x /= centres.length; com.y /= centres.length;
    const c = Math.cos(angle), s = Math.sin(angle);
    const rotatedCom = { x: c * com.x - s * com.y, y: s * com.x + c * com.y };
    const frame = platform || { x: 0, y: 0, angle: 0 };
    const fc = Math.cos(frame.angle), fs = Math.sin(frame.angle);
    const worldCom = {
        x: frame.x + fc * rotatedCom.x - fs * rotatedCom.y,
        y: frame.y + fs * rotatedCom.x + fc * rotatedCom.y,
    };
    return {
        id,
        x: worldCom.x,
        y: worldCom.y,
        angle: frame.angle + angle,
        cells: cells.map((cell, index) => ({
            x: centres[index].x - com.x,
            y: centres[index].y - com.y,
            value: cell.value || 1,
        })),
    };
}

test('recovery accepts a small translated body and returns exact lattice cells', () => {
    const rows = 4, columns = 5;
    const body = bodyFor([{ row: 3, column: 2 }], { rows, columns });
    body.x += 0.04; body.y -= 0.03;
    const recovered = recoverGrid({ snapshot: { platform: null, bodies: [body] }, rows, columns, cellSizeMeters: 1 });
    assert.deepEqual(recovered.cells, [{ row: 3, column: 2, value: 1, bodyId: 1 }]);
    assert.equal(recovered.rockingState.omega, 0);
    assert.equal(recovered.rockingState.alpha, 0);
    assert.ok(recovered.maxErrorCells < 0.1);
});

test('recovery allows a real quarter-turn when all square corners stay on vertices', () => {
    const rows = 5, columns = 5;
    const cells = [{ row: 3, column: 0 }, { row: 3, column: 1 }, { row: 4, column: 0 }];
    const body = bodyFor(cells, { rows, columns, angle: Math.PI / 2 });
    // The COM of an L triomino is fractional.  A real quarter-turn that
    // remains on the lattice therefore includes the corresponding whole-cell
    // translation after rotation.
    body.x -= 0.5; body.y += 0.5;
    const recovered = recoverGrid({ snapshot: { platform: null, bodies: [body] }, rows, columns, cellSizeMeters: 1 });
    assert.deepEqual(recovered.cells.map(({ row, column }) => `${row},${column}`), ['3,2', '3,3', '4,3']);
});

test('recovery rejects misaligned rotations, overlapping cells, and invalid rocking poses', () => {
    const rows = 4, columns = 4;
    const misaligned = bodyFor([{ row: 3, column: 1 }], { rows, columns, angle: 0.2 });
    assert.equal(recoverGrid({ snapshot: { platform: null, bodies: [misaligned] }, rows, columns, cellSizeMeters: 1 }), null);

    const first = bodyFor([{ row: 3, column: 1 }], { rows, columns, id: 1 });
    const second = bodyFor([{ row: 3, column: 1 }], { rows, columns, id: 2 });
    assert.equal(recoverGrid({ snapshot: { platform: null, bodies: [first, second] }, rows, columns, cellSizeMeters: 1 }), null);

    const shape = rockingGeometry(2, 60, 10);
    const platform = { x: 0, y: 0, angle: shape.halfAngle + 0.01 };
    const body = bodyFor([{ row: 3, column: 1 }], { rows, columns, platform });
    assert.equal(recoverGrid({ snapshot: { platform, bodies: [body] }, rows, columns, cellSizeMeters: 1, rockingShape: shape }), null);
});

test('rocking recovery removes dynamic platform translation drift and returns canonical pose', () => {
    const rows = 4, columns = 5, angle = 0.18;
    const shape = rockingGeometry(2, 60, 10);
    const platform = { x: 0.07, y: -0.04, angle };
    const body = bodyFor([{ row: 3, column: 2 }, { row: 3, column: 3 }], { rows, columns, platform, cellSize: 1 });
    const recovered = recoverGrid({ snapshot: { platform, bodies: [body] }, rows, columns, cellSizeMeters: 1, rockingShape: shape });
    assert.deepEqual(recovered.cells.map(({ row, column }) => `${row},${column}`), ['3,2', '3,3']);
    assert.ok(Math.abs(recovered.platform.angle - angle) < 1e-12);
    assert.ok(Math.abs(recovered.platform.x - (shape.radius * angle - shape.d * Math.sin(angle))) < 1e-12);
    assert.ok(Math.abs(recovered.platform.y - shape.d * (Math.cos(angle) - 1)) < 1e-12);
});

test('alignment is measured on the visible deck even after substantial deck translation', () => {
    const rows = 4, columns = 5, shape = rockingGeometry(5, 60, 20);
    const platform = { x: .8, y: -.02, angle: -.1 };
    const body = bodyFor([{ row: 3, column: 2 }], { rows, columns, platform, cellSize: 1 });
    const recovered = recoverGrid({ snapshot: { platform, bodies: [body] }, rows, columns, cellSizeMeters: 1, rockingShape: shape });
    assert.ok(recovered);
    assert.ok(Math.abs(recovered.platform.x + recovered.rockingState.offsetX - platform.x) < 1e-12);
    assert.deepEqual(recovered.cells.map(c => [c.row, c.column]), [[3, 2]]);
});

test('collapse has a finite timeout distinct from settled rest', () => {
    const simulation = createCollapseSimulation({
        rows: 1,
        columns: 1,
        maxSeconds: 0.02,
        cells: [{ row: 0, column: 0, value: 1, bodyId: 1 }],
        physics: { cellSizeMeters: 1, gravity: 9.81, blockMassKg: 1, pieceFriction: 0, platformFriction: 0, walls: false },
    });
    simulation.step(1);
    const snapshot = simulation.snapshot();
    assert.equal(snapshot.elapsed, 0.02);
    assert.equal(snapshot.timedOut, true);
    assert.equal(snapshot.settled, false);
    simulation.step(1);
    assert.equal(simulation.snapshot().elapsed, 0.02);
});

test('even an aligned motionless piece must complete the observation interval', () => {
    const simulation = createCollapseSimulation({ rows: 1, columns: 2,
        cells: [{ row: 0, column: 0, value: 1, bodyId: 1 }], physics: { cellSizeMeters: .3 } });
    simulation.step(.8);
    assert.equal(simulation.snapshot().settled, false);
    simulation.step(1.4);
    assert.equal(simulation.snapshot().settled, true);
    assert.ok(simulation.snapshot().quietSeconds >= COLLAPSE_NUMERICS.settleHoldSeconds);
});

test('stationary long stacks remain finite during collapse integration', () => {
    const cells = [];
    let id = 1;
    for (let row = 0; row < 12; row++) for (let column = 0; column < 4; column++) {
        cells.push({ row, column, value: 1, bodyId: id++ });
    }
    const simulation = createCollapseSimulation({
        rows: 12,
        columns: 4,
        cells,
        physics: { cellSizeMeters: 0.3, gravity: 9.81, blockMassKg: 1, pieceFriction: 0.2, platformFriction: 0.2, walls: false },
    });
    let peakSpeed = 0;
    for (let step = 0; step < 5 * 240; step++) {
        simulation.step(1 / 240);
        const current = simulation.snapshot();
        for (const body of current.bodies) peakSpeed = Math.max(peakSpeed, Math.hypot(body.vx, body.vy));
        if (current.settled || current.timedOut) break;
    }
    const snapshot = simulation.snapshot();
    assert.ok(snapshot.elapsed <= COLLAPSE_NUMERICS.maxSeconds);
    assert.ok(snapshot.bodies.every(body => [body.x, body.y, body.angle].every(Number.isFinite)));
    assert.equal(snapshot.timedOut, false);
    assert.equal(snapshot.settled, true);
    assert.ok(peakSpeed < 0.1, `unforced pile acquired a velocity kick: ${peakSpeed} m/s`);
});

test('rolling resistance cannot reverse near-rest rotation through the deck-origin inertia', () => {
    const shape = rockingGeometry(3, 120, 20);
    const simulation = createCollapseSimulation({ rows: 10, columns: 10, cells: [],
        physics: { cellSizeMeters: .3, gravity: 9.81 }, rockingShape: shape,
        rockingState: { angle: 0, omega: 1e-5, alpha: 0 }, rollingFriction: 10 });
    const body = simulation.platformBody;
    const center = body.getLocalCenter();
    const inertiaAtCenter = body.getInertia() - body.getMass() * (center.x ** 2 + center.y ** 2);
    const maximumStoppingTorque = inertiaAtCenter * Math.abs(body.getAngularVelocity()) / COLLAPSE_NUMERICS.stepSeconds;
    const applied = [];
    const applyTorque = body.applyTorque.bind(body);
    body.applyTorque = torque => { applied.push(torque); applyTorque(torque); };
    simulation.step(COLLAPSE_NUMERICS.stepSeconds);
    assert.ok(applied.length > 0);
    assert.ok(Math.abs(applied[0]) <= maximumStoppingTorque * (1 + 1e-10));
});

test('high-friction contacts cannot add mechanical energy to a gently moving pile', () => {
    const cells = [];
    for (let row = 5; row < 8; row++) for (const column of [4, 5])
        cells.push({ row, column, value: 1, bodyId: row * 10 + column });
    const simulation = createCollapseSimulation({ rows: 8, columns: 10, cells,
        physics: { cellSizeMeters: .3, gravity: 9.81, pieceFriction: 1000, platformFriction: 1000 },
        rockingShape: rockingGeometry(3, 60, 20), rockingState: { angle: .015, omega: .02, alpha: 0 } });
    const energy = () => {
        let total = 0, potential = 0;
        for (let body = simulation.world.getBodyList(); body; body = body.getNext()) {
            if (!body.isDynamic()) continue;
            const m = body.getMass(), v = body.getLinearVelocity(), c = body.getLocalCenter();
            const inertia = body.getInertia() - m * (c.x * c.x + c.y * c.y);
            total += m * ((v.x * v.x + v.y * v.y) / 2 - 9.81 * body.getWorldCenter().y)
                + inertia * body.getAngularVelocity() ** 2 / 2;
            potential -= m * 9.81 * body.getWorldCenter().y;
        }
        return { total, potential, kinetic: total - potential };
    };
    const initial = energy().total;
    for (let i = 0; i < 240; i++) {
        simulation.step(1 / 240);
        const current = energy();
        assert.ok(current.kinetic <= Math.max(0, initial - current.potential) + 0.1,
            'contacts converted numerical depenetration into a velocity kick');
    }
});
