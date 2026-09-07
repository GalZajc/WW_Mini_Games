import assert from 'node:assert/strict';
import StandingSwingJumpGame, {
    readSwingParameters,
    solveStandingSwingAcceleration,
    standingSwingArmGeometry,
    standingSwingElbowPosition,
} from '../renderer/games/standing-swing-jump/game.js';
import WheelieBalanceGame, {
    generateTerrainBump,
    readWheelieParameters,
    sampleTerrain,
    wheelieForces,
    wheelieGeometry,
} from '../renderer/games/wheelie-balance/game.js';

const silentAudio = Object.freeze({
    playClick() {},
    playPlasticImpact() {},
});

function simulateSwing(targetForState, duration = 15) {
    const game = makeSwingGame().game;
    game.phase = 'playing';
    const parameters = game.parameters;
    const step = 1 / 300;
    let maximumAngle = 0;
    let maximumRelativeLean = 0;
    for (let index = 0; index < duration / step; index++) {
        game.desiredArmReach = targetForState(game, parameters);
        const acceleration = solveStandingSwingAcceleration(
            game,
            parameters,
            game.armTargetReach,
        );
        game._integrateAttached(step);
        maximumAngle = Math.max(maximumAngle, Math.abs(game.theta));
        const relative = Math.atan2(
            Math.sin(game.beta - game.theta),
            Math.cos(game.beta - game.theta),
        );
        maximumRelativeLean = Math.max(
            maximumRelativeLean,
            Math.abs(relative),
        );
        assert.ok([
            game.theta,
            game.thetaVelocity,
            game.beta,
            game.betaVelocity,
            acceleration.armForce,
        ].every(Number.isFinite));
        const arm = standingSwingArmGeometry(game, parameters);
        assert.ok(Math.abs(
            arm.seat.x * arm.hand.y - arm.seat.y * arm.hand.x,
        ) < 1e-9, 'The attached hand left the rope line.');
        const elbow = standingSwingElbowPosition(arm.shoulder, arm.hand, parameters);
        assert.ok(Math.abs(Math.hypot(
            elbow.x - arm.shoulder.x,
            elbow.y - arm.shoulder.y,
        ) - parameters.upperArmLength) < 1e-8);
        assert.ok(Math.abs(Math.hypot(
            arm.hand.x - elbow.x,
            arm.hand.y - elbow.y,
        ) - parameters.forearmLength) < 1e-8);
    }
    return { game, maximumAngle, maximumRelativeLean };
}

// A phase-correct arm extension/bend sequence must add meaningful swing energy
// through the closed mechanism, while neutral arms merely hold their bend.
{
    const passive = simulateSwing((_state, parameters) => parameters.neutralArmReach);
    const pumped = simulateSwing((state, parameters) => {
        const quadrant = (state.theta >= 0 ? 2 : 0) + (state.thetaVelocity >= 0 ? 1 : 0);
        const extend = Boolean((2 >> quadrant) & 1);
        return extend ? parameters.extendedArmReach : parameters.pulledArmReach;
    });
    assert.ok(pumped.maximumAngle > passive.maximumAngle + 0.3,
        'Correctly phased arm movement did not pump the standing swing.');
    assert.ok(pumped.maximumRelativeLean < 0.55,
        'The rigid two-link arms allowed an impossible body fold.');
}

// R really straightens the two-link arm and leans the body away from the
// fixed grip; T bends the same arm without ever releasing that grip.
{
    const game = makeSwingGame().game;
    game.phase = 'playing';
    game.desiredArmReach = game.parameters.extendedArmReach;
    for (let index = 0; index < 600; index++) game._integrateAttached(1 / 300);
    const extended = standingSwingArmGeometry(game, game.parameters);
    game.desiredArmReach = game.parameters.pulledArmReach;
    for (let index = 0; index < 600; index++) game._integrateAttached(1 / 300);
    const bent = standingSwingArmGeometry(game, game.parameters);
    assert.ok(extended.distance > bent.distance + 0.35);
    assert.ok(Math.abs(
        bent.seat.x * bent.hand.y - bent.seat.y * bent.hand.x,
    ) < 1e-9);
    assert.equal(game.flightPosition, null, 'R/T detached the hands before a jump.');
}

// Even extreme body/arm settings are normalized to a reachable grip instead
// of producing a visually stretched limb.
{
    const parameters = readSwingParameters({
        riderHeight: 2.15,
        shoulderHeightFraction: 0.84,
        upperArmLength: 0.22,
        forearmLength: 0.22,
        handHeightAboveSeat: 0.9,
    });
    const state = { theta: 0, thetaVelocity: 0, beta: 0, betaVelocity: 0 };
    const arm = standingSwingArmGeometry(state, parameters);
    assert.ok(arm.distance <= parameters.upperArmLength + parameters.forearmLength);
}

