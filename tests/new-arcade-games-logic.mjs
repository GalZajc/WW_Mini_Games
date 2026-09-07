import assert from 'node:assert/strict';

import {
    DINO_RUNNER_DEFAULTS,
    nextDinoObstacleGap,
    readDinoRunnerSettings,
    validateDinoRunnerSettings,
} from '../renderer/games/dino-runner/game.js';
import {
    ROBOT_ISLAND_DEFAULTS,
    isRobotOnIsland,
    readRobotIslandParameters,
} from '../renderer/games/robot-island/game.js';
import {
    BOWL_BALANCE_DEFAULTS,
    bowlRadialFraction,
    stepSphericalBowlParticle,
} from '../renderer/games/spherical-bowl-balance/game.js';
import {
    BOWL_SHARED_DEFAULTS,
    stepRollingSurfaceBody,
} from '../renderer/games/spherical-bowl-balance/physics.js';
import { resolveCircleSegmentCollision } from '../renderer/games/cup-and-ball/game-2d.js';

const dino = readDinoRunnerSettings(DINO_RUNNER_DEFAULTS);
assert.equal(dino.runningSpeed, DINO_RUNNER_DEFAULTS.runningSpeed);
assert.throws(
    () => validateDinoRunnerSettings({ ...dino, jumpSpeed: 0 }),
    /greater than zero/,
);
for (let index = 0; index < 100; index++) {
    const gap = nextDinoObstacleGap(dino, () => ((index * 0.61803398875) % 1));
    assert.ok(Number.isFinite(gap));
    assert.ok(gap >= 0.01);
}
const flightDistance = dino.runningSpeed * 2 * dino.jumpSpeed / dino.gravity;
assert.ok(flightDistance > 5.5, 'The default jump must comfortably clear a normal single obstacle.');

const robot = readRobotIslandParameters(ROBOT_ISLAND_DEFAULTS);
assert.equal(isRobotOnIsland('1d', { x: 0, y: 0 }, robot.islandLength), true);
assert.equal(isRobotOnIsland('1d', { x: robot.islandLength, y: 0 }, robot.islandLength), false);
assert.equal(isRobotOnIsland('2d', { x: 0, y: 0 }, robot.islandLength), true);
assert.equal(isRobotOnIsland('2d', { x: 0, y: robot.islandLength }, robot.islandLength), false);

const bowl = BOWL_BALANCE_DEFAULTS;
const particle = {
    position: { x: 0, y: -bowl.bowlRadius, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
};
assert.equal(bowlRadialFraction(particle.position, bowl), 0);
assert.ok(bowl.bandInnerFraction >= 0.85, 'The default target band should be near the rim.');
for (let index = 0; index < 100; index++) {
    stepSphericalBowlParticle(particle, { x: 3, z: 0 }, bowl, 1 / 240);
}
assert.ok([particle.position.x, particle.position.y, particle.position.z,
    particle.velocity.x, particle.velocity.y, particle.velocity.z].every(Number.isFinite));
assert.ok(Math.abs(Math.hypot(particle.position.x, particle.position.y, particle.position.z)
    - bowl.bowlRadius) < 1e-9);

// A solid sphere starts in pure rolling contact, remains on its smaller
// centre path R-r, and develops the no-slip angular velocity v/r.
const marbleParameters = { ...BOWL_SHARED_DEFAULTS };
const marblePathRadius = marbleParameters.bowlRadius - marbleParameters.marbleRadius;
const marble = {
    position: { x: marblePathRadius * 0.35, y: -marblePathRadius * Math.sqrt(1 - 0.35 ** 2), z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    omega: { x: 0, y: 0, z: 0 },
};
for (let index = 0; index < 360; index++) {
    stepRollingSurfaceBody(marble, { x: 0, z: 0 }, marbleParameters, 1 / 300);
}
assert.ok(Math.abs(Math.hypot(marble.position.x, marble.position.y, marble.position.z)
    - marblePathRadius) < 1e-9);
assert.equal(marble.contactMode, 'rolling');
assert.ok(marble.slipSpeed < 1e-8);

// The 2D cup wall is a moving rigid contact: penetration is projected out,
// the inward normal velocity rebounds, and tangential friction slows sliding.
const cupHit = resolveCircleSegmentCollision({
    position: { x: 0.12, y: 0.4 },
    velocity: { x: -3, y: 2 },
    radius: 0.2,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    restitution: 0.5,
    friction: 0.4,
});
assert.equal(cupHit.collided, true);
assert.ok(cupHit.position.x >= 0.2);
assert.ok(cupHit.velocity.x > 0);
assert.ok(cupHit.velocity.y < 2);

console.log('New arcade game logic tests passed.');
