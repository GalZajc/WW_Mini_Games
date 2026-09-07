import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

/*
 * All physical and procedural parameters live here. The fixed logical world
 * and integrator values below are numerical implementation choices; every
 * quantity that changes difficulty or physical behaviour is exposed through
 * getSettingsSchema().
 */
export const TARZAN_DEFAULTS = Object.freeze({
    gravity: 9.81,
    bodyMass: 75,
    bodyLength: 1.62,
    bodyInertiaFactor: 0.18,
    upperArmLength: 0.42,
    forearmLength: 0.42,
    neutralElbowAngle: 145,
    loweredElbowAngle: 176,
    pulledElbowAngle: 58,
    jumpPullDuration: 0.14,
    jumpPullForce: 8000,
    legPumpDuration: 0.72,
    legPumpForce: 620,
    legPumpCooldown: 0.12,
    legHipSwingAngle: 72,
    legKneeBendAngle: 96,
    legJointDampingRatio: 0.82,
    legMassFraction: 0.24,
    slowPullRate: 82,
    automaticExtendRate: 62,
    initialSwingAngle: 32,
    ropeStaticStretchPercent: 5,
    ropeDamping: 900,
    airDrag: 0.018,
    angularDamping: 0.08,
    postureStiffness: 880,
    postureDamping: 165,
    maximumPostureTorque: 1050,
    meanVineGap: 5.45,
    vineGapStdDev: 0.72,
    meanVineLength: 4.90,
    vineLengthStdDev: 0.58,
    anchorHeight: 9.55,
    anchorHeightStdDev: 0.34,
    reachabilitySafety: 0.82,
});