function makeSwingGame(width = 1280, height = 720) {
    const submissions = [];
    const mouse = { x: 0, y: 0 };
    const input = {
        getMousePos: () => ({ ...mouse }),
        isActionDown: () => false,
        isActionJustDown: () => false,
        isActionJustUp: () => false,
    };
    const game = new StandingSwingJumpGame();
    game._setup(
        { width, height }, null, input, silentAudio, {},
        result => submissions.push(result), () => {}, null, {}, null,
    );
    return { game, mouse, submissions };
}

// Resize is render-only: two metre-based simulations stay bit-identical.
{
    const first = makeSwingGame(1280, 720).game;
    const second = makeSwingGame(900, 900).game;
    first.phase = second.phase = 'playing';
    for (let index = 0; index < 900; index++) {
        first.update(1 / 300);
        second.update(1 / 300);
    }
    assert.equal(first.theta, second.theta);
    assert.equal(first.beta, second.beta);
    assert.equal(first.thetaVelocity, second.thetaVelocity);
}

// Releasing a right/up drag adds a right/up physical launch velocity and the
// ballistic landing submits horizontal distance rather than screen pixels.
{
    const { game, mouse, submissions } = makeSwingGame();
    game.phase = 'playing';
    const inherited = game._riderComVelocity();
    mouse.x = 565;
    mouse.y = 305;
    game.drag = { start: { x: 400, y: 420 }, current: { x: 565, y: 305 } };
    game._releaseFromDrag();
    assert.ok(game.flightVelocity.x > inherited.x + 2);
    assert.ok(game.flightVelocity.y > inherited.y + 1);
    for (let index = 0; index < 5000 && game.phase !== 'done'; index++) {
        game.update(1 / 300);
    }
    assert.equal(game.phase, 'done');
    assert.equal(submissions.length, 1);
    assert.ok(submissions[0].distance > 1);
}

function makeWheelieGame(settings = {}) {
    const submissions = [];
    let throttle = false;
    const input = {
        isActionDown: () => throttle,
        isActionJustDown: () => false,
    };
    const game = new WheelieBalanceGame();
    game._setup(
        { width: 1280, height: 720 }, null, input, silentAudio, {
            meanTerrainAmplitude: 0,
            terrainAmplitudeStdDev: 0,
            ...settings,
        },
        result => submissions.push(result), () => {}, null, {}, null,
    );
    game.phase = 'running';
    return { game, submissions, setThrottle: value => { throttle = value; } };
}

function makeRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

// The named terrain width is a real full width at half maximum, not an
// arbitrary visual scale, and the analytic slope is zero at each hilltop.
{
    const bump = { centre: 17, amplitude: 0.8, fwhm: 12 };
    const peak = sampleTerrain([bump], bump.centre);
    const leftHalf = sampleTerrain([bump], bump.centre - bump.fwhm / 2);
    const rightHalf = sampleTerrain([bump], bump.centre + bump.fwhm / 2);
    assert.ok(Math.abs(peak.height - bump.amplitude) < 1e-12);
    assert.ok(Math.abs(peak.slope) < 1e-12);
    assert.ok(Math.abs(leftHalf.height - bump.amplitude / 2) < 1e-12);
    assert.ok(Math.abs(rightHalf.height - bump.amplitude / 2) < 1e-12);
}

// Seeded generation is repeatable and both requested standard deviations
// materially affect the course rather than being swallowed by clamping.
{
    const parameters = readWheelieParameters();
    const sequenceFor = seed => {
        const random = makeRandom(seed);
        const bumps = [];
        for (let index = 0; index < 1200; index++) {
            bumps.push(generateTerrainBump(
                bumps[bumps.length - 1] || null,
                parameters,
                random,
                index,
            ));
        }
        return bumps;
    };
    const first = sequenceFor(0x7157cafe);
    const second = sequenceFor(0x7157cafe);
    assert.deepEqual(first, second);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = values => {
        const average = mean(values);
        return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
    };
    const amplitudes = first.map(bump => bump.amplitude);
    const widths = first.map(bump => bump.fwhm);
    assert.ok(Math.abs(mean(amplitudes) - parameters.meanTerrainAmplitude) < 0.02);
    assert.ok(Math.abs(deviation(amplitudes) - parameters.terrainAmplitudeStdDev) < 0.02);
    assert.ok(Math.abs(mean(widths) - parameters.meanTerrainFwhm) < 0.7);
    assert.ok(Math.abs(deviation(widths) - parameters.terrainFwhmStdDev) < 0.7);
}

// Engine power is intentionally absent from the record key even when the live
// slider changes it by a large amount.
{
    const { game } = makeWheelieGame();
    game.enginePowerKw = 20;
    const weakKey = game.getRecordSettings();
    game.enginePowerKw = 210;
    const strongKey = game.getRecordSettings();
    assert.deepEqual(strongKey, weakKey);
    assert.equal(Object.hasOwn(strongKey, 'enginePowerKw'), false);
    assert.equal(Object.hasOwn(strongKey, 'meanTerrainAmplitude'), true);
    const rougher = makeWheelieGame({ meanTerrainAmplitude: 0.9 }).game.getRecordSettings();
    assert.notDeepEqual(rougher, strongKey);
}

