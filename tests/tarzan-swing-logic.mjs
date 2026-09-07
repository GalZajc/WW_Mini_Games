import assert from 'node:assert/strict';
import TarzanSwingGame, {
    TARZAN_DEFAULTS,
    generateNextVine,
    reachableGapLimit,
} from '../renderer/games/tarzan-swing/game.js';

const noInput = Object.freeze({
    isActionJustDown: () => false,
    isActionJustUp: () => false,
    isActionDown: () => false,
});
const silentAudio = Object.freeze({
    playClick() {},
    playPlasticImpact() {},
    playTone() {},
});

function makeRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function makeGame(width = 1280, height = 720, seed = 12345) {
    const submissions = [];
    const game = new TarzanSwingGame();
    game._setup(
        { width, height },
        null,
        noInput,
        silentAudio,
        {},
        results => submissions.push(results),
        () => {},
        null,
        {},
        null,
    );
    game._resetRun(seed);
    return { game, submissions };
}

function assertFiniteState(game) {
    for (const value of [
        game.position.x,
        game.position.y,
        game.velocity.x,
        game.velocity.y,
        game.bodyAngle,
        game.angularVelocity,
    ]) assert.ok(Number.isFinite(value), `Non-finite simulation value: ${value}`);
}

// The opening pose is stationary on the branch with a geometrically taut,
// unextended first vine. Gravity therefore produces swing energy immediately
// instead of spending the opening second taking up hidden slack.
{
    const game = makeGame().game;
    const geometry = game._updateAttachmentGeometry();
    assert.equal(game.parameters.ropeStaticStretchPercent, 5);
    assert.equal(game.ropeIsSlack, false);
    assert.ok(Math.abs(geometry.distance - geometry.naturalDistance) < 1e-10);
    assert.deepEqual(game.velocity, { x: 0, y: 0 });
    assert.ok(game.position.x < game.vines[0].anchor.x);
}

// Starting is automatic: 3, 2 and 1 are frozen preparation steps; the clock
// and physics start exactly when the visible zero flash begins.
{
    const game = makeGame().game;
    const initialPosition = { ...game.position };
    assert.equal(game.phase, 'countdown');
    for (let frame = 0; frame < 47; frame++) game.update(0.05);
    assert.equal(game.phase, 'countdown');
    assert.equal(game.elapsed, 0);
    assert.deepEqual(game.position, initialPosition);
    game.update(0.051);
    game.update(0.001);
    assert.equal(game.phase, 'playing');
    assert.equal(game.elapsed, 0);
    assert.ok(game.startFlashRemaining > 0);
    game.update(0.01);
    assert.ok(game.elapsed > 0);
}

// Every displayed arm pose is exact two-link inverse kinematics: neither the
// upper arm nor forearm may change length while the elbow opens or closes.
{
    const game = makeGame().game;
    game._startRun(false);
    for (let frame = 0; frame < 240; frame++) {
        if (frame === 30) game._startJump();
        game.update(1 / 240);
        const shoulder = game._shoulderPoint();
        const positiveElbow = game._elbowPoint(shoulder, game.handPoint, 1);
        const negativeElbow = game._elbowPoint(shoulder, game.handPoint, -1);
        const elbow = game._forwardElbowPoint(shoulder, game.handPoint);
        assert.ok(elbow.x >= positiveElbow.x - 1e-9);
        assert.ok(elbow.x >= negativeElbow.x - 1e-9);
        const upper = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
        const forearm = Math.hypot(game.handPoint.x - elbow.x, game.handPoint.y - elbow.y);
        assert.ok(Math.abs(upper - game.parameters.upperArmLength) < 1e-6);
        assert.ok(Math.abs(forearm - game.parameters.forearmLength) < 1e-6);
    }
}

