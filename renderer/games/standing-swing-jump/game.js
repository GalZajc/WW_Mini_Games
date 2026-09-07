import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

/*
 * Standing-swing model
 * --------------------
 * q = (theta, beta). theta is the rope angle from the downward vertical;
 * beta is the rider's upward body axis from the upward vertical. The feet stay
 * on the seat and both massless arm links stay connected between the shoulder
 * and a fixed grip point on the rope. R/T change the requested elbow bend; the
 * resulting arm force is applied equally and oppositely to the body and rope.
 * The hands are therefore a real part of the closed mechanism and detach only
 * when the player releases a jump drag.
 *
 * Every physical/difficulty parameter is centralized here and exposed in the
 * standard settings menu below. SIMULATION contains only numerical/rendering
 * choices which must not change physical outcomes.
 */
export const SWING_DEFAULTS = Object.freeze({
    gravity: 9.81,
    ropeLength: 3.8,
    seatMass: 16,
    riderMass: 72,
    riderHeight: 1.72,
    riderComHeight: 0.86,
    riderInertiaFactor: 0.17,
    shoulderHeightFraction: 0.76,
    upperArmLength: 0.34,
    forearmLength: 0.38,
    handHeightAboveSeat: 1.5,
    neutralArmReach: 0.38,
    extendedArmReach: 0.70,
    pulledArmReach: 0.235,
    armActuationRate: 1.8,
    armStiffness: 4600,
    armDamping: 480,
    maximumArmForce: 4500,
    armLimitStiffness: 22000,
    armLimitDamping: 900,
    ropeBearingDamping: 0.34,
    bodyAngularDamping: 18,
    airDrag: 0.055,
    launchMaximumSpeed: 4.6,
    launchAngularDamping: 1.8,
    initialSwingAngle: 18,
});

