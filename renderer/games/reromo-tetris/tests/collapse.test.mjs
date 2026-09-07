import assert from 'node:assert/strict';
import test from 'node:test';
import { createCollapseSimulation } from '../collapse-physics.js';
import { rockingGeometry } from '../rocking-physics.js';

const PHYSICS = Object.freeze({
    cellSizeMeters: 1,
    blockMassKg: 2,
    gravity: 9.81,
    pieceFriction: 0.35,
    wallFriction: 0.8,
    platformFriction: 0.6,
    walls: false,
});

function stepFor(simulation, seconds, dt = 1 / 60) {
    for (let elapsed = 0; elapsed < seconds - 1e-12; elapsed += dt) simulation.step(Math.min(dt, seconds - elapsed));
}

test('the finite floor lets a 5-cell overhang tip under gravity', () => {
    const simulation = createCollapseSimulation({
        rows: 1,
        columns: 2,
        cells: Array.from({ length: 5 }, (_, column) => ({ row: 0, column, value: 1, bodyId: 7 })),
        physics: { ...PHYSICS, blockMassKg: 1, pieceFriction: 0, platformFriction: 0 },
    });
    const initial = simulation.snapshot();
    assert.equal(initial.bodies.length, 1);
    assert.equal(initial.bodies[0].cells.length, 5);
    assert.equal(initial.bodies[0].x, 1.5);
    assert.equal(initial.bodies[0].y, -0.5);
    assert.equal(initial.settled, false);

    simulation.step(1 / 60);
    const after = simulation.snapshot();
    assert.ok(Math.abs(after.bodies[0].angle) > 1e-4 || after.bodies[0].y > -0.51,
        'overhanging body did not begin a physical tip');
    assert.equal(after.settled, false);
});

test('stacked independent pieces collide and reach physical rest', () => {
    const cells = [];
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 2; column++) {
            cells.push({ row, column, value: row + 1, bodyId: row * 2 + column + 1 });
        }
    }
    const simulation = createCollapseSimulation({ rows: 3, columns: 2, cells, physics: PHYSICS });
    stepFor(simulation, 3);
    const result = simulation.snapshot();
    assert.equal(result.bodies.length, 6);
    assert.equal(result.settled, true);
    assert.ok(result.contacts.length >= 2, 'resting stack has no contact points');
    for (const body of simulation.pieceBodies.values()) {
        assert.equal(body.getMass(), PHYSICS.blockMassKg);
    }
});

test('piece, platform and wall contacts retain independent friction values', () => {
    const simulation = createCollapseSimulation({
        rows: 2,
        columns: 1,
        cells: [
            { row: 0, column: 0, value: 1, bodyId: 1 },
            { row: 1, column: 0, value: 2, bodyId: 2 },
        ],
        physics: { ...PHYSICS, pieceFriction: 0.21, platformFriction: 0.73, wallFriction: 0.91, walls: true },
    });
    simulation.step(1 / 60);
    const frictionByKinds = new Map();
    for (let contact = simulation.world.getContactList(); contact; contact = contact.getNext()) {
        if (!contact.isTouching()) continue;
        const kinds = [contact.getFixtureA().getUserData().kind, contact.getFixtureB().getUserData().kind].sort().join('+');
        frictionByKinds.set(kinds, contact.getFriction());
    }
    assert.equal(frictionByKinds.get('piece+piece'), 0.21);
    assert.equal(frictionByKinds.get('floor+piece'), 0.73);
});

test('rocking pieces begin with the platform transform and material-point velocity', () => {
    const shape = rockingGeometry(3, 60, 20);
    const rockingState = { angle: 0.22, omega: 0.37, alpha: -0.1 };
    const simulation = createCollapseSimulation({
        rows: 3,
        columns: 4,
        cells: [{ row: 2, column: 1, value: 4, bodyId: 12 }],
        physics: PHYSICS,
        rockingShape: shape,
        rockingState,
        rollingFriction: 0,
    });
    const platform = simulation.platformBody;
    const piece = simulation.pieceBodies.get(12);
    assert.ok(platform);
    assert.equal(platform.getAngle(), rockingState.angle);
    assert.equal(platform.getAngularVelocity(), rockingState.omega);
    const originVelocity = platform.getLinearVelocityFromWorldPoint(platform.getPosition());
    const expectedOriginVelocity = {
        x: (shape.radius - shape.d * Math.cos(rockingState.angle)) * rockingState.omega,
        y: -shape.d * Math.sin(rockingState.angle) * rockingState.omega,
    };
    assert.ok(Math.abs(originVelocity.x - expectedOriginVelocity.x) < 1e-12);
    assert.ok(Math.abs(originVelocity.y - expectedOriginVelocity.y) < 1e-12);
    assert.equal(piece.getAngle(), rockingState.angle);
    assert.equal(piece.getAngularVelocity(), rockingState.omega);
    const expectedVelocity = platform.getLinearVelocityFromWorldPoint(piece.getPosition());
    const velocity = piece.getLinearVelocity();
    assert.ok(Math.abs(velocity.x - expectedVelocity.x) < 1e-12);
    assert.ok(Math.abs(velocity.y - expectedVelocity.y) < 1e-12);

    const platformSnapshot = simulation.snapshot().platform;
    assert.ok(Math.abs(platformSnapshot.x) > 0);
    assert.ok(Math.abs(platformSnapshot.y) > 0);
    assert.ok(simulation.snapshot().contacts.length > 0, 'platform was not initially touching ground');
});