// Bounded active shoulder/trunk stabilization prevents the passive rigid-body
// spin that the original one-stick model produced.
{
    const game = makeGame().game;
    game._startRun(false);
    let maximumAngle = 0;
    let maximumAngularSpeed = 0;
    for (let frame = 0; frame < 2400; frame++) {
        game.update(1 / 240);
        maximumAngle = Math.max(maximumAngle, Math.abs(game.bodyAngle));
        maximumAngularSpeed = Math.max(maximumAngularSpeed, Math.abs(game.angularVelocity));
    }
    assert.ok(maximumAngle < 1.5, `Posture spun too far: ${maximumAngle} rad.`);
    assert.ok(maximumAngularSpeed < 2.5, `Posture spun too fast: ${maximumAngularSpeed} rad/s.`);
}

// Axial rope damping must not masquerade as angular friction. A passive swing
// loses only a small amount of angular amplitude per cycle.
{
    const game = makeGame().game;
    game._startRun(false);
    const rightPeaks = [];
    let previousHorizontalVelocity = game.velocity.x;
    for (let frame = 0; frame < 3600 && rightPeaks.length < 3; frame++) {
        game.update(1 / 240);
        if (previousHorizontalVelocity > 0 && game.velocity.x <= 0) {
            rightPeaks.push(game.position.x - game.vines[0].anchor.x);
        }
        previousHorizontalVelocity = game.velocity.x;
    }
    assert.ok(rightPeaks.length >= 3);
    assert.ok(
        Math.abs(rightPeaks[1]) > Math.abs(rightPeaks[0]) * 0.9
            && Math.abs(rightPeaks[2]) > Math.abs(rightPeaks[1]) * 0.9,
        `Axial damping incorrectly killed angular motion: ${rightPeaks.join(', ')}`,
    );
}

// A deliberately imposed radial extension, on the other hand, should return
// rapidly and without sustained bouncing to the static gravity extension.
{
    const game = makeGame().game;
    game._startRun(false);
    const vine = game.vines[0];
    const shoulder = game._shoulderPoint();
    const shoulderOffset = {
        x: shoulder.x - game.position.x,
        y: shoulder.y - game.position.y,
    };
    const naturalDistance = vine.gripLength + game.armTargetLength;
    const displacedShoulder = {
        x: vine.anchor.x,
        y: vine.anchor.y - naturalDistance - 0.45,
    };
    game.position = {
        x: displacedShoulder.x - shoulderOffset.x,
        y: displacedShoulder.y - shoulderOffset.y,
    };
    game.velocity = { x: 0, y: 0 };
    for (let frame = 0; frame < 480; frame++) game.update(1 / 240);
    const geometry = game._updateAttachmentGeometry();
    const equilibriumExtension = vine.gripLength
        * game.parameters.ropeStaticStretchPercent / 100;
    const extension = geometry.distance - geometry.naturalDistance;
    assert.ok(
        Math.abs(extension - equilibriumExtension) < 5e-4,
        `Radial rope oscillation did not settle: ${extension} vs ${equilibriumExtension}`,
    );
    assert.ok(Math.abs(game.velocity.y) < 1e-3);
}

// The truncated random generator may vary, but it may never emit a gap beyond
// the conservative reach envelope of the preceding swing.
{
    const random = makeRandom(0x51a7cafe);
    let previous = {
        id: 0,
        anchor: { x: 4.72, y: TARZAN_DEFAULTS.anchorHeight },
        fullLength: TARZAN_DEFAULTS.meanVineLength,
        gripLength: TARZAN_DEFAULTS.meanVineLength,
    };
    const gaps = [];
    const lengths = [];
    for (let id = 1; id <= 4000; id++) {
        const next = generateNextVine(previous, TARZAN_DEFAULTS, random, id);
        assert.ok(next.generatedGap >= 2.5);
        assert.ok(next.generatedGap <= next.maximumSafeGap + 1e-12);
        assert.equal(next.maximumSafeGap, reachableGapLimit(previous, TARZAN_DEFAULTS));
        assert.ok(next.fullLength >= 3.35 && next.fullLength <= 6.70);
        assert.ok(Math.abs(next.anchor.y - previous.anchor.y) <= 0.72 + 1e-12);
        gaps.push(next.generatedGap);
        lengths.push(next.fullLength);
        previous = next;
    }
    assert.ok(Math.max(...gaps) - Math.min(...gaps) > 1.0, 'Vine spacing lost its random variation.');
    assert.ok(Math.max(...lengths) - Math.min(...lengths) > 1.0, 'Vine length lost its random variation.');
}