// Rolling resistance acts only longitudinally and a higher configured value
// produces stronger coasting deceleration.
{
    const state = { velocity: 12, pitch: 0 };
    const low = wheelieForces(state, readWheelieParameters({ rollingResistance: 0.005 }), 80, false);
    const high = wheelieForces(state, readWheelieParameters({ rollingResistance: 0.06 }), 80, false);
    assert.ok(high.longitudinalAcceleration < low.longitudinalAcceleration);
    assert.equal(low.driveForce, 0);
}

// Default rear-wheel traction can lift the front. A binary throttle controller
// can then genuinely balance it for a substantial distance; permanent full
// throttle eventually crosses the rear-contact stability boundary.
{
    const balanced = makeWheelieGame().game;
    for (let index = 0; index < 6000 && balanced.phase !== 'done'; index++) {
        let throttle = true;
        if (balanced.hasLifted) {
            const target = 40 * Math.PI / 180;
            throttle = 4 * (target - balanced.pitch) - 1.6 * balanced.pitchVelocity > 0;
        }
        balanced._integrate(1 / 300, throttle);
    }
    assert.equal(balanced.hasLifted, true);
    assert.ok(balanced.distance > 150,
        `Binary throttle could not sustain a wheelie: ${balanced.distance} m.`);

    const fullThrottle = makeWheelieGame().game;
    let backwardCrashStart = null;
    let backwardCrashFrames = 0;
    for (let index = 0; index < 3000 && fullThrottle.phase !== 'done'; index++) {
        fullThrottle._integrate(1 / 300, true);
        if (fullThrottle.phase === 'crashing') {
            backwardCrashFrames++;
            backwardCrashStart ||= {
                pitch: fullThrottle.pitch,
                distance: fullThrottle.distance,
            };
        }
    }
    assert.ok(backwardCrashStart, 'Backward balance loss skipped its crash simulation.');
    assert.ok(backwardCrashFrames > 10, 'Backward rollover ended before it was visible.');
    assert.equal(fullThrottle.phase, 'done');
    assert.match(fullThrottle.endReason, /backwards/i);
    assert.ok(fullThrottle.pitch > backwardCrashStart.pitch + 0.3,
        'The car did not physically rotate onto its rear body after balance was lost.');
    assert.ok(fullThrottle.backwardBodyPivot,
        'The rear-body impact did not replace the rear-wheel pivot.');
    assert.ok(fullThrottle.pitch > 2.2,
        'The car stopped upright on its bumper instead of toppling onto its roof.');
    assert.equal(fullThrottle.distance, backwardCrashStart.distance,
        'Crash animation incorrectly added to the wheelie score.');
    assert.ok(fullThrottle._rearBodyGroundClearance() <= 0.01,
        'Game over appeared before the rear body reached the terrain.');
    assert.ok(fullThrottle._backwardRoofGroundClearance() <= 0.01,
        'Game over appeared before the overturned roof reached the terrain.');
    const geometry = wheelieGeometry(fullThrottle, fullThrottle.parameters);
    assert.ok(geometry.comXFromRearContact <= 0.1 || fullThrottle.pitch > 0.8);
}

// Once airborne, releasing the rear drive lets gravity return the front wheel
// to the road and ends the scored interval exactly once.
{
    const { game, submissions } = makeWheelieGame();
    for (let index = 0; index < 900 && !game.hasLifted; index++) game._integrate(1 / 300, true);
    assert.equal(game.hasLifted, true);
    let frontCrashFrames = 0;
    let frontCrashDistance = null;
    for (let index = 0; index < 5000 && game.phase !== 'done'; index++) {
        game._integrate(1 / 300, false);
        if (game.phase === 'crashing') {
            frontCrashFrames++;
            frontCrashDistance ??= game.distance;
            assert.equal(submissions.length, 0,
                'Score was submitted before the landing animation completed.');
        }
    }
    assert.ok(frontCrashFrames > 100,
        'Front-wheel landing was hidden immediately by game over.');
    assert.equal(game.phase, 'done');
    assert.match(game.endReason, /front wheel/i);
    assert.equal(game.distance, frontCrashDistance,
        'Landing animation incorrectly added to the wheelie score.');
    assert.ok(Math.abs(game._vehicleGeometry().frontTireBottomY) < 0.02,
        'Game over appeared before the front tyre settled onto the road.');
    assert.equal(submissions.length, 1);
}

// Camera framing follows the rear contact without velocity-dependent lag, so a
// fast car cannot run out of the right side of the viewport.
{
    const { game } = makeWheelieGame();
    game.position = 500;
    game.velocity = 55;
    game.hasLifted = true;
    game.pitch = 35 * Math.PI / 180;
    game.update(1 / 60);
    const rearScreenX = game._worldToLogical({
        x: game.position,
        y: game.parameters.wheelRadius,
    }).x;
    assert.ok(rearScreenX > game._logicalWidth() * 0.45);
    assert.ok(rearScreenX < game._logicalWidth() * 0.7);
}

console.log('Standing Swing Jump and Wheelie Balance physics tests passed.');