test('body IDs keep disconnected cells separate while a connected shape stays rigid', () => {
    const simulation = createCollapseSimulation({
        rows: 3,
        columns: 4,
        cells: [
            { row: 2, column: 0, value: 1 },
            { row: 2, column: 1, value: 1 },
            { row: 1, column: 1, value: 1 },
            { row: 0, column: 3, value: 2 },
        ],
        physics: { ...PHYSICS, blockMassKg: 1 },
    });
    const initial = simulation.snapshot();
    assert.equal(initial.bodies.length, 2);
    assert.deepEqual(initial.bodies.map(body => body.cells.length), [3, 1]);
    assert.equal(simulation.pieceBodies.get(initial.bodies[0].id).getMass(), 3);
    assert.equal(simulation.pieceBodies.get(initial.bodies[1].id).getMass(), 1);
    const expectedOffsets = [[-2 / 3, 1 / 3], [1 / 3, 1 / 3], [1 / 3, -2 / 3]];
    for (const [actual, expected] of initial.bodies[0].cells.map((cell, index) => [[cell.x, cell.y], expectedOffsets[index]])) {
        assert.ok(Math.abs(actual[0] - expected[0]) < 1e-12);
        assert.ok(Math.abs(actual[1] - expected[1]) < 1e-12);
    }
});

test('rocking platform preserves its analytic mass and reports ground contacts', () => {
    const shape = rockingGeometry(2, 90, 17);
    const simulation = createCollapseSimulation({
        rows: 2,
        columns: 2,
        cells: [{ row: 1, column: 0, value: 1, bodyId: 3 }, { row: 1, column: 1, value: 1, bodyId: 4 }],
        physics: { ...PHYSICS, blockMassKg: 1 },
        rockingShape: shape,
        rockingState: { angle: 0, omega: 0, alpha: 0 },
    });
    assert.equal(simulation.platformBody.getMass(), shape.massKg);
    assert.equal(simulation.pieceBodies.get(3).getMass(), 1);
    assert.equal(simulation.pieceBodies.get(4).getMass(), 1);
    const contacts = simulation.contactPoints();
    assert.ok(contacts.some(point => Math.abs(point.y - shape.sag) < 1e-3),
        `missing ground contact at sag ${shape.sag}`);
    simulation.step(1 / 60);
    assert.ok(simulation.snapshot().contacts.length > 0);
});


test('fine arc retains its lower surface and a heavy platform starts without a collision kick', () => {
    for (const degrees of [5, 60, 180]) {
        const shape = rockingGeometry(1.5, degrees, 1000);
        const simulation = createCollapseSimulation({ rows: 1, columns: 5,
            cells: [], physics: { ...PHYSICS, cellSizeMeters: 0.3 }, rockingShape: shape,
            rockingState: { angle: 0, omega: 0, alpha: 0 } });
        const vertices = simulation.platformFixtures[0].getShape().m_vertices;
        assert.ok(Math.abs(Math.max(...vertices.map(v => v.y)) - shape.sag) < 1e-10);
        simulation.step(10);
        assert.ok(Math.abs(simulation.snapshot().platform.y) < 0.002, `ground lost at arc ${degrees}`);
        assert.ok(Math.abs(simulation.snapshot().platform.angle) < 0.002);
        assert.equal(simulation.snapshot().settled, true);
    }
    const simulation = createCollapseSimulation({ rows: 1, columns: 5,
        cells: [3, 4, 5, 6, 7].map(column => ({ row: 0, column, value: 1, bodyId: 1 })),
        physics: { ...PHYSICS, cellSizeMeters: 0.3, blockMassKg: 1, platformFriction: 1 },
        rockingShape: rockingGeometry(1.5, 60, 1000), rockingState: { angle: 0, omega: 0, alpha: 0 } });
    simulation.step(1 / 240);
    const pose = simulation.snapshot().platform;
    assert.ok(Math.abs(pose.x) < 0.001 && Math.abs(pose.y) < 0.001 && Math.abs(pose.angle) < 0.001);
    assert.equal(simulation.snapshot().settled, false, 'instantaneous low speed is not settled');
    simulation.step(10);
    assert.ok(Math.abs(simulation.snapshot().platform.y) < 0.01);
    assert.ok(Math.abs(simulation.snapshot().bodies[0].angle) > 0.05);
});