// R performs active work through a visible, finite leg-pump cycle. Against an
// otherwise identical passive swing it must increase tangential speed.
{
    const passive = makeGame(1280, 720, 12345).game;
    const active = makeGame(1280, 720, 12345).game;
    passive._startRun(false);
    active._startRun(false);
    let maximumHipAngle = 0;
    let maximumKneeAngle = 0;
    for (let frame = 0; frame < 240; frame++) {
        if (frame === 30) active._startLegPump();
        passive.update(1 / 240);
        active.update(1 / 240);
        maximumHipAngle = Math.max(maximumHipAngle, Math.abs(active.legHipAngle));
        maximumKneeAngle = Math.max(maximumKneeAngle, Math.abs(active.legKneeAngle));
    }
    const passiveSpeed = Math.hypot(passive.velocity.x, passive.velocity.y);
    const activeSpeed = Math.hypot(active.velocity.x, active.velocity.y);
    assert.ok(activeSpeed > passiveSpeed + 1.0, 'Leg pump did not add meaningful swing energy.');
    assert.ok(maximumHipAngle > 0.8, 'Simulated hip joint barely moved.');
    assert.ok(maximumKneeAngle > 1.1, 'Simulated knee joint barely moved.');
    assert.equal(active.legPumpActive, false);
    assert.ok(active.legPumpCooldownRemaining >= 0);
}

// The spacing setting must materially change generated courses instead of
// being hidden by the reachability clamp.
{
    const meanGapFor = requestedMean => {
        const random = makeRandom(0x714acafe);
        const parameters = { ...TARZAN_DEFAULTS, meanVineGap: requestedMean };
        let previous = {
            id: 0,
            anchor: { x: 4.72, y: parameters.anchorHeight },
            fullLength: parameters.meanVineLength,
            gripLength: parameters.meanVineLength,
        };
        let total = 0;
        for (let id = 1; id <= 1000; id++) {
            previous = generateNextVine(previous, parameters, random, id);
            total += previous.generatedGap;
        }
        return total / 1000;
    };
    const closeMean = meanGapFor(2.5);
    const farMean = meanGapFor(7.0);
    assert.ok(
        farMean - closeMean > 3.0,
        `Spacing setting was still ineffective: ${closeMean} m vs ${farMean} m.`,
    );
}

// One LMB starts a short forceful pull and automatic release; the resulting
// flight has enough speed for a real physical transfer to the next vine.
{
    const { game } = makeGame();
    game._startRun(false);
    let caught = false;
    let speedBeforeJump = 0;
    let maximumFlightSpeed = 0;
    for (let frame = 0; frame < 900; frame++) {
        if (frame === 180) {
            speedBeforeJump = Math.hypot(game.velocity.x, game.velocity.y);
            game._startJump();
        }
        game.update(1 / 240);
        assertFiniteState(game);
        if (!game.attached && frame > 180) {
            maximumFlightSpeed = Math.max(
                maximumFlightSpeed,
                Math.hypot(game.velocity.x, game.velocity.y),
            );
            const vine = game.vines[1];
            const shoulder = game._shoulderPoint();
            const bottomY = vine.anchor.y - vine.fullLength;
            const candidateY = Math.max(bottomY, Math.min(vine.anchor.y - 0.55, shoulder.y));
            const distance = Math.hypot(vine.anchor.x - shoulder.x, candidateY - shoulder.y);
            if (distance <= game.parameters.upperArmLength + game.parameters.forearmLength) {
                game._tryGrabNextVine();
                caught = true;
                break;
            }
        }
    }
    assert.ok(caught, 'The deterministic default first transfer is not playable.');
    assert.equal(game.attached, true);
    assert.equal(game.currentVineIndex, 1);
    assert.equal(game.ropesCleared, 1);
    assert.ok(maximumFlightSpeed > speedBeforeJump + 1.5, 'The jump pull is not forceful enough.');
}