const SIMULATION = Object.freeze({
    logicalHeight: 720,
    pixelsPerMetre: 70,
    groundScreenY: 665,
    fixedTimeStep: 1 / 300,
    maximumSubsteps: 20,
    maximumFrameTime: 0.05,
    pivotHeight: 6.55,
    countdownStepDuration: 0.72,
    zeroFlashDuration: 0.42,
    maximumAngularSpeed: 12,
    maximumFlightSpeed: 30,
    maximumDragLogicalPixels: 185,
    minimumScoredFlightTime: 0.08,
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const mix = (a, b, t) => a + (b - a) * t;
const vector = (x = 0, y = 0) => ({ x, y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a, factor) => ({ x: a.x * factor, y: a.y * factor });
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const magnitude = value => Math.hypot(value.x, value.y);
const normalize = (value, fallback = vector(1, 0)) => {
    const length = magnitude(value);
    return length > 1e-9 ? scale(value, 1 / length) : { ...fallback };
};

const armRelativeAngleForReach = (reach, parameters) => {
    const shoulderHeight = parameters.riderHeight * parameters.shoulderHeightFraction;
    const handHeight = parameters.handHeightAboveSeat;
    const cosine = (
        handHeight * handHeight + shoulderHeight * shoulderHeight - reach * reach
    ) / (2 * handHeight * shoulderHeight);
    return Math.acos(clamp(cosine, -1, 1));
};

export function readSwingParameters(settings = {}) {
    const source = { ...SWING_DEFAULTS, ...(settings || {}) };
    const ropeLength = Number(source.ropeLength);
    const riderHeight = Number(source.riderHeight);
    const shoulderHeightFraction = Number(source.shoulderHeightFraction);
    const shoulderHeight = riderHeight * shoulderHeightFraction;
    const upperArmLength = Number(source.upperArmLength);
    const forearmLength = Number(source.forearmLength);
    const handHeightAboveSeat = Number(source.handHeightAboveSeat);
    return Object.freeze({
        gravity: Number(source.gravity),
        ropeLength,
        seatMass: Number(source.seatMass),
        riderMass: Number(source.riderMass),
        riderHeight,
        riderComHeight: Number(source.riderComHeight),
        riderInertiaFactor: Number(source.riderInertiaFactor),
        shoulderHeightFraction,
        upperArmLength,
        forearmLength,
        handHeightAboveSeat,
        neutralArmReach: Number(source.neutralArmReach),
        extendedArmReach: Number(source.extendedArmReach),
        pulledArmReach: Number(source.pulledArmReach),
        armActuationRate: Number(source.armActuationRate),
        armStiffness: Number(source.armStiffness),
        armDamping: Number(source.armDamping),
        maximumArmForce: Number(source.maximumArmForce),
        armLimitStiffness: Number(source.armLimitStiffness),
        armLimitDamping: Number(source.armLimitDamping),
        ropeBearingDamping: Number(source.ropeBearingDamping),
        bodyAngularDamping: Number(source.bodyAngularDamping),
        airDrag: Number(source.airDrag),
        launchMaximumSpeed: Number(source.launchMaximumSpeed),
        launchAngularDamping: Number(source.launchAngularDamping),
        initialSwingAngle: Number(source.initialSwingAngle),
    });
}

export function validateSwingSettings(settings = {}) {
    const positive = [
        ['ropeLength', 'Rope length'], ['seatMass', 'Seat mass'], ['riderMass', 'Rider mass'],
        ['riderHeight', 'Rider height'], ['riderComHeight', 'Rider COM height'],
        ['upperArmLength', 'Upper-arm length'], ['forearmLength', 'Forearm length'],
        ['handHeightAboveSeat', 'Grip height above seat'],
    ];
    for (const [key, label] of positive) requirePositiveNumber(settings[key], label);
    requireFiniteNumber(settings.gravity, 'Gravity', { minimum: 0 });
    requireFiniteNumber(settings.shoulderHeightFraction, 'Shoulder height fraction', { minimum: 0, maximum: 1 });
    requireFiniteNumber(settings.riderInertiaFactor, 'Body inertia factor', { minimum: 0 });
    const upper = Number(settings.upperArmLength);
    const fore = Number(settings.forearmLength);
    const minimumReach = Math.abs(upper - fore);
    const maximumReach = upper + fore;
    for (const [key, label] of [['neutralArmReach', 'Neutral reach'], ['extendedArmReach', 'Extended reach'], ['pulledArmReach', 'Pulled reach']]) {
        const reach = requireFiniteNumber(settings[key], label);
        if (reach < minimumReach || reach > maximumReach) throw new Error(`${label} must lie between ${minimumReach} and ${maximumReach} m for the selected arm lengths.`);
    }
    for (const [key, label] of [
        ['armStiffness', 'Arm stiffness'], ['armDamping', 'Arm damping'], ['maximumArmForce', 'Maximum arm force'],
        ['armLimitStiffness', 'Arm-limit stiffness'], ['armLimitDamping', 'Arm-limit damping'],
        ['ropeBearingDamping', 'Pivot damping'], ['bodyAngularDamping', 'Ankle damping'], ['airDrag', 'Air drag'],
        ['launchMaximumSpeed', 'Maximum jump push'], ['launchAngularDamping', 'Airborne posture damping'],
    ]) requireFiniteNumber(settings[key], label, { minimum: 0 });
    // A zero actuation rate is a valid frozen-arm experiment. It simply
    // prevents the active arm target from changing; no denominator depends
    // on this rate.
    requireFiniteNumber(settings.armActuationRate, 'Arm extension speed', { minimum: 0 });
}

/** Geometry of the fixed hand grip and shoulder, relative to the swing pivot. */
export function standingSwingArmGeometry(state, parameters) {
    const p = parameters;
    const shoulderHeight = p.riderHeight * p.shoulderHeightFraction;
    const seat = vector(
        p.ropeLength * Math.sin(state.theta),
        -p.ropeLength * Math.cos(state.theta),
    );
    const hand = add(seat, vector(
        -p.handHeightAboveSeat * Math.sin(state.theta),
        p.handHeightAboveSeat * Math.cos(state.theta),
    ));
    const shoulder = add(seat, vector(
        -shoulderHeight * Math.sin(state.beta),
        shoulderHeight * Math.cos(state.beta),
    ));
    const shoulderToHand = subtract(hand, shoulder);
    const rawDistance = Math.max(1e-9, magnitude(shoulderToHand));
    // The settings validator rejects an unreachable target before a game
    // starts.  This projection is still needed for a transient numerical
    // state (or a direct geometry helper call): a rigid two-link arm cannot
    // represent a distance outside its triangle-inequality interval.
    const minimumReach = Math.abs(p.upperArmLength - p.forearmLength) + 1e-7;
    const maximumReach = p.upperArmLength + p.forearmLength - 1e-7;
    const distance = clamp(rawDistance, minimumReach, maximumReach);
    const direction = scale(shoulderToHand, 1 / rawDistance);
    const handVelocity = scale(
        vector(Math.cos(state.theta), Math.sin(state.theta)),
        (p.ropeLength - p.handHeightAboveSeat) * (state.thetaVelocity || 0),
    );
    const shoulderVelocity = add(
        scale(
            vector(Math.cos(state.theta), Math.sin(state.theta)),
            p.ropeLength * (state.thetaVelocity || 0),
        ),
        scale(
            vector(-Math.cos(state.beta), -Math.sin(state.beta)),
            shoulderHeight * (state.betaVelocity || 0),
        ),
    );
    return {
        seat,
        hand,
        shoulder,
        shoulderHeight,
        direction,
        distance,
        distanceRate: dot(direction, subtract(handVelocity, shoulderVelocity)),
        minimumReach,
        maximumReach,
    };
}

/** Exact massless two-link inverse kinematics; both limb lengths stay fixed. */
export function standingSwingElbowPosition(shoulder, hand, parameters) {
    const offset = subtract(hand, shoulder);
    const rawDistance = magnitude(offset);
    const direction = normalize(offset, vector(1, 0));
    const minimum = Math.abs(parameters.upperArmLength - parameters.forearmLength) + 1e-7;
    const maximum = parameters.upperArmLength + parameters.forearmLength - 1e-7;
    const distance = clamp(rawDistance, minimum, maximum);
    const along = (
        parameters.upperArmLength * parameters.upperArmLength
        - parameters.forearmLength * parameters.forearmLength
        + distance * distance
    ) / (2 * distance);
    const across = Math.sqrt(Math.max(
        0,
        parameters.upperArmLength * parameters.upperArmLength - along * along,
    ));
    const base = add(shoulder, scale(direction, along));
    const perpendicular = vector(-direction.y, direction.x);
    const first = add(base, scale(perpendicular, across));
    const second = add(base, scale(perpendicular, -across));
    return first.x >= second.x ? first : second;
}

/** Return the coupled angular accelerations for the closed standing swing. */
export function solveStandingSwingAcceleration(state, parameters, targetArmReach) {
    const { theta, thetaVelocity, beta, betaVelocity } = state;
    const p = parameters;
    const totalMass = p.seatMass + p.riderMass;
    const bodyArm = -p.riderComHeight;
    const bodyInertia = p.riderMass * p.riderHeight * p.riderHeight
        * p.riderInertiaFactor;
    const delta = theta - beta;
    const mass11 = totalMass * p.ropeLength * p.ropeLength;
    const mass12 = p.riderMass * p.ropeLength * bodyArm * Math.cos(delta);
    const mass22 = p.riderMass * bodyArm * bodyArm + bodyInertia;

    const arm = standingSwingArmGeometry(state, p);
    const requestedReach = clamp(
        Number.isFinite(targetArmReach) ? targetArmReach : p.neutralArmReach,
        arm.minimumReach,
        arm.maximumReach,
    );
    let armForce = p.armStiffness * (arm.distance - requestedReach)
        + p.armDamping * arm.distanceRate;
    if (arm.distance > arm.maximumReach) {
        armForce += p.armLimitStiffness * (arm.distance - arm.maximumReach)
            + p.armLimitDamping * Math.max(0, arm.distanceRate);
    } else if (arm.distance < arm.minimumReach) {
        armForce -= p.armLimitStiffness * (arm.minimumReach - arm.distance)
            + p.armLimitDamping * Math.max(0, -arm.distanceRate);
    }
    armForce = clamp(armForce, -p.maximumArmForce, p.maximumArmForce);
    const shoulderForce = scale(arm.direction, armForce);
    const bodyArmTorque = dot(
        shoulderForce,
        scale(vector(-Math.cos(beta), -Math.sin(beta)), arm.shoulderHeight),
    );
    const ropeArmTorque = dot(
        shoulderForce,
        scale(vector(Math.cos(theta), Math.sin(theta)), p.handHeightAboveSeat),
    );
    const relativeSpeed = betaVelocity - thetaVelocity;
    const ankleDampingTorque = p.bodyAngularDamping * relativeSpeed;
    const coupling = p.riderMass * p.ropeLength * bodyArm * Math.sin(delta);
    const right1 = -totalMass * p.gravity * p.ropeLength * Math.sin(theta)
        - coupling * betaVelocity * betaVelocity
        + ropeArmTorque
        + ankleDampingTorque
        - p.ropeBearingDamping * thetaVelocity;
    const right2 = coupling * thetaVelocity * thetaVelocity
        - p.riderMass * p.gravity * bodyArm * Math.sin(beta)
        + bodyArmTorque
        - ankleDampingTorque;
    const determinant = Math.max(1e-8, mass11 * mass22 - mass12 * mass12);
    return {
        thetaAcceleration: (right1 * mass22 - right2 * mass12) / determinant,
        betaAcceleration: (right2 * mass11 - right1 * mass12) / determinant,
        armForce,
        armDistance: arm.distance,
        armDistanceRate: arm.distanceRate,
        targetArmReach: requestedReach,
        relativeLean: beta - theta,
    };
}

export default class StandingSwingJumpGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        validateSwingSettings({ ...SWING_DEFAULTS, ...(this.settings || {}) });
        requireFiniteNumber(
            this.settings?.initialSwingAngle ?? SWING_DEFAULTS.initialSwingAngle,
            'Initial swing angle',
        );
        this.parameters = readSwingParameters(this.settings);
        this.bestDistance = 0;
        this._bestRequest = (this._bestRequest || 0) + 1;
        this._loadBest(this._bestRequest);
        this._resetRun();
    }

    _resetRun() {
        this.phase = 'countdown';
        this.countdownElapsed = 0;
        this.startFlashRemaining = 0;
        this.elapsed = 0;
        this.accumulator = 0;
        this.theta = -this.parameters.initialSwingAngle * Math.PI / 180;
        this.thetaVelocity = 0;
        this.beta = this.theta + armRelativeAngleForReach(
            this.parameters.neutralArmReach,
            this.parameters,
        );
        this.betaVelocity = 0;
        this.desiredArmReach = this.parameters.neutralArmReach;
        this.armTargetReach = this.parameters.neutralArmReach;
        this.armForce = 0;
        this.muscleWork = 0;
        this.drag = null;
        this.flightPosition = null;
        this.flightVelocity = null;
        this.flightAngle = 0;
        this.flightAngularVelocity = 0;
        this.flightTime = 0;
        this.takeoffX = 0;
        this.landingX = 0;
        this.distance = 0;
        this.failureReason = '';
        this.cameraX = 0;
        this._scoreSubmitted = false;
    }

    async _loadBest(requestId) {
        try {
            const record = await this.app?.records?.getBest(
                'standing-swing-jump',
                this.getRecordSettings(this.settings),
                'distance',
            );
            if (requestId !== this._bestRequest) return;
            const value = Number(record?.results?.distance);
            if (Number.isFinite(value)) this.bestDistance = value;
        } catch (error) {
            console.warn('Could not load Swing Jump record:', error);
        }
    }

    _seatPosition() {
        return vector(
            this.parameters.ropeLength * Math.sin(this.theta),
            SIMULATION.pivotHeight - this.parameters.ropeLength * Math.cos(this.theta),
        );
    }

    _riderComPosition() {
        const seat = this._seatPosition();
        return add(seat, vector(
            -this.parameters.riderComHeight * Math.sin(this.beta),
            this.parameters.riderComHeight * Math.cos(this.beta),
        ));
    }

    _riderComVelocity() {
        return vector(
            this.parameters.ropeLength * Math.cos(this.theta) * this.thetaVelocity
                - this.parameters.riderComHeight * Math.cos(this.beta) * this.betaVelocity,
            this.parameters.ropeLength * Math.sin(this.theta) * this.thetaVelocity
                - this.parameters.riderComHeight * Math.sin(this.beta) * this.betaVelocity,
        );
    }

    _attachedArmGeometry() {
        const geometry = standingSwingArmGeometry(this, this.parameters);
        const lift = point => vector(point.x, point.y + SIMULATION.pivotHeight);
        return {
            ...geometry,
            seat: lift(geometry.seat),
            hand: lift(geometry.hand),
            shoulder: lift(geometry.shoulder),
        };
    }

    _footPosition(position = this.flightPosition, angle = this.flightAngle) {
        if (!position) return this._seatPosition();
        return add(position, vector(
            this.parameters.riderComHeight * Math.sin(angle),
            -this.parameters.riderComHeight * Math.cos(angle),
        ));
    }

    _updateArmCommand() {
        const leaningBack = Boolean(this.input.isActionDown?.('leanBack'));
        const pulling = Boolean(this.input.isActionDown?.('pullForward'));
        if (leaningBack === pulling) this.desiredArmReach = this.parameters.neutralArmReach;
        else if (leaningBack) this.desiredArmReach = this.parameters.extendedArmReach;
        else this.desiredArmReach = this.parameters.pulledArmReach;
    }

    _integrateAttached(step) {
        const maximumChange = this.parameters.armActuationRate * step;
        this.armTargetReach += clamp(
            this.desiredArmReach - this.armTargetReach,
            -maximumChange,
            maximumChange,
        );
        const acceleration = solveStandingSwingAcceleration(
            this,
            this.parameters,
            this.armTargetReach,
        );
        this.armForce = acceleration.armForce;
        this.muscleWork += Math.max(
            0,
            -acceleration.armForce * acceleration.armDistanceRate,
        ) * step;
        this.thetaVelocity = clamp(
            this.thetaVelocity + acceleration.thetaAcceleration * step,
            -SIMULATION.maximumAngularSpeed,
            SIMULATION.maximumAngularSpeed,
        );
        this.betaVelocity = clamp(
            this.betaVelocity + acceleration.betaAcceleration * step,
            -SIMULATION.maximumAngularSpeed,
            SIMULATION.maximumAngularSpeed,
        );
        this.theta += this.thetaVelocity * step;
        this.beta += this.betaVelocity * step;
        this.theta = Math.atan2(Math.sin(this.theta), Math.cos(this.theta));
        this.beta = Math.atan2(Math.sin(this.beta), Math.cos(this.beta));
        this._projectArmConfiguration();
    }

    _projectArmConfiguration() {
        const minimumReach = Math.abs(
            this.parameters.upperArmLength - this.parameters.forearmLength,
        ) + 0.01;
        const maximumReach = this.parameters.upperArmLength
            + this.parameters.forearmLength - 0.01;
        const minimumAngle = armRelativeAngleForReach(minimumReach, this.parameters);
        const maximumAngle = armRelativeAngleForReach(maximumReach, this.parameters);
        const relative = Math.atan2(
            Math.sin(this.beta - this.theta),
            Math.cos(this.beta - this.theta),
        );
        const constrained = clamp(relative, minimumAngle, maximumAngle);
        if (constrained === relative) return;
        const relativeVelocity = this.betaVelocity - this.thetaVelocity;
        if ((relative < minimumAngle && relativeVelocity < 0)
            || (relative > maximumAngle && relativeVelocity > 0)) {
            this.betaVelocity = this.thetaVelocity;
        }
        this.beta = Math.atan2(
            Math.sin(this.theta + constrained),
            Math.cos(this.theta + constrained),
        );
    }

    _integrateFlight(step) {
        const velocity = this.flightVelocity;
        const speed = magnitude(velocity);
        const dragFactor = speed > 1e-8
            ? this.parameters.airDrag * speed / this.parameters.riderMass
            : 0;
        velocity.x += -dragFactor * velocity.x * step;
        velocity.y += (-this.parameters.gravity - dragFactor * velocity.y) * step;
        const cappedSpeed = magnitude(velocity);
        if (cappedSpeed > SIMULATION.maximumFlightSpeed) {
            this.flightVelocity = scale(velocity, SIMULATION.maximumFlightSpeed / cappedSpeed);
        }
        this.flightPosition.x += this.flightVelocity.x * step;
        this.flightPosition.y += this.flightVelocity.y * step;
        this.flightAngularVelocity *= Math.exp(-this.parameters.launchAngularDamping * step);
        this.flightAngle += this.flightAngularVelocity * step;
        this.flightTime += step;

        const foot = this._footPosition();
        if (this.flightTime >= SIMULATION.minimumScoredFlightTime
            && foot.y <= 0 && this.flightVelocity.y < 0) {
            this.landingX = foot.x;
            this.distance = Math.max(0, this.landingX - this.takeoffX);
            this.bestDistance = Math.max(this.bestDistance, this.distance);
            this._finishRun('Landed');
        }
    }

    _mouseLogical() {
        const mouse = this.input.getMousePos?.() || vector(this.w * 0.5, this.h * 0.5);
        const renderScale = this._renderScale();
        return vector(mouse.x / renderScale, mouse.y / renderScale);
    }

    _beginDrag() {
        if (this.phase !== 'playing' || this.flightPosition) return;
        const point = this._mouseLogical();
        this.drag = { start: point, current: point };
    }

    _updateDrag() {
        if (!this.drag) return;
        this.drag.current = this._mouseLogical();
    }

    _releaseFromDrag() {
        if (!this.drag || this.flightPosition || this.phase !== 'playing') {
            this.drag = null;
            return;
        }
        this._updateDrag();
        const visual = vector(
            this.drag.current.x - this.drag.start.x,
            this.drag.current.y - this.drag.start.y,
        );
        const strength = clamp(
            magnitude(visual) / SIMULATION.maximumDragLogicalPixels,
            0,
            1,
        );
        const worldDirection = normalize(vector(visual.x, -visual.y), vector(1, 0.35));
        const pushVelocity = scale(
            worldDirection,
            this.parameters.launchMaximumSpeed * strength,
        );
        const seat = this._seatPosition();
        const com = this._riderComPosition();
        const inherited = this._riderComVelocity();
        this.flightPosition = { ...com };
        this.flightVelocity = add(inherited, pushVelocity);
        this.flightAngle = this.beta;
        this.flightAngularVelocity = this.betaVelocity;
        this.takeoffX = seat.x;
        this.flightTime = 0;
        this.drag = null;
        this.audio.playPlasticImpact?.(0.25);
    }

    _finishRun(reason) {
        if (this.phase === 'done') return;
        this.phase = 'done';
        this.failureReason = reason;
        if (!this._scoreSubmitted) {
            this.submitScore({
                distance: Number(this.distance.toFixed(3)),
                flightTime: Number(this.flightTime.toFixed(3)),
                pumpingTime: Number(this.elapsed.toFixed(3)),
                muscleWork: Number(this.muscleWork.toFixed(1)),
            });
            this._scoreSubmitted = true;
        }
        this.audio.playPlasticImpact?.(0.42);
    }

    update(dt) {
        const cappedDt = Math.min(Number(dt) || 0, SIMULATION.maximumFrameTime);
        if (this.phase === 'countdown') {
            this.countdownElapsed += cappedDt;
            if (this.countdownElapsed >= SIMULATION.countdownStepDuration * 3) {
                this.phase = 'playing';
                this.startFlashRemaining = SIMULATION.zeroFlashDuration;
                this.audio.playClick?.();
            }
            return;
        }
        if (this.phase === 'done') {
            if (this.input.isActionJustDown?.('leanBack')
                || this.input.isActionJustDown?.('pullForward')
                || this.input.isActionJustDown?.('jumpDrag')) this._resetRun();
            return;
        }

        if (this.input.isActionJustDown?.('jumpDrag')) this._beginDrag();
        if (this.input.isActionDown?.('jumpDrag')) this._updateDrag();
        if (this.input.isActionJustUp?.('jumpDrag')) this._releaseFromDrag();
        this._updateArmCommand();
        this.elapsed += cappedDt;
        this.startFlashRemaining = Math.max(0, this.startFlashRemaining - cappedDt);
        this.accumulator = Math.min(
            this.accumulator + cappedDt,
            SIMULATION.fixedTimeStep * SIMULATION.maximumSubsteps,
        );
        let substeps = 0;
        while (this.accumulator >= SIMULATION.fixedTimeStep
            && substeps < SIMULATION.maximumSubsteps) {
            if (this.flightPosition) this._integrateFlight(SIMULATION.fixedTimeStep);
            else this._integrateAttached(SIMULATION.fixedTimeStep);
            this.accumulator -= SIMULATION.fixedTimeStep;
            substeps++;
            if (this.phase === 'done') break;
        }
        const focusX = this.flightPosition?.x || 0;
        this.cameraX = mix(this.cameraX, Math.max(0, focusX - 2.2), 1 - Math.exp(-3.5 * cappedDt));
    }

    _renderScale() { return this.h / SIMULATION.logicalHeight; }
    _logicalWidth() { return this.w / Math.max(1e-6, this._renderScale()); }
    _worldToLogical(point) {
        return vector(
            this._logicalWidth() * 0.46
                + (point.x - this.cameraX) * SIMULATION.pixelsPerMetre,
            SIMULATION.groundScreenY - point.y * SIMULATION.pixelsPerMetre,
        );
    }

    _drawBackground(ctx, width, height) {
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#48c3f1');
        sky.addColorStop(0.68, '#bceefd');
        sky.addColorStop(1, '#ebfbff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255,255,255,.82)';
        for (const [x, y, size] of [[90, 95, 1], [width - 190, 135, .8], [width * .58, 65, .58]]) {
            ctx.beginPath();
            ctx.arc(x, y, 34 * size, 0, Math.PI * 2);
            ctx.arc(x + 35 * size, y - 9 * size, 29 * size, 0, Math.PI * 2);
            ctx.arc(x + 68 * size, y + 2 * size, 25 * size, 0, Math.PI * 2);
            ctx.fill();
        }
        const groundY = SIMULATION.groundScreenY;
        ctx.fillStyle = '#5dcc48';
        ctx.fillRect(0, groundY, width, height - groundY);
        ctx.fillStyle = '#2c963a';
        ctx.fillRect(0, groundY, width, 7);
        const metreOffset = ((-this.cameraX * SIMULATION.pixelsPerMetre) % SIMULATION.pixelsPerMetre);
        ctx.strokeStyle = 'rgba(32,101,43,.35)';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#236e31';
        ctx.font = '700 10px Inter,sans-serif';
        ctx.textAlign = 'center';
        for (let x = metreOffset - 70; x < width + 70; x += SIMULATION.pixelsPerMetre) {
            ctx.beginPath();
            ctx.moveTo(x, groundY);
            ctx.lineTo(x, groundY + 13);
            ctx.stroke();
        }
    }

    _drawFrame(ctx) {
        const pivot = this._worldToLogical(vector(0, SIMULATION.pivotHeight));
        const legBottom = this._worldToLogical(vector(0, 0));
        const spread = 2.15 * SIMULATION.pixelsPerMetre;
        ctx.strokeStyle = '#385267';
        ctx.lineWidth = 13;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pivot.x - 18, pivot.y);
        ctx.lineTo(pivot.x - spread, legBottom.y);
        ctx.moveTo(pivot.x + 18, pivot.y);
        ctx.lineTo(pivot.x + spread, legBottom.y);
        ctx.moveTo(pivot.x - 82, pivot.y);
        ctx.lineTo(pivot.x + 82, pivot.y);
        ctx.stroke();
        ctx.strokeStyle = '#86a4b7';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pivot.x - 18, pivot.y);
        ctx.lineTo(pivot.x - spread, legBottom.y);
        ctx.moveTo(pivot.x + 18, pivot.y);
        ctx.lineTo(pivot.x + spread, legBottom.y);
        ctx.stroke();

        const seat = this._worldToLogical(this._seatPosition());
        // The foreground rope passes through the actual physical grip point.
        // A second, slightly offset rope suggests the hidden parallel side.
        ctx.strokeStyle = 'rgba(188,160,111,.72)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pivot.x - 7, pivot.y + 3);
        ctx.lineTo(seat.x - 9, seat.y);
        ctx.stroke();
        ctx.strokeStyle = '#f0dfb5';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pivot.x, pivot.y + 3);
        ctx.lineTo(seat.x, seat.y);
        ctx.stroke();
        ctx.strokeStyle = '#714526';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(seat.x - 28, seat.y);
        ctx.lineTo(seat.x + 28, seat.y);
        ctx.stroke();
    }

    _drawRider(ctx) {
        const inFlight = Boolean(this.flightPosition);
        const angle = inFlight ? this.flightAngle : this.beta;
        const foot = inFlight ? this._footPosition() : this._seatPosition();
        const attachedArm = inFlight ? null : this._attachedArmGeometry();
        const top = add(foot, vector(
            -this.parameters.riderHeight * Math.sin(angle),
            this.parameters.riderHeight * Math.cos(angle),
        ));
        const hip = add(foot, scale(vector(
            -Math.sin(angle), Math.cos(angle),
        ), this.parameters.riderHeight * 0.48));
        const shoulder = attachedArm?.shoulder || add(foot, scale(vector(
            -Math.sin(angle), Math.cos(angle),
        ), this.parameters.riderHeight * this.parameters.shoulderHeightFraction));
        const head = add(top, scale(vector(-Math.sin(angle), Math.cos(angle)), 0.12));
        const screenFoot = this._worldToLogical(foot);
        const screenHip = this._worldToLogical(hip);
        const screenShoulder = this._worldToLogical(shoulder);
        const screenHead = this._worldToLogical(head);
        ctx.strokeStyle = '#263840';
        ctx.fillStyle = '#ffd0a1';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(screenFoot.x, screenFoot.y);
        ctx.lineTo(screenHip.x, screenHip.y);
        ctx.lineTo(screenShoulder.x, screenShoulder.y);
        ctx.stroke();
        ctx.strokeStyle = '#e24b3f';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(screenHip.x, screenHip.y);
        ctx.lineTo(screenShoulder.x, screenShoulder.y);
        ctx.stroke();
        const forward = vector(Math.cos(angle), Math.sin(angle));
        const upward = vector(-Math.sin(angle), Math.cos(angle));
        const hand = attachedArm?.hand || add(
            shoulder,
            add(scale(forward, 0.53), scale(upward, 0.08)),
        );
        const elbow = standingSwingElbowPosition(shoulder, hand, this.parameters);
        const handScreen = this._worldToLogical(hand);
        const elbowScreen = this._worldToLogical(elbow);
        ctx.strokeStyle = '#ffd0a1';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(screenShoulder.x, screenShoulder.y);
        ctx.lineTo(elbowScreen.x, elbowScreen.y);
        ctx.lineTo(handScreen.x, handScreen.y);
        ctx.stroke();
        ctx.fillStyle = '#263840';
        ctx.beginPath();
        ctx.arc(handScreen.x, handScreen.y, inFlight ? 4 : 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screenHead.x, screenHead.y, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd0a1';
        ctx.fill();
        ctx.strokeStyle = '#263840';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    _drawDragArrow(ctx) {
        if (!this.drag) return;
        const start = this.drag.start;
        const current = this.drag.current;
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        const length = Math.hypot(dx, dy);
        const strength = clamp(length / SIMULATION.maximumDragLogicalPixels, 0, 1);
        const angle = Math.atan2(dy, dx);
        ctx.strokeStyle = '#e7473c';
        ctx.fillStyle = '#e7473c';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(current.x, current.y);
        ctx.lineTo(current.x - 18 * Math.cos(angle - 0.55), current.y - 18 * Math.sin(angle - 0.55));
        ctx.lineTo(current.x - 18 * Math.cos(angle + 0.55), current.y - 18 * Math.sin(angle + 0.55));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#263840';
        ctx.font = '800 12px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(strength * 100)}% push`, current.x, current.y - 20);
    }

    _drawHud(ctx, width) {
        ctx.fillStyle = 'rgba(244,252,246,.91)';
        ctx.strokeStyle = '#2f823a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(15, 15, Math.min(455, width - 30), 94, 14);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#27813a';
        ctx.font = '900 11px Inter,sans-serif';
        ctx.fillText('SWING JUMP', 29, 38);
        ctx.fillStyle = '#253b34';
        ctx.font = '900 23px Inter,sans-serif';
        const value = this.flightPosition
            ? Math.max(0, this._footPosition().x - this.takeoffX)
            : Math.abs(this.theta) * 180 / Math.PI;
        ctx.fillText(this.flightPosition ? `${value.toFixed(2)} m` : `${value.toFixed(1)}° swing`, 29, 67);
        ctx.fillStyle = '#5c7067';
        ctx.font = '700 12px Inter,sans-serif';
        const state = this.flightPosition
            ? 'airborne'
            : (this.desiredArmReach > this.parameters.neutralArmReach + 0.01
                ? 'R · straightening arms'
                : (this.desiredArmReach < this.parameters.neutralArmReach - 0.01
                    ? 'T · bending arms'
                    : 'R extend · T bend · drag LMB to jump'));
        ctx.fillText(`${state} · best ${this.bestDistance.toFixed(2)} m`, 29, 91);
    }

    _drawOverlay(ctx, width, height) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.phase === 'countdown') {
            const number = Math.max(1, 3 - Math.floor(this.countdownElapsed / SIMULATION.countdownStepDuration));
            ctx.fillStyle = 'rgba(247,253,247,.94)';
            ctx.strokeStyle = '#2f823a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, 54, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#27813a';
            ctx.font = '900 58px Inter,sans-serif';
            ctx.fillText(String(number), width / 2, height / 2 + 1);
            ctx.fillStyle = '#42574f';
            ctx.font = '700 13px Inter,sans-serif';
            ctx.fillText('Stand ready', width / 2, height / 2 + 78);
        } else if (this.phase === 'playing' && this.startFlashRemaining > 0) {
            ctx.fillStyle = '#27813a';
            ctx.font = '900 58px Inter,sans-serif';
            ctx.fillText('GO', width / 2, height / 2);
        } else if (this.phase === 'done') {
            ctx.fillStyle = 'rgba(27,74,48,.30)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#f5fbf5';
            ctx.strokeStyle = '#416d51';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(width / 2 - 205, height / 2 - 100, 410, 200, 18);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#27813a';
            ctx.font = '900 27px Inter,sans-serif';
            ctx.fillText('LANDING DISTANCE', width / 2, height / 2 - 56);
            ctx.fillStyle = '#253b34';
            ctx.font = '900 36px Inter,sans-serif';
            ctx.fillText(`${this.distance.toFixed(2)} m`, width / 2, height / 2 - 7);
            ctx.fillStyle = '#5c7067';
            ctx.font = '700 13px Inter,sans-serif';
            ctx.fillText('Press R, T or left mouse to try again', width / 2, height / 2 + 54);
        }
    }

    render() {
        const ctx = this.ctx;
        const renderScale = this._renderScale();
        const width = this._logicalWidth();
        const height = SIMULATION.logicalHeight;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
        this._drawBackground(ctx, width, height);
        this._drawFrame(ctx);
        this._drawRider(ctx);
        this._drawDragArrow(ctx);
        this._drawHud(ctx, width);
        this._drawOverlay(ctx, width, height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    onResize() {
        // The metre-based state and fixed logical height make resize cosmetic.
    }

    destroy() {}

    preparePauseSettings(settings) {
        validateSwingSettings({ ...SWING_DEFAULTS, ...settings });
        requireFiniteNumber(settings.initialSwingAngle ?? SWING_DEFAULTS.initialSwingAngle, 'Initial swing angle');
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        return { ...readSwingParameters(settings) };
    }

    static getSettingsSchema() {
        const d = SWING_DEFAULTS;
        return [
            { key: 'gravity', label: 'Gravity [m/s²]', type: 'range', min: 3, max: 20, step: 0.05, default: d.gravity, group: 'World' },
            { key: 'ropeLength', label: 'Rope length [m]', type: 'range', min: 2.2, max: 6.5, step: 0.05, default: d.ropeLength, group: 'Swing' },
            { key: 'seatMass', label: 'Seat and chains mass [kg]', type: 'range', min: 4, max: 50, step: 1, default: d.seatMass, group: 'Swing' },
            { key: 'ropeBearingDamping', label: 'Pivot damping [N·m·s/rad]', type: 'range', min: 0, max: 4, step: 0.02, default: d.ropeBearingDamping, group: 'Swing' },
            { key: 'initialSwingAngle', label: 'Starting angle [°]', type: 'range', min: 2, max: 38, step: 1, default: d.initialSwingAngle, group: 'Swing' },
            { key: 'riderMass', label: 'Rider mass [kg]', type: 'range', min: 30, max: 140, step: 1, default: d.riderMass, group: 'Rider' },
            { key: 'riderHeight', label: 'Rider height [m]', type: 'range', min: 1.25, max: 2.15, step: 0.01, default: d.riderHeight, group: 'Rider' },
            { key: 'riderComHeight', label: 'Standing COM above feet [m]', type: 'range', min: 0.5, max: 1.2, step: 0.01, default: d.riderComHeight, group: 'Rider' },
            { key: 'riderInertiaFactor', label: 'Body inertia factor', type: 'range', min: 0.07, max: 0.35, step: 0.005, default: d.riderInertiaFactor, group: 'Rider' },
            { key: 'bodyAngularDamping', label: 'Ankle damping [N·m·s/rad]', type: 'range', min: 0, max: 80, step: 0.5, default: d.bodyAngularDamping, group: 'Rider' },
            { key: 'shoulderHeightFraction', label: 'Shoulder height / body height', type: 'range', min: 0.65, max: 0.84, step: 0.005, default: d.shoulderHeightFraction, group: 'Rider' },
            { key: 'upperArmLength', label: 'Upper-arm length [m]', type: 'range', min: 0.22, max: 0.5, step: 0.005, default: d.upperArmLength, group: 'Arms and grip' },
            { key: 'forearmLength', label: 'Forearm length [m]', type: 'range', min: 0.22, max: 0.5, step: 0.005, default: d.forearmLength, group: 'Arms and grip' },
            { key: 'handHeightAboveSeat', label: 'Grip height above seat [m]', type: 'range', min: 0.9, max: 1.9, step: 0.01, default: d.handHeightAboveSeat, group: 'Arms and grip' },
            { key: 'neutralArmReach', label: 'Neutral shoulder-hand reach [m]', type: 'range', min: 0.08, max: 0.95, step: 0.005, default: d.neutralArmReach, group: 'Arm motion' },
            { key: 'extendedArmReach', label: 'R extended reach [m]', type: 'range', min: 0.08, max: 0.95, step: 0.005, default: d.extendedArmReach, group: 'Arm motion' },
            { key: 'pulledArmReach', label: 'T bent reach [m]', type: 'range', min: 0.08, max: 0.95, step: 0.005, default: d.pulledArmReach, group: 'Arm motion' },
            { key: 'armActuationRate', label: 'Arm extension speed [m/s]', type: 'range', min: 0, max: 4, step: 0.05, domainMin: 0, domainStep: 'any', default: d.armActuationRate, group: 'Arm motion' },
            { key: 'armStiffness', label: 'Arm servo stiffness [N/m]', type: 'range', min: 200, max: 12000, step: 100, default: d.armStiffness, group: 'Arm forces' },
            { key: 'armDamping', label: 'Arm servo damping [N·s/m]', type: 'range', min: 0, max: 1800, step: 20, default: d.armDamping, group: 'Arm forces' },
            { key: 'maximumArmForce', label: 'Maximum arm force [N]', type: 'range', min: 300, max: 9000, step: 100, default: d.maximumArmForce, group: 'Arm forces' },
            { key: 'armLimitStiffness', label: 'Rigid-link limit stiffness [N/m]', type: 'range', min: 2000, max: 60000, step: 500, default: d.armLimitStiffness, group: 'Arm forces' },
            { key: 'armLimitDamping', label: 'Rigid-link limit damping [N·s/m]', type: 'range', min: 0, max: 3500, step: 50, default: d.armLimitDamping, group: 'Arm forces' },
            { key: 'launchMaximumSpeed', label: 'Maximum jump push [m/s]', type: 'range', min: 0.5, max: 10, step: 0.1, default: d.launchMaximumSpeed, group: 'Jump' },
            { key: 'airDrag', label: 'Air drag [N·s²/m²]', type: 'range', min: 0, max: 1.5, step: 0.01, default: d.airDrag, group: 'Jump' },
            { key: 'launchAngularDamping', label: 'Airborne posture damping [1/s]', type: 'range', min: 0, max: 8, step: 0.1, default: d.launchAngularDamping, group: 'Jump' },
        ];
    }

    static getControlsSchema() {
        return [
            { action: 'leanBack', label: 'Extend arms / lean back', defaultBindings: [{ type: 'keyboard', code: 'KeyR' }] },
            { action: 'pullForward', label: 'Bend arms / pull in', defaultBindings: [{ type: 'keyboard', code: 'KeyT' }] },
            { action: 'jumpDrag', label: 'Drag and release to jump', defaultBindings: [{ type: 'mouse', code: 0 }] },
        ];
    }
}