const SIMULATION = Object.freeze({
    logicalHeight: 720,
    pixelsPerMetre: 64,
    groundScreenY: 684,
    fixedTimeStep: 1 / 240,
    maximumSubsteps: 16,
    maximumFrameTime: 0.05,
    minimumGap: 2.50,
    minimumVineLength: 3.35,
    maximumVineLength: 6.70,
    minimumGripLength: 0.55,
    shoulderRatio: 0.40,
    firstVineAnchorX: 4.72,
    deathY: -1.35,
    maximumLinearSpeed: 22,
    maximumAngularSpeed: 12,
    vinesKeptBehind: 3,
    vinesGeneratedAhead: 7,
    countdownStepDuration: 0.8,
    zeroFlashDuration: 0.45,
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = t => {
    const value = clamp(t, 0, 1);
    return value * value * (3 - 2 * value);
};
const vector = (x = 0, y = 0) => ({ x, y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a, factor) => ({ x: a.x * factor, y: a.y * factor });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const magnitude = value => Math.hypot(value.x, value.y);
const normalize = (value, fallback = vector(0, -1)) => {
    const length = magnitude(value);
    return length > 1e-9 ? scale(value, 1 / length) : { ...fallback };
};
const cross = (a, b) => a.x * b.y - a.y * b.x;

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Date.now() >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function normalRandom(random) {
    const first = Math.max(1e-9, random());
    const second = random();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(Math.PI * 2 * second);
}

export function reachableGapLimit(previousVine, parameters) {
    const armReach = parameters.upperArmLength + parameters.forearmLength;
    const effectiveRadius = previousVine.gripLength + armReach;
    // Repeated, correctly timed R pumps can approach the horizontal position.
    // The hard safeguard is therefore the actual geometric transfer envelope,
    // while reachabilitySafety keeps a tunable margin below that envelope.
    const geometricLimit = effectiveRadius + armReach - 0.22;
    return Math.max(
        SIMULATION.minimumGap,
        geometricLimit * parameters.reachabilitySafety,
    );
}

export function generateNextVine(previousVine, parameters, random, id) {
    const requestedGap = parameters.meanVineGap
        + parameters.vineGapStdDev * normalRandom(random);
    const maximumSafeGap = reachableGapLimit(previousVine, parameters);
    const gap = clamp(requestedGap, SIMULATION.minimumGap, maximumSafeGap);

    const requestedLength = parameters.meanVineLength
        + parameters.vineLengthStdDev * normalRandom(random);
    let fullLength = clamp(
        requestedLength,
        SIMULATION.minimumVineLength,
        SIMULATION.maximumVineLength,
    );
    const anchorY = clamp(
        parameters.anchorHeight + parameters.anchorHeightStdDev * normalRandom(random),
        previousVine.anchor.y - 0.72,
        previousVine.anchor.y + 0.72,
    );

    // The lower end must intersect the conservative transfer corridor of the
    // preceding swing. Lengthen a short random vine when necessary; this keeps
    // the sampled character while preventing geometrically impossible gaps.
    const armReach = parameters.upperArmLength + parameters.forearmLength;
    const transferCorridorY = previousVine.anchor.y
        - previousVine.gripLength
        - armReach * 0.35;
    const minimumLengthForCorridor = anchorY - transferCorridorY;
    fullLength = clamp(
        Math.max(fullLength, minimumLengthForCorridor),
        SIMULATION.minimumVineLength,
        SIMULATION.maximumVineLength,
    );

    return {
        id,
        anchor: vector(previousVine.anchor.x + gap, anchorY),
        fullLength,
        gripLength: fullLength,
        generatedGap: gap,
        maximumSafeGap,
    };
}

export default class TarzanSwingGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this._migrateLegacySettings();
        this._validateSettings({ ...TARZAN_DEFAULTS, ...(this.settings || {}) });
        this.parameters = this._readParameters(this.settings);
        this.bestRopes = 0;
        this.bestDistance = 0;
        this._bestRequest = (this._bestRequest || 0) + 1;
        this._loadBest(this._bestRequest);
        this._resetRun();
    }

    _migrateLegacySettings() {
        const legacyKeys = [
            'nominalArmLength',
            'loweredArmLength',
            'pulledArmLength',
            'grabReach',
            'pullDuration',
        ];
        const migrated = { ...(this.settings || {}) };
        let changed = false;
        const spacingRevision = Number(migrated.tarzanSpacingRevision) || 0;
        if (spacingRevision < 2) {
            const storedMeanGap = Number(migrated.meanVineGap);
            if (Number.isFinite(storedMeanGap) && storedMeanGap <= 4.1) {
                migrated.meanVineGap = TARZAN_DEFAULTS.meanVineGap;
            }
            const storedGapDeviation = Number(migrated.vineGapStdDev);
            if (Number.isFinite(storedGapDeviation) && storedGapDeviation <= 0.58) {
                migrated.vineGapStdDev = TARZAN_DEFAULTS.vineGapStdDev;
            }
            migrated.tarzanSpacingRevision = 2;
            changed = true;
        }
        const legRevision = Number(migrated.tarzanLegRevision) || 0;
        if (legRevision < 2) {
            if (Number(migrated.legPumpDuration) === 0.52) {
                migrated.legPumpDuration = TARZAN_DEFAULTS.legPumpDuration;
            }
            if (Number(migrated.legPumpForce) === 420) {
                migrated.legPumpForce = TARZAN_DEFAULTS.legPumpForce;
            }
            migrated.tarzanLegRevision = 2;
            changed = true;
        }
        for (const key of legacyKeys) {
            if (!Object.hasOwn(migrated, key)) continue;
            delete migrated[key];
            changed = true;
        }
        if (Number(migrated.ropeStaticStretchPercent) === 10) {
            migrated.ropeStaticStretchPercent = TARZAN_DEFAULTS.ropeStaticStretchPercent;
            changed = true;
        }
        if ([24, 92].includes(Number(migrated.ropeDamping))) {
            migrated.ropeDamping = TARZAN_DEFAULTS.ropeDamping;
            changed = true;
        }
        if (Number(migrated.jumpPullDuration) === 0.16) {
            migrated.jumpPullDuration = TARZAN_DEFAULTS.jumpPullDuration;
            changed = true;
        }
        if ([2600, 4200, 5200].includes(Number(migrated.jumpPullForce))) {
            migrated.jumpPullForce = TARZAN_DEFAULTS.jumpPullForce;
            changed = true;
        }
        if (Number(migrated.airDrag) === 0.1) {
            migrated.airDrag = TARZAN_DEFAULTS.airDrag;
            changed = true;
        }
        if (Number(migrated.angularDamping) === 0.32) {
            migrated.angularDamping = TARZAN_DEFAULTS.angularDamping;
            changed = true;
        }
        if (Number(migrated.postureDamping) === 210) {
            migrated.postureDamping = TARZAN_DEFAULTS.postureDamping;
            changed = true;
        }
        if (!changed) return;
        this.settings = migrated;
        if (this.app) this.app.currentSettings = { ...migrated };
        this.app?.settingsManager?.save?.('tarzan-swing', migrated)?.catch?.(error => {
            console.warn('Could not migrate Tarzan Swing settings:', error);
        });
    }

    _readParameters(settings) {
        const source = { ...TARZAN_DEFAULTS, ...(settings || {}) };
        const upperArmLength = Number(source.upperArmLength);
        const forearmLength = Number(source.forearmLength);
        return Object.freeze({
            gravity: Number(source.gravity),
            bodyMass: Number(source.bodyMass),
            bodyLength: Number(source.bodyLength),
            bodyInertiaFactor: Number(source.bodyInertiaFactor),
            upperArmLength,
            forearmLength,
            neutralElbowAngle: Number(source.neutralElbowAngle),
            loweredElbowAngle: Number(source.loweredElbowAngle),
            pulledElbowAngle: Number(source.pulledElbowAngle),
            jumpPullDuration: Number(source.jumpPullDuration),
            jumpPullForce: Number(source.jumpPullForce),
            legPumpDuration: Number(source.legPumpDuration),
            legPumpForce: Number(source.legPumpForce),
            legPumpCooldown: Number(source.legPumpCooldown),
            legHipSwingAngle: Number(source.legHipSwingAngle),
            legKneeBendAngle: Number(source.legKneeBendAngle),
            legJointDampingRatio: Number(source.legJointDampingRatio),
            legMassFraction: Number(source.legMassFraction),
            slowPullRate: Number(source.slowPullRate),
            automaticExtendRate: Number(source.automaticExtendRate),
            initialSwingAngle: Number(source.initialSwingAngle),
            ropeStaticStretchPercent: Number(source.ropeStaticStretchPercent),
            ropeDamping: Number(source.ropeDamping),
            airDrag: Number(source.airDrag),
            angularDamping: Number(source.angularDamping),
            postureStiffness: Number(source.postureStiffness),
            postureDamping: Number(source.postureDamping),
            maximumPostureTorque: Number(source.maximumPostureTorque),
            meanVineGap: Number(source.meanVineGap),
            vineGapStdDev: Number(source.vineGapStdDev),
            meanVineLength: Number(source.meanVineLength),
            vineLengthStdDev: Number(source.vineLengthStdDev),
            anchorHeight: Number(source.anchorHeight),
            anchorHeightStdDev: Number(source.anchorHeightStdDev),
            reachabilitySafety: Number(source.reachabilitySafety),
        });
    }

    _validateSettings(settings = {}) {
        const positive = [
            ['meanVineGap', 'Mean vine spacing'], ['meanVineLength', 'Mean vine length'],
            ['anchorHeight', 'Canopy height'], ['bodyMass', 'Tarzan mass'], ['bodyLength', 'Body length'],
            ['bodyInertiaFactor', 'Body rotational inertia'], ['upperArmLength', 'Upper-arm length'],
            ['forearmLength', 'Forearm length'],
        ];
        for (const [key, label] of positive) requirePositiveNumber(settings[key], label);
        requireFiniteNumber(settings.gravity, 'Gravity', { minimum: 0 });
        // The safety factor is a genuine fraction, but zero would make every
        // generated gap unreachable.  Use the positive helper so the error is
        // stated as “greater than zero”, rather than exposing Number.MIN_VALUE
        // (5e-324) as a fake user-facing boundary.
        requirePositiveNumber(settings.reachabilitySafety, 'Reachability safety factor', { maximum: 1 });
        const nonNegative = [
            ['vineGapStdDev', 'Spacing standard deviation'], ['vineLengthStdDev', 'Length standard deviation'],
            ['anchorHeightStdDev', 'Canopy height deviation'], ['ropeStaticStretchPercent', 'Vine stretch'],
            ['ropeDamping', 'Vine damping'], ['airDrag', 'Air drag'], ['angularDamping', 'Body angular damping'],
            ['postureStiffness', 'Posture stiffness'], ['postureDamping', 'Posture damping'],
            ['maximumPostureTorque', 'Maximum posture torque'], ['jumpPullDuration', 'Jump pull duration'],
            ['jumpPullForce', 'Jump pull force'], ['legPumpDuration', 'Leg-pump duration'], ['legPumpForce', 'Leg-pump force'],
            ['legPumpCooldown', 'Leg-pump cooldown'], ['legJointDampingRatio', 'Leg-joint damping'],
            ['legMassFraction', 'Moving leg mass fraction'], ['slowPullRate', 'Slow pull rate'],
            ['automaticExtendRate', 'Automatic arm extension rate'],
        ];
        for (const [key, label] of nonNegative) requireFiniteNumber(settings[key], label, { minimum: 0 });
        for (const [key, label] of [
            ['neutralElbowAngle', 'Neutral elbow angle'], ['loweredElbowAngle', 'Lowered elbow angle'],
            ['pulledElbowAngle', 'Pulled-up elbow angle'], ['legHipSwingAngle', 'Hip swing angle'],
            ['legKneeBendAngle', 'Knee bend angle'], ['initialSwingAngle', 'Initial swing angle'],
        ]) requireFiniteNumber(settings[key], label);
    }

    preparePauseSettings(settings) {
        this._validateSettings({ ...TARZAN_DEFAULTS, ...(settings || {}) });
        return settings;
    }

    _resetRun(seed = makeSeed()) {
        this.seed = seed >>> 0;
        this.random = seededRandom(this.seed);
        this.vines = [];
        const firstLength = clamp(
            this.parameters.meanVineLength
                + this.parameters.vineLengthStdDev * normalRandom(this.random) * 0.35,
            SIMULATION.minimumVineLength,
            SIMULATION.maximumVineLength,
        );
        this.vines.push({
            id: 0,
            anchor: vector(SIMULATION.firstVineAnchorX, this.parameters.anchorHeight),
            fullLength: firstLength,
            gripLength: firstLength,
            generatedGap: 0,
            maximumSafeGap: 0,
        });
        for (let index = 1; index < SIMULATION.vinesGeneratedAhead; index++) {
            this.vines.push(generateNextVine(
                this.vines[this.vines.length - 1],
                this.parameters,
                this.random,
                index,
            ));
        }

        this.bodyAngle = 0;
        this.angularVelocity = 0;
        this.currentVineIndex = 0;
        this.attached = true;
        this.elbowAngle = this.parameters.loweredElbowAngle * Math.PI / 180;
        this.armTargetLength = this._armReach(this.elbowAngle);
        this.elbowBendSign = 1;
        const initialAngle = this.parameters.initialSwingAngle * Math.PI / 180;
        const initialTetherLength = firstLength + this.armTargetLength;
        const initialShoulder = add(
            this.vines[0].anchor,
            vector(
                -Math.sin(initialAngle) * initialTetherLength,
                -Math.cos(initialAngle) * initialTetherLength,
            ),
        );
        this.position = subtract(
            initialShoulder,
            vector(0, this.parameters.bodyLength * SIMULATION.shoulderRatio),
        );
        this.velocity = vector(0, 0);
        this.startX = this.position.x;
        this.startY = this.position.y;
        this.jumpElapsed = 0;
        this.jumpActive = false;
        this.jumpStartElbowAngle = this.elbowAngle;
        this.manualPullHeld = false;
        this.legPumpActive = false;
        this.legPumpElapsed = 0;
        this.legPumpCooldownRemaining = 0;
        this.legHipAngle = 0;
        this.legHipAngularVelocity = 0;
        this.legKneeAngle = 0;
        this.legKneeAngularVelocity = 0;
        this.legMusclePower = 0;
        this.lastPostureTargetAngle = null;
        this.phase = 'countdown';
        this.countdownElapsed = 0;
        this.startFlashRemaining = 0;
        this.failureReason = '';
        this.ropesCleared = 0;
        this.elapsed = 0;
        this.maximumX = this.startX;
        this.flightTime = 0;
        this.accumulator = 0;
        this.cameraX = this.startX + 2.65;
        this._scoreSubmitted = false;
        this._updateAttachmentGeometry();
    }

    async _loadBest(requestId) {
        try {
            const record = await this.app?.records?.getBest(
                'tarzan-swing',
                this.getRecordSettings(this.settings),
                'ropes',
            );
            if (requestId !== this._bestRequest) return;
            const ropes = Number(record?.results?.ropes);
            const distance = Number(record?.results?.distance);
            if (Number.isFinite(ropes)) this.bestRopes = ropes;
            if (Number.isFinite(distance)) this.bestDistance = distance;
        } catch (error) {
            console.warn('Could not load Tarzan Swing record:', error);
        }
    }

    _bodyAxis() {
        return vector(Math.sin(this.bodyAngle), Math.cos(this.bodyAngle));
    }

    _armReach(elbowAngle = this.elbowAngle) {
        const upper = this.parameters.upperArmLength;
        const forearm = this.parameters.forearmLength;
        return Math.sqrt(Math.max(
            0,
            upper * upper + forearm * forearm
                - 2 * upper * forearm * Math.cos(elbowAngle),
        ));
    }

    _elbowAngleForReach(reach) {
        const upper = this.parameters.upperArmLength;
        const forearm = this.parameters.forearmLength;
        const minimum = Math.abs(upper - forearm) + 1e-5;
        const maximum = upper + forearm - 1e-5;
        const distance = clamp(reach, minimum, maximum);
        const cosine = clamp(
            (upper * upper + forearm * forearm - distance * distance)
                / (2 * upper * forearm),
            -1,
            1,
        );
        return Math.acos(cosine);
    }

    _shoulderOffset() {
        return scale(
            this._bodyAxis(),
            this.parameters.bodyLength * SIMULATION.shoulderRatio,
        );
    }

    _shoulderPoint() {
        return add(this.position, this._shoulderOffset());
    }

    _shoulderVelocity() {
        const offset = this._shoulderOffset();
        return vector(
            this.velocity.x - this.angularVelocity * offset.y,
            this.velocity.y + this.angularVelocity * offset.x,
        );
    }

    _currentVine() {
        return this.vines[this.currentVineIndex] || null;
    }

    _updateArmAction(dt) {
        const lowered = this.parameters.loweredElbowAngle * Math.PI / 180;
        const pulled = this.parameters.pulledElbowAngle * Math.PI / 180;
        const neutral = this.parameters.neutralElbowAngle * Math.PI / 180;

        if (this.attached && this.jumpActive) {
            this.jumpElapsed += dt;
            const progress = clamp(
                this.jumpElapsed / this.parameters.jumpPullDuration,
                0,
                1,
            );
            this.elbowAngle = mix(
                this.jumpStartElbowAngle,
                pulled,
                smoothstep(progress),
            );
            this.armTargetLength = this._armReach();
            if (progress >= 1) this._releaseVine();
            return;
        }

        const target = !this.attached
            ? neutral
            : (this.manualPullHeld ? pulled : lowered);
        const rate = (this.attached && this.manualPullHeld
            ? this.parameters.slowPullRate
            : this.parameters.automaticExtendRate) * Math.PI / 180;
        const difference = target - this.elbowAngle;
        this.elbowAngle += clamp(difference, -rate * dt, rate * dt);
        this.armTargetLength = this._armReach();
    }

    _startJump() {
        if (!this.attached || this.jumpActive || this.phase !== 'playing') return;
        this.jumpActive = true;
        this.jumpElapsed = 0;
        this.jumpStartElbowAngle = this.elbowAngle;
        this.manualPullHeld = false;
        this.audio.playPlasticImpact?.(0.24);
    }

    _startLegPump() {
        if (!this.attached || this.jumpActive || this.legPumpActive
            || this.legPumpCooldownRemaining > 0 || this.phase !== 'playing') return;
        this.legPumpActive = true;
        this.legPumpElapsed = 0;
        this.audio.playClick?.(0.18);
    }

    _updateLegPump(dt) {
        this.legPumpCooldownRemaining = Math.max(0, this.legPumpCooldownRemaining - dt);
        if (this.legPumpActive) this.legPumpElapsed += dt;
        const progress = this._legPumpProgress();
        let targetHip = 0;
        let targetKnee = 0;
        if (this.legPumpActive && progress < 0.46) {
            const inward = smoothstep(progress / 0.46);
            targetHip = this.parameters.legHipSwingAngle * Math.PI / 180 * inward;
            targetKnee = this.parameters.legKneeBendAngle * Math.PI / 180 * inward;
        } else if (this.legPumpActive) {
            const outward = smoothstep((progress - 0.46) / 0.54);
            targetHip = mix(
                this.parameters.legHipSwingAngle * Math.PI / 180,
                -this.parameters.legHipSwingAngle * 0.42 * Math.PI / 180,
                outward,
            );
            targetKnee = mix(
                this.parameters.legKneeBendAngle * Math.PI / 180,
                0,
                outward,
            );
        }

        const naturalFrequency = 10 / this.parameters.legPumpDuration;
        const damping = 2 * this.parameters.legJointDampingRatio * naturalFrequency;
        const hipAcceleration = naturalFrequency * naturalFrequency
            * (targetHip - this.legHipAngle) - damping * this.legHipAngularVelocity;
        const kneeAcceleration = naturalFrequency * naturalFrequency
            * (targetKnee - this.legKneeAngle) - damping * this.legKneeAngularVelocity;
        const legMass = this.parameters.bodyMass * this.parameters.legMassFraction;
        const thighLength = this.parameters.bodyLength * 0.30;
        const shinLength = this.parameters.bodyLength * 0.32;
        const hipInertia = legMass * (thighLength + shinLength) ** 2 / 3;
        const kneeInertia = legMass * shinLength * shinLength / 3;
        const hipTorque = hipInertia * hipAcceleration;
        const kneeTorque = kneeInertia * kneeAcceleration;
        this.legMusclePower = Math.max(
            0,
            hipTorque * this.legHipAngularVelocity
                + kneeTorque * this.legKneeAngularVelocity,
        );
        this.legHipAngularVelocity += hipAcceleration * dt;
        this.legKneeAngularVelocity += kneeAcceleration * dt;
        this.legHipAngle += this.legHipAngularVelocity * dt;
        this.legKneeAngle = clamp(
            this.legKneeAngle + this.legKneeAngularVelocity * dt,
            0,
            Math.PI * 0.92,
        );

        if (this.legPumpActive && this.legPumpElapsed >= this.parameters.legPumpDuration) {
            this.legPumpElapsed = this.parameters.legPumpDuration;
            this.legPumpActive = false;
            this.legPumpCooldownRemaining = this.parameters.legPumpCooldown;
        }
    }

    _legPumpProgress() {
        if (!this.legPumpActive) return 0;
        return clamp(this.legPumpElapsed / this.parameters.legPumpDuration, 0, 1);
    }

    _updateAttachmentGeometry() {
        if (!this.attached) {
            const shoulder = this._shoulderPoint();
            const axis = this._bodyAxis();
            this.handPoint = add(shoulder, scale(axis, this._armReach() * 0.78));
            this.ropeIsSlack = false;
            return null;
        }
        const vine = this._currentVine();
        const shoulder = this._shoulderPoint();
        const anchorToShoulder = subtract(shoulder, vine.anchor);
        const distance = magnitude(anchorToShoulder);
        const direction = normalize(anchorToShoulder, vector(0, -1));
        const naturalDistance = vine.gripLength + this.armTargetLength;
        const taut = distance >= naturalDistance;
        // All extension belongs to the elastic vine. The shoulder-to-hand
        // chord is fixed by the two rigid arm links and the elbow angle, so an
        // increased tether load can never lengthen the rendered arms.
        this.handPoint = add(shoulder, scale(direction, -this.armTargetLength));
        const anchorToHandDistance = magnitude(subtract(this.handPoint, vine.anchor));
        this.ropeIsSlack = anchorToHandDistance < vine.gripLength * 0.997;
        return { vine, shoulder, direction, distance, naturalDistance, taut };
    }

    _tetherForce() {
        const geometry = this._updateAttachmentGeometry();
        if (!geometry) return { force: vector(), torque: 0 };
        const extension = geometry.distance - geometry.naturalDistance;
        if (extension <= 0) return { force: vector(), torque: 0 };

        const staticExtension = geometry.vine.gripLength
            * this.parameters.ropeStaticStretchPercent / 100;
        const stiffness = this.parameters.bodyMass * this.parameters.gravity
            / Math.max(0.01, staticExtension);
        const shoulderVelocity = this._shoulderVelocity();
        const radialSpeed = dot(shoulderVelocity, geometry.direction);
        let tension = Math.max(
            0,
            stiffness * extension + this.parameters.ropeDamping * radialSpeed,
        );
        if (this.jumpActive) {
            const progress = clamp(
                this.jumpElapsed / this.parameters.jumpPullDuration,
                0,
                1,
            );
            tension += this.parameters.jumpPullForce * Math.sin(Math.PI * progress);
        }
        // A massless axial rope damper can only oppose extension/contraction.
        // It must not brake velocity tangent to the swing arc.
        let force = scale(geometry.direction, -tension);
        if (this.legPumpActive) {
            const tangentialVelocity = subtract(
                shoulderVelocity,
                scale(geometry.direction, radialSpeed),
            );
            const forwardTangent = vector(-geometry.direction.y, geometry.direction.x);
            const pumpDirection = normalize(tangentialVelocity, forwardTangent);
            const tangentialSpeed = Math.max(0.75, magnitude(tangentialVelocity));
            const powerLimitedForce = this.legMusclePower / tangentialSpeed;
            // Positive power from the simulated hip/knee actuators is
            // transmitted through the grip into pendular motion. The force
            // setting is a safety/strength cap, not a canned animation pulse.
            force = add(
                force,
                scale(
                    pumpDirection,
                    Math.min(this.parameters.legPumpForce, powerLimitedForce),
                ),
            );
        }
        return {
            force,
            torque: cross(this._shoulderOffset(), force),
        };
    }

    _postureTorque(step) {
        // Brachiation is not a passive rigid-rod motion. Shoulder, trunk and
        // leg activity keep the body approximately aligned with the support
        // line. This bounded PD moment is a reduced-order representation of
        // that active neuromuscular stabilization; it cannot inject unlimited
        // angular impulse and every coefficient is exposed in the settings.
        const supportDirection = normalize(
            subtract(this.handPoint, this.position),
            this._bodyAxis(),
        );
        const targetAngle = Math.atan2(supportDirection.x, supportDirection.y);
        let targetAngularVelocity = 0;
        if (this.lastPostureTargetAngle !== null) {
            const targetDelta = Math.atan2(
                Math.sin(targetAngle - this.lastPostureTargetAngle),
                Math.cos(targetAngle - this.lastPostureTargetAngle),
            );
            targetAngularVelocity = clamp(targetDelta / Math.max(step, 1e-6), -5, 5);
        }
        this.lastPostureTargetAngle = targetAngle;
        const error = Math.atan2(
            Math.sin(targetAngle - this.bodyAngle),
            Math.cos(targetAngle - this.bodyAngle),
        );
        return clamp(
            this.parameters.postureStiffness * error
                - this.parameters.postureDamping
                    * (this.angularVelocity - targetAngularVelocity),
            -this.parameters.maximumPostureTorque,
            this.parameters.maximumPostureTorque,
        );
    }

    _integrate(step, allowTether = true) {
        const mass = this.parameters.bodyMass;
        let force = vector(
            -this.parameters.airDrag * this.velocity.x * Math.abs(this.velocity.x),
            -mass * this.parameters.gravity
                - this.parameters.airDrag * this.velocity.y * Math.abs(this.velocity.y),
        );
        let torque = -this.parameters.angularDamping * this.angularVelocity;
        if (allowTether && this.attached) {
            const tether = this._tetherForce();
            force = add(force, tether.force);
            // The arm/shoulder controller transmits the tether resultant to
            // the whole-body COM. Applying the same force again as an
            // unopposed shoulder torque recreates the old passive-stick
            // artefact and bleeds swing energy into torso rotation.
            torque += this._postureTorque(step);
        }

        this.velocity = add(this.velocity, scale(force, step / mass));
        const speed = magnitude(this.velocity);
        if (speed > SIMULATION.maximumLinearSpeed) {
            this.velocity = scale(this.velocity, SIMULATION.maximumLinearSpeed / speed);
        }
        this.position = add(this.position, scale(this.velocity, step));

        const inertia = mass * this.parameters.bodyLength * this.parameters.bodyLength
            * this.parameters.bodyInertiaFactor;
        this.angularVelocity = clamp(
            this.angularVelocity + torque / inertia * step,
            -SIMULATION.maximumAngularSpeed,
            SIMULATION.maximumAngularSpeed,
        );
        this.bodyAngle += this.angularVelocity * step;
        this.bodyAngle = Math.atan2(Math.sin(this.bodyAngle), Math.cos(this.bodyAngle));
        this.maximumX = Math.max(this.maximumX, this.position.x);
        this._updateAttachmentGeometry();
    }

    _startRun(_startPulling = false) {
        if (this.phase !== 'ready' && this.phase !== 'countdown') return;
        this.phase = 'playing';
        this.jumpActive = false;
        this.jumpElapsed = 0;
        this.manualPullHeld = false;
        this.legPumpActive = false;
        this.audio.playClick?.();
    }

    _releaseVine() {
        if (!this.attached) return;
        this.attached = false;
        this.jumpActive = false;
        this.manualPullHeld = false;
        this.legPumpActive = false;
        this.lastPostureTargetAngle = null;
        this.flightTime = 0;
        this.audio.playClick?.(0.18);
        this._updateAttachmentGeometry();
    }

    _tryGrabNextVine() {
        if (this.phase !== 'playing') return;
        const nextIndex = this.currentVineIndex + 1;
        this._ensureVinesAhead(nextIndex + SIMULATION.vinesGeneratedAhead);
        const vine = this.vines[nextIndex];
        const shoulder = this._shoulderPoint();
        const bottomY = vine.anchor.y - vine.fullLength;
        const candidateY = clamp(shoulder.y, bottomY, vine.anchor.y - SIMULATION.minimumGripLength);
        const candidate = vector(vine.anchor.x, candidateY);
        const distance = magnitude(subtract(candidate, shoulder));
        const maximumArmReach = this.parameters.upperArmLength + this.parameters.forearmLength;
        if (distance > maximumArmReach) {
            this._gameOver('The next vine was out of reach.');
            return;
        }

        vine.gripLength = clamp(
            vine.anchor.y - candidateY,
            SIMULATION.minimumGripLength,
            vine.fullLength,
        );
        this.currentVineIndex = nextIndex;
        this.attached = true;
        this.jumpActive = false;
        this.jumpElapsed = 0;
        this.manualPullHeld = false;
        this.legPumpActive = false;
        this.legPumpElapsed = 0;
        this.lastPostureTargetAngle = null;
        this.elbowAngle = this._elbowAngleForReach(distance);
        this.armTargetLength = this._armReach();
        this.ropesCleared += 1;
        this.bestRopes = Math.max(this.bestRopes, this.ropesCleared);
        this.flightTime = 0;
        this.audio.playPlasticImpact?.(0.22);
        this._updateAttachmentGeometry();
    }

    _ensureVinesAhead(minimumCount = this.currentVineIndex + SIMULATION.vinesGeneratedAhead) {
        while (this.vines.length < minimumCount) {
            this.vines.push(generateNextVine(
                this.vines[this.vines.length - 1],
                this.parameters,
                this.random,
                this.vines.length,
            ));
        }
    }

    _gameOver(reason) {
        if (this.phase === 'dead') return;
        this.phase = 'dead';
        this.failureReason = reason;
        this.attached = false;
        this.jumpActive = false;
        this.manualPullHeld = false;
        this.legPumpActive = false;
        const distance = Math.max(0, this.maximumX - this.startX);
        this.bestDistance = Math.max(this.bestDistance, distance);
        if (!this._scoreSubmitted) {
            this.submitScore({
                ropes: this.ropesCleared,
                distance: Number(distance.toFixed(3)),
                seconds: Number(this.elapsed.toFixed(3)),
                reason,
                seed: this.seed,
            });
            this._scoreSubmitted = true;
        }
        this.audio.playTone?.(145, 0.34, 'triangle', 0.22);
    }

    update(dt) {
        const grabPressed = this.input.isActionJustDown('grab');
        const pullPressed = this.input.isActionJustDown('pullRelease');
        const legPumpPressed = this.input.isActionJustDown('legPump');

        if (this.phase === 'countdown') {
            this.countdownElapsed += Math.min(dt, SIMULATION.maximumFrameTime);
            if (this.countdownElapsed >= SIMULATION.countdownStepDuration * 3) {
                this._startRun(false);
                this.startFlashRemaining = SIMULATION.zeroFlashDuration;
            }
            return;
        }
        if (this.phase === 'ready') {
            this._startRun(false);
            return;
        }
        if (this.phase === 'dead') {
            if (grabPressed || pullPressed) {
                this._resetRun();
                return;
            }
            this._integrate(Math.min(dt, SIMULATION.maximumFrameTime), false);
            this._updateCamera(dt);
            return;
        }

        this.manualPullHeld = Boolean(
            this.attached
                && !this.jumpActive
                && this.input.isActionDown?.('pullRelease'),
        );
        if (grabPressed) {
            if (this.attached) this._startJump();
            else this._tryGrabNextVine();
        }
        if (legPumpPressed) this._startLegPump();

        const cappedDt = Math.min(dt, SIMULATION.maximumFrameTime);
        this.startFlashRemaining = Math.max(0, this.startFlashRemaining - cappedDt);
        this.elapsed += cappedDt;
        if (!this.attached) this.flightTime += cappedDt;
        this._updateArmAction(cappedDt);
        this._updateLegPump(cappedDt);
        this.accumulator = Math.min(
            this.accumulator + cappedDt,
            SIMULATION.fixedTimeStep * SIMULATION.maximumSubsteps,
        );
        let substeps = 0;
        while (this.accumulator >= SIMULATION.fixedTimeStep
            && substeps < SIMULATION.maximumSubsteps) {
            this._integrate(SIMULATION.fixedTimeStep, true);
            this.accumulator -= SIMULATION.fixedTimeStep;
            substeps++;
        }

        this._ensureVinesAhead();
        this._updateCamera(cappedDt);
        if (this.position.y < SIMULATION.deathY) this._gameOver('Tarzan fell to the forest floor.');
    }

    _updateCamera(dt) {
        const target = this.position.x + 2.45;
        const factor = 1 - Math.exp(-4.5 * Math.max(0, dt));
        this.cameraX = mix(this.cameraX, target, factor);
    }

    _renderScale() {
        return this.h / SIMULATION.logicalHeight;
    }

    _logicalWidth() {
        return this.w / Math.max(1e-6, this._renderScale());
    }

    _worldToLogical(point) {
        return {
            x: this._logicalWidth() * 0.5
                + (point.x - this.cameraX) * SIMULATION.pixelsPerMetre,
            y: SIMULATION.groundScreenY - point.y * SIMULATION.pixelsPerMetre,
        };
    }

    _drawBackground(ctx, width, height) {
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#43bce9');
        sky.addColorStop(0.62, '#a9e8f8');
        sky.addColorStop(1, '#d7f5df');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        const farOffset = -((this.cameraX * 11) % 180);
        ctx.fillStyle = '#78bd72';
        for (let x = farOffset - 180; x < width + 180; x += 150) {
            ctx.beginPath();
            ctx.arc(x, 148, 78, 0, Math.PI * 2);
            ctx.arc(x + 62, 126, 62, 0, Math.PI * 2);
            ctx.arc(x + 116, 155, 72, 0, Math.PI * 2);
            ctx.fill();
        }

        const nearOffset = -((this.cameraX * 23) % 230);
        ctx.fillStyle = '#268f4b';
        for (let x = nearOffset - 230; x < width + 230; x += 205) {
            ctx.beginPath();
            ctx.arc(x, 74, 92, 0, Math.PI * 2);
            ctx.arc(x + 72, 56, 78, 0, Math.PI * 2);
            ctx.arc(x + 145, 92, 96, 0, Math.PI * 2);
            ctx.fill();
        }

        const ground = ctx.createLinearGradient(0, SIMULATION.groundScreenY - 12, 0, height);
        ground.addColorStop(0, '#37a641');
        ground.addColorStop(1, '#155b2a');
        ctx.fillStyle = ground;
        ctx.fillRect(0, SIMULATION.groundScreenY - 8, width, height - SIMULATION.groundScreenY + 8);
    }

    _drawTrees(ctx) {
        for (const vine of this.vines) {
            const anchor = this._worldToLogical(vine.anchor);
            if (anchor.x < -180 || anchor.x > this._logicalWidth() + 180) continue;
            if (vine.id % 3 === 1) {
                ctx.strokeStyle = '#75401f';
                ctx.lineWidth = 24;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(anchor.x + 68, SIMULATION.logicalHeight + 12);
                ctx.quadraticCurveTo(anchor.x + 38, 350, anchor.x + 16, anchor.y - 18);
                ctx.stroke();
                ctx.strokeStyle = '#9a5c2d';
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.moveTo(anchor.x + 14, anchor.y - 4);
                ctx.lineTo(anchor.x - 34, anchor.y + 13);
                ctx.stroke();
            }
            ctx.fillStyle = '#1e783b';
            ctx.beginPath();
            ctx.arc(anchor.x, anchor.y - 7, 26, 0, Math.PI * 2);
            ctx.arc(anchor.x - 24, anchor.y - 16, 23, 0, Math.PI * 2);
            ctx.arc(anchor.x + 26, anchor.y - 18, 25, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _ropeCurve(anchor, end, arcLength) {
        const delta = subtract(end, anchor);
        const direct = magnitude(delta);
        const excess = Math.max(0, arcLength - direct);
        const sag = Math.min(
            arcLength * 0.44,
            Math.sqrt(Math.max(0, arcLength * arcLength - direct * direct)) * 0.58
                + excess * 0.7,
        );
        return Array.from({ length: 25 }, (_, index) => {
            const t = index / 24;
            return vector(
                mix(anchor.x, end.x, t),
                mix(anchor.y, end.y, t) - sag * 4 * t * (1 - t),
            );
        });
    }

    _strokeWorldPolyline(ctx, points, color, width) {
        if (points.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        points.forEach((point, index) => {
            const screen = this._worldToLogical(point);
            if (index === 0) ctx.moveTo(screen.x, screen.y);
            else ctx.lineTo(screen.x, screen.y);
        });
        ctx.stroke();
    }

    _drawTail(ctx, vine) {
        const tailLength = Math.max(0, vine.fullLength - vine.gripLength);
        if (tailLength < 0.03) return;
        const anchorToHand = normalize(subtract(this.handPoint, vine.anchor));
        let oppositeMotion = scale(this._shoulderVelocity(), -1);
        oppositeMotion = subtract(oppositeMotion, scale(anchorToHand, dot(oppositeMotion, anchorToHand)));
        let tangent = normalize(oppositeMotion, vector(anchorToHand.y, -anchorToHand.x));
        if (tangent.y > 0.45) tangent = scale(tangent, -1);
        const normal = vector(-tangent.y, tangent.x);
        const points = Array.from({ length: 18 }, (_, index) => {
            const t = index / 17;
            const flutter = Math.sin(this.elapsed * 8 + t * Math.PI * 2.4) * 0.08 * tailLength * t;
            return add(
                this.handPoint,
                add(
                    scale(tangent, tailLength * t),
                    add(scale(vector(0, -1), tailLength * 0.34 * t * t), scale(normal, flutter)),
                ),
            );
        });
        this._strokeWorldPolyline(ctx, points, '#2d7b34', 4);
    }

    _drawVines(ctx) {
        for (const vine of this.vines) {
            const anchorScreen = this._worldToLogical(vine.anchor);
            if (anchorScreen.x < -100 || anchorScreen.x > this._logicalWidth() + 100) continue;
            if (this.attached && vine.id === this.currentVineIndex) {
                const curve = this.ropeIsSlack
                    ? this._ropeCurve(vine.anchor, this.handPoint, vine.gripLength)
                    : [vine.anchor, this.handPoint];
                this._strokeWorldPolyline(ctx, curve, '#287638', 5);
                this._drawTail(ctx, vine);
            } else {
                const bottom = vector(vine.anchor.x, vine.anchor.y - vine.fullLength);
                const points = Array.from({ length: 17 }, (_, index) => {
                    const t = index / 16;
                    const breeze = Math.sin(this.elapsed * 1.7 + vine.id * 1.9 + t * 4.2)
                        * 0.035 * vine.fullLength * t * t;
                    return vector(vine.anchor.x + breeze, mix(vine.anchor.y, bottom.y, t));
                });
                this._strokeWorldPolyline(ctx, points, '#2f833b', 4);
            }
            ctx.fillStyle = '#154f2a';
            ctx.beginPath();
            ctx.arc(anchorScreen.x, anchorScreen.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawStartingBranch(ctx) {
        if (this.phase !== 'ready' && this.phase !== 'countdown') return;
        const foot = add(this.position, scale(this._bodyAxis(), -this.parameters.bodyLength * 0.5));
        const left = this._worldToLogical(vector(this.startX - 2.05, foot.y - 0.02));
        const right = this._worldToLogical(vector(this.startX + 1.12, foot.y - 0.02));
        ctx.strokeStyle = '#75401f';
        ctx.lineWidth = 17;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
        ctx.strokeStyle = '#a86631';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(left.x + 5, left.y - 3);
        ctx.lineTo(right.x - 5, right.y - 3);
        ctx.stroke();
    }

    _elbowPoint(shoulder, hand, bendSign = this.elbowBendSign) {
        const upper = this.parameters.upperArmLength;
        const forearm = this.parameters.forearmLength;
        const chord = subtract(hand, shoulder);
        const distance = clamp(
            magnitude(chord),
            Math.abs(upper - forearm) + 1e-5,
            upper + forearm - 1e-5,
        );
        const direction = normalize(chord, this._bodyAxis());
        const along = (upper * upper - forearm * forearm + distance * distance)
            / (2 * distance);
        const outward = Math.sqrt(Math.max(0, upper * upper - along * along));
        const normal = vector(-direction.y, direction.x);
        return add(
            shoulder,
            add(scale(direction, along), scale(normal, outward * bendSign)),
        );
    }

    _forwardElbowPoint(shoulder, hand) {
        const positive = this._elbowPoint(shoulder, hand, 1);
        const negative = this._elbowPoint(shoulder, hand, -1);
        // The course advances toward +x, so use the inverse-kinematic
        // solution whose elbow is farther forward along the course.
        this.elbowBendSign = positive.x >= negative.x ? 1 : -1;
        return this.elbowBendSign > 0 ? positive : negative;
    }

    _drawArticulatedArms(ctx, shoulder, hand) {
        const elbow = this._forwardElbowPoint(shoulder, hand);
        const shoulderScreen = this._worldToLogical(shoulder);
        const elbowScreen = this._worldToLogical(elbow);
        const handScreen = this._worldToLogical(hand);
        ctx.strokeStyle = '#263238';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(shoulderScreen.x, shoulderScreen.y);
        ctx.lineTo(elbowScreen.x, elbowScreen.y);
        ctx.lineTo(handScreen.x, handScreen.y);
        ctx.stroke();
    }

    _drawTarzan(ctx) {
        const axis = this._bodyAxis();
        const side = vector(axis.y, -axis.x);
        const shoulder = this._shoulderPoint();
        const hip = add(this.position, scale(axis, -this.parameters.bodyLength * 0.12));
        const head = add(this.position, scale(axis, this.parameters.bodyLength * 0.58));
        const shoulderScreen = this._worldToLogical(shoulder);
        const hipScreen = this._worldToLogical(hip);
        const headScreen = this._worldToLogical(head);
        const handScreen = this._worldToLogical(this.handPoint);

        ctx.strokeStyle = '#263238';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shoulderScreen.x, shoulderScreen.y);
        ctx.lineTo(hipScreen.x, hipScreen.y);
        ctx.stroke();

        const thighLength = this.parameters.bodyLength * 0.30;
        const shinLength = this.parameters.bodyLength * 0.32;
        const thighDirection = add(
            scale(side, Math.sin(this.legHipAngle)),
            scale(axis, -Math.cos(this.legHipAngle)),
        );
        const shinAngle = this.legHipAngle - this.legKneeAngle;
        const shinDirection = add(
            scale(side, Math.sin(shinAngle)),
            scale(axis, -Math.cos(shinAngle)),
        );
        const knee = add(hip, scale(thighDirection, thighLength));
        const foot = add(knee, scale(shinDirection, shinLength));
        const kneeScreen = this._worldToLogical(knee);
        const footScreen = this._worldToLogical(foot);
        ctx.strokeStyle = '#263238';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hipScreen.x, hipScreen.y);
        ctx.lineTo(kneeScreen.x, kneeScreen.y);
        ctx.lineTo(footScreen.x, footScreen.y);
        ctx.stroke();

        ctx.fillStyle = '#f7fbff';
        ctx.strokeStyle = '#263238';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(headScreen.x, headScreen.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Arms are drawn in front of the torso/head so the upper-arm/elbow/
        // forearm chain stays readable even at the fully flexed pull pose.
        this._drawArticulatedArms(ctx, shoulder, this.handPoint);

        ctx.fillStyle = '#263238';
        ctx.beginPath();
        ctx.arc(handScreen.x, handScreen.y, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawHud(ctx, width) {
        ctx.save();
        ctx.shadowColor = 'rgba(28,72,45,.22)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(238,243,239,.94)';
        ctx.strokeStyle = '#52645a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(14, 14, Math.min(360, width - 28), 91, 14);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const distance = Math.max(0, this.maximumX - this.startX);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#277c37';
        ctx.font = '800 11px Inter,sans-serif';
        ctx.fillText('TARZAN SWING', 28, 35);
        ctx.fillStyle = '#24342a';
        ctx.font = '900 28px Inter,sans-serif';
        ctx.fillText(`${this.ropesCleared} vines`, 28, 65);
        ctx.fillStyle = '#5d6d63';
        ctx.font = '12px Inter,sans-serif';
        const state = !this.attached
            ? 'flying'
            : (this.jumpActive
                ? 'jump pull'
                : (this.legPumpActive
                    ? 'leg pump'
                    : (this.manualPullHeld
                        ? 'slow pull'
                        : (this.ropeIsSlack ? 'slack vine' : 'arms extending'))));
        ctx.fillText(`${distance.toFixed(1)} m · ${state} · best ${this.bestRopes}`, 28, 88);
    }

    _drawOverlays(ctx, width, height) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.phase === 'countdown') {
            const number = Math.max(
                1,
                3 - Math.floor(this.countdownElapsed / SIMULATION.countdownStepDuration),
            );
            ctx.fillStyle = 'rgba(239,245,240,.94)';
            ctx.strokeStyle = '#53655a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(width * 0.5, height * 0.5, 54, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#277c37';
            ctx.font = '900 58px Inter,sans-serif';
            ctx.fillText(String(number), width * 0.5, height * 0.5 + 2);
            ctx.fillStyle = '#425149';
            ctx.font = '700 13px Inter,sans-serif';
            ctx.fillText('Get ready', width * 0.5, height * 0.5 + 79);
        } else if (this.phase === 'playing' && this.startFlashRemaining > 0) {
            ctx.fillStyle = 'rgba(239,245,240,.90)';
            ctx.strokeStyle = '#277c37';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(width * 0.5, height * 0.5, 50, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#277c37';
            ctx.font = '900 55px Inter,sans-serif';
            ctx.fillText('0', width * 0.5, height * 0.5 + 2);
        }
        if (this.phase === 'dead') {
            ctx.fillStyle = 'rgba(40,78,53,.32)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#eff4f0';
            ctx.strokeStyle = '#53655a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(width * 0.5 - 210, height * 0.5 - 105, 420, 210, 18);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#c84435';
            ctx.font = '900 28px Inter,sans-serif';
            ctx.fillText('GAME OVER', width * 0.5, height * 0.5 - 62);
            ctx.fillStyle = '#24342a';
            ctx.font = '800 22px Inter,sans-serif';
            ctx.fillText(`${this.ropesCleared} vines`, width * 0.5, height * 0.5 - 23);
            ctx.fillStyle = '#5b6a61';
            ctx.font = '13px Inter,sans-serif';
            ctx.fillText(this.failureReason, width * 0.5, height * 0.5 + 14);
            ctx.fillText('Click either mouse button to try again', width * 0.5, height * 0.5 + 59);
        }
    }

    render() {
        const ctx = this.ctx;
        const pixelWidth = this.w;
        const pixelHeight = this.h;
        const renderScale = this._renderScale();
        const logicalWidth = this._logicalWidth();
        const logicalHeight = SIMULATION.logicalHeight;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pixelWidth, pixelHeight);
        ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
        this._drawBackground(ctx, logicalWidth, logicalHeight);
        this._drawTrees(ctx);
        this._drawStartingBranch(ctx);
        this._drawVines(ctx);
        this._drawTarzan(ctx);
        this._drawHud(ctx, logicalWidth);
        this._drawOverlays(ctx, logicalWidth, logicalHeight);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    onResize() {
        // Physics remains in metre-based world coordinates. Only this render
        // transform changes, so resizing cannot alter a jump or a vine gap.
    }

    destroy() {}

    getRecordSettings(settings = this.settings) {
        const parameters = this._readParameters(settings);
        return { ...parameters };
    }

    static getSettingsSchema() {
        const defaults = TARZAN_DEFAULTS;
        return [
            { key: 'meanVineGap', label: 'Requested mean vine spacing [m]', type: 'range', min: 2.5, max: 7.0, step: 0.05, default: defaults.meanVineGap, group: 'Vine generation' },
            { key: 'vineGapStdDev', label: 'Spacing standard deviation [m]', type: 'range', min: 0, max: 1.8, step: 0.05, default: defaults.vineGapStdDev, group: 'Vine generation' },
            { key: 'meanVineLength', label: 'Mean vine length [m]', type: 'range', min: 3.6, max: 6.4, step: 0.05, default: defaults.meanVineLength, group: 'Vine generation' },
            { key: 'vineLengthStdDev', label: 'Length standard deviation [m]', type: 'range', min: 0, max: 1.5, step: 0.05, default: defaults.vineLengthStdDev, group: 'Vine generation' },
            { key: 'anchorHeight', label: 'Mean canopy height [m]', type: 'range', min: 8.7, max: 10.2, step: 0.05, default: defaults.anchorHeight, group: 'Vine generation' },
            { key: 'anchorHeightStdDev', label: 'Canopy height deviation [m]', type: 'range', min: 0, max: 0.75, step: 0.025, default: defaults.anchorHeightStdDev, group: 'Vine generation' },
            { key: 'reachabilitySafety', label: 'Reachability safety factor', type: 'range', min: 0.58, max: 0.92, step: 0.01, default: defaults.reachabilitySafety, group: 'Vine generation' },
            { key: 'gravity', label: 'Gravity [m/s²]', type: 'range', min: 4, max: 18, step: 0.05, default: defaults.gravity, group: 'Physics' },
            { key: 'bodyMass', label: 'Tarzan mass [kg]', type: 'range', min: 35, max: 130, step: 1, default: defaults.bodyMass, group: 'Physics' },
            { key: 'bodyLength', label: 'Body length [m]', type: 'range', min: 1.15, max: 2.15, step: 0.01, default: defaults.bodyLength, group: 'Physics' },
            { key: 'bodyInertiaFactor', label: 'Body rotational inertia factor', type: 'range', min: 0.08, max: 0.34, step: 0.005, default: defaults.bodyInertiaFactor, group: 'Physics' },
            { key: 'ropeStaticStretchPercent', label: 'Vine stretch under body weight [%]', type: 'range', min: 2, max: 30, step: 0.5, default: defaults.ropeStaticStretchPercent, group: 'Physics' },
            { key: 'ropeDamping', label: 'Vine damping [N·s/m]', type: 'range', min: 0, max: 1800, step: 10, default: defaults.ropeDamping, group: 'Physics' },
            { key: 'airDrag', label: 'Air drag [N·s²/m²]', type: 'range', min: 0, max: 2.5, step: 0.025, default: defaults.airDrag, group: 'Physics' },
            { key: 'angularDamping', label: 'Body angular damping', type: 'range', min: 0, max: 3, step: 0.025, default: defaults.angularDamping, group: 'Physics' },
            { key: 'postureStiffness', label: 'Active posture stiffness [N·m/rad]', type: 'range', min: 0, max: 1800, step: 10, default: defaults.postureStiffness, group: 'Active stabilization' },
            { key: 'postureDamping', label: 'Active posture damping [N·m·s/rad]', type: 'range', min: 0, max: 500, step: 5, default: defaults.postureDamping, group: 'Active stabilization' },
            { key: 'maximumPostureTorque', label: 'Maximum muscle torque [N·m]', type: 'range', min: 0, max: 2200, step: 10, default: defaults.maximumPostureTorque, group: 'Active stabilization' },
            { key: 'upperArmLength', label: 'Upper-arm length [m]', type: 'range', min: 0.25, max: 0.58, step: 0.005, default: defaults.upperArmLength, group: 'Pull action' },
            { key: 'forearmLength', label: 'Forearm length [m]', type: 'range', min: 0.24, max: 0.56, step: 0.005, default: defaults.forearmLength, group: 'Pull action' },
            { key: 'neutralElbowAngle', label: 'Neutral elbow angle [°]', type: 'range', min: 105, max: 175, step: 1, default: defaults.neutralElbowAngle, group: 'Pull action' },
            { key: 'loweredElbowAngle', label: 'Lowered elbow angle [°]', type: 'range', min: 145, max: 179, step: 1, default: defaults.loweredElbowAngle, group: 'Pull action' },
            { key: 'pulledElbowAngle', label: 'Pulled-up elbow angle [°]', type: 'range', min: 35, max: 115, step: 1, default: defaults.pulledElbowAngle, group: 'Pull action' },
            { key: 'jumpPullDuration', label: 'Jump pull duration [s]', type: 'range', min: 0.08, max: 0.34, step: 0.005, default: defaults.jumpPullDuration, group: 'Jump action' },
            { key: 'jumpPullForce', label: 'Jump muscle force [N]', type: 'range', min: 500, max: 12000, step: 50, default: defaults.jumpPullForce, group: 'Jump action' },
            { key: 'legPumpDuration', label: 'Leg-pump duration [s]', type: 'range', min: 0.2, max: 1.2, step: 0.01, default: defaults.legPumpDuration, group: 'Leg pump' },
            { key: 'legPumpForce', label: 'Leg-pump force [N]', type: 'range', min: 50, max: 1200, step: 10, default: defaults.legPumpForce, group: 'Leg pump' },
            { key: 'legPumpCooldown', label: 'Leg-pump cooldown [s]', type: 'range', min: 0, max: 1.0, step: 0.01, default: defaults.legPumpCooldown, group: 'Leg pump' },
            { key: 'legHipSwingAngle', label: 'Hip swing angle [°]', type: 'range', min: 15, max: 110, step: 1, default: defaults.legHipSwingAngle, group: 'Leg pump' },
            { key: 'legKneeBendAngle', label: 'Knee bend angle [°]', type: 'range', min: 20, max: 145, step: 1, default: defaults.legKneeBendAngle, group: 'Leg pump' },
            { key: 'legJointDampingRatio', label: 'Leg-joint damping ratio', type: 'range', min: 0.2, max: 1.5, step: 0.01, default: defaults.legJointDampingRatio, group: 'Leg pump' },
            { key: 'legMassFraction', label: 'Moving leg mass fraction', type: 'range', min: 0.08, max: 0.35, step: 0.005, default: defaults.legMassFraction, group: 'Leg pump' },
            { key: 'slowPullRate', label: 'RMB slow pull rate [°/s]', type: 'range', min: 20, max: 180, step: 1, default: defaults.slowPullRate, group: 'Slow pull' },
            { key: 'automaticExtendRate', label: 'Automatic arm extension rate [°/s]', type: 'range', min: 20, max: 180, step: 1, default: defaults.automaticExtendRate, group: 'Slow pull' },
            { key: 'initialSwingAngle', label: 'Initial swing angle from vertical [°]', type: 'range', min: 18, max: 48, step: 1, default: defaults.initialSwingAngle, group: 'Starting position' },
        ];
    }

    static getControlsSchema() {
        return [
            {
                action: 'grab',
                label: 'Attached: jump · airborne: catch vine',
                defaultBindings: [{ type: 'mouse', code: 0 }],
            },
            {
                action: 'pullRelease',
                label: 'Hold: slow pull · release: extend arms',
                defaultBindings: [{ type: 'mouse', code: 2 }],
            },
            {
                action: 'legPump',
                label: 'Swing legs to gain speed',
                defaultBindings: [{ type: 'keyboard', code: 'KeyR' }],
            },
        ];
    }
}