// RMB is a reversible slow climb only. Releasing it extends the arms again
// without ever detaching the hands from the current vine.
{
    const game = makeGame().game;
    game._startRun(false);
    const extended = game.elbowAngle;
    game.manualPullHeld = true;
    game._updateArmAction(0.5);
    const shortened = game.elbowAngle;
    assert.ok(shortened < extended);
    assert.equal(game.attached, true);
    game.manualPullHeld = false;
    game._updateArmAction(0.5);
    assert.ok(game.elbowAngle > shortened);
    assert.equal(game.attached, true);
}

// Procedural safeguards cover dynamics as well as geometry. Across varied
// first-vine lengths and canopy offsets, a coarse human-scale timing search
// must always find at least one valid first transfer.
{
    const canReachSecondVine = seed => {
        for (let jumpStart = 0.2; jumpStart < 3; jumpStart += 0.1) {
                const game = makeGame(1280, 720, seed).game;
                game._startRun(false);
                let jumped = false;
                for (let frame = 0; frame < 900; frame++) {
                    const time = frame / 240;
                    if (time >= jumpStart && !jumped) {
                        game._startJump();
                        jumped = true;
                    }
                    game.update(1 / 240);
                    if (!jumped || game.attached) continue;
                    const vine = game.vines[1];
                    const shoulder = game._shoulderPoint();
                    const bottomY = vine.anchor.y - vine.fullLength;
                    const candidateY = Math.max(
                        bottomY,
                        Math.min(vine.anchor.y - 0.55, shoulder.y),
                    );
                    const distance = Math.hypot(
                        vine.anchor.x - shoulder.x,
                        candidateY - shoulder.y,
                    );
                    if (distance <= game.parameters.upperArmLength + game.parameters.forearmLength) {
                        return true;
                    }
                    if (game.phase === 'dead') break;
                }
            }
        return false;
    };
    for (let seed = 1; seed <= 32; seed++) {
        assert.ok(canReachSecondVine(seed), `Seed ${seed} has no playable first transfer.`);
    }
}

// Changing only the window dimensions cannot change metre-space physics.
{
    const small = makeGame(800, 600, 9981).game;
    const large = makeGame(1920, 1080, 9981).game;
    small._startRun(false);
    large._startRun(false);
    for (let frame = 0; frame < 720; frame++) {
        small.update(1 / 240);
        large.update(1 / 240);
    }
    assert.deepEqual(small.position, large.position);
    assert.deepEqual(small.velocity, large.velocity);
    assert.deepEqual(small.vines, large.vines);
}

// A slack massless vine is visibly bowed rather than drawn as a rigid line.
{
    const game = makeGame().game;
    const curve = game._ropeCurve({ x: 0, y: 6 }, { x: 2, y: 2 }, 5.4);
    const middle = curve[Math.floor(curve.length / 2)];
    assert.ok(middle.y < 4, 'Slack-vine midpoint does not sag below the straight chord.');
}

// Missing an intentional LMB catch ends the round and records the exact seed.
{
    const { game, submissions } = makeGame(1280, 720, 777);
    game._startRun(false);
    game._releaseVine();
    game.position = { x: -20, y: 3 };
    game._tryGrabNextVine();
    assert.equal(game.phase, 'dead');
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].seed, 777);
}

{
    const schema = TarzanSwingGame.getSettingsSchema();
    const keys = new Set(schema.map(setting => setting.key));
    for (const key of Object.keys(TARZAN_DEFAULTS)) {
        assert.ok(keys.has(key), `Physical/procedural parameter ${key} is not exposed in settings.`);
    }
    const controls = TarzanSwingGame.getControlsSchema();
    assert.deepEqual(controls.map(control => control.defaultBindings[0].code), [0, 2, 'KeyR']);
    const game = makeGame().game;
    assert.deepEqual(Object.keys(game.getRecordSettings()).sort(), Object.keys(TARZAN_DEFAULTS).sort());
}

console.log('Tarzan Swing generation, physics, controls, records and resize invariance passed.');
