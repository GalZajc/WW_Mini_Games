import assert from 'node:assert/strict';
import {
    generateMemoryCurve,
    readCurveMemorySettings,
    scoreCurveMatch,
    smoothCurve,
} from '../renderer/games/curve-memory/game.js';
import {
    generateCupShuffle,
    readCupShuffleSettings,
    resolveCupShuffle,
} from '../renderer/games/cup-shuffle/game.js';
import { readNumberMemorySettings } from '../renderer/games/number-memory/game.js';
import {
    bowlRadialFraction,
    readBowlBalanceSettings,
    stepSphericalBowlParticle,
} from '../renderer/games/spherical-bowl-balance/game.js';
import RhythmMemoryGame from '../renderer/games/rhythm-memory/game.js';

const almostEqual = (first, second, tolerance = 1e-9) => (
    Math.abs(first - second) <= tolerance
);

// Every user-facing number is normalized in exactly one settings reader.
{
    const number = readNumberMemorySettings({ visibleTime: -10, startingDigits: 999 });
    assert.equal(number.visibleTime, 0.15);
    assert.equal(number.startingDigits, 12);
    const cups = readCupShuffleSettings({ cupCount: 2, ballCount: 99, shuffleMoves: 0 });
    assert.equal(cups.cupCount, 2);
    assert.equal(cups.ballCount, 1);
    assert.equal(cups.shuffleMoves, 1);
    const curve = readCurveMemorySettings({ persistenceLength: 1e9, curveLength: 0 });
    assert.equal(curve.curveLength, 2);
    assert.equal(curve.persistenceLength, 15);
}

// A generated cup round is reproducible, contains only legal swaps, and the
// resolver agrees with applying the swaps directly.
{
    const parameters = readCupShuffleSettings({ cupCount: 7, ballCount: 3, shuffleMoves: 80 });
    const first = generateCupShuffle(parameters, 0x5eedcafe);
    const second = generateCupShuffle(parameters, 0x5eedcafe);
    assert.deepEqual(first, second);
    assert.equal(first.ballCupIds.length, 3);
    assert.equal(new Set(first.ballCupIds).size, 3);
    assert.equal(first.moves.length, 80);
    for (const [left, right] of first.moves) {
        assert.notEqual(left, right);
        assert.ok(left >= 0 && left < parameters.cupCount);
        assert.ok(right >= 0 && right < parameters.cupCount);
    }
    const resolved = resolveCupShuffle(parameters, first);
    assert.deepEqual(
        Object.values(resolved).map(Number).sort((a, b) => a - b),
        Array.from({ length: parameters.cupCount }, (_, index) => index),
    );
}

// The curve score is independent of drawing direction, rewards an exact
// reconstruction, and clearly separates it from an unrelated path.
{
    const parameters = readCurveMemorySettings();
    const target = generateMemoryCurve(parameters, 0xc0ffee);
    const repeated = generateMemoryCurve(parameters, 0xc0ffee);
    assert.deepEqual(target, repeated);
    const exact = scoreCurveMatch(target, target, parameters.drawingLowpassPasses);
    const reverse = scoreCurveMatch(target, [...target].reverse(), parameters.drawingLowpassPasses);
    const unrelated = scoreCurveMatch(
        target,
        target.map((point, index) => ({
            x: index / (target.length - 1),
            y: 0.15 + 0.7 * index / (target.length - 1),
        })),
        parameters.drawingLowpassPasses,
    );
    assert.ok(exact.score > 99);
    assert.ok(reverse.score > 99);
    assert.ok(unrelated.score < exact.score - 35);
    assert.equal(reverse.reversed, true);
}

// The symmetric low-pass filter smooths hand jitter without translating the
// endpoints; applying it forwards/backwards does not bias the drawn line.
{
    const jitter = Array.from({ length: 21 }, (_, index) => ({
        x: index,
        y: index % 2 ? 1 : -1,
    }));
    const smoothed = smoothCurve(jitter, 5);
    assert.deepEqual(smoothed[0], jitter[0]);
    assert.deepEqual(smoothed.at(-1), jitter.at(-1));
    const roughness = points => points.slice(1, -1).reduce((sum, point, index) => (
        sum + Math.abs(points[index].y - 2 * point.y + points[index + 2].y)
    ), 0);
    assert.ok(roughness(smoothed) < roughness(jitter) * 0.08);
}

// The bowl integrator enforces the spherical constraint and removes numerical
// radial velocity after every step.
{
    const parameters = readBowlBalanceSettings();
    const fraction = (parameters.bandInnerFraction + parameters.bandOuterFraction) / 2;
    const x = fraction * parameters.bowlRadius;
    const state = {
        position: {
            x,
            y: -Math.sqrt(parameters.bowlRadius ** 2 - x ** 2),
            z: 0,
        },
        velocity: { x: 0, y: 0, z: 0 },
    };
    for (let index = 0; index < 2400; index++) {
        stepSphericalBowlParticle(
            state,
            { x: 4 * Math.sin(index / 100), z: 3 * Math.cos(index / 91) },
            parameters,
            1 / 240,
        );
        const radius = Math.hypot(state.position.x, state.position.y, state.position.z);
        const radialVelocity = state.position.x * state.velocity.x
            + state.position.y * state.velocity.y
            + state.position.z * state.velocity.z;
        assert.ok(almostEqual(radius, parameters.bowlRadius, 1e-10));
        assert.ok(almostEqual(radialVelocity, 0, 1e-8));
    }
}

// A stationary bowl lets gravity pull the point out of the upper band, while
// the analytically required horizontal acceleration holds the same point.
{
    const parameters = readBowlBalanceSettings({ slidingDamping: 0.18 });
    const fraction = (parameters.bandInnerFraction + parameters.bandOuterFraction) / 2;
    const makeState = () => {
        const x = fraction * parameters.bowlRadius;
        return {
            position: {
                x,
                y: -Math.sqrt(parameters.bowlRadius ** 2 - x ** 2),
                z: 0,
            },
            velocity: { x: 0, y: 0, z: 0 },
        };
    };
    const falling = makeState();
    for (let index = 0; index < 240; index++) {
        stepSphericalBowlParticle(falling, { x: 0, z: 0 }, parameters, 1 / 240);
    }
    assert.ok(bowlRadialFraction(falling.position, parameters) < parameters.bandInnerFraction);

    const held = makeState();
    const requiredAcceleration = -parameters.gravity * held.position.x / (-held.position.y);
    for (let index = 0; index < 720; index++) {
        stepSphericalBowlParticle(
            held,
            { x: requiredAcceleration, z: 0 },
            parameters,
            1 / 240,
        );
    }
    assert.ok(almostEqual(bowlRadialFraction(held.position, parameters), fraction, 1e-10));
}

// Rhythm memory interval distribution (uniform vs perceptual)
{
    const game = Object.create(RhythmMemoryGame.prototype);
    assert.doesNotThrow(() => game.preparePauseSettings({ distribution: 'perceptual' }));
    assert.doesNotThrow(() => game.preparePauseSettings({ distribution: 'uniform' }));
    assert.throws(() => game.preparePauseSettings({ distribution: 'invalid' }));

    const createDummy = (settings) => {
        const dummy = Object.create(RhythmMemoryGame.prototype);
        dummy.settings = settings;
        dummy.audio = {};
        dummy.input = { isActionJustDown: () => false, isMouseJustDown: () => false };
        dummy._ensureActionButton = () => {};
        dummy._syncActionButton = () => {};
        dummy.init();
        return dummy;
    };

    // Test uniform distribution: arithmetic mean is ~ (min + max) / 2
    const uniformGame = createDummy({ distribution: 'uniform', minimumInterval: 0.2, maximumInterval: 0.8 });
    assert.equal(uniformGame.getRecordSettings().distribution, 'uniform');
    let sumUniform = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
        const val = uniformGame._newInterval();
        assert.ok(val >= 0.2 && val <= 0.8);
        sumUniform += val;
    }
    const uniformMean = sumUniform / N;
    assert.ok(Math.abs(uniformMean - 0.5) < 0.02, `Expected uniform mean ~0.5, got ${uniformMean}`);

    // Test perceptual distribution: geometric mean ~ sqrt(min * max) splits samples ~50/50
    const perceptualGame = createDummy({ distribution: 'perceptual', minimumInterval: 0.2, maximumInterval: 0.8 });
    assert.equal(perceptualGame.getRecordSettings().distribution, 'perceptual');
    const geometricMean = Math.sqrt(0.2 * 0.8); // 0.4
    let belowGeometric = 0;
    for (let i = 0; i < N; i++) {
        const val = perceptualGame._newInterval();
        assert.ok(val >= 0.2 && val <= 0.8);
        if (val < geometricMean) belowGeometric++;
    }
    const fraction = belowGeometric / N;
    assert.ok(Math.abs(fraction - 0.5) < 0.025, `Expected perceptual ~50% below geometric mean, got ${fraction}`);
}

console.log('Memory, rhythm, cup-shuffle, and spherical-bowl logic tests passed.');
